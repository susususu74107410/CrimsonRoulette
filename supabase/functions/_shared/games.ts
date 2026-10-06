// 모든 게임의 실제 판정 로직. 클라이언트는 절대 결과를 계산하지 않고,
// 이 서버 코드가 계산한 결과만 받습니다 (부정 방지).

export type NvpOutcome = {
  outcome: "win" | "lose" | "push";
  chipDelta: number; // 베팅 금액 대비 순증감 (베팅 차감 전 기준)
  detail: Record<string, unknown>;
};

function randInt(maxExclusive: number): number {
  return Math.floor(Math.random() * maxExclusive);
}

// 1) 하이 앤 로우 (1~10, Low=1~5 / High=6~10, 적중 1:1)
export function playHighLow(bet: number, guess: "low" | "high"): NvpOutcome {
  const drawn = randInt(10) + 1; // 1~10
  const isHigh = drawn >= 6;
  const win = (guess === "high") === isHigh;
  return {
    outcome: win ? "win" : "lose",
    chipDelta: win ? bet : -bet,
    detail: { drawn, guess },
  };
}

// 2) 룰렛 (0~36, 유럽식 단순화). betType: 'color' | 'parity' | 'number'
const ROULETTE_RED = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);
export function playRoulette(
  bet: number,
  betType: "color" | "parity" | "number",
  betValue: string | number,
): NvpOutcome {
  const drawn = randInt(37); // 0~36
  let win = false;
  let payoutMultiple = 1;
  if (drawn === 0) {
    win = false; // 0은 모든 외부 배팅(color/parity/number-not-0) 패배 처리
  } else if (betType === "color") {
    const drawnColor = ROULETTE_RED.has(drawn) ? "red" : "black";
    win = betValue === drawnColor;
    payoutMultiple = 1;
  } else if (betType === "parity") {
    const drawnParity = drawn % 2 === 0 ? "even" : "odd";
    win = betValue === drawnParity;
    payoutMultiple = 1;
  } else if (betType === "number") {
    win = Number(betValue) === drawn;
    payoutMultiple = 35;
  }
  return {
    outcome: win ? "win" : "lose",
    chipDelta: win ? bet * payoutMultiple : -bet,
    detail: { drawn, betType, betValue },
  };
}

// 3) 레드 앤 블랙 (카드 색 맞히기, 1:1)
export function playRedBlack(bet: number, guess: "red" | "black"): NvpOutcome {
  const drawnColor = Math.random() < 0.5 ? "red" : "black";
  const win = guess === drawnColor;
  return {
    outcome: win ? "win" : "lose",
    chipDelta: win ? bet : -bet,
    detail: { drawnColor, guess },
  };
}

// ---- 블랙잭 공용 (NVP/PVP 모두 사용): 단순화된 자동 진행 방식 ----
// 카드 한 벌을 무한하다고 가정(카드 카운팅 방지, 매 판 독립 시행)하고
// 양쪽 모두 "16 이하면 히트, 17 이상이면 스탠드"인 표준 딜러 규칙을 그대로 적용합니다.
// (플레이어가 직접 히트/스탠드를 고르는 대화형 방식이 아닌 자동 진행 버전입니다 —
//  필요하면 이 함수를 확장해 턴제 API로 바꿀 수 있습니다.)
function drawCardValue(): number {
  // 1~13, 그림카드(11,12,13)는 10으로, 에이스(1)는 별도 처리
  const raw = randInt(13) + 1;
  if (raw > 10) return 10;
  return raw; // 1 = Ace
}

export type Hand = { total: number; isBlackjack: boolean; cards: number[] };

export function dealAutoHand(): Hand {
  const cards: number[] = [drawCardValue(), drawCardValue()];
  let aceCount = cards.filter((c) => c === 1).length;
  const sum = () => {
    let total = cards.reduce((a, c) => a + (c === 1 ? 11 : c), 0);
    let aces = aceCount;
    while (total > 21 && aces > 0) {
      total -= 10; // 에이스를 1로 재계산
      aces -= 1;
    }
    return total;
  };
  while (sum() < 17) {
    const c = drawCardValue();
    cards.push(c);
    if (c === 1) aceCount += 1;
  }
  const total = sum();
  return {
    total,
    isBlackjack: cards.length === 2 && total === 21,
    cards,
  };
}

// NVP 블랙잭: 러너 vs 하우스
export function playBlackjackVsHouse(bet: number): NvpOutcome {
  const player = dealAutoHand();
  const house = dealAutoHand();
  let outcome: "win" | "lose" | "push";
  let multiple = 1;
  if (player.total > 21) {
    outcome = "lose";
  } else if (house.total > 21) {
    outcome = "win";
  } else if (player.isBlackjack && !house.isBlackjack) {
    outcome = "win";
    multiple = 1.5;
  } else if (!player.isBlackjack && house.isBlackjack) {
    outcome = "lose";
  } else if (player.total === house.total) {
    outcome = "push";
  } else if (player.total > house.total) {
    outcome = "win";
  } else {
    outcome = "lose";
  }
  const chipDelta = outcome === "win"
    ? Math.floor(bet * multiple)
    : outcome === "lose"
    ? -bet
    : 0;
  return { outcome, chipDelta, detail: { player, house, multiple } };
}

// PVP 블랙잭: 두 러너의 패를 각각 자동 진행 후 비교 (하우스 없음, 3:2 보너스 없음)
export function resolvePvpBlackjack(): {
  a: Hand;
  b: Hand;
  winner: "a" | "b" | "push";
} {
  const a = dealAutoHand();
  const b = dealAutoHand();
  let winner: "a" | "b" | "push";
  if (a.total > 21 && b.total > 21) winner = "push";
  else if (a.total > 21) winner = "b";
  else if (b.total > 21) winner = "a";
  else if (a.total === b.total) winner = "push";
  else winner = a.total > b.total ? "a" : "b";
  return { a, b, winner };
}

// PVP 숫자 하이 앤 로우: 각자 1~100 난수를 뽑아 높은 쪽이 승리
export function resolvePvpHighLow(): {
  a: number;
  b: number;
  winner: "a" | "b" | "push";
} {
  const a = randInt(100) + 1;
  const b = randInt(100) + 1;
  const winner = a === b ? "push" : a > b ? "a" : "b";
  return { a, b, winner };
}

// 4) 러시안 룰렛 — 실제 총기 요소 없는 추상화된 "푸시유어럭" 미니게임.
// 6칸 중 1칸이 "위험 칸"이며, 플레이어는 미리 몇 번을 도전할지(riskLevel 1~5)
// 한 번에 정하고 결과를 즉시 확인합니다(중간에 멈출 수 있는 실시간 방식이 아닌
// 단일 요청-단일 정산 버전).
// 생존 확률 = (6 - riskLevel) / 6, 생존 시 배당 = riskLevel에 비례해 증가.
export function playRussianRoulette(
  bet: number,
  riskLevel: number,
): NvpOutcome {
  const level = Math.min(5, Math.max(1, Math.floor(riskLevel)));
  const surviveProb = (6 - level) / 6;
  const survived = Math.random() < surviveProb;
  // 공정 배당(1/확률). 칩은 정수 단위라 순이익은 반올림하되, 승리했는데 0개가 되지
  // 않도록 최소 1개는 지급합니다. (예: 1단계 = 1.2배, 3단계 = 2배, 5단계 = 6배)
  const multiple = Math.round((6 / (6 - level)) * 100) / 100;
  const chipDelta = survived
    ? Math.max(1, Math.round(bet * (multiple - 1)))
    : -bet;
  return {
    outcome: survived ? "win" : "lose",
    chipDelta,
    detail: { riskLevel: level, survived, multiple },
  };
}
