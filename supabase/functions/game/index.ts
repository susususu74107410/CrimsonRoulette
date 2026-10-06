import { getServiceClient } from "../_shared/db.ts";
import { corsHeaders, errorJson, handlePreflight, json } from "../_shared/cors.ts";
import { requireRunner } from "../_shared/auth.ts";
import { CHIP_COLORS, ChipColor } from "../_shared/economy.ts";
import { randomJoinCode } from "../_shared/crypto.ts";
import { todayKST } from "../_shared/time.ts";
import {
  playBlackjackVsHouse,
  playHighLow,
  playRedBlack,
  playRoulette,
  playRussianRoulette,
  resolvePvpBlackjack,
  resolvePvpHighLow,
} from "../_shared/games.ts";

const NVP_GAMES = ["highlow", "roulette", "redblack", "blackjack", "russian"];
const PVP_GAMES = ["blackjack", "highlow"];
const DAILY_LIMIT = 3;
const PVP_EXPIRY_MINUTES = 15;

function isChipColor(v: unknown): v is ChipColor {
  return typeof v === "string" && (CHIP_COLORS as readonly string[]).includes(v);
}

async function getBalance(
  db: ReturnType<typeof getServiceClient>,
  runnerId: string,
  color: string,
): Promise<number> {
  const { data } = await db
    .from("chip_balances")
    .select("count")
    .eq("runner_id", runnerId)
    .eq("color", color)
    .maybeSingle();
  return data?.count ?? 0;
}

async function addToBalance(
  db: ReturnType<typeof getServiceClient>,
  runnerId: string,
  color: string,
  delta: number,
) {
  const current = await getBalance(db, runnerId, color);
  const next = current + delta;
  if (next < 0) throw new Error("칩이 부족합니다.");
  const { error } = await db
    .from("chip_balances")
    .upsert({ runner_id: runnerId, color, count: next });
  if (error) throw new Error("칩 갱신 중 오류가 발생했습니다.");
  return next;
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;

  const auth = await requireRunner(req);
  if ("error" in auth) return errorJson(auth.error, auth.status);
  const runnerId = auth.runnerId;

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return errorJson("요청 본문이 올바르지 않습니다.");
  }
  const action = body.action;
  const db = getServiceClient();

  // ---------------------------------------------------------------- NVP ----
  if (action === "nvp_play") {
    const game = String(body.game || "");
    const betColor = body.betColor;
    const betAmount = Number(body.betAmount);

    if (!NVP_GAMES.includes(game)) return errorJson("알 수 없는 게임입니다.");
    if (!isChipColor(betColor)) return errorJson("올바른 칩 색상을 선택해주세요.");
    if (!Number.isInteger(betAmount) || betAmount <= 0) {
      return errorJson("베팅 금액은 1 이상의 정수여야 합니다.");
    }

    const today = todayKST();
    const { count: playedToday } = await db
      .from("nvp_play_log")
      .select("id", { count: "exact", head: true })
      .eq("runner_id", runnerId)
      .eq("game", game)
      .eq("play_date", today);
    if ((playedToday || 0) >= DAILY_LIMIT) {
      return errorJson(`오늘은 이 게임을 더 이상 플레이할 수 없습니다 (일일 ${DAILY_LIMIT}회 제한).`);
    }

    const balance = await getBalance(db, runnerId, betColor);
    if (balance < betAmount) return errorJson("칩이 부족합니다.");

    let result;
    try {
      if (game === "highlow") {
        const guess = body.guess === "high" ? "high" : "low";
        result = playHighLow(betAmount, guess);
      } else if (game === "roulette") {
        const betType = ["color", "parity", "number"].includes(
            String(body.betType),
          )
          ? String(body.betType) as "color" | "parity" | "number"
          : "color";
        result = playRoulette(betAmount, betType, body.betValue as string | number);
      } else if (game === "redblack") {
        const guess = body.guess === "black" ? "black" : "red";
        result = playRedBlack(betAmount, guess);
      } else if (game === "blackjack") {
        result = playBlackjackVsHouse(betAmount);
      } else {
        const riskLevel = Number(body.riskLevel) || 1;
        result = playRussianRoulette(betAmount, riskLevel);
      }
    } catch {
      return errorJson("게임 처리 중 오류가 발생했습니다.", 500);
    }

    const newBalance = await addToBalance(db, runnerId, betColor, result.chipDelta);

    await db.from("nvp_play_log").insert({
      runner_id: runnerId,
      game,
      play_date: today,
      bet_color: betColor,
      bet_amount: betAmount,
      outcome: result.outcome,
      chip_delta: result.chipDelta,
      detail: result.detail,
    });

    return json({
      outcome: result.outcome,
      chipDelta: result.chipDelta,
      detail: result.detail,
      newBalance,
      remainingToday: DAILY_LIMIT - ((playedToday || 0) + 1),
    });
  }

  // ------------------------------------------------------------ PVP 생성 ----
  if (action === "pvp_create") {
    const game = String(body.game || "");
    const betColor = body.betColor;
    const betAmount = Number(body.betAmount);

    if (!PVP_GAMES.includes(game)) return errorJson("알 수 없는 게임입니다.");
    if (!isChipColor(betColor)) return errorJson("올바른 칩 색상을 선택해주세요.");
    if (!Number.isInteger(betAmount) || betAmount <= 0) {
      return errorJson("베팅 금액은 1 이상의 정수여야 합니다.");
    }
    const balance = await getBalance(db, runnerId, betColor);
    if (balance < betAmount) return errorJson("칩이 부족합니다.");

    await addToBalance(db, runnerId, betColor, -betAmount); // 에스크로

    let code = randomJoinCode();
    for (let i = 0; i < 5; i++) {
      const { data: exists } = await db
        .from("pvp_sessions")
        .select("code")
        .eq("code", code)
        .maybeSingle();
      if (!exists) break;
      code = randomJoinCode();
    }

    const expiresAt = new Date(Date.now() + PVP_EXPIRY_MINUTES * 60 * 1000);
    const { error } = await db.from("pvp_sessions").insert({
      code,
      game,
      creator_id: runnerId,
      bet_color: betColor,
      bet_amount: betAmount,
      status: "waiting",
      expires_at: expiresAt,
    });
    if (error) {
      await addToBalance(db, runnerId, betColor, betAmount); // 롤백
      return errorJson("게임 생성 중 오류가 발생했습니다.", 500);
    }

    return json({ code, expiresAt: expiresAt.toISOString() });
  }

  // -------------------------------------------------------------- PVP 참가 ----
  if (action === "pvp_join") {
    const code = String(body.code || "").trim().toUpperCase();
    if (!code) return errorJson("입장 코드를 입력해주세요.");

    const { data: sess } = await db
      .from("pvp_sessions")
      .select("*")
      .eq("code", code)
      .maybeSingle();
    if (!sess) return errorJson("존재하지 않는 코드입니다.");
    if (sess.creator_id === runnerId) return errorJson("본인이 만든 게임에는 참가할 수 없습니다.");

    if (sess.status !== "waiting") {
      return errorJson("이미 종료되었거나 만료된 코드입니다.");
    }
    if (new Date(sess.expires_at).getTime() < Date.now()) {
      await addToBalance(db, sess.creator_id, sess.bet_color, sess.bet_amount); // 환불
      await db.from("pvp_sessions").update({ status: "expired" }).eq("code", code);
      return errorJson("코드가 만료되었습니다.");
    }
    // 참가자는 생성자가 이미 정해둔 칩 색상/수량을 그대로 따릅니다 (코드만 입력하면 됨).
    const betColor = sess.bet_color;
    const betAmount = sess.bet_amount;

    const balance = await getBalance(db, runnerId, betColor);
    if (balance < betAmount) {
      return errorJson(`이 게임에 참가하려면 ${betColor} 칩 ${betAmount}개가 필요합니다. 칩이 부족합니다.`);
    }
    await addToBalance(db, runnerId, betColor, -betAmount);

    let winner: "a" | "b" | "push";
    let detail: Record<string, unknown>;
    if (sess.game === "blackjack") {
      const r = resolvePvpBlackjack();
      winner = r.winner;
      detail = { creatorHand: r.a, joinerHand: r.b };
    } else {
      const r = resolvePvpHighLow();
      winner = r.winner;
      detail = { creatorNumber: r.a, joinerNumber: r.b };
    }

    let winnerId: string | null = null;
    if (winner === "a") {
      winnerId = sess.creator_id;
      await addToBalance(db, sess.creator_id, sess.bet_color, sess.bet_amount * 2);
    } else if (winner === "b") {
      winnerId = runnerId;
      await addToBalance(db, runnerId, sess.bet_color, sess.bet_amount * 2);
    } else {
      await addToBalance(db, sess.creator_id, sess.bet_color, sess.bet_amount);
      await addToBalance(db, runnerId, sess.bet_color, sess.bet_amount);
    }

    await db
      .from("pvp_sessions")
      .update({
        joiner_id: runnerId,
        status: "finished",
        result: detail,
        winner_id: winnerId,
        finished_at: new Date().toISOString(),
      })
      .eq("code", code);

    return json({
      game: sess.game,
      betColor: sess.bet_color,
      betAmount: sess.bet_amount,
      detail,
      result: winnerId === null ? "push" : winnerId === runnerId ? "win" : "lose",
    });
  }

  // -------------------------------------------------------------- PVP 상태 ----
  if (action === "pvp_status") {
    const code = String(body.code || "").trim().toUpperCase();
    const { data: sess } = await db
      .from("pvp_sessions")
      .select("*")
      .eq("code", code)
      .maybeSingle();
    if (!sess) return errorJson("존재하지 않는 코드입니다.");
    if (sess.creator_id !== runnerId && sess.joiner_id !== runnerId) {
      return errorJson("본인이 참여한 게임만 확인할 수 있습니다.", 403);
    }
    if (
      sess.status === "waiting" &&
      new Date(sess.expires_at).getTime() < Date.now()
    ) {
      await addToBalance(db, sess.creator_id, sess.bet_color, sess.bet_amount);
      await db.from("pvp_sessions").update({ status: "expired" }).eq("code", code);
      sess.status = "expired";
    }
    return json({ session: sess });
  }

  // -------------------------------------------------------------- PVP 취소 ----
  if (action === "pvp_cancel") {
    const code = String(body.code || "").trim().toUpperCase();
    const { data: sess } = await db
      .from("pvp_sessions")
      .select("*")
      .eq("code", code)
      .maybeSingle();
    if (!sess) return errorJson("존재하지 않는 코드입니다.");
    if (sess.creator_id !== runnerId) return errorJson("본인이 만든 게임만 취소할 수 있습니다.", 403);
    if (sess.status !== "waiting") return errorJson("대기 중인 게임만 취소할 수 있습니다.");
    await addToBalance(db, sess.creator_id, sess.bet_color, sess.bet_amount);
    await db.from("pvp_sessions").update({ status: "cancelled" }).eq("code", code);
    return json({ ok: true });
  }

  return errorJson("알 수 없는 action 입니다.", 400);
});
