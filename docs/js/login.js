const form = document.getElementById("login-form");
const msgEl = document.getElementById("msg");

if (form) {
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    if (msgEl) {
      msgEl.style.display = "none";
    }
    
    const passwordInput = document.getElementById("password");
    const password = passwordInput ? passwordInput.value : "";
    const btn = form.querySelector("button");
    if (btn) btn.disabled = true;

    try {
      // Supabase Edge Function을 통해 비밀번호 검증
      const FUNCTIONS_URL = "https://ebpnfkycjpgfgqlscjim.supabase.co/functions/v1/admin-auth";
      
      const response = await fetch(FUNCTIONS_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password: password })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // 로그인 성공 시 세션 저장 후 대시보드로 이동
        localStorage.setItem("admin_logged_in", "true");
        window.location.href = "dashboard.html";
      } else {
        throw new Error(data.message || "비밀번호가 틀렸습니다.");
      }
    } catch (e) {
      if (msgEl) {
        msgEl.style.display = "block";
        msgEl.textContent = e.message;
      } else {
        alert(e.message);
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  });
}
