// 이벤트가 한국에서 열린다고 가정하고, "오늘"의 기준을 UTC가 아닌
// 한국 표준시(KST, UTC+9)로 계산합니다. NVP 일일 3회 제한이 자정(KST)에
// 초기화되도록 하기 위함입니다. 다른 시간대에서 진행한다면 이 오프셋만
// 바꿔주면 됩니다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function todayKST(): string {
  const shifted = new Date(Date.now() + KST_OFFSET_MS);
  return shifted.toISOString().slice(0, 10);
}
