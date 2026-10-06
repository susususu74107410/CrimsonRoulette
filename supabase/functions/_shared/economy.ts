import { getServiceClient } from "./db.ts";

export const CHIP_COLORS = ["red", "blue", "green", "yellow", "white"] as const;
export type ChipColor = typeof CHIP_COLORS[number];

// 규칙 13: 상점 아이템의 "고정 순위" (1이 가장 비싼/중요한 자리).
// 이 순위는 절대 바뀌지 않고, 실행 시점에 가치가 가장 높은 칩부터 순서대로
// 이 순위에 배정됩니다. (예: rank 1 아이템은 항상 "현재 가치가 가장 높은 색")
export const ITEM_RANK: Record<string, number> = {
  change_value: 1, // 칩 가치 바꾸기
  full_swap: 2, // 지정 1인과 칩 전체 교환
  check_total: 3, // 지정 1인 칩 총합 확인
  check_values: 4, // 현재 각 칩 가치 확인
  check_ranking: 5, // 현재 팀 순위 확인
};
export const ITEM_KEYS = Object.keys(ITEM_RANK);

export type ChipValues = Record<ChipColor, number>;

export async function getChipValues(
  db = getServiceClient(),
): Promise<ChipValues> {
  const { data, error } = await db
    .from("chip_config")
    .select("color, value");
  if (error || !data) throw new Error("칩 설정을 불러오지 못했습니다.");
  const values = {} as ChipValues;
  for (const row of data) values[row.color as ChipColor] = Number(row.value);
  return values;
}

// 가치 높은 순으로 정렬된 색상 배열
export function rankColorsHighToLow(values: ChipValues): ChipColor[] {
  return [...CHIP_COLORS].sort((a, b) => values[b] - values[a]);
}

// 각 아이템에 현재 배정된 결제 색상 { change_value: 'yellow', ... }
export function assignItemColors(
  values: ChipValues,
): Record<string, ChipColor> {
  const ordered = rankColorsHighToLow(values); // ordered[0] = 최고가 색
  const assignment: Record<string, ChipColor> = {};
  for (const [item, rank] of Object.entries(ITEM_RANK)) {
    assignment[item] = ordered[rank - 1];
  }
  return assignment;
}

// 현재 필요 수량 (전체 아이템 공통, 사용될 때마다 다같이 +1)
export async function getShopCostAmount(
  db = getServiceClient(),
): Promise<number> {
  const { data, error } = await db
    .from("shop_usage")
    .select("global_use_count")
    .eq("id", 1)
    .single();
  if (error || !data) throw new Error("상점 사용 현황을 불러오지 못했습니다.");
  return Number(data.global_use_count) + 1; // 0회 사용 -> 1개, 1회 사용 -> 2개 ...
}

export function computeTotalValue(
  balances: Record<ChipColor, number>,
  values: ChipValues,
): number {
  let total = 0;
  for (const c of CHIP_COLORS) total += (balances[c] || 0) * (values[c] || 0);
  return total;
}

export type ChipConfigRow = {
  color: ChipColor;
  value: number;
  min_value: number;
  max_value: number;
};

export async function getChipConfigFull(
  db: ReturnType<typeof getServiceClient>,
): Promise<ChipConfigRow[]> {
  const { data, error } = await db
    .from("chip_config")
    .select("color, value, min_value, max_value");
  if (error || !data) throw new Error("칩 설정을 불러오지 못했습니다.");
  return data as ChipConfigRow[];
}

// 러너 한 명의 칩 보유 현황을 { red: n, blue: n, ... } 형태로 가져오기
export async function getBalances(
  db: ReturnType<typeof getServiceClient>,
  runnerId: string,
): Promise<Record<ChipColor, number>> {
  const { data, error } = await db
    .from("chip_balances")
    .select("color, count")
    .eq("runner_id", runnerId);
  if (error) throw new Error("칩 보유 현황을 불러오지 못했습니다.");
  const balances = { red: 0, blue: 0, green: 0, yellow: 0, white: 0 } as Record<
    ChipColor,
    number
  >;
  for (const row of data || []) balances[row.color as ChipColor] = row.count;
  return balances;
}

// 팀별 총 가치 순위 (실시간 칩 가치 기준)
export async function computeTeamRankings(
  db: ReturnType<typeof getServiceClient>,
): Promise<{ teamName: string; totalValue: number }[]> {
  const values = await getChipValues(db);
  const { data: teams, error: teamErr } = await db.from("teams").select(
    "id, name",
  );
  if (teamErr || !teams) throw new Error("팀 정보를 불러오지 못했습니다.");

  const { data: rows, error } = await db
    .from("chip_balances")
    .select("count, color, runners!inner(team_id)");
  if (error) throw new Error("팀 순위를 계산하지 못했습니다.");

  const totals = new Map<number, number>();
  for (const row of (rows || []) as unknown as {
    count: number;
    color: ChipColor;
    runners: { team_id: number | null };
  }[]) {
    const teamId = row.runners?.team_id;
    if (teamId == null) continue;
    const add = row.count * (values[row.color] || 0);
    totals.set(teamId, (totals.get(teamId) || 0) + add);
  }

  return teams
    .map((t) => ({ teamName: t.name, totalValue: totals.get(t.id) || 0 }))
    .sort((a, b) => b.totalValue - a.totalValue);
}
