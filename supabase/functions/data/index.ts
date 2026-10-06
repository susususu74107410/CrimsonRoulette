import { getServiceClient } from "../_shared/db.ts";
import { corsHeaders, errorJson, handlePreflight, json } from "../_shared/cors.ts";
import { requireRunner } from "../_shared/auth.ts";
import {
  assignItemColors,
  computeTotalValue,
  getBalances,
  getChipConfigFull,
  getChipValues,
  getShopCostAmount,
  ITEM_KEYS,
} from "../_shared/economy.ts";
import { buildPersonalLog } from "../_shared/logs.ts";
import { todayKST } from "../_shared/time.ts";

const NVP_GAMES = ["highlow", "roulette", "redblack", "blackjack", "russian"];
const DAILY_LIMIT = 3;
const COOLDOWN_HOURS: Record<string, number> = {
  change_value: 2,
  full_swap: 1,
};

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // 기본값 사용
  }
  const action = body.action || "dashboard";
  const db = getServiceClient();

  if (action === "public_log") {
    const { data, error } = await db
      .from("item_log")
      .select("created_at, item_key")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return errorJson("공개 로그를 불러오지 못했습니다.", 500);
    return json({
      entries: (data || []).map((r) => ({
        time: r.created_at,
        itemKey: r.item_key,
      })),
    });
  }

  if (action === "dashboard") {
    const auth = await requireRunner(req);
    if ("error" in auth) return errorJson(auth.error, auth.status);
    const runnerId = auth.runnerId;

    const { data: runner } = await db
      .from("runners")
      .select("display_name, team_id")
      .eq("id", runnerId)
      .maybeSingle();
    if (!runner) return errorJson("러너 정보를 찾을 수 없습니다.", 404);

    let teamName: string | null = null;
    if (runner.team_id) {
      const { data: team } = await db
        .from("teams")
        .select("name")
        .eq("id", runner.team_id)
        .maybeSingle();
      teamName = team?.name ?? null;
    }

    const [balances, values, shopCost, chipConfigs] = await Promise.all([
      getBalances(db, runnerId),
      getChipValues(db),
      getShopCostAmount(db),
      getChipConfigFull(db),
    ]);
    const totalValue = computeTotalValue(balances, values);
    const itemColors = assignItemColors(values);

    // 오늘 남은 NVP 플레이 횟수 (한국 시간 기준 자정 리셋)
    const today = todayKST();
    const { data: playsToday } = await db
      .from("nvp_play_log")
      .select("game")
      .eq("runner_id", runnerId)
      .eq("play_date", today);
    const playedCount: Record<string, number> = {};
    for (const g of NVP_GAMES) playedCount[g] = 0;
    for (const r of playsToday || []) {
      playedCount[r.game] = (playedCount[r.game] || 0) + 1;
    }
    const nvpRemaining: Record<string, number> = {};
    for (const g of NVP_GAMES) {
      nvpRemaining[g] = Math.max(0, DAILY_LIMIT - (playedCount[g] || 0));
    }

    // 쿨다운 상태
    const { data: cooldownRows } = await db
      .from("shop_cooldowns")
      .select("item_key, last_used_at");
    const cooldowns: Record<string, { availableAt: string | null }> = {};
    for (const row of cooldownRows || []) {
      if (!row.last_used_at) {
        cooldowns[row.item_key] = { availableAt: null }; // null = 지금 사용 가능
      } else {
        const hours = COOLDOWN_HOURS[row.item_key] || 0;
        const availableAt = new Date(
          new Date(row.last_used_at).getTime() + hours * 3600 * 1000,
        );
        cooldowns[row.item_key] = {
          availableAt: availableAt.getTime() > Date.now()
            ? availableAt.toISOString()
            : null,
        };
      }
    }

    // 내가 만든, 아직 대기 중인 PVP 코드
    const { data: myOpenSessions } = await db
      .from("pvp_sessions")
      .select("code, game, bet_color, bet_amount, expires_at, status")
      .eq("creator_id", runnerId)
      .eq("status", "waiting");

    const shopItems = ITEM_KEYS.map((key) => ({
      key,
      color: itemColors[key],
      cost: shopCost,
      cooldownAvailableAt: cooldowns[key]?.availableAt ?? null,
    }));
    // 가치 자체는 비공개, 허용 범위(최소/최대)만 공개 — "칩 가치 바꾸기"에 사용
    const chipBounds: Record<string, { min: number; max: number }> = {};
    for (const c of chipConfigs) chipBounds[c.color] = { min: c.min_value, max: c.max_value };

    const personalLog = await buildPersonalLog(db, runnerId);

    return json({
      displayName: runner.display_name,
      teamName,
      chipCounts: balances,
      totalValue,
      nvpRemaining,
      pendingPvpSessions: myOpenSessions || [],
      shopItems,
      chipBounds,
      personalLog,
    });
  }

  return errorJson("알 수 없는 action 입니다.", 400);
});
