(function () {
  var pollTimer = null;
  var staticDemoInvoices = {};

  function qs(selector, root) {
    return (root || document).querySelector(selector);
  }

  function request(path, options) {
    var config = window.CLASSONE_APIPAY || {};
    var backendUrl = String(config.backendUrl || "").replace(/\/+$/, "");
    var url = backendUrl ? backendUrl + path : path;

    return fetch(url, Object.assign({
      headers: { "content-type": "application/json" }
    }, options || {})).then(function (response) {
      return response.json().then(function (data) {
        if (!response.ok) {
          var message = data.message || data.error || "API Pay request failed";
          throw new Error(message);
        }
        return data;
      });
    }).catch(function (error) {
      if (!backendUrl && config.allowStaticDemoFallback !== false && path.indexOf("/api/apipay/") === 0) {
        return staticDemoRequest(path, options, error);
      }
      throw error;
    });
  }

  function staticDemoRequest(path, options) {
    var payload = {};
    try {
      payload = options && options.body ? JSON.parse(options.body) : {};
    } catch (error) {
      payload = {};
    }

    if (path === "/api/apipay/config") {
      return Promise.resolve({
        mode: "static-demo",
        apiBaseUrl: "GitHub Pages static demo"
      });
    }

    if (path === "/api/apipay/qr" || path === "/api/apipay/phone") {
      var id = Date.now();
      var invoice = {
        id: id,
        amount: money(payload.amount).toFixed(2),
        description: payload.description || "Classone demo order",
        external_order_id: payload.external_order_id || "classone-static-demo",
        status: "pending",
        paid_at: null,
        phone: payload.phone_number || null,
        created_at: new Date().toISOString(),
        is_qr_token: path === "/api/apipay/qr",
        qr_token_url: path === "/api/apipay/qr" ? "https://qr.kaspi.kz/static-demo-" + id : null,
        qr_image_url: path === "/api/apipay/qr" ? createStaticDemoQr(id) : null,
        qr_expires_at: path === "/api/apipay/qr" ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null,
        demo: true
      };
      staticDemoInvoices[id] = { invoice: invoice, createdAt: Date.now() };
      return Promise.resolve(invoice);
    }

    var invoiceMatch = path.match(/^\/api\/apipay\/invoices\/(\d+)$/);
    if (invoiceMatch) {
      var record = staticDemoInvoices[invoiceMatch[1]];
      if (!record) return Promise.reject(new Error("Static demo invoice not found"));
      if (Date.now() - record.createdAt > 6500) {
        record.invoice.status = "paid";
        record.invoice.paid_at = new Date().toISOString();
      }
      return Promise.resolve(record.invoice);
    }

    return Promise.reject(new Error("Static demo route not found"));
  }

  function createStaticDemoQr(invoiceId) {
    var rects = "";
    for (var y = 0; y < 21; y += 1) {
      for (var x = 0; x < 21; x += 1) {
        var finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
        var on = finder
          ? x === 0 || y === 0 || x === 6 || y === 6 || (x > 1 && x < 5 && y > 1 && y < 5)
          : ((x * 7 + y * 11 + invoiceId) % 5) < 2;
        if (on) rects += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';
      }
    }
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" shape-rendering="crispEdges"><rect width="21" height="21" fill="#fff"/><g fill="#111">' + rects + "</g></svg>";
    return "data:image/svg+xml;base64," + btoa(svg);
  }

  function money(value) {
    var number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return 1000;
    return Math.round(number * 100) / 100;
  }

  function setResult(html) {
    qs("[data-kaspi-result]").innerHTML = html;
  }

  function statusText(status) {
    var map = {
      paid: "已支付 / оплачено",
      pending: "等待付款 / ожидание оплаты",
      processing: "处理中 / обработка",
      expired: "已过期 / истекло",
      cancelled: "已取消 / отменено"
    };
    return map[status] || status || "等待状态 / ожидание статуса";
  }

  function pollInvoice(id) {
    clearInterval(pollTimer);
    pollTimer = setInterval(function () {
      request("/api/apipay/invoices/" + id)
        .then(function (invoice) {
          var status = invoice.status || "pending";
          var node = qs("[data-kaspi-status]");
          if (node) {
            node.textContent = statusText(status);
            node.className = "kaspi-pay-status" + (status === "paid" ? " is-paid" : "");
          }
          if (["paid", "expired", "cancelled"].indexOf(status) !== -1) clearInterval(pollTimer);
        })
        .catch(function (error) {
          clearInterval(pollTimer);
          setResult("<strong>状态检查失败 / ошибка проверки</strong><br>" + error.message);
        });
    }, 2200);
  }

  function createQr() {
    var amount = money(qs("[data-kaspi-amount]").value);
    var externalOrderId = qs("[data-kaspi-order]").value.trim() || ("classone-" + Date.now());
    setResult("正在创建 Kaspi Pay QR / создаем QR...");
    request("/api/apipay/qr", {
      method: "POST",
      body: JSON.stringify({
        amount: amount,
        external_order_id: externalOrderId,
        description: "Classone order " + externalOrderId
      })
    }).then(function (invoice) {
      setResult(
        (invoice.qr_image_url ? '<img alt="Kaspi Pay QR" src="' + invoice.qr_image_url + '">' : "") +
        '<span class="kaspi-pay-status" data-kaspi-status>' + statusText(invoice.status) + "</span>" +
        (invoice.qr_token_url ? '<a class="kaspi-pay-link" href="' + invoice.qr_token_url + '" target="_blank" rel="noreferrer">打开 Kaspi Pay 链接 / открыть ссылку Kaspi</a>' : "") +
        '<small>Invoice ID: ' + invoice.id + " · " + invoice.amount + " ₸</small>"
      );
      if (invoice.id) pollInvoice(invoice.id);
    }).catch(function (error) {
      setResult("<strong>无法创建 QR / QR не создан</strong><br>" + error.message);
    });
  }

  function createPhoneInvoice() {
    var amount = money(qs("[data-kaspi-amount]").value);
    var phone = qs("[data-kaspi-phone]").value.trim();
    var externalOrderId = qs("[data-kaspi-order]").value.trim() || ("classone-" + Date.now());
    if (!/^8\d{10}$/.test(phone)) {
      setResult("请输入格式为 8XXXXXXXXXX 的号码 / введите номер в формате 8XXXXXXXXXX");
      return;
    }
    setResult("正在发送 Kaspi Pay invoice / выставляем счет...");
    request("/api/apipay/phone", {
      method: "POST",
      body: JSON.stringify({
        phone_number: phone,
        amount: amount,
        external_order_id: externalOrderId,
        description: "Classone order " + externalOrderId
      })
    }).then(function (invoice) {
      setResult(
        '<span class="kaspi-pay-status" data-kaspi-status>' + statusText(invoice.status) + "</span>" +
        "<small>Invoice ID: " + invoice.id + " · " + invoice.amount + " ₸ · " + (invoice.phone || phone) + "</small>"
      );
      if (invoice.id) pollInvoice(invoice.id);
    }).catch(function (error) {
      setResult("<strong>无法创建 invoice / счет не создан</strong><br>" + error.message);
    });
  }

  function openModal() {
    qs("[data-kaspi-modal]").hidden = false;
    request("/api/apipay/config").then(function (config) {
      qs("[data-kaspi-mode]").textContent = config.mode === "live"
        ? "Live API Pay"
        : config.mode === "static-demo"
          ? "Static demo mode: GitHub Pages"
          : "Demo mode: add APIPAY_API_KEY for live Kaspi Pay";
    }).catch(function () {});
  }

  function closeModal() {
    clearInterval(pollTimer);
    qs("[data-kaspi-modal]").hidden = true;
  }

  function mount() {
    if (qs("[data-kaspi-launcher]")) return;
    var launcher = document.createElement("button");
    launcher.type = "button";
    launcher.className = "kaspi-pay-launcher";
    launcher.dataset.kaspiLauncher = "true";
    launcher.textContent = "Kaspi Pay";
    launcher.addEventListener("click", openModal);

    var modal = document.createElement("div");
    modal.className = "kaspi-pay-modal";
    modal.dataset.kaspiModal = "true";
    modal.hidden = true;
    modal.innerHTML = '' +
      '<section class="kaspi-pay-panel" role="dialog" aria-modal="true" aria-label="Kaspi Pay">' +
        '<header class="kaspi-pay-head">' +
          '<div><h2 class="kaspi-pay-title">Kaspi Pay 支付</h2><p class="kaspi-pay-subtitle" data-kaspi-mode>Checking API Pay...</p></div>' +
          '<button class="kaspi-pay-close" type="button" aria-label="Close" data-kaspi-close>&times;</button>' +
        '</header>' +
        '<div class="kaspi-pay-body">' +
          '<label class="kaspi-pay-field">金额 / сумма, ₸<input data-kaspi-amount inputmode="decimal" value="1000"></label>' +
          '<label class="kaspi-pay-field">订单号 / order ID<input data-kaspi-order value="classone-demo"></label>' +
          '<label class="kaspi-pay-field">手机号 invoice / телефон<input data-kaspi-phone inputmode="numeric" placeholder="87001234567"></label>' +
          '<div class="kaspi-pay-actions">' +
            '<button class="kaspi-pay-primary" type="button" data-kaspi-create-qr>生成 QR / QR</button>' +
            '<button class="kaspi-pay-secondary" type="button" data-kaspi-create-phone>发送 invoice</button>' +
          '</div>' +
          '<div class="kaspi-pay-result" data-kaspi-result>选择 QR 或手机号 invoice / выберите QR или счет по телефону</div>' +
          '<p class="kaspi-pay-note">API Pay docs: POST /invoices/qr, POST /invoices, GET /invoices/{id}. API key is kept on the local server.</p>' +
        '</div>' +
      '</section>';

    document.body.appendChild(launcher);
    document.body.appendChild(modal);
    qs("[data-kaspi-close]", modal).addEventListener("click", closeModal);
    qs("[data-kaspi-create-qr]", modal).addEventListener("click", createQr);
    qs("[data-kaspi-create-phone]", modal).addEventListener("click", createPhoneInvoice);
    modal.addEventListener("click", function (event) {
      if (event.target === modal) closeModal();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
