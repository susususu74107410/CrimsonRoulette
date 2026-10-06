if (getToken()) {
  window.location.href = "dashboard.html";
}

const form = document.getElementById("login-form");
const msgEl = document.getElementById("msg");

form.addEventListener("submit", async (ev) => {
  ev.preventDefault();
  showMsg(msgEl, "", false);
  msgEl.style.display = "none";
  const id = document.getElementById("id").value.trim();
  const password = document.getElementById("password").value;
  const btn = form.querySelector("button");
  btn.disabled = true;
  try {
    const data = await callFunction("auth", { action: "login", id, password });
    setSession(data.token, {
      id: data.runnerId,
      displayName: data.displayName,
      teamName: data.teamName,
    });
    window.location.href = "dashboard.html";
  } catch (e) {
    showMsg(msgEl, e.message, true);
  } finally {
    btn.disabled = false;
  }
});
