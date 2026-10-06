import { getServiceClient } from "../_shared/db.ts";
import { corsHeaders, errorJson, handlePreflight, json } from "../_shared/cors.ts";
import { requireRunner } from "../_shared/auth.ts";
import {
  assignItemColors,
  CHIP_COLORS,
  ChipColor,
  computeTeamRankings,
  computeTotalValue,
  getBalances,
  getChipConfigFull,
  getChipValues,
  getShopCostAmount,
  ITEM_KEYS,
} from "../_shared/economy.ts";

const COOLDOWN_HOURS: Record<string, number> = {
  change_value: 2,
  full_swap: 1,
};

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

async function setBalance(
  db: ReturnType<typeof getServiceClient>,
  runnerId: string,
  color: string,
  count: number,
) {
  await db.from("chip_balances").upsert({ runner_id: runnerId, color, count });
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

  // ------------------------------------------------------------ 칩 환전 ----
  if (action === "exchange") {
    const fromColor = body.fromColor;
    const toColor = body.toColor;
    const amount = Number(body.amount);

    if (!isChipColor(fromColor) || !isChipColor(toColor)) {
      return errorJson("올바른 칩 색상을 선택해주세요.");
    }
    if (fromColor === toColor) return errorJson("서로 다른 색상이어야 합니다.");
    if (!Number.isInteger(amount) || amount <= 0) {
      return errorJson("환전 수량은 1 이상의 정수여야 합니다.");
    }

    const fromBalance = await getBalance(db, runnerId, fromColor);
    if (fromBalance < amount) return errorJson("칩이 부족합니다.");

    const values = await getChipValues(db);
    const toAmount = Math.floor((amount * values[fromColor]) / values[toColor]); // 규칙 7: 소수점 절삭

    await setBalance(db, runnerId, fromColor, fromBalance - amount);
    const toBalance = await getBalance(db, runnerId, toColor);
    await setBalance(db, runnerId, toColor, toBalance + toAmount);

    await db.from("exchange_log").insert({
      runner_id: runnerId,
      from_color: fromColor,
      from_amount: amount,
      to_color: toColor,
      to_amount: toAmount,
    });

    const newBalances = await getBalances(db, runnerId);
    return json({ toAmount, newBalances });
  }

  // ------------------------------------------------------------ 상점 구매 ----
  if (action === "shop_buy") {
    const itemKey = String(body.itemKey || "");
    if (!ITEM_KEYS.includes(itemKey)) return errorJson("알 수 없는 아이템입니다.");

    const values = await getChipValues(db);
    const itemColors = assignItemColors(values);
    const payColor = itemColors[itemKey];
    const cost = await getShopCostAmount(db);

    // 쿨다운 체크 (칩 가치 바꾸기 / 지정 1인과 칩 전체 교환)
    if (itemKey === "change_value" || itemKey === "full_swap") {
      const { data: cd } = await db
        .from("shop_cooldowns")
        .select("last_used_at")
        .eq("item_key", itemKey)
        .maybeSingle();
      if (cd?.last_used_at) {
        const hours = COOLDOWN_HOURS[itemKey];
        const availableAt = new Date(cd.last_used_at).getTime() + hours * 3600 * 1000;
        if (availableAt > Date.now()) {
          return errorJson(
            `이 아이템은 ${new Date(availableAt).toLocaleString("ko-KR")}부터 다시 사용할 수 있습니다.`,
          );
        }
      }
    }

    const balance = await getBalance(db, runnerId, payColor);
    if (balance < cost) {
      return errorJson(`이 아이템은 현재 ${payColor} 칩 ${cost}개가 필요합니다. 칩이 부족합니다.`);
    }

    let targetId: string | null = null;
    let detail: Record<string, unknown> = {};

    if (itemKey === "change_value") {
      const newValueColor = body.newValueColor;
      const newValue = Number(body.newValue);
      if (!isChipColor(newValueColor)) return errorJson("가치를 바꿀 칩 색상을 선택해주세요.");
      const configs = await getChipConfigFull(db);
      const cfg = configs.find((c) => c.color === newValueColor)!;
      if (!Number.isFinite(newValue) || newValue < cfg.min_value || newValue > cfg.max_value) {
        return errorJson(`값은 ${cfg.min_value} ~ ${cfg.max_value} 사이여야 합니다.`);
      }
      await db.from("chip_config").update({ value: newValue }).eq("color", newValueColor);
      detail = { color: newValueColor, newValue };
    } else if (itemKey === "full_swap") {
      const t = String(body.targetId || "");
      const { data: target } = await db.from("runners").select("id").eq("id", t).maybeSingle();
      if (!target) return errorJson("대상 러너를 찾을 수 없습니다.");
      if (target.id === runnerId) return errorJson("자기 자신은 지정할 수 없습니다.");
      targetId = target.id;

      const myBalances = await getBalances(db, runnerId);
      const theirBalances = await getBalances(db, targetId);
      for (const c of CHIP_COLORS) {
        await setBalance(db, runnerId, c, theirBalances[c]);
        await setBalance(db, targetId, c, myBalances[c]);
      }
      detail = { swappedWith: targetId };
    } else if (itemKey === "check_total") {
      const t = String(body.targetId || "");
      const { data: target } = await db.from("runners").select("id, display_name").eq("id", t)
        .maybeSingle();
      if (!target) return errorJson("대상 러너를 찾을 수 없습니다.");
      targetId = target.id;
      const theirBalances = await getBalances(db, targetId);
      const total = computeTotalValue(theirBalances, values);
      detail = { targetId, targetName: target.display_name, totalValue: total };
    } else if (itemKey === "check_values") {
      detail = { values };
    } else if (itemKey === "check_ranking") {
      detail = { rankings: await computeTeamRankings(db) };
    }

    // 결제 및 기록
    await setBalance(db, runnerId, payColor, balance - cost);
    await db.from("shop_usage").update({ global_use_count: cost }).eq("id", 1); // cost = 이전count+1
    if (itemKey === "change_value" || itemKey === "full_swap") {
      await db
        .from("shop_cooldowns")
        .update({ last_used_at: new Date().toISOString(), last_used_by: runnerId })
        .eq("item_key", itemKey);
    }
    await db.from("item_log").insert({
      item_key: itemKey,
      actor_id: runnerId,
      target_id: targetId,
      paid_color: payColor,
      paid_amount: cost,
      detail,
    });

    return json({ itemKey, paidColor: payColor, paidAmount: cost, detail });
  }

  return errorJson("알 수 없는 action 입니다.", 400);
});
