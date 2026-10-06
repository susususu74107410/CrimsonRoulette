// 모든 페이지가 공유하는 API 호출 헬퍼.
// 러너 세션 토큰은 localStorage에 저장합니다 (이 사이트만 접근 가능, 기기 단위).

const TOKEN_KEY = "chipgame_token";
const RUNNER_KEY = "chipgame_runner";
const ADMIN_TOKEN_KEY = "chipgame_admin_token";

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
function setSession(token, runnerInfo) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(RUNNER_KEY, JSON.stringify(runnerInfo || {}));
}
function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(RUNNER_KEY);
}
function getRunnerInfo() {
  try {
    return JSON.parse(localStorage.getItem(RUNNER_KEY) || "{}");
  } catch {
    return {};
  }
}

function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}
function setAdminToken(token) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}
function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function callFunction(fnName, payload, { asAdmin = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = asAdmin ? getAdminToken() : getToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  if (FUNCTIONS_URL.includes("YOUR_PROJECT_REF")) {
    throw new Error("docs/js/config.js 의 FUNCTIONS_URL을 본인 Supabase 주소로 바꿔주세요.");
  }

  let res;
  try {
    res = await fetch(`${FUNCTIONS_URL}/${fnName}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload || {}),
    });
  } catch (e) {
    throw new Error("서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.");
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error("서버 응답을 처리할 수 없습니다.");
  }

  if (!res.ok) {
    if (res.status === 401 && !asAdmin) {
      clearSession();
    }
    throw new Error(data.error || "요청 처리 중 오류가 발생했습니다.");
  }
  return data;
}

function requireLogin() {
  if (!getToken()) {
    window.location.href = "login.html";
  }
}

function requireAdminLogin() {
  if (!getAdminToken()) {
    window.location.href = "admin.html";
  }
}

const CHIP_LABELS = {
  red: "레드",
  blue: "블루",
  green: "그린",
  yellow: "옐로우",
  white: "화이트",
};

const ITEM_LABELS = {
  change_value: "칩 가치 바꾸기",
  full_swap: "지정 1인과 칩 전체 교환",
  check_total: "지정 1인 칩 총합 확인",
  check_values: "현재 각 칩 가치 확인",
  check_ranking: "현재 팀 순위 확인",
};

const NVP_GAME_LABELS = {
  highlow: "하이 앤 로우",
  roulette: "룰렛",
  redblack: "레드 앤 블랙",
  blackjack: "블랙잭",
  russian: "러시안 룰렛",
};

const PVP_GAME_LABELS = {
  blackjack: "블랙잭",
  highlow: "숫자 하이 앤 로우",
};

function fmtTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function chipSwatch(color) {
  return `<span class="chip-swatch chip-${color}"></span>`;
}

function renderPersonalLogEntry(e) {
  const time = `<span class="log-time">${fmtTime(e.time)}</span>`;
  if (e.type === "nvp") {
    const cls = e.outcome === "win" ? "log-win" : e.outcome === "lose" ? "log-lose" : "";
    return `<div class="log-entry">${time}<span>[시스템전] ${NVP_GAME_LABELS[e.game] || e.game} · ${chipSwatch(e.betColor)}${e.betAmount} · <span class="${cls}">${e.outcome === "win" ? "승" : e.outcome === "lose" ? "패" : "무"} (${e.chipDelta >= 0 ? "+" : ""}${e.chipDelta})</span></span></div>`;
  }
  if (e.type === "pvp") {
    const cls = e.result === "win" ? "log-win" : e.result === "lose" ? "log-lose" : "";
    return `<div class="log-entry">${time}<span>[대인전] ${PVP_GAME_LABELS[e.game] || e.game} vs ${e.opponent} · ${chipSwatch(e.betColor)}${e.betAmount} · <span class="${cls}">${e.result === "win" ? "승" : e.result === "lose" ? "패" : "무"}</span></span></div>`;
  }
  if (e.type === "exchange") {
    return `<div class="log-entry">${time}<span>[환전] ${chipSwatch(e.fromColor)}${e.fromAmount} → ${chipSwatch(e.toColor)}${e.toAmount}</span></div>`;
  }
  if (e.type === "item_used") {
    return `<div class="log-entry">${time}<span>[아이템] ${ITEM_LABELS[e.itemKey] || e.itemKey} 사용 · ${chipSwatch(e.paidColor)}${e.paidAmount}</span></div>`;
  }
  if (e.type === "item_used_on_me") {
    return `<div class="log-entry">${time}<span class="muted">[알림] 누군가 나를 대상으로 "${ITEM_LABELS[e.itemKey] || e.itemKey}"를 사용했습니다 (사용자 비공개)</span></div>`;
  }
  return `<div class="log-entry">${time}<span>${e.type}</span></div>`;
}

function showMsg(el, text, isError) {
  el.textContent = text;
  el.className = "msg " + (isError ? "error" : "ok");
  el.style.display = text ? "block" : "none";
}
