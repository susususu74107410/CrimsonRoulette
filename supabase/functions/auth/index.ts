import { getServiceClient } from "../_shared/db.ts";
import { corsHeaders, errorJson, handlePreflight, json } from "../_shared/cors.ts";
import { randomToken, verifyPassword } from "../_shared/crypto.ts";
import { requireRunner } from "../_shared/auth.ts";

const SESSION_HOURS = 12;

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // 빈 바디도 허용 (logout 등)
  }
  const action = body.action;
  const db = getServiceClient();

  if (action === "login") {
    const id = String(body.id || "").trim();
    const password = String(body.password || "");
    if (!id || !password) return errorJson("아이디와 비밀번호를 입력해주세요.");

    const { data: runner, error } = await db
      .from("runners")
      .select("id, password_hash, display_name, team_id")
      .eq("id", id)
      .maybeSingle();

    if (error || !runner) return errorJson("아이디 또는 비밀번호가 올바르지 않습니다.", 401);

    const ok = await verifyPassword(password, runner.password_hash);
    if (!ok) return errorJson("아이디 또는 비밀번호가 올바르지 않습니다.", 401);

    let teamName: string | null = null;
    if (runner.team_id) {
      const { data: team } = await db
        .from("teams")
        .select("name")
        .eq("id", runner.team_id)
        .maybeSingle();
      teamName = team?.name ?? null;
    }

    const token = randomToken();
    const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600 * 1000);
    const { error: sessErr } = await db
      .from("sessions")
      .insert({ token, runner_id: runner.id, expires_at: expiresAt });
    if (sessErr) return errorJson("로그인 처리 중 오류가 발생했습니다.", 500);

    return json({
      token,
      runnerId: runner.id,
      displayName: runner.display_name,
      teamName,
    });
  }

  if (action === "logout") {
    const auth = await requireRunner(req);
    if ("error" in auth) return errorJson(auth.error, auth.status);
    const header = req.headers.get("Authorization") || "";
    const token = header.replace(/^Bearer\s+/i, "").trim();
    await db.from("sessions").delete().eq("token", token);
    return json({ ok: true });
  }

  return errorJson("알 수 없는 action 입니다.", 400);
});
