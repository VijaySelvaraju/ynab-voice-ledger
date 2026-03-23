import { format, subDays } from "date-fns";
import { parseMultipleTransactions, type ParsedTransaction } from "./parser";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------
function buildPrompt(input: string, categories: string[]): string {
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");
  const yesterdayStr = format(subDays(today, 1), "yyyy-MM-dd");
  const currentYear = format(today, "yyyy");
  const categoriesJson = JSON.stringify(categories.length ? categories : ["Uncategorized"]);

  return `You are a financial transaction parser. Your job is to extract structured expense transactions from natural language input. The currency is always EUR.

The input often comes from voice dictation software, so expect:
- Missing or inconsistent punctuation
- Filler words like "um", "uh", "like", "so", "and then", "oh and", "also"
- Run-on sentences with multiple expenses blended together
- Numbers spoken as words ("sixteen" instead of "16") or approximations ("about thirty euros", "like 5 euros something")
- Brand names that may be misspelled or lowercased by dictation ("dominos", "starbucks", "carrefour")

Ignore all filler words. Focus on extracting the actual transactions.

For each transaction, extract:
- "date": ISO date string (YYYY-MM-DD). Interpret "today" as ${todayStr}, "yesterday" as ${yesterdayStr}. If no date is mentioned for a transaction, default to ${todayStr}. If a date like "20th march" is given without a year, assume ${currentYear}.
- "payee": The business or person paid. Clean up to proper case (e.g., "dominos" → "Domino's Pizza", "carrefour" → "Carrefour"). If unclear, use the most likely merchant name.
- "category": Match to the closest category from this list: ${categoriesJson}. If no good match, use "Uncategorized".
- "memo": Any descriptive detail about what was purchased or the context. Keep it concise. Strip filler words.
- "amount": The numeric amount as a positive number (e.g., 16.00, not -16). Convert spoken numbers to digits. If the user gives an approximation, use the stated number.

Rules:
- Return ONLY a valid JSON array of objects. No markdown, no explanation, no backticks.
- Each object MUST have all 5 fields: date, payee, category, memo, amount.
- If the input contains multiple expenses, return multiple objects in the array.
- If you cannot parse the input at all, return an empty array [].
- The amount MUST be a number, not a string.

Example input (typed): "Had lunch at dominos, two pizzas 16 euros. Yesterday coffee at starbucks 4.50"
Example output: [{"date":"${todayStr}","payee":"Domino's Pizza","category":"Dining Out","memo":"two pizzas","amount":16.00},{"date":"${yesterdayStr}","payee":"Starbucks","category":"Dining Out","memo":"coffee","amount":4.50}]

Example input (voice dictation): "so today I had lunch at dominos like two pizzas and it was about sixteen euros and then um yesterday I grabbed coffee at starbucks for like four fifty oh and I also went to carrefour for groceries like weekly shopping that was around forty five euros fifty"
Example output: [{"date":"${todayStr}","payee":"Domino's Pizza","category":"Dining Out","memo":"two pizzas","amount":16.00},{"date":"${yesterdayStr}","payee":"Starbucks","category":"Dining Out","memo":"coffee","amount":4.50},{"date":"${yesterdayStr}","payee":"Carrefour","category":"Groceries","memo":"weekly shopping","amount":45.50}]

Now parse the following input:
${input}`;
}

// ---------------------------------------------------------------------------
// Raw Gemini call
// ---------------------------------------------------------------------------
async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const url = `${GEMINI_ENDPOINT}?key=${apiKey}`;
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (response.status === 401 || response.status === 403) {
    throw new GeminiAuthError("Invalid API key");
  }
  if (response.status === 429) {
    const detail = await extractErrorMessage(response);
    throw new GeminiRateLimitError(detail || "Rate limit exceeded");
  }
  if (!response.ok) {
    const detail = await extractErrorMessage(response);
    throw new Error(detail || `Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error("Unexpected Gemini response shape");
  }
  return text;
}

// ---------------------------------------------------------------------------
// Extract human-readable error message from Gemini error responses
// ---------------------------------------------------------------------------
async function extractErrorMessage(response: Response): Promise<string | null> {
  try {
    const data = await response.json();
    return data?.error?.message || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Custom error types (for distinguishing auth vs rate-limit vs other)
// ---------------------------------------------------------------------------
export class GeminiAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiAuthError";
  }
}

export class GeminiRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiRateLimitError";
  }
}

// ---------------------------------------------------------------------------
// Response validation & mapping
// ---------------------------------------------------------------------------
interface GeminiTransaction {
  date: string;
  payee: string;
  category: string;
  memo: string;
  amount: number;
}

function isValidTransaction(obj: unknown): obj is GeminiTransaction {
  if (typeof obj !== "object" || obj === null) return false;
  const t = obj as Record<string, unknown>;
  return (
    typeof t.date === "string" &&
    typeof t.payee === "string" &&
    typeof t.category === "string" &&
    typeof t.memo === "string" &&
    typeof t.amount === "number" &&
    t.amount > 0
  );
}

function mapToParserFormat(t: GeminiTransaction): ParsedTransaction {
  return {
    date: t.date,
    payee: t.payee,
    category: t.category,
    memo: t.memo,
    amount: -Math.round(t.amount * 1000), // positive → negative milliunits
    needsReview: false,
  };
}

// ---------------------------------------------------------------------------
// Main: parse with AI
// ---------------------------------------------------------------------------
export async function parseWithAI(
  input: string,
  categories: string[],
  apiKey: string
): Promise<ParsedTransaction[]> {
  const prompt = buildPrompt(input, categories);
  const rawText = await callGemini(prompt, apiKey);

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("Gemini returned non-JSON output");
  }

  if (!Array.isArray(parsed)) {
    throw new Error("Gemini response was not an array");
  }

  const valid = parsed.filter(isValidTransaction);
  if (valid.length === 0 && parsed.length > 0) {
    throw new Error("Gemini returned transactions with missing or invalid fields");
  }

  return valid.map(mapToParserFormat);
}

// ---------------------------------------------------------------------------
// Validate API key (lightweight test call)
// ---------------------------------------------------------------------------
export async function validateGeminiApiKey(
  apiKey: string
): Promise<{ valid: boolean; error?: string }> {
  try {
    // Use a lightweight models.get call that doesn't consume generation quota
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash?key=${apiKey}`;
    const response = await fetch(url);
    if (response.status === 401 || response.status === 403) {
      return { valid: false, error: "invalid_key" };
    }
    if (response.status === 404) {
      return { valid: false, error: "invalid_key" };
    }
    if (!response.ok) {
      const detail = await extractErrorMessage(response);
      return { valid: false, error: detail || "network" };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "network" };
  }
}

// ---------------------------------------------------------------------------
// Convenience wrapper with fallback logic
// ---------------------------------------------------------------------------
export async function parseTransactions(
  input: string,
  categories: string[],
  apiKey: string | null,
  mode: "ai" | "local"
): Promise<{ transactions: ParsedTransaction[]; usedParser: "ai" | "local"; error?: string; errorDetail?: string }> {
  if (mode === "ai" && apiKey) {
    try {
      const transactions = await parseWithAI(input, categories, apiKey);
      return { transactions, usedParser: "ai" };
    } catch (e) {
      if (e instanceof GeminiRateLimitError) {
        const fallback = parseMultipleTransactions(input, categories);
        return { transactions: fallback, usedParser: "local", error: "rate_limit", errorDetail: e.message };
      }
      const msg = e instanceof Error ? e.message : "Unknown error";
      const fallback = parseMultipleTransactions(input, categories);
      return { transactions: fallback, usedParser: "local", error: `AI parser failed: ${msg}` };
    }
  }

  // Local parser path
  const transactions = parseMultipleTransactions(input, categories);
  return { transactions, usedParser: "local" };
}
