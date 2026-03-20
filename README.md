# YNAB Voice Ledger

A single-page web app that lets you type expenses in natural language, parses them into structured fields, and creates transactions in YNAB — locked to a single staging account for safety.

Built with Vite + React + TypeScript + Tailwind CSS. No backend, no AI — just deterministic rule-based parsing and the YNAB API.

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
| **Amount** | Numeric value, typically at the end. Supports decimals with `.` or `,`. Recognizes currency words (`euros`, `eur`, `€`). Always stored as negative milliunits (YNAB format: €16.00 = -16000). |
| **Payee** | Known brands are matched first (Dominos Pizza, Carrefour, Amazon, etc.). Otherwise, the first word(s) before any category keyword are used. |
| **Category** | Matched against your real YNAB categories (fetched during setup). Keyword hints help map common words to the right category. Falls back to "Uncategorized". |
| **Memo** | Whatever descriptive text remains after extracting the other fields. |

### Category Matching

During setup, the app fetches all your real YNAB categories via `GET /budgets/{id}/categories`. When parsing, category detection works in two passes:

1. **Direct match** — words in your input are compared against tokens from your real category names. For example, typing "groceries" matches your "Groceries" category directly.
2. **Hint-based match** — common keywords are mapped to category name fragments so the parser can find the right category even when the category name itself isn't in the input:

| Keywords | Matched to categories containing... |
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

The selected account (e.g., "Inbox") is the **only** account the app will ever write to. This is enforced architecturally, not just by convention. A "Reset Setup" button on the main screen lets you reconfigure.

### Main Screen

- The locked account name is displayed prominently at the top so you always know where transactions are going
- Large textarea for typing/pasting natural language entries
- **Parse** button runs the local parser (no network calls)
- Editable review table with columns: Date, Payee, Category, Memo, Amount, Status
- **Create All** submits to YNAB, showing green/red per-row feedback
- **Clear** resets everything

### Transaction History

Below the entry form, the last 20 transactions created through the app are shown (stored in localStorage), each with date, payee, amount, and creation timestamp.

## Safety Constraints

This is the most important part of the architecture. The app is designed to be **incapable** of causing damage to your YNAB data.

### Single API Module

All YNAB API communication goes through one file: `src/lib/ynab-api.ts`. This module exposes exactly **four functions**:

| Function | Method | Purpose |
|---|---|---|
| `fetchBudgets(token)` | `GET /budgets` | Setup only — list available budgets |
| `fetchAccounts(token, budgetId)` | `GET /budgets/{id}/accounts` | Setup only — list accounts in a budget |
| `fetchCategories(token, budgetId)` | `GET /budgets/{id}/categories` | Setup only — fetch real category names for parsing |
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

Output goes to `dist/`. This is a static SPA — deploy to Netlify, Vercel, GitHub Pages, or any static host.

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
│   ├── SetupScreen.tsx               # One-time setup wizard (token → budget → account)
│   ├── TransactionEntry.tsx          # Main screen: input, parse, review table, submit
│   └── TransactionHistory.tsx        # Last 20 transactions created via the app
└── lib/
    ├── ynab-api.ts                   # YNAB API wrapper — the ONLY module that talks to YNAB
    ├── parser.ts                     # Rule-based natural language parser
    └── storage.ts                    # localStorage helpers for setup config and history
```

## Tech Stack

| Dependency | Purpose |
|---|---|
| [Vite](https://vite.dev) | Build tool and dev server |
| [React](https://react.dev) 19 | UI framework |
| [TypeScript](https://www.typescriptlang.org) 5.9 | Type safety |
| [Tailwind CSS](https://tailwindcss.com) 4 | Utility-first styling |
| [date-fns](https://date-fns.org) 4 | Date parsing and formatting |

No AI/LLM libraries. No backend server. No OAuth. No database. All state lives in localStorage.

## Design Decisions

- **Rule-based parser over AI**: Deterministic, fast, works offline, no API costs. The trade-off is less flexibility, but the editable review table compensates — you can always fix what the parser gets wrong.
- **Real categories over hardcoded guesses**: The app fetches your actual YNAB categories during setup and matches against them, so parsed categories align with your budget structure.
- **Single staging account**: Rather than guarding against mistakes with confirmation dialogs, the app is architecturally limited to one account. You move transactions to the right account in YNAB itself.
- **Unapproved by default**: Transactions need explicit approval in YNAB, acting as a second safety net.
- **No backend**: The YNAB Personal Access Token is stored in localStorage and sent directly to the YNAB API from the browser. This is a personal tool, not a multi-user SaaS.
- **localStorage over a database**: Simple, zero-config persistence. Setup config and the last 20 transactions are all that's stored.

## License

Personal project. Not published to npm or any package registry.
