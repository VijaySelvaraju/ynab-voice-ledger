// SAFETY: This module is the ONLY place that talks to the YNAB API.
// It can ONLY create transactions in the pre-selected staging account.
// It cannot update, delete, or read transactions from any other account.
// This is by design. Do not add new API functions without explicit approval.

const BASE_URL = "https://api.ynab.com/v1";

export interface Budget {
  id: string;
  name: string;
}

export interface Account {
  id: string;
  name: string;
  closed: boolean;
  deleted: boolean;
}

export interface TransactionPayload {
  account_id: string;
  date: string;
  amount: number;
  payee_name: string;
  category_name: string;
  memo: string;
  cleared: "uncleared";
  approved: false;
}

export interface CreateTransactionsResult {
  transaction_ids: string[];
  duplicate_import_ids: string[];
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function fetchBudgets(token: string): Promise<Budget[]> {
  const res = await fetch(`${BASE_URL}/budgets`, {
    method: "GET",
    headers: headers(token),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(
      `Failed to fetch budgets: ${res.status} ${body?.error?.detail || res.statusText}`
    );
  }
  const data = await res.json();
  return data.data.budgets.map((b: { id: string; name: string }) => ({
    id: b.id,
    name: b.name,
  }));
}

export async function fetchAccounts(
  token: string,
  budgetId: string
): Promise<Account[]> {
  const res = await fetch(`${BASE_URL}/budgets/${budgetId}/accounts`, {
    method: "GET",
    headers: headers(token),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(
      `Failed to fetch accounts: ${res.status} ${body?.error?.detail || res.statusText}`
    );
  }
  const data = await res.json();
  return data.data.accounts
    .filter((a: Account) => !a.closed && !a.deleted)
    .map((a: { id: string; name: string }) => ({
      id: a.id,
      name: a.name,
    }));
}

export async function createTransactions(
  token: string,
  budgetId: string,
  accountId: string,
  transactions: Omit<TransactionPayload, "account_id" | "cleared" | "approved">[]
): Promise<CreateTransactionsResult> {
  // SAFETY CHECK: Verify the account ID matches the one stored during setup
  const storedConfig = localStorage.getItem("ynab-setup");
  if (storedConfig) {
    const config = JSON.parse(storedConfig);
    if (config.accountId !== accountId) {
      throw new Error(
        "SAFETY: Account ID does not match the configured staging account. Transaction refused."
      );
    }
  } else {
    throw new Error(
      "SAFETY: No setup configuration found. Cannot create transactions."
    );
  }

  const payload = {
    transactions: transactions.map((t) => ({
      account_id: accountId,
      date: t.date,
      amount: t.amount,
      payee_name: t.payee_name,
      category_name: t.category_name,
      memo: t.memo,
      cleared: "uncleared" as const,
      approved: false as const,
    })),
  };

  const res = await fetch(
    `${BASE_URL}/budgets/${budgetId}/transactions`,
    {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify(payload),
    }
  );
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(
      `Failed to create transactions: ${res.status} ${body?.error?.detail || res.statusText}`
    );
  }
  const data = await res.json();
  return {
    transaction_ids: data.data.transaction_ids || [],
    duplicate_import_ids: data.data.duplicate_import_ids || [],
  };
}
