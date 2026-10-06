(async function () {
  const listEl = document.getElementById("log-list");
  try {
    const data = await callFunction("data", { action: "public_log" });
    if (!data.entries || data.entries.length === 0) {
      listEl.innerHTML = '<p class="muted">아직 기록이 없습니다.</p>';
      return;
    }
    listEl.innerHTML = data.entries
      .map(
        (e) => `
      <div class="log-entry">
        <span class="log-time">${fmtTime(e.time)}</span>
        <span>${ITEM_LABELS[e.itemKey] || e.itemKey} 사용됨</span>
      </div>`,
      )
      .join("");
  } catch (e) {
    listEl.innerHTML = `<p class="muted">공개 기록을 불러오지 못했습니다. (${e.message})</p>`;
  }
})();
