import { getServiceClient } from "./db.ts";

type LogEntry = { time: string; type: string; [key: string]: unknown };

// 규칙 16/17: 개인 로그 = 시간 + NVP 로그 + PVP 로그 + 환전 로그 + 아이템 사용 로그
// (+ 남이 나를 대상으로 "지정 1인" 아이템을 썼을 때의 익명 기록)
export async function buildPersonalLog(
  db: ReturnType<typeof getServiceClient>,
  runnerId: string,
  limit = 100,
): Promise<LogEntry[]> {
  const entries: LogEntry[] = [];

  const { data: nvp } = await db
    .from("nvp_play_log")
    .select("created_at, game, bet_color, bet_amount, outcome, chip_delta")
    .eq("runner_id", runnerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  for (const r of nvp || []) {
    entries.push({
      time: r.created_at,
      type: "nvp",
      game: r.game,
      betColor: r.bet_color,
      betAmount: r.bet_amount,
      outcome: r.outcome,
      chipDelta: r.chip_delta,
    });
  }

  const { data: pvp } = await db
    .from("pvp_sessions")
    .select(
      "finished_at, created_at, game, bet_color, bet_amount, creator_id, joiner_id, winner_id, status",
    )
    .or(`creator_id.eq.${runnerId},joiner_id.eq.${runnerId}`)
    .eq("status", "finished")
    .order("finished_at", { ascending: false })
    .limit(limit);
  for (const r of pvp || []) {
    const isCreator = r.creator_id === runnerId;
    const opponentId = isCreator ? r.joiner_id : r.creator_id;
    let opponentName = opponentId;
    if (opponentId) {
      const { data: opp } = await db
        .from("runners")
        .select("display_name")
        .eq("id", opponentId)
        .maybeSingle();
      opponentName = opp?.display_name ?? opponentId;
    }
    const result = r.winner_id === null
      ? "push"
      : r.winner_id === runnerId
      ? "win"
      : "lose";
    entries.push({
      time: r.finished_at || r.created_at,
      type: "pvp",
      game: r.game,
      betColor: r.bet_color,
      betAmount: r.bet_amount,
      opponent: opponentName,
      result,
    });
  }

  const { data: exch } = await db
    .from("exchange_log")
    .select("created_at, from_color, from_amount, to_color, to_amount")
    .eq("runner_id", runnerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  for (const r of exch || []) {
    entries.push({
      time: r.created_at,
      type: "exchange",
      fromColor: r.from_color,
      fromAmount: r.from_amount,
      toColor: r.to_color,
      toAmount: r.to_amount,
    });
  }

  const { data: myItems } = await db
    .from("item_log")
    .select("created_at, item_key, target_id, paid_color, paid_amount, detail")
    .eq("actor_id", runnerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  for (const r of myItems || []) {
    entries.push({
      time: r.created_at,
      type: "item_used",
      itemKey: r.item_key,
      target: r.target_id,
      paidColor: r.paid_color,
      paidAmount: r.paid_amount,
      detail: r.detail,
    });
  }

  // 규칙 17: 남이 나를 지정해서 "칩 전체 교환" / "칩 총합 확인" 아이템을 쓰면
  // 누가 썼는지는 익명으로, 사용 사실과 시간만 내 개인 로그에 남음
  const { data: onMe } = await db
    .from("item_log")
    .select("created_at, item_key")
    .eq("target_id", runnerId)
    .in("item_key", ["full_swap", "check_total"])
    .order("created_at", { ascending: false })
    .limit(limit);
  for (const r of onMe || []) {
    entries.push({
      time: r.created_at,
      type: "item_used_on_me",
      itemKey: r.item_key,
    });
  }

  entries.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  return entries.slice(0, limit);
}
