requireLogin();

const msgEl = document.getElementById("msg");
const CHIP_COLORS = ["red", "blue", "green", "yellow", "white"];

function fillColorSelects() {
  document.querySelectorAll(".color-select").forEach((sel) => {
    sel.innerHTML = CHIP_COLORS.map(
      (c) => `<option value="${c}">${CHIP_LABELS[c]}</option>`,
    ).join("");
  });
}
fillColorSelects();

const info = getRunnerInfo();
document.getElementById("who-name").textContent = `${info.displayName || info.id} 님`;

// 룰렛: 숫자 직접 선택 시 입력창 표시
const rouletteChoice = document.querySelector(".roulette-choice");
const rouletteNumberWrap = document.querySelector(".roulette-number-wrap");
rouletteChoice.addEventListener("change", () => {
  rouletteNumberWrap.style.display = rouletteChoice.value === "number" ? "block" : "none";
});

async function refreshRemaining() {
  try {
    const data = await callFunction("data", { action: "dashboard" });
    document.querySelectorAll(".remain").forEach((el) => {
      const game = el.dataset.game;
      el.textContent = data.nvpRemaining[game] ?? "-";
    });
  } catch {
    // 조용히 무시 (게임 플레이 자체는 서버가 다시 검증함)
  }
}
refreshRemaining();

document.querySelectorAll(".nvp-form").forEach((form) => {
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const game = form.dataset.game;
    const resultEl = document.querySelector(`.result[data-game="${game}"]`);
    const btn = form.querySelector("button");
    const fd = new FormData(form);
    const payload = {
      action: "nvp_play",
      game,
      betColor: fd.get("betColor"),
      betAmount: Number(fd.get("betAmount")),
    };
    if (game === "highlow") payload.guess = fd.get("guess");
    if (game === "redblack") payload.guess = fd.get("guess");
    if (game === "russian") payload.riskLevel = Number(fd.get("riskLevel"));
    if (game === "roulette") {
      const choice = fd.get("choice");
      if (choice === "number") {
        payload.betType = "number";
        payload.betValue = Number(fd.get("numberValue"));
      } else {
        const [betType, betValue] = choice.split(":");
        payload.betType = betType;
        payload.betValue = betValue;
      }
    }

    btn.disabled = true;
    resultEl.textContent = "";
    try {
      const data = await callFunction("game", payload);
      const cls = data.outcome === "win" ? "log-win" : data.outcome === "lose" ? "log-lose" : "";
      const label = data.outcome === "win" ? "승리" : data.outcome === "lose" ? "패배" : "무승부";
      resultEl.innerHTML = `<span class="${cls}">${label}</span> (${data.chipDelta >= 0 ? "+" : ""}${data.chipDelta}) · 남은 횟수 ${data.remainingToday}`;
      const remainEl = document.querySelector(`.remain[data-game="${game}"]`);
      if (remainEl) remainEl.textContent = data.remainingToday;
    } catch (e) {
      resultEl.innerHTML = `<span class="log-lose">${e.message}</span>`;
    } finally {
      btn.disabled = false;
    }
  });
});

// ---- PVP 만들기 ----
document.getElementById("pvp-create-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const resultEl = document.getElementById("pvp-create-result");
  const btn = ev.target.querySelector("button");
  btn.disabled = true;
  try {
    const data = await callFunction("game", {
      action: "pvp_create",
      game: fd.get("game"),
      betColor: fd.get("betColor"),
      betAmount: Number(fd.get("betAmount")),
    });
    resultEl.innerHTML = `발급된 코드: <strong style="font-size:1.3rem;">${data.code}</strong><br /><span class="muted">이 코드는 15분 후 만료되며, 아무도 참가하지 않으면 베팅한 칩은 자동으로 환불됩니다.</span>`;
  } catch (e) {
    resultEl.innerHTML = `<span class="log-lose">${e.message}</span>`;
  } finally {
    btn.disabled = false;
  }
});

// ---- PVP 참가 ----
document.getElementById("pvp-join-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const resultEl = document.getElementById("pvp-join-result");
  const btn = ev.target.querySelector("button");
  btn.disabled = true;
  try {
    const data = await callFunction("game", {
      action: "pvp_join",
      code: String(fd.get("code") || "").toUpperCase(),
    });
    const cls = data.result === "win" ? "log-win" : data.result === "lose" ? "log-lose" : "";
    const label = data.result === "win" ? "승리" : data.result === "lose" ? "패배" : "무승부";
    resultEl.innerHTML = `<span class="${cls}">${label}</span> — ${PVP_GAME_LABELS[data.game]} · ${chipSwatch(data.betColor)}${data.betAmount}`;
  } catch (e) {
    resultEl.innerHTML = `<span class="log-lose">${e.message}</span>`;
  } finally {
    btn.disabled = false;
  }
});

// ---- 환전 ----
document.getElementById("exchange-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const resultEl = document.getElementById("exchange-result");
  const btn = ev.target.querySelector("button");
  const fromColor = fd.get("fromColor");
  const toColor = fd.get("toColor");
  if (fromColor === toColor) {
    resultEl.innerHTML = `<span class="log-lose">서로 다른 색상을 선택해주세요.</span>`;
    return;
  }
  btn.disabled = true;
  try {
    const data = await callFunction("economy", {
      action: "exchange",
      fromColor,
      toColor,
      amount: Number(fd.get("amount")),
    });
    resultEl.innerHTML = `${chipSwatch(toColor)}${data.toAmount}개를 받았습니다.`;
  } catch (e) {
    resultEl.innerHTML = `<span class="log-lose">${e.message}</span>`;
  } finally {
    btn.disabled = false;
  }
});
