import { getServiceClient } from "../_shared/db.ts";
import { corsHeaders, errorJson, handlePreflight, json } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";
import { hashPassword, randomToken } from "../_shared/crypto.ts";
import {
  CHIP_COLORS,
  ChipColor,
  computeTeamRankings,
  computeTotalValue,
  getBalances,
  getChipConfigFull,
  getChipValues,
} from "../_shared/economy.ts";

const ADMIN_SESSION_HOURS = 24;
const STARTING_CHIP_CAP = 30; // 규칙 8

function isChipColor(v: unknown): v is ChipColor {
  return typeof v === "string" && (CHIP_COLORS as readonly string[]).includes(v);
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // 무시
  }
  const action = body.action;
  const db = getServiceClient();

  // ---------------------------------------------------------- 관리자 로그인 ----
  if (action === "login") {
    const password = String(body.password || "");
    const expected = Deno.env.get("ADMIN_PASSWORD");
    if (!expected) {
      return errorJson("서버에 ADMIN_PASSWORD가 설정되어 있지 않습니다.", 500);
    }
    if (password !== expected) return errorJson("비밀번호가 올바르지 않습니다.", 401);

    const token = randomToken();
    const expiresAt = new Date(Date.now() + ADMIN_SESSION_HOURS * 3600 * 1000);
    await db.from("admin_sessions").insert({ token, expires_at: expiresAt });
    return json({ token });
  }

  // 아래부터는 전부 관리자 인증 필요
  const auth = await requireAdmin(req);
  if ("error" in auth) return errorJson(auth.error, auth.status);

  // ---------------------------------------------------------------- 팀 ----
  if (action === "create_team") {
    const name = String(body.name || "").trim();
    if (!name) return errorJson("팀 이름을 입력해주세요.");
    const { data, error } = await db.from("teams").insert({ name }).select().single();
    if (error) return errorJson("팀 생성에 실패했습니다. 이미 있는 이름일 수 있습니다.", 400);
    return json({ team: data });
  }

  if (action === "list_teams") {
    const { data } = await db.from("teams").select("id, name").order("id");
    return json({ teams: data || [] });
  }

  // -------------------------------------------------------------- 러너 ----
  if (action === "create_runner") {
    const id = String(body.id || "").trim();
    const password = String(body.password || "");
    const displayName = String(body.displayName || id);
    const teamId = body.teamId ? Number(body.teamId) : null;
    const startingChips = (body.startingChips || {}) as Record<string, number>;

    if (!id || !password) return errorJson("아이디와 비밀번호를 입력해주세요.");

    const total = CHIP_COLORS.reduce((s, c) => s + (Number(startingChips[c]) || 0), 0);
    if (total > STARTING_CHIP_CAP) {
      return errorJson(`시작 칩 총합은 ${STARTING_CHIP_CAP}개를 넘을 수 없습니다. (현재 합계: ${total})`);
    }
    for (const c of CHIP_COLORS) {
      const v = Number(startingChips[c]) || 0;
      if (!Number.isInteger(v) || v < 0) return errorJson(`${c} 칩 개수는 0 이상의 정수여야 합니다.`);
    }

    const passwordHash = await hashPassword(password);
    const { error: insErr } = await db.from("runners").insert({
      id,
      password_hash: passwordHash,
      display_name: displayName,
      team_id: teamId,
    });
    if (insErr) return errorJson("러너 생성에 실패했습니다. 이미 있는 아이디일 수 있습니다.", 400);

    for (const c of CHIP_COLORS) {
      await db.from("chip_balances").upsert({
        runner_id: id,
        color: c,
        count: Number(startingChips[c]) || 0,
      });
    }

    return json({ ok: true, runnerId: id });
  }

  if (action === "list_runners") {
    const { data: runners } = await db
      .from("runners")
      .select("id, display_name, team_id, teams(name)")
      .order("id");
    const values = await getChipValues(db);
    const result = [];
    for (const r of runners || []) {
      const balances = await getBalances(db, r.id);
      result.push({
        id: r.id,
        displayName: r.display_name,
        teamName: (r as unknown as { teams: { name: string } | null }).teams?.name ?? null,
        chipCounts: balances,
        totalValue: computeTotalValue(balances, values),
      });
    }
    return json({ runners: result });
  }

  if (action === "adjust_balance") {
    const runnerId = String(body.runnerId || "");
    const color = body.color;
    const newCount = Number(body.count);
    if (!isChipColor(color)) return errorJson("올바른 칩 색상을 선택해주세요.");
    if (!Number.isInteger(newCount) || newCount < 0) {
      return errorJson("칩 개수는 0 이상의 정수여야 합니다.");
    }
    const { data: r } = await db.from("runners").select("id").eq("id", runnerId).maybeSingle();
    if (!r) return errorJson("러너를 찾을 수 없습니다.");
    await db.from("chip_balances").upsert({ runner_id: runnerId, color, count: newCount });
    return json({ ok: true });
  }

  // -------------------------------------------------------------- 칩 설정 ----
  if (action === "set_chip_value") {
    const color = body.color;
    const value = Number(body.value);
    if (!isChipColor(color)) return errorJson("올바른 칩 색상을 선택해주세요.");
    if (!Number.isFinite(value) || value <= 0) return errorJson("값은 0보다 커야 합니다.");
    await db.from("chip_config").update({ value }).eq("color", color);
    return json({ ok: true });
  }

  if (action === "set_chip_bounds") {
    const color = body.color;
    const min = Number(body.min);
    const max = Number(body.max);
    if (!isChipColor(color)) return errorJson("올바른 칩 색상을 선택해주세요.");
    if (!Number.isFinite(min) || !Number.isFinite(max) || min <= 0 || max < min) {
      return errorJson("최소/최대값을 올바르게 입력해주세요.");
    }
    await db.from("chip_config").update({ min_value: min, max_value: max }).eq("color", color);
    return json({ ok: true });
  }

  // -------------------------------------------------------------- 현황판 ----
  if (action === "overview") {
    const configs = await getChipConfigFull(db);
    const rankings = await computeTeamRankings(db);
    const { data: usage } = await db.from("shop_usage").select("global_use_count").eq("id", 1)
      .single();
    const { data: cooldowns } = await db.from("shop_cooldowns").select("*");
    return json({
      chipConfig: configs,
      teamRankings: rankings,
      globalUseCount: usage?.global_use_count ?? 0,
      cooldowns: cooldowns || [],
    });
  }

  return errorJson("알 수 없는 action 입니다.", 400);
});
