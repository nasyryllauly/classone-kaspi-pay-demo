(function () {
  var basePath = location.pathname.endsWith("/")
    ? location.pathname
    : location.pathname.replace(/\/[^/]*$/, "/");

  function asset(path) {
    return basePath + path.replace(/^\/+/, "");
  }

  function ok(data) {
    return { code: 1, msg: "static demo", data: data, time: Date.now() };
  }

  var products = [
    {
      product_id: 10001,
      name: "CLASS ONE Membership",
      subtitle: "CLASS ONE 会员权益套餐",
      thumb: asset("oss/uploads/images/2e/3fc8b19414c74cbbdf3f7a17ecdad7.png"),
      price_sale: "19900",
      integralPriceSale: "199"
    },
    {
      product_id: 10002,
      name: "Premium Shopping Card",
      subtitle: "精选购物权益卡",
      thumb: asset("static/images/my/demo.png"),
      price_sale: "29900",
      integralPriceSale: "299"
    },
    {
      product_id: 10003,
      name: "Service Package",
      subtitle: "跨境服务包",
      thumb: asset("static/images/fn.png"),
      price_sale: "9900",
      integralPriceSale: "99"
    }
  ];

  var mocks = [
    {
      test: /promotion\/home\/config/,
      response: ok({
        banners: [
          {
            id: 1,
            thumb: asset("static/images/my/demo.png"),
            href: "/pages/goods/productList",
            is_within: 1,
            is_article: 0
          },
          {
            id: 2,
            thumb: asset("static/images/wallet/coupon-bg.png"),
            href: "/pages/wallet/recharge",
            is_within: 1,
            is_article: 0
          }
        ],
        jgs: [],
        activityPopups: [],
        latestArticle: {
          id: 9001,
          title: "Kaspi Pay demo is ready. Static storefront data is loaded for presentation."
        }
      })
    },
    {
      test: /product\/spu\/list/,
      response: ok({
        total: products.length,
        list: [
          {
            series_id: "demo-series",
            series_title: "CLASS ONE Demo Products",
            set_color: "#f50505",
            goods_list: products
          }
        ]
      })
    },
    {
      test: /promotion\/home\/pending-msg-count/,
      response: ok({ article_total: 1 })
    },
    {
      test: /promotion\/home\/country-config|member\/config\/country|system\/config\/country|countryConfig|country-config/,
      response: ok({
        currencyCode: "KZT",
        exchangeRate: "1",
        showIntegral: true,
        symbolPosition: 1,
        priceSymbol: "₸"
      })
    },
    {
      test: /v1\/650ba9d0cb44e/,
      response: ok([
        {
          id: 9001,
          title: "Kaspi Pay demo is ready. Static storefront data is loaded for presentation."
        }
      ])
    },
    {
      test: /v1\/650c247b99254/,
      response: ok([])
    },
    {
      test: /v1\/6554485c69891/,
      response: ok(null)
    }
  ];

  function findMock(url) {
    var path = String(url || "");
    return mocks.find(function (mock) { return mock.test.test(path); });
  }

  function jsonResponse(body) {
    return JSON.stringify(body);
  }

  if (window.fetch) {
    var originalFetch = window.fetch.bind(window);
    window.fetch = function (input, options) {
      var url = typeof input === "string" ? input : input && input.url;
      var mock = findMock(url);
      if (!mock) return originalFetch(input, options);
      return Promise.resolve(new Response(jsonResponse(mock.response), {
        status: 200,
        headers: { "content-type": "application/json" }
      }));
    };
  }

  var OriginalXHR = window.XMLHttpRequest;
  if (!OriginalXHR) return;

  function StaticXHR() {
    this._xhr = new OriginalXHR();
    this._headers = {};
    this.readyState = 0;
    this.status = 0;
    this.statusText = "";
    this.responseText = "";
    this.response = "";
  }

  StaticXHR.prototype.open = function (method, url, async, user, password) {
    this._method = method;
    this._url = url;
    this._mock = findMock(url);
    if (!this._mock) return this._xhr.open(method, url, async !== false, user, password);
    this.readyState = 1;
    if (this.onreadystatechange) this.onreadystatechange();
  };

  StaticXHR.prototype.setRequestHeader = function (key, value) {
    if (this._mock) this._headers[key] = value;
    else this._xhr.setRequestHeader(key, value);
  };

  StaticXHR.prototype.getResponseHeader = function (key) {
    if (this._mock && key && key.toLowerCase() === "content-type") return "application/json";
    return this._xhr.getResponseHeader(key);
  };

  StaticXHR.prototype.getAllResponseHeaders = function () {
    if (this._mock) return "content-type: application/json\r\n";
    return this._xhr.getAllResponseHeaders();
  };

  StaticXHR.prototype.send = function () {
    var self = this;
    if (!this._mock) {
      this._xhr.onreadystatechange = function () {
        copyXhr(self);
        if (self.onreadystatechange) self.onreadystatechange();
      };
      this._xhr.onload = function (event) { if (self.onload) self.onload(event); };
      this._xhr.onerror = function (event) { if (self.onerror) self.onerror(event); };
      return this._xhr.send.apply(this._xhr, arguments);
    }

    setTimeout(function () {
      self.readyState = 4;
      self.status = 200;
      self.statusText = "OK";
      self.responseText = jsonResponse(self._mock.response);
      self.response = self.responseText;
      if (self.onreadystatechange) self.onreadystatechange();
      if (self.onload) self.onload();
      if (self.onloadend) self.onloadend();
    }, 20);
  };

  StaticXHR.prototype.abort = function () {
    if (this._mock) return;
    return this._xhr.abort();
  };

  function copyXhr(wrapper) {
    var xhr = wrapper._xhr;
    wrapper.readyState = xhr.readyState;
    wrapper.status = xhr.status;
    wrapper.statusText = xhr.statusText;
    wrapper.responseText = xhr.responseText;
    wrapper.response = xhr.response;
  }

  ["timeout", "withCredentials", "responseType"].forEach(function (prop) {
    Object.defineProperty(StaticXHR.prototype, prop, {
      get: function () { return this._mock ? this["_" + prop] : this._xhr[prop]; },
      set: function (value) {
        if (this._mock) this["_" + prop] = value;
        else this._xhr[prop] = value;
      }
    });
  });

  window.XMLHttpRequest = StaticXHR;
})();
