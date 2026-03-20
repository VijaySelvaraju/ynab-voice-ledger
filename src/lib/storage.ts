export interface SetupConfig {
  token: string;
  budgetId: string;
  accountId: string;
  accountName: string;
}

export interface HistoryEntry {
  date: string;
  payee: string;
  amount: number;
  createdAt: string;
}

const SETUP_KEY = "ynab-setup";
const HISTORY_KEY = "ynab-history";

export function getSetup(): SetupConfig | null {
  const raw = localStorage.getItem(SETUP_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveSetup(config: SetupConfig): void {
  localStorage.setItem(SETUP_KEY, JSON.stringify(config));
}

export function clearSetup(): void {
  localStorage.removeItem(SETUP_KEY);
}

export function getHistory(): HistoryEntry[] {
  const raw = localStorage.getItem(HISTORY_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function addToHistory(entries: HistoryEntry[]): void {
  const current = getHistory();
  const updated = [...entries, ...current].slice(0, 20);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
}
