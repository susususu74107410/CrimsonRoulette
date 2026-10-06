requireLogin();

const info = getRunnerInfo();
document.getElementById("who-name").textContent = `${info.displayName || info.id} 님`;

const ITEM_DESC = {
  change_value: "선택한 색상 칩의 가치를 원하는 값으로 바꿉니다. (2시간마다 전원 공유 쿨다운)",
  full_swap: "지정한 러너와 보유한 모든 칩을 통째로 맞바꿉니다. (1시간마다 전원 공유 쿨다운)",
  check_total: "지정한 러너의 칩 총합(가치 기준)을 확인합니다.",
  check_values: "현재 각 색상 칩의 가치를 확인합니다.",
  check_ranking: "현재 팀별 순위를 확인합니다.",
};

function itemExtraFields(key, bounds) {
  if (key === "change_value") {
    const opts = ["red", "blue", "green", "yellow", "white"]
      .map((c) => `<option value="${c}">${CHIP_LABELS[c]}</option>`)
      .join("");
    return `
      <div class="spread">
        <div><label>바꿀 칩 색상</label><select name="newValueColor">${opts}</select></div>
        <div><label>새 가치</label><input type="number" name="newValue" required /></div>
      </div>
      <p class="muted" id="bounds-hint"></p>`;
  }
  if (key === "full_swap" || key === "check_total") {
    return `<label>대상 러너 아이디</label><input type="text" name="targetId" required />`;
  }
  return "";
}

function renderCooldown(availableAt) {
  if (!availableAt) return "";
  return `<p class="muted">다음 사용 가능: ${fmtTime(availableAt)}</p>`;
}

// 구매 후 목록을 다시 그리면서 결과 문구가 사라지지 않도록 마지막 결과를 보관
const lastResults = {};

async function load() {
  const container = document.getElementById("items");
  try {
    const data = await callFunction("data", { action: "dashboard" });
    container.innerHTML = data.shopItems
      .map((item) => {
        const disabled = item.cooldownAvailableAt ? "disabled" : "";
        return `
        <div class="game-card" data-item="${item.key}">
          <h3>${ITEM_LABELS[item.key]}</h3>
          <p class="rules">${ITEM_DESC[item.key]}</p>
          <p>필요 비용: ${chipSwatch(item.color)}${item.cost}개</p>
          ${renderCooldown(item.cooldownAvailableAt)}
          <form class="buy-form" data-item="${item.key}">
            ${itemExtraFields(item.key, data.chipBounds)}
            <button type="submit" style="margin-top:10px;" ${disabled}>구매</button>
          </form>
          <div class="result mono" data-item="${item.key}">${lastResults[item.key] || ""}</div>
        </div>`;
      })
      .join("");

    // change_value 범위 힌트 표시
    document.querySelectorAll('.buy-form[data-item="change_value"] select[name="newValueColor"]')
      .forEach((sel) => {
        const hint = sel.closest(".buy-form").querySelector("#bounds-hint");
        const update = () => {
          const b = data.chipBounds[sel.value];
          hint.textContent = b ? `허용 범위: ${b.min} ~ ${b.max}` : "";
        };
        sel.addEventListener("change", update);
        update();
      });

    document.querySelectorAll(".buy-form").forEach((form) => {
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const itemKey = form.dataset.item;
        const resultEl = document.querySelector(`.result[data-item="${itemKey}"]`);
        const btn = form.querySelector("button");
        const fd = new FormData(form);
        const payload = { action: "shop_buy", itemKey };
        if (itemKey === "change_value") {
          payload.newValueColor = fd.get("newValueColor");
          payload.newValue = Number(fd.get("newValue"));
        }
        if (itemKey === "full_swap" || itemKey === "check_total") {
          payload.targetId = fd.get("targetId");
        }
        btn.disabled = true;
        resultEl.textContent = "";
        try {
          const res = await callFunction("economy", payload);
          lastResults[itemKey] = renderPurchaseResult(itemKey, res.detail);
          resultEl.innerHTML = lastResults[itemKey];
          load(); // 비용/쿨다운 갱신 (결과 문구는 lastResults 로 유지)
        } catch (e) {
          resultEl.innerHTML = `<span class="log-lose">${e.message}</span>`;
          btn.disabled = false;
        }
      });
    });
  } catch (e) {
    container.innerHTML = `<p class="msg error">불러오지 못했습니다: ${e.message}</p>`;
  }
}

function renderPurchaseResult(itemKey, detail) {
  if (itemKey === "change_value") {
    return `${chipSwatch(detail.color)}${CHIP_LABELS[detail.color]} 가치를 ${detail.newValue}(으)로 변경했습니다.`;
  }
  if (itemKey === "full_swap") {
    return `${detail.swappedWith} 님과 칩을 전부 맞바꿨습니다.`;
  }
  if (itemKey === "check_total") {
    return `${detail.targetName}(${detail.targetId}) 님의 칩 총합: <strong>${detail.totalValue}</strong>`;
  }
  if (itemKey === "check_values") {
    return Object.entries(detail.values)
      .map(([c, v]) => `${chipSwatch(c)}${CHIP_LABELS[c]}: ${v}`)
      .join(" · ");
  }
  if (itemKey === "check_ranking") {
    return detail.rankings
      .map((r, i) => `${i + 1}위 ${r.teamName} (${r.totalValue})`)
      .join(" · ");
  }
  return JSON.stringify(detail);
}

load();
