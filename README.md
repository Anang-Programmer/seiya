<div align="center">

<img src="docs/images/banner.png" alt="Seiya: money decisions, made together" width="100%" />

<br />

[![Live](https://img.shields.io/badge/live-seiya.web.id-B45529?style=for-the-badge)](https://seiya.web.id)
![Next.js 16](https://img.shields.io/badge/Next.js-16-2A2B2F?style=for-the-badge&logo=nextdotjs&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-2D5232?style=for-the-badge&logo=supabase&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-sin1-2A2B2F?style=for-the-badge&logo=vercel&logoColor=white)

**[Open the app](https://seiya.web.id)** · [Demo video](#demo-video) · [How it works](#how-it-works) · [Features](#features) · [Run it locally](#run-it-locally) · [Developer guide](docs/DEVELOPER.md)

</div>

---

## What is Seiya?

Money fights between couples rarely start with big decisions. They start with small surprises: a purchase the other person didn't know about, a late-night impulse buy, a bill nobody remembered.

**Seiya** is a couple-finance co-pilot that prevents those surprises:

- 🤝 **Agree once.** Both partners sign one set of money rules, called **Seiya's Promise**.
- 🔑 **Seiya enforces it.** Big shared purchases need the partner's PIN. Late-night impulse buys wait until morning.
- 🔒 **Privacy stays.** Personal wallets stay personal. Only shared money is decided together.
- 💬 **Just ask.** Log spending, scan a receipt or add a bill by chatting with Seiya.

> All money in this MVP is **simulated**. No endpoint moves real money.

## Demo video

<div align="center">

[![Watch the Seiya demo on YouTube](docs/images/demo-video.jpg)](https://youtu.be/eRDdkp4D1XI)

▶️ **[Watch on YouTube](https://youtu.be/eRDdkp4D1XI)**

</div>

## How it works

### 1 · Start together

<img src="docs/images/flow-getting-started.png" alt="Sign up, create or join a shared space, answer 21 questions, sign Seiya's Promise, open the wallets, create a security PIN" width="100%" />

### 2 · Every expense passes the Dual-Key Gateway

<img src="docs/images/flow-expense-gateway.png" alt="An expense is checked for cooling-off first, then for partner approval, and is recorded only when both checks pass" width="100%" />

The rules come from the numbers both partners agreed on. They are enforced by the database (RLS and server-side functions), never by the screen or by the AI.

## Features

| | Feature | What it does |
|---|---|---|
| 📜 | **Seiya's Promise** | The AI drafts the rules from both partners' answers: cost split, "discuss first" limit, cooling-off, privacy. The rules go live when both sign the same version. |
| 🔑 | **Dual-key approvals** | A shared expense above the limit waits for the partner's 6-digit PIN. You can never approve your own request. |
| ⏳ | **Waiting List** | Late-night or impulse buys above the cooling-off limit are held. Afterwards you continue (checked again) or cancel. |
| 💬 | **Ask Seiya** | Chat in your own words: "I spent 150k on groceries", "add the electricity bill", "how much do we have left?". |
| 🧾 | **Receipts and statements** | Receipt photos are read on your device (OCR). Bank statements (PDF, Excel, CSV) are imported after you confirm. |
| 👛 | **Wallets** | One shared wallet and one personal wallet each, with Add money, a starting balance and multi-currency support. |
| 📅 | **Bills and Plan** | Due dates, recurring bills, budgets and couple goals. Deleting a shared goal needs both partners. |
| ⚖️ | **Settle up** | Each shared expense is split by your agreed %, so Seiya always knows who owes whom. |

## Built with

| Layer | Technology |
|---|---|
| App | Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4 |
| Data and auth | Supabase: Postgres, Row Level Security, server-side RPCs |
| AI | Provider router with fallback (Groq → Mistral → OpenRouter → Cloudflare), RAG over the product knowledge |
| On-device reading | `tesseract.js` (receipt OCR), `unpdf`, SheetJS |
| Hosting | Vercel, Singapore region (`sin1`), next to the database |

## Run it locally

Requires Node.js 20+, a Supabase project and at least one AI provider key.

```bash
npm install
cp .env.example .env.local   # fill in the values
npx supabase db push         # apply the database migrations
npm run dev                  # http://localhost:3000
```

Environment variables, database, deployment, the full API reference and the test scripts are in the **[Developer guide](docs/DEVELOPER.md)**.

---

<div align="center">
  <img src="public/seiya-icon.svg" alt="Seiya" width="40" />
  <br />
  <sub>Seiya · money decisions, made together · <a href="https://seiya.web.id">seiya.web.id</a></sub>
</div>
