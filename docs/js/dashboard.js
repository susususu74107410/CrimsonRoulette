requireLogin();

document.getElementById("logout-link").addEventListener("click", async (ev) => {
  ev.preventDefault();
  try {
    await callFunction("auth", { action: "logout" });
  } catch {
    // 무시하고 로그아웃 진행
  }
  clearSession();
  window.location.href = "login.html";
});

(async function load() {
  const info = getRunnerInfo();
  document.getElementById("who-name").textContent =
    `${info.displayName || info.id} 님`;

  try {
    const data = await callFunction("data", { action: "dashboard" });

    document.getElementById("total-value").textContent = data.totalValue;
    document.getElementById("team-name").textContent = data.teamName
      ? `소속 팀: ${data.teamName}`
      : "소속 팀 없음";

    const chipListEl = document.getElementById("chip-list");
    chipListEl.innerHTML = Object.entries(data.chipCounts)
      .map(
        ([color, count]) => `
        <div class="row">
          <span>${chipSwatch(color)}${CHIP_LABELS[color]}</span>
          <span class="chip-count">${count}</span>
        </div>`,
      )
      .join("");

    const nvpEl = document.getElementById("nvp-remaining");
    nvpEl.innerHTML = Object.entries(data.nvpRemaining)
      .map(
        ([game, remaining]) => `
        <div class="row">
          <span>${NVP_GAME_LABELS[game] || game}</span>
          <span class="mono">${remaining} / 3</span>
        </div>`,
      )
      .join("");

    if (data.pendingPvpSessions && data.pendingPvpSessions.length > 0) {
      document.getElementById("pending-pvp-panel").style.display = "block";
      document.getElementById("pending-pvp-list").innerHTML = data.pendingPvpSessions
        .map(
          (s) => `
        <div class="row">
          <span>${PVP_GAME_LABELS[s.game] || s.game} · ${chipSwatch(s.bet_color)}${s.bet_amount}</span>
          <span class="mono">${s.code}</span>
        </div>`,
        )
        .join("");
    }

    const logEl = document.getElementById("personal-log");
    if (!data.personalLog || data.personalLog.length === 0) {
      logEl.innerHTML = '<p class="muted">아직 기록이 없습니다.</p>';
    } else {
      logEl.innerHTML = data.personalLog.map(renderPersonalLogEntry).join("");
    }
  } catch (e) {
    document.getElementById("personal-log").innerHTML =
      `<p class="msg error">불러오지 못했습니다: ${e.message}</p>`;
  }
})();
