import { createServer } from "node:http";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.join(__dirname, "classone.jinmu10a.com");
const cdnRoot = path.join(__dirname, "cdn.dcloud.net.cn");
const apiBaseUrl = process.env.APIPAY_BASE_URL || "https://bpapi.bazarbay.site/api/v1";
const apiKey = process.env.APIPAY_API_KEY || "";
const port = Number(process.env.PORT || 4173);
const mockInvoices = new Map();
const apiCacheRoot = path.join(__dirname, "api-cache");
const localAccountsFile = path.join(__dirname, "local-accounts.json");
const classoneProxyTargets = {
  "/classone-api": "https://api.jinmu10a.com/api",
  "/classone-java": "https://joapi.jinmu10a.com/app-api",
  "/classone-empr": "https://api.jmzxhw.cn/api"
};
const defaultTestAccount = {
  user_id: 7076601087,
  user_mobile: "7076601087",
  phone: "7076601087",
  area_code: "007",
  first_name: "Мадияр",
  last_name: "Жанабаев",
  nickname: "Жанабаев Мадияр",
  real_name: "Жанабаев Мадияр",
  registered_location: 1,
  user_token: "local-test-token-7076601087",
  avatar: "/static/images/tabbar/10a/my.png",
  level_name: "Тестовый аккаунт",
  integral: "0.00",
  balance: "0.00"
};

loadDotEnv(path.join(__dirname, ".env.local"));

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = rest.join("=").replace(/^["']|["']$/g, "");
  }
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        req.destroy();
        reject(new Error("Request body is too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", chunk => {
      size += chunk.length;
      if (size > 1024 * 1024) {
        req.destroy();
        reject(new Error("Request body is too large"));
      } else {
        chunks.push(chunk);
      }
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function proxyApiPay(pathname, method, payload) {
  const response = await fetch(`${apiBaseUrl}${pathname}`, {
    method,
    headers: {
      "content-type": "application/json",
      "accept": "application/json",
      "x-api-key": process.env.APIPAY_API_KEY || apiKey
    },
    body: method === "GET" ? undefined : JSON.stringify(payload)
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }
  return { ok: response.ok, status: response.status, data };
}

function createDemoQr(invoiceId) {
  const cells = Array.from({ length: 21 }, (_, y) =>
    Array.from({ length: 21 }, (_, x) => {
      const finder =
        (x < 7 && y < 7) ||
        (x > 13 && y < 7) ||
        (x < 7 && y > 13);
      if (finder) return x === 0 || y === 0 || x === 6 || y === 6 || (x > 1 && x < 5 && y > 1 && y < 5);
      return ((x * 7 + y * 11 + invoiceId) % 5) < 2;
    })
  );
  const rects = cells.flatMap((row, y) =>
    row.map((on, x) => on ? `<rect x="${x}" y="${y}" width="1" height="1"/>` : "").filter(Boolean)
  ).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" shape-rendering="crispEdges"><rect width="21" height="21" fill="#fff"/><g fill="#111">${rects}</g></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function createMockInvoice(payload, kind) {
  const id = Date.now();
  const invoice = {
    id,
    amount: Number(payload.amount || 1000).toFixed(2),
    description: payload.description || "Classone order",
    external_order_id: payload.external_order_id || `classone-${id}`,
    status: "pending",
    paid_at: null,
    phone: payload.phone_number || null,
    created_at: new Date().toISOString(),
    is_qr_token: kind === "qr",
    qr_token_url: kind === "qr" ? `https://qr.kaspi.kz/demo-${id}` : null,
    qr_image_url: kind === "qr" ? createDemoQr(id) : null,
    qr_expires_at: kind === "qr" ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null,
    demo: true
  };
  mockInvoices.set(String(id), { invoice, createdAt: Date.now() });
  return invoice;
}

async function handleApi(req, res, url) {
  try {
    if (url.pathname === "/api/apipay/config" && req.method === "GET") {
      return sendJson(res, 200, {
        mode: process.env.APIPAY_API_KEY ? "live" : "demo",
        apiBaseUrl
      });
    }

    if (url.pathname === "/api/apipay/qr" && req.method === "POST") {
      const payload = await readBody(req);
      if (!process.env.APIPAY_API_KEY) {
        return sendJson(res, 201, createMockInvoice(payload, "qr"));
      }
      const body = {
        amount: Number(payload.amount),
        description: payload.description || "Classone order",
        external_order_id: payload.external_order_id || `classone-${Date.now()}`
      };
      if (process.env.APIPAY_SANDBOX_SIMULATE) body.simulate = process.env.APIPAY_SANDBOX_SIMULATE;
      const result = await proxyApiPay("/invoices/qr", "POST", body);
      return sendJson(res, result.status, result.data);
    }

    if (url.pathname === "/api/apipay/phone" && req.method === "POST") {
      const payload = await readBody(req);
      if (!process.env.APIPAY_API_KEY) {
        return sendJson(res, 201, createMockInvoice(payload, "phone"));
      }
      const body = {
        phone_number: payload.phone_number,
        amount: Number(payload.amount),
        description: payload.description || "Classone order",
        external_order_id: payload.external_order_id || `classone-${Date.now()}`
      };
      const result = await proxyApiPay("/invoices", "POST", body);
      return sendJson(res, result.status, result.data);
    }

    const invoiceMatch = url.pathname.match(/^\/api\/apipay\/invoices\/(\d+)$/);
    if (invoiceMatch && req.method === "GET") {
      const id = invoiceMatch[1];
      if (!process.env.APIPAY_API_KEY) {
        const record = mockInvoices.get(id);
        if (!record) return sendJson(res, 404, { error: "Invoice not found" });
        if (Date.now() - record.createdAt > 6500) {
          record.invoice.status = "paid";
          record.invoice.paid_at = new Date().toISOString();
        }
        return sendJson(res, 200, record.invoice);
      }
      const result = await proxyApiPay(`/invoices/${id}`, "GET");
      return sendJson(res, result.status, result.data);
    }

    return sendJson(res, 404, { error: "API route not found" });
  } catch (error) {
    return sendJson(res, 500, { error: error.message || "Unexpected API error" });
  }
}

function classoneProxyTarget(url) {
  for (const [prefix, target] of Object.entries(classoneProxyTargets)) {
    if (url.pathname === prefix || url.pathname.startsWith(`${prefix}/`)) {
      return {
        prefix,
        target,
        pathname: url.pathname.slice(prefix.length) || "/"
      };
    }
  }
  return null;
}

function normalizePhone(value = "") {
  return String(value).replace(/[^\d]/g, "").replace(/^77/, "7").replace(/^7(?=\d{10}$)/, "").replace(/^8(?=\d{10}$)/, "");
}

function loadLocalAccounts() {
  if (!existsSync(localAccountsFile)) {
    return { accounts: [defaultTestAccount] };
  }
  try {
    const data = JSON.parse(readFileSync(localAccountsFile, "utf8"));
    if (!Array.isArray(data.accounts)) data.accounts = [];
    if (!data.accounts.some(account => account.user_mobile === defaultTestAccount.user_mobile)) {
      data.accounts.push(defaultTestAccount);
    }
    return data;
  } catch {
    return { accounts: [defaultTestAccount] };
  }
}

async function saveLocalAccounts(data) {
  await writeFile(localAccountsFile, JSON.stringify(data, null, 2));
}

function classoneSuccess(data, msg = "success") {
  return {
    code: 1,
    msg,
    data,
    time: Math.floor(Date.now() / 1000),
    user: data?.userinfo?.user_mobile || data?.user_mobile || ""
  };
}

function localUserInfo(account = defaultTestAccount) {
  return {
    ...defaultTestAccount,
    ...account,
    full_name: account.real_name || account.nickname || "Жанабаев Мадияр",
    user_token: account.user_token || `local-test-token-${account.user_mobile}`
  };
}

async function handleClassoneMock(req, res, match) {
  const pathname = match.pathname.replace(/^\/+/, "");
  const method = req.method.toUpperCase();

  if (method === "GET" && pathname === "system/dict-data/types") {
    return sendJson(res, 200, classoneSuccess({
      idd_codes: [
        { label: "Kazakhstan", value: "007" },
        { label: "中国", value: "086" }
      ],
      registered_location: [
        { label: "Kazakhstan", value: 1 },
        { label: "China", value: 2 }
      ]
    }));
  }

  if (method === "POST" && pathname === "v1/5b5bdc44796e8") {
    return sendJson(res, 200, classoneSuccess({
      verify_code: "123456",
      local_only: true
    }, "Локальный код подтверждения: 123456"));
  }

  if (method === "POST" && pathname === "v1/5cad9f63e4f94") {
    const payload = await readBody(req);
    const phone = normalizePhone(payload.user_mobile || defaultTestAccount.user_mobile) || defaultTestAccount.user_mobile;
    const data = loadLocalAccounts();
    const existing = data.accounts.find(account => account.user_mobile === phone);
    const account = localUserInfo({
      ...(existing || {}),
      user_id: existing?.user_id || Number(phone),
      user_mobile: phone,
      phone,
      area_code: payload.area_code || "007",
      registered_location: payload.registered_location || 1,
      user_token: `local-test-token-${phone}`,
      nickname: phone === defaultTestAccount.user_mobile ? "Жанабаев Мадияр" : `Local user ${phone}`,
      real_name: phone === defaultTestAccount.user_mobile ? "Жанабаев Мадияр" : `Local user ${phone}`
    });
    if (existing) {
      Object.assign(existing, account);
    } else {
      data.accounts.push(account);
    }
    await saveLocalAccounts(data);
    return sendJson(res, 200, classoneSuccess({ userinfo: account }, "Локальный аккаунт создан"));
  }

  if (method === "POST" && pathname === "v1/5c78dbfd977cf") {
    const payload = await readBody(req);
    const phone = normalizePhone(payload.user_mobile || defaultTestAccount.user_mobile) || defaultTestAccount.user_mobile;
    const data = loadLocalAccounts();
    let account = data.accounts.find(item => normalizePhone(item.user_mobile) === phone);
    if (!account && phone === defaultTestAccount.user_mobile) {
      account = defaultTestAccount;
      data.accounts.push(account);
      await saveLocalAccounts(data);
    }
    if (!account) {
      return sendJson(res, 200, { code: 0, msg: "Локальный аккаунт не найден", data: null });
    }
    return sendJson(res, 200, classoneSuccess({ userinfo: localUserInfo(account) }, "Локальный вход выполнен"));
  }

  if (method === "GET" && pathname === "member/user/user_info") {
    return sendJson(res, 200, classoneSuccess(localUserInfo(defaultTestAccount)));
  }

  if (method === "POST" && pathname === "v1/653625cbc6332") {
    return sendJson(res, 200, classoneSuccess({ logged: true }));
  }

  return false;
}

function isSensitiveClassoneWrite(req, pathname) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return false;
  if (process.env.CLASSONE_ALLOW_LIVE_WRITES === "1") return false;
  return /login|logout|register|password|pay|order|withdraw|transfer|upload|bank|user/i.test(pathname) || true;
}

async function handleClassoneProxy(req, res, url) {
  const match = classoneProxyTarget(url);
  if (!match) return false;

  const mockResponse = await handleClassoneMock(req, res, match);
  if (mockResponse !== false) return mockResponse;

  if (isSensitiveClassoneWrite(req, match.pathname)) {
    return sendJson(res, 403, {
      code: "LOCAL_PROXY_BLOCKED",
      msg: "Live write/login requests are blocked in the local clone. Set CLASSONE_ALLOW_LIVE_WRITES=1 only if you intentionally want to proxy credentials or account actions to the original Classone backend."
    });
  }

  const upstreamUrl = new URL(match.target + match.pathname);
  upstreamUrl.search = url.search;
  const cacheKey = createHash("sha256").update(`${req.method} ${upstreamUrl.href}`).digest("hex");
  const cacheFile = path.join(apiCacheRoot, `${cacheKey}.json`);

  if ((req.method === "GET" || req.method === "HEAD") && existsSync(cacheFile)) {
    const cached = JSON.parse(await readFile(cacheFile, "utf8"));
    res.writeHead(cached.status || 200, {
      "content-type": cached.contentType || "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-classone-cache": "hit"
    });
    return res.end(Buffer.from(cached.body, "base64"));
  }

  const rawBody = req.method === "GET" || req.method === "HEAD" ? undefined : await readRawBody(req);
  const headers = {
    "accept": req.headers.accept || "application/json, text/plain, */*",
    "content-type": req.headers["content-type"] || "application/json",
    "user-agent": req.headers["user-agent"] || "Mozilla/5.0 ClassoneLocalClone",
    "referer": "https://classone.jinmu10a.com/",
    "origin": "https://classone.jinmu10a.com"
  };
  if (req.headers.authorization) headers.authorization = req.headers.authorization;
  if (req.headers.token) headers.token = req.headers.token;

  try {
    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body: rawBody && rawBody.length ? rawBody : undefined
    });
    const arrayBuffer = await upstream.arrayBuffer();
    const body = Buffer.from(arrayBuffer);
    const contentType = upstream.headers.get("content-type") || "application/json; charset=utf-8";

    if (req.method === "GET" && upstream.ok) {
      await mkdir(apiCacheRoot, { recursive: true });
      await writeFile(cacheFile, JSON.stringify({
        url: upstreamUrl.href,
        status: upstream.status,
        contentType,
        body: body.toString("base64"),
        cachedAt: new Date().toISOString()
      }, null, 2));
    }

    res.writeHead(upstream.status, {
      "content-type": contentType,
      "cache-control": "no-store",
      "x-classone-cache": "miss"
    });
    return res.end(body);
  } catch (error) {
    return sendJson(res, 502, {
      code: "LOCAL_PROXY_ERROR",
      msg: error.message || "Failed to reach original Classone backend"
    });
  }
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

async function serveStatic(req, res, url) {
  const decodedPath = decodeURIComponent(url.pathname);
  const root = decodedPath.startsWith("/cdn.dcloud.net.cn/") ? path.dirname(cdnRoot) : siteRoot;
  const cleanPath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(root, cleanPath);

  if (decodedPath === "/" || decodedPath.endsWith("/")) {
    filePath = path.join(siteRoot, "index.html");
  }

  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) filePath = path.join(filePath, "index.html");
    res.writeHead(200, {
      "content-type": mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store"
    });
    createReadStream(filePath).pipe(res);
  } catch {
    const fallback = path.join(siteRoot, "index.html");
    const html = await readFile(fallback);
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    });
    res.end(html);
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname.startsWith("/api/apipay/")) return handleApi(req, res, url);
  if (classoneProxyTarget(url)) return handleClassoneProxy(req, res, url);
  return serveStatic(req, res, url);
}).listen(port, () => {
  console.log(`Classone Kaspi Pay copy is running at http://localhost:${port}`);
  console.log(`API Pay mode: ${process.env.APIPAY_API_KEY ? "live" : "demo"}`);
  console.log(`Classone live writes: ${process.env.CLASSONE_ALLOW_LIVE_WRITES === "1" ? "enabled" : "blocked"}`);
});
