const CHIP_COLORS = ["red", "blue", "green", "yellow", "white"];

function fillSelect(sel, options) {
  sel.innerHTML = options.map((o) => `<option value="${o.value}">${o.label}</option>`).join("");
}

const loginPanel = document.getElementById("login-panel");
const adminBody = document.getElementById("admin-body");
const logoutLink = document.getElementById("admin-logout");

function showAdminUI() {
  loginPanel.style.display = "none";
  adminBody.style.display = "block";
  logoutLink.style.display = "inline";
  fillSelect(
    document.getElementById("value-color-select"),
    CHIP_COLORS.map((c) => ({ value: c, label: CHIP_LABELS[c] })),
  );
  loadTeams();
  loadOverview();
  loadRunners();
}

if (getAdminToken()) showAdminUI();

document.getElementById("admin-login-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const msgEl = document.getElementById("login-msg");
  try {
    const data = await callFunction("admin", { action: "login", password: fd.get("password") });
    setAdminToken(data.token);
    showAdminUI();
  } catch (e) {
    showMsg(msgEl, e.message, true);
  }
});

logoutLink.addEventListener("click", (ev) => {
  ev.preventDefault();
  clearAdminToken();
  window.location.reload();
});

// ---- 팀 ----
async function loadTeams() {
  const data = await callFunction("admin", { action: "list_teams" }, { asAdmin: true });
  document.getElementById("team-list").innerHTML = data.teams
    .map((t) => `<div class="row"><span>${t.name}</span><span class="mono">#${t.id}</span></div>`)
    .join("");
  fillSelect(document.getElementById("team-select"), [
    { value: "", label: "(팀 없음)" },
    ...data.teams.map((t) => ({ value: t.id, label: t.name })),
  ]);
}

document.getElementById("create-team-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const fd = new FormData(ev.target);
  try {
    await callFunction("admin", { action: "create_team", name: fd.get("name") }, { asAdmin: true });
    ev.target.reset();
    loadTeams();
  } catch (e) {
    alert(e.message);
  }
});

// ---- 러너 ----
const runnerForm = document.getElementById("create-runner-form");
function currentChipSum() {
  const fd = new FormData(runnerForm);
  return CHIP_COLORS.reduce((s, c) => s + (Number(fd.get(`chip_${c}`)) || 0), 0);
}
runnerForm.addEventListener("input", () => {
  document.getElementById("chip-sum").textContent = currentChipSum();
});

runnerForm.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const fd = new FormData(runnerForm);
  const msgEl = document.getElementById("create-runner-msg");
  const startingChips = {};
  for (const c of CHIP_COLORS) startingChips[c] = Number(fd.get(`chip_${c}`)) || 0;

  try {
    await callFunction(
      "admin",
      {
        action: "create_runner",
        id: fd.get("id"),
        password: fd.get("password"),
        displayName: fd.get("displayName") || fd.get("id"),
        teamId: fd.get("teamId") || null,
        startingChips,
      },
      { asAdmin: true },
    );
    showMsg(msgEl, "러너가 생성되었습니다.", false);
    runnerForm.reset();
    document.getElementById("chip-sum").textContent = "0";
    loadRunners();
  } catch (e) {
    showMsg(msgEl, e.message, true);
  }
});

async function loadRunners() {
  const data = await callFunction("admin", { action: "list_runners" }, { asAdmin: true });
  document.getElementById("runner-list").innerHTML = data.runners
    .map(
      (r) => `
    <div class="row">
      <span>${r.displayName} <span class="muted">(${r.id})</span><br/><span class="muted">${r.teamName || "팀 없음"}</span></span>
      <span class="mono">${r.totalValue}</span>
    </div>`,
    )
    .join("");
}

// ---- 칩 가치 ----
document.getElementById("set-value-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const fd = new FormData(ev.target);
  try {
    await callFunction(
      "admin",
      { action: "set_chip_value", color: fd.get("color"), value: Number(fd.get("value")) },
      { asAdmin: true },
    );
    loadOverview();
  } catch (e) {
    alert(e.message);
  }
});

// ---- 현황판 ----
async function loadOverview() {
  const data = await callFunction("admin", { action: "overview" }, { asAdmin: true });
  const values = data.chipConfig
    .map((c) => `${chipSwatch(c.color)}${CHIP_LABELS[c.color]}: ${c.value} (${c.min_value}~${c.max_value})`)
    .join("<br/>");
  const rankings = data.teamRankings
    .map((r, i) => `${i + 1}위 ${r.teamName}: ${r.totalValue}`)
    .join("<br/>");
  document.getElementById("overview").innerHTML = `
    <p><strong>칩 가치 (관리자 전용)</strong><br/>${values}</p>
    <p><strong>팀 순위</strong><br/>${rankings}</p>
    <p><strong>상점 누적 사용 횟수</strong>: ${data.globalUseCount}회 (다음 필요 수량: ${data.globalUseCount + 1}개씩)</p>
  `;
}
document.getElementById("refresh-overview").addEventListener("click", loadOverview);
