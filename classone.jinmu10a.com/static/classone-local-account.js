(function () {
  var basePath = location.pathname.endsWith("/")
    ? location.pathname
    : location.pathname.replace(/\/[^/]*$/, "/");

  var account = {
    user_id: 7076601087,
    user_mobile: "7076601087",
    phone: "7076601087",
    area_code: "007",
    first_name: "Мадияр",
    last_name: "Жанабаев",
    nickname: "Жанабаев Мадияр",
    real_name: "Жанабаев Мадияр",
    full_name: "Жанабаев Мадияр",
    registered_location: 1,
    user_token: "local-test-token-7076601087",
    avatar: basePath + "static/images/tabbar/10a/my.png",
    level_name: "Тестовый аккаунт",
    integral: "0.00",
    balance: "0.00"
  };

  window.__CLASSONE_TEST_ACCOUNT__ = account;

  function loginLocalAccount() {
    localStorage.setItem("USERINFO", JSON.stringify(account));
    localStorage.setItem("TOKEN", account.user_token);
    localStorage.setItem("from_login", "true");
    location.href = basePath + "#/pages/tabbar/index";
    setTimeout(function () {
      location.reload();
    }, 120);
  }

  function mountButton() {
    if (document.querySelector("[data-local-account-login]")) return;
    var button = document.createElement("button");
    button.type = "button";
    button.dataset.localAccountLogin = "true";
    button.textContent = "Тестовый аккаунт: Жанабаев Мадияр";
    button.style.cssText = [
      "position:fixed",
      "left:16px",
      "bottom:86px",
      "z-index:100000",
      "border:0",
      "border-radius:999px",
      "padding:12px 16px",
      "background:#111827",
      "color:#fff",
      "box-shadow:0 12px 28px rgba(15,23,42,.24)",
      "font:700 14px -apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif",
      "cursor:pointer"
    ].join(";");
    button.addEventListener("click", loginLocalAccount);
    document.body.appendChild(button);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountButton);
  } else {
    mountButton();
  }
})();
