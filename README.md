# YNAB Voice Ledger

A progressive web app that lets you type expenses in natural language, parses them into structured fields, and creates transactions in YNAB — locked to a single staging account for safety.

Built with Vite + React + TypeScript + Tailwind CSS. No backend. Optional AI-powered parsing via Gemini 2.0 Flash. Installable as a PWA on mobile and desktop.

## How It Works

The workflow is designed for speed: **type → parse → review → submit**.

1. **Type** (or dictate) your expenses in plain language
2. **Parse** extracts date, payee, category, memo, and amount — using AI or the local rule-based parser
3. **Review** the parsed results in an editable table — fix anything that looks off
4. **Submit** creates all transactions in your pre-selected YNAB staging account

All transactions are created as **unapproved** and **uncleared** in YNAB, giving you a built-in review step before they affect your budget.

## AI Parser (Optional)

The app supports two parsing modes, selectable per-session with a toggle:

**AI mode** (requires a free Google AI Studio API key) — describe any number of expenses in free-form natural language, including voice dictation output:

```
so today I had lunch at dominos like two pizzas and it was about sixteen euros
and then um yesterday I grabbed coffee at starbucks for like four fifty oh and
I also went to carrefour for groceries that was around forty five euros fifty
```

Gemini 2.0 Flash extracts all 3 transactions, handles filler words, normalises brand names, maps to your real YNAB categories, and converts spoken numbers to digits.

**Local mode** (default, no API key needed) — deterministic rule-based parser, works offline, one transaction per line:

```
20th march dominos pizza dining out two pizzas for dinner 16 euros
march 15 carrefour groceries weekly shopping 45.50
today metro transport going to office 1.90
yesterday amazon shopping new headphones 29.99
```

### Getting a Gemini API key

1. Go to [Google AI Studio](https://aistudio.google.com/apikey)
2. Create a free API key (Gemini 2.0 Flash is included in the free tier)
3. During setup (step 4) or via the **Configure AI** button in the header, paste the key
4. The app validates it with a lightweight test call before saving
5. After deploying, add HTTP referrer restrictions in the Google Cloud Console to lock the key to your domain only

### Fallback behaviour

If the Gemini API is unavailable, the app automatically falls back to the local parser and shows a toast notification. Rate-limit errors show a specific "Try again in a minute" message instead of a generic error.

## Input Examples (Local Parser)

Each line is parsed independently. The parser extracts:

| Field | How it's detected |
|---|---|
| **Date** | Beginning of the line. Supports `today`, `yesterday`, `20th march`, `march 15 2026`, `15/03/2026`, `2026-03-20`. Defaults to today if omitted. Year defaults to current year if omitted. |
| **Amount** | Numeric value, typically at the end. Supports decimals with `.` or `,`. Recognizes currency words (`euros`, `eur`, `€`, `dollars`, `pounds`). Always stored as negative milliunits (YNAB format: €16.00 = -16000). |
| **Payee** | Known brands are matched first (Dominos Pizza, Carrefour, Amazon, etc.). Otherwise, the first word(s) before any category keyword are used. Punctuation is automatically cleaned. |
| **Category** | Matched against your real YNAB budget categories using scored matching (exact token > substring > keyword hint). Falls back to "Uncategorized". |
| **Memo** | Whatever descriptive text remains after extracting the other fields. |

### Category Matching

Categories are fetched from your actual YNAB budget during setup and stored locally. The parser matches input text against your real category names using a three-tier scoring system:

1. **Exact token match** — a word in your input matches a word in a category name (highest priority)
2. **Substring match** — partial word overlap between input and category names
3. **Keyword hints** — built-in mappings from common words to category fragments (e.g., "pizza" → dining, "metro" → transport)

In the review table, categories appear as a **dropdown** populated with your real YNAB categories, so you can easily reassign any transaction before submitting.

### Keyword Hint Map

| Keywords | Typical Category Match |
|---|---|
| pizza, lunch, dinner, breakfast, cafe, coffee | dining, restaurant, food, eating |
| supermarket, carrefour, monoprix, lidl, aldi | groceries, food |
| metro, bus, uber, taxi, navigo, train | transport, travel |
| amazon, clothes, shoes | shopping, clothing |
| netflix, spotify | subscription, entertainment, streaming |
| pharmacy, doctor | medical, health |
| rent, electricity, water, internet, phone | bills, utilities, housing |

If no match is found, the category defaults to "Uncategorized" — you can always fix it in the review table or in YNAB itself.

If the parser can't confidently extract a payee or amount, the row is flagged as "needs review" with a yellow highlight so you can fix it before submitting.

## Screens

### Setup Screen (one-time)

A step-by-step wizard shown on first launch:

1. **Enter your YNAB Personal Access Token** — stored in localStorage, shown as a password field with a reveal toggle
2. **Select a budget** — fetched from `GET /budgets`. This also fetches your categories from `GET /budgets/{id}/categories` so the parser can match against your real category names.
3. **Select a staging account** — fetched from `GET /budgets/{id}/accounts`, filtered to exclude closed/deleted accounts
4. **AI Parser (optional)** — enter a Google AI Studio API key to enable Gemini parsing. Validated with a lightweight test call. Skip to use local parser only.

During setup, the app also fetches **all categories** from your selected budget. These are stored locally and used for both parsing and the category dropdown in the review table.

The selected account (e.g., "Inbox") is the **only** account the app will ever write to. This is enforced architecturally, not just by convention. A "Reset Setup" button on the main screen lets you reconfigure.

### Main Screen

- The locked account name is displayed prominently at the top so you always know where transactions are going
- **Parser mode toggle** — switch between AI (Gemini) and Local modes; AI option is greyed out if no API key is configured
- Large textarea — placeholder adapts to the active mode (freeform for AI, one-per-line for local)
- **Parse** / **Parse with AI** button — shows a spinner and "Parsing with AI..." when a network call is in progress
- Toast notifications — "Parsed with AI ✓", fallback warning, or rate-limit message after each parse
- Editable review table with columns: Date, Payee, Category (dropdown), Memo, Amount, Status
- **Transaction summary** showing count and total amount before submission
- **Create All** triggers a confirmation dialog before sending to YNAB
- **Clear** resets everything
- **Configure AI** / **AI key ✓** button in the header — add or remove the Gemini key without resetting YNAB setup

### Transaction History

Below the entry form, the last 20 transactions created through the app are shown (stored in localStorage), each with date, payee, amount, and creation timestamp.

## Safety Constraints

This is the most important part of the architecture. The app is designed to be **incapable** of causing damage to your YNAB data.

### Submission Guardrails

Before any transactions are created, the app enforces multiple safety checks:

| Guardrail | Description |
|---|---|
| **Confirmation dialog** | You must explicitly confirm with "Yes, create" before any API call |
| **Total summary** | Shows the number of transactions and total amount before submission |
| **Large amount warning** | Transactions exceeding €500 are highlighted in orange with a ⚠️ warning |
| **Daily limit** | Maximum 20 transactions per day (tracked in localStorage), with a blocking warning when exceeded |
| **Review flags** | Any row the parser is uncertain about is flagged for manual review |

### Single API Module

All YNAB API communication goes through one file: `src/lib/ynab-api.ts`. This module exposes exactly **four functions**:

| Function | Method | Purpose |
|---|---|---|
| `fetchBudgets(token)` | `GET /budgets` | Setup only — list available budgets |
| `fetchAccounts(token, budgetId)` | `GET /budgets/{id}/accounts` | Setup only — list accounts in a budget |
| `fetchCategories(token, budgetId)` | `GET /budgets/{id}/categories` | Setup only — list categories for matching |
| `createTransactions(token, budgetId, accountId, transactions)` | `POST /budgets/{id}/transactions` | The only write operation |

### What the app cannot do

- **No PUT or PATCH** — cannot update existing transactions
- **No DELETE** — cannot delete anything
- **No cross-account writes** — `createTransactions` validates the account ID against the stored setup config and throws an error if they don't match
- **No other endpoints** — no scheduled transactions, no payee management, no category editing, no goal modification, no month budget changes (categories are read-only during setup)
- **No direct fetch calls** — all YNAB API traffic must go through the wrapper module

### Transaction safety defaults

Every transaction created by this app has:
- `approved: false` — appears as unapproved in YNAB so you must explicitly approve it
- `cleared: "uncleared"` — no automatic reconciliation
- `payee_name` (string, not ID) — YNAB auto-matches or creates payees
- `category_name` (string, not ID) — if the category doesn't exist, YNAB leaves it uncategorized

## Progressive Web App

The app is a fully installable PWA with:

- **Web App Manifest** — custom app name, icons, and theme color
- **Service Worker** — precaches all app assets for instant loading
- **Offline support** — the app shell loads offline (API calls still require connectivity)
- **Auto-update** — the service worker updates silently in the background
- **Home screen install** — works on iOS (via Safari's "Add to Home Screen") and Android/desktop (via browser install prompt)

### App Icons

| Size | File | Purpose |
|---|---|---|
| 192×192 | `public/pwa-192x192.png` | Android home screen, Apple touch icon |
| 512×512 | `public/pwa-512x512.png` | Splash screens, high-res displays |

## Getting Started

### Prerequisites

- Node.js 18+
- A [YNAB Personal Access Token](https://app.ynab.com/settings/developer)
- A staging/inbox account in your YNAB budget (recommended: create an account called "Inbox")

### Install and Run

```bash
npm install
npm run dev
```

The app opens at `http://localhost:5173`. Complete the one-time setup wizard to connect your YNAB account.

### Build for Production

```bash
npm run build
```

Output goes to `dist/`. This is a static PWA — deploy to Netlify, Vercel, GitHub Pages, or any static host. The service worker and manifest are generated automatically.

### Preview Production Build

```bash
npm run build && npm run preview
```

This lets you test the full PWA experience locally, including service worker registration and the install prompt.

### Other Commands

```bash
npm run lint      # Run ESLint
npm run preview   # Preview the production build locally
```

## Project Structure

```
src/
├── main.tsx                          # React entry point
├── App.tsx                           # Root component — routes between Setup and Main
├── index.css                         # Tailwind CSS import
├── components/
│   ├── SetupScreen.tsx               # One-time setup wizard (token → budget → account → AI key)
│   ├── TransactionEntry.tsx          # Main screen: mode toggle, input, parse, review, submit
│   ├── TransactionHistory.tsx        # Last 20 transactions created via the app
│   └── AiKeyModal.tsx                # Modal for adding/removing Gemini key post-setup
└── lib/
    ├── ynab-api.ts                   # YNAB API wrapper — the ONLY module that talks to YNAB
    ├── parser.ts                     # Rule-based natural language parser (local fallback)
    ├── ai-parser.ts                  # Gemini 2.0 Flash AI parser with fallback logic
    └── storage.ts                    # localStorage helpers for setup config, history, AI key
public/
├── pwa-192x192.png                   # PWA icon (192×192)
└── pwa-512x512.png                   # PWA icon (512×512)
```

## Tech Stack

| Dependency | Purpose |
|---|---|
| [Vite](https://vite.dev) | Build tool and dev server |
| [React](https://react.dev) 19 | UI framework |
| [TypeScript](https://www.typescriptlang.org) 5.9 | Type safety |
| [Tailwind CSS](https://tailwindcss.com) 4 | Utility-first styling |
| [date-fns](https://date-fns.org) 4 | Date parsing and formatting |
| [Gemini 2.0 Flash](https://ai.google.dev/gemini-api) *(optional)* | AI-powered natural language transaction parsing |

No AI SDK installed — Gemini is called directly via `fetch` to keep the bundle small. No backend server. No OAuth. No database. All state lives in localStorage.

## Design Decisions

- **AI as enhancement, not replacement**: Gemini 2.0 Flash was added to handle freeform multi-transaction input and voice dictation (Wispr Flow), which the regex parser can't handle well. The rule-based parser remains as the offline fallback — deterministic, instant, no API costs.
- **Gemini Flash specifically**: Free tier, fast response, and native JSON output mode (`responseMimeType: "application/json"`) means no prompt engineering tricks needed to get structured output. Called directly via `fetch` — no SDK, no extra bundle weight.
- **User-provided API key**: Since there's no backend, the Gemini key is stored in localStorage and sent directly to Google from the browser — the same trust model as the YNAB token. Each user uses their own key, so there's no risk of someone exploiting yours.
- **Real category matching**: Categories are fetched from your actual YNAB budget and matched using scored multi-tier logic (local parser) or passed directly to Gemini as a list (AI parser) so the model picks from your real categories.
- **Single staging account**: Rather than guarding against mistakes with confirmation dialogs alone, the app is architecturally limited to one account. You move transactions to the right account in YNAB itself.
- **Multiple guardrails**: Confirmation dialog, amount warnings, daily limits, and review flags work together to prevent mistakes.
- **Unapproved by default**: Transactions need explicit approval in YNAB, acting as a final safety net.
- **No backend**: The YNAB Personal Access Token is stored in localStorage and sent directly to the YNAB API from the browser. This is a personal tool, not a multi-user SaaS.
- **localStorage over a database**: Simple, zero-config persistence. Setup config and the last 20 transactions are all that's stored.
- **PWA for mobile use**: Installable on phone home screens for quick expense entry on the go.

## License

Personal project. Not published to npm or any package registry.
