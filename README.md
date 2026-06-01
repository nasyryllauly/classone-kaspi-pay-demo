# Classone Kaspi Pay / API Pay Demo

Local copy of `https://classone.jinmu10a.com` with a Kaspi Pay payment layer through ApiPay.kz.

The copy includes the original SPA shell, all discovered lazy-loaded page chunks, local `/static/images/*` assets, the original font, a local image cache for visible `oss.jinmu10a.com` assets, and same-origin proxy routes for the original Classone APIs.

## Public Demo

This repository is ready for GitHub Pages. The static public demo runs from `classone.jinmu10a.com/` and uses browser-only demo mode for Kaspi Pay:

- QR invoice is generated locally.
- Phone invoice is generated locally.
- Invoice status changes to `paid` after a few seconds for demonstration.
- No real money is charged in GitHub Pages mode.

For live ApiPay.kz requests, run the Node server locally with `APIPAY_API_KEY`.

## Classone API proxy

The original frontend base URLs were rewritten to local proxy prefixes:

- `/classone-api/*` -> `https://api.jinmu10a.com/api/*`
- `/classone-java/*` -> `https://joapi.jinmu10a.com/app-api/*`
- `/classone-empr/*` -> `https://api.jmzxhw.cn/api/*`

Public GET responses are cached under `api-cache/`. Live write requests, login, order, pay, upload, bank, and account actions are blocked by default so demo users do not accidentally send credentials or account actions to the original backend.

To intentionally allow live writes:

```bash
CLASSONE_ALLOW_LIVE_WRITES=1 npm start
```

## Local Test Account

The copy has a local-only test account:

- Name: `Жанабаев Мадияр`
- Phone: `+77076601087`
- Local phone value: `7076601087`
- Token: `local-test-token-7076601087`

Use the floating `Тестовый аккаунт: Жанабаев Мадияр` button on the login screen, or call `POST /classone-api/v1/5c78dbfd977cf` with `{"user_mobile":"7076601087"}`.

## Run

```bash
npm start
```

Open `http://localhost:4173`.

## Live API Pay mode

Create `.env.local`:

```bash
APIPAY_API_KEY=your_api_key_here
```

Optional sandbox setting:

```bash
APIPAY_SANDBOX_SIMULATE=paid
```

The local server keeps the API key private and calls:

- `POST https://bpapi.bazarbay.site/api/v1/invoices/qr`
- `POST https://bpapi.bazarbay.site/api/v1/invoices`
- `GET https://bpapi.bazarbay.site/api/v1/invoices/{id}`

Without `APIPAY_API_KEY`, the site runs in demo mode so the payment video can show the full flow without charging a real customer.
