# YNAB Voice Ledger

A progressive web app that lets you type expenses in natural language, parses them into structured fields, and creates transactions in YNAB — locked to a single staging account for safety.

Built with Vite + React + TypeScript + Tailwind CSS. No backend, no AI — just deterministic rule-based parsing and the YNAB API. Installable as a PWA on mobile and desktop.

## How It Works

The workflow is designed for speed: **type → parse → review → submit**.

1. **Type** one or more expenses in plain language (one per line)
2. **Parse** extracts date, payee, category, memo, and amount from each line
3. **Review** the parsed results in an editable table — fix anything that looks off
4. **Submit** creates all transactions in your pre-selected YNAB staging account

All transactions are created as **unapproved** and **uncleared** in YNAB, giving you a built-in review step before they affect your budget.

## Input Examples

```
20th march dominos pizza dining out two pizzas for dinner 16 euros
march 15 carrefour groceries weekly shopping 45.50
today metro transport going to office 1.90
yesterday amazon shopping new headphones 29.99
```

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
| dining, restaurant, pizza, lunch, dinner, breakfast, cafe, coffee | Dining Out |
| groceries, supermarket, carrefour, monoprix, lidl, aldi | Groceries |
| metro, bus, uber, taxi, transport, navigo, train | Transportation |
| amazon, shopping, clothes, shoes | Shopping |
| netflix, spotify, subscription | Subscriptions |
| pharmacy, doctor, medical | Medical |
| rent, electricity, water, internet, phone | Bills |

If the parser can't confidently extract a payee or amount, the row is flagged as "needs review" with a yellow highlight so you can fix it before submitting.

## Screens

### Setup Screen (one-time)

A step-by-step wizard shown on first launch:

1. **Enter your YNAB Personal Access Token** — stored in localStorage, shown as a password field with a reveal toggle
2. **Select a budget** — fetched from `GET /budgets`
3. **Select a staging account** — fetched from `GET /budgets/{id}/accounts`, filtered to exclude closed/deleted accounts

During setup, the app also fetches **all categories** from your selected budget. These are stored locally and used for both parsing and the category dropdown in the review table.

The selected account (e.g., "Inbox") is the **only** account the app will ever write to. This is enforced architecturally, not just by convention. A "Reset Setup" button on the main screen lets you reconfigure.

### Main Screen

- The locked account name is displayed prominently at the top so you always know where transactions are going
- Large textarea for typing/pasting natural language entries
- **Parse** button runs the local parser (no network calls)
- Editable review table with columns: Date, Payee, Category (dropdown), Memo, Amount, Status
- **Transaction summary** showing count and total amount before submission
- **Create All** triggers a confirmation dialog before sending to YNAB
- **Clear** resets everything

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
- **No other endpoints** — no scheduled transactions, no payee management, no category editing, no goal modification, no month budget changes
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
│   ├── SetupScreen.tsx               # One-time setup wizard (token → budget → account → categories)
│   ├── TransactionEntry.tsx          # Main screen: input, parse, review table, guardrails, submit
│   └── TransactionHistory.tsx        # Last 20 transactions created via the app
└── lib/
    ├── ynab-api.ts                   # YNAB API wrapper — the ONLY module that talks to YNAB
    ├── parser.ts                     # Rule-based natural language parser with category matching
    └── storage.ts                    # localStorage helpers for setup config and history
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
| [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) | PWA manifest and service worker generation |

No AI/LLM libraries. No backend server. No OAuth. No database. All state lives in localStorage.

## Design Decisions

- **Rule-based parser over AI**: Deterministic, fast, works offline, no API costs. The trade-off is less flexibility, but the editable review table compensates — you can always fix what the parser gets wrong.
- **Real category matching**: Categories are fetched from your actual YNAB budget and matched using scored multi-tier logic, not hardcoded strings.
- **Single staging account**: Rather than guarding against mistakes with confirmation dialogs alone, the app is architecturally limited to one account. You move transactions to the right account in YNAB itself.
- **Multiple guardrails**: Confirmation dialog, amount warnings, daily limits, and review flags work together to prevent mistakes.
- **Unapproved by default**: Transactions need explicit approval in YNAB, acting as a final safety net.
- **No backend**: The YNAB Personal Access Token is stored in localStorage and sent directly to the YNAB API from the browser. This is a personal tool, not a multi-user SaaS.
- **localStorage over a database**: Simple, zero-config persistence. Setup config and the last 20 transactions are all that's stored.
- **PWA for mobile use**: Installable on phone home screens for quick expense entry on the go.

## License

Personal project. Not published to npm or any package registry.
