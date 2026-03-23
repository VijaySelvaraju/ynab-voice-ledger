export interface SetupConfig {
  token: string;
  budgetId: string;
  accountId: string;
  accountName: string;
  categories: string[];
}

export interface HistoryEntry {
  date: string;
  payee: string;
  amount: number;
  createdAt: string;
}

const SETUP_KEY = "ynab-setup";
const HISTORY_KEY = "ynab-history";
const GEMINI_KEY = "gemini-api-key";
const PARSER_MODE_KEY = "parser-mode";

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

export function getGeminiApiKey(): string | null {
  return localStorage.getItem(GEMINI_KEY);
}

export function setGeminiApiKey(key: string): void {
  localStorage.setItem(GEMINI_KEY, key);
}

export function clearGeminiApiKey(): void {
  localStorage.removeItem(GEMINI_KEY);
}

export function getParserMode(): "ai" | "local" {
  const stored = localStorage.getItem(PARSER_MODE_KEY);
  if (stored === "ai" || stored === "local") return stored;
  // Default: ai if a key exists, local otherwise
  return getGeminiApiKey() ? "ai" : "local";
}

export function setParserMode(mode: "ai" | "local"): void {
  localStorage.setItem(PARSER_MODE_KEY, mode);
}
