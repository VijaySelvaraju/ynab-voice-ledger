import {
  parse,
  format,
  subDays,
  isValid,
} from "date-fns";
import { enUS } from "date-fns/locale";

export interface ParsedTransaction {
  date: string; // YYYY-MM-DD
  payee: string;
  category: string;
  memo: string;
  amount: number; // milliunits, always negative
  needsReview: boolean;
}

const CATEGORY_MAP: Record<string, string> = {
  dining: "Dining Out",
  restaurant: "Dining Out",
  pizza: "Dining Out",
  lunch: "Dining Out",
  dinner: "Dining Out",
  breakfast: "Dining Out",
  cafe: "Dining Out",
  coffee: "Dining Out",
  groceries: "Groceries",
  supermarket: "Groceries",
  carrefour: "Groceries",
  monoprix: "Groceries",
  lidl: "Groceries",
  aldi: "Groceries",
  metro: "Transportation",
  bus: "Transportation",
  uber: "Transportation",
  taxi: "Transportation",
  transport: "Transportation",
  navigo: "Transportation",
  train: "Transportation",
  amazon: "Shopping",
  shopping: "Shopping",
  clothes: "Shopping",
  shoes: "Shopping",
  netflix: "Subscriptions",
  spotify: "Subscriptions",
  subscription: "Subscriptions",
  pharmacy: "Medical",
  doctor: "Medical",
  medical: "Medical",
  rent: "Bills",
  electricity: "Bills",
  water: "Bills",
  internet: "Bills",
  phone: "Bills",
};

const KNOWN_BRANDS = [
  "dominos pizza",
  "burger king",
  "mc donalds",
  "mcdonalds",
  "starbucks",
  "carrefour",
  "monoprix",
  "lidl",
  "aldi",
  "amazon",
  "netflix",
  "spotify",
  "uber",
  "ikea",
  "zara",
  "h&m",
];

function parseDate(text: string, today: Date): { date: string; remaining: string } {
  const lower = text.toLowerCase().trim();

  // "today"
  if (/^today\b/.test(lower)) {
    return {
      date: format(today, "yyyy-MM-dd"),
      remaining: text.replace(/^today\s*/i, "").trim(),
    };
  }

  // "yesterday"
  if (/^yesterday\b/.test(lower)) {
    return {
      date: format(subDays(today, 1), "yyyy-MM-dd"),
      remaining: text.replace(/^yesterday\s*/i, "").trim(),
    };
  }

  // ISO format: 2026-03-20
  const isoMatch = lower.match(/^(\d{4}-\d{2}-\d{2})\b/);
  if (isoMatch) {
    const d = parse(isoMatch[1], "yyyy-MM-dd", today);
    if (isValid(d)) {
      return {
        date: format(d, "yyyy-MM-dd"),
        remaining: text.slice(isoMatch[0].length).trim(),
      };
    }
  }

  // DD/MM/YYYY
  const slashMatch = lower.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (slashMatch) {
    const d = parse(slashMatch[0], "dd/MM/yyyy", today);
    if (isValid(d)) {
      return {
        date: format(d, "yyyy-MM-dd"),
        remaining: text.slice(slashMatch[0].length).trim(),
      };
    }
  }

  // "20th march 2026" or "20th march" or "20 march 2026"
  const dayFirstMatch = lower.match(
    /^(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b/i
  );
  if (dayFirstMatch) {
    const dayStr = dayFirstMatch[1];
    const monthStr = dayFirstMatch[2];
    const yearStr = dayFirstMatch[3] || format(today, "yyyy");
    const dateStr = `${dayStr} ${monthStr} ${yearStr}`;
    const d = parse(dateStr, "d MMMM yyyy", today, { locale: enUS });
    if (isValid(d)) {
      return {
        date: format(d, "yyyy-MM-dd"),
        remaining: text.slice(dayFirstMatch[0].length).trim(),
      };
    }
  }

  // "march 15 2026" or "march 15"
  const monthFirstMatch = lower.match(
    /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?\b/i
  );
  if (monthFirstMatch) {
    const monthStr = monthFirstMatch[1];
    const dayStr = monthFirstMatch[2];
    const yearStr = monthFirstMatch[3] || format(today, "yyyy");
    const dateStr = `${dayStr} ${monthStr} ${yearStr}`;
    const d = parse(dateStr, "d MMMM yyyy", today, { locale: enUS });
    if (isValid(d)) {
      return {
        date: format(d, "yyyy-MM-dd"),
        remaining: text.slice(monthFirstMatch[0].length).trim(),
      };
    }
  }

  // Default to today
  return {
    date: format(today, "yyyy-MM-dd"),
    remaining: text.trim(),
  };
}

function parseAmount(text: string): { amount: number; remaining: string } {
  // Remove currency words/symbols for matching but keep the text
  const cleaned = text
    .replace(/\b(euros?|eur|€)\b/gi, "")
    .trim();

  // Find numeric values (supports both . and , as decimal separators)
  // Look for amount - try end of string first, then anywhere
  const amounts: { value: number; index: number; length: number }[] = [];
  const amountRegex = /(\d+(?:[.,]\d{1,2})?)/g;
  let match: RegExpExecArray | null;

  while ((match = amountRegex.exec(cleaned)) !== null) {
    const raw = match[1].replace(",", ".");
    const value = parseFloat(raw);
    if (!isNaN(value) && value > 0) {
      amounts.push({ value, index: match.index, length: match[0].length });
    }
  }

  if (amounts.length === 0) {
    return { amount: 0, remaining: text };
  }

  // Prefer the last number (most likely the amount)
  const chosen = amounts[amounts.length - 1];
  const milliunits = -Math.round(chosen.value * 1000);

  // Remove the amount and currency words from the original text
  let remaining = text
    .replace(/\b(euros?|eur|€)\b/gi, "")
    .replace(chosen.value.toString(), "")
    .replace(chosen.value.toFixed(2), "")
    // Also try removing the original format with comma
    .replace(chosen.value.toString().replace(".", ","), "")
    .trim();

  // Clean up the numeric value from remaining text more aggressively
  const numStr = text.match(/(\d+(?:[.,]\d{1,2})?)\s*(?:euros?|eur|€)?/gi);
  if (numStr) {
    for (const ns of numStr) {
      remaining = remaining.replace(ns, "").trim();
    }
  }

  return { amount: milliunits, remaining };
}

function detectCategory(text: string): string {
  const lower = text.toLowerCase();
  for (const [keyword, category] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(keyword)) {
      return category;
    }
  }
  return "Uncategorized";
}

function extractPayee(text: string): { payee: string; remaining: string } {
  const lower = text.toLowerCase();

  // Check known brands first
  for (const brand of KNOWN_BRANDS) {
    if (lower.includes(brand)) {
      const payee = brand
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      const remaining = text.replace(new RegExp(brand, "i"), "").trim();
      return { payee, remaining };
    }
  }

  // Take the first word(s) that look like a name (capitalized or first words)
  const words = text.split(/\s+/);
  const categoryKeywords = new Set(Object.keys(CATEGORY_MAP));

  // Find first word that isn't a category keyword
  const payeeWords: string[] = [];
  let payeeEndIndex = 0;

  for (let i = 0; i < words.length; i++) {
    const wordLower = words[i].toLowerCase().replace(/[^a-z]/g, "");
    if (categoryKeywords.has(wordLower)) {
      break;
    }
    payeeWords.push(words[i]);
    payeeEndIndex = i + 1;
    // Take at most 3 words for payee
    if (payeeWords.length >= 3) break;
  }

  if (payeeWords.length === 0) {
    return { payee: "Unknown", remaining: text };
  }

  const payee = payeeWords
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  const remaining = words.slice(payeeEndIndex).join(" ").trim();
  return { payee, remaining };
}

function removeCategoryKeywords(text: string): string {
  let result = text;
  for (const keyword of Object.keys(CATEGORY_MAP)) {
    result = result.replace(new RegExp(`\\b${keyword}\\b`, "gi"), "").trim();
  }
  // Clean up extra whitespace
  return result.replace(/\s+/g, " ").trim();
}

export function parseTransaction(
  input: string,
  today: Date = new Date()
): ParsedTransaction {
  let needsReview = false;

  const trimmed = input.trim();
  if (!trimmed) {
    return {
      date: format(today, "yyyy-MM-dd"),
      payee: "",
      category: "Uncategorized",
      memo: "",
      amount: 0,
      needsReview: true,
    };
  }

  // Step 1: Parse date from the beginning
  const { date, remaining: afterDate } = parseDate(trimmed, today);

  // Step 2: Parse amount (usually at the end)
  const { amount, remaining: afterAmount } = parseAmount(afterDate);
  if (amount === 0) {
    needsReview = true;
  }

  // Step 3: Detect category from the full remaining text
  const category = detectCategory(afterAmount);

  // Step 4: Extract payee from the beginning of remaining text
  const { payee, remaining: afterPayee } = extractPayee(afterAmount);

  // Step 5: Memo is whatever is left after removing category keywords
  const memo = removeCategoryKeywords(afterPayee);

  if (!payee || payee === "Unknown") {
    needsReview = true;
  }

  return {
    date,
    payee,
    category,
    memo,
    amount,
    needsReview,
  };
}

export function parseMultipleTransactions(
  input: string,
  today: Date = new Date()
): ParsedTransaction[] {
  const lines = input
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return lines.map((line) => parseTransaction(line, today));
}
