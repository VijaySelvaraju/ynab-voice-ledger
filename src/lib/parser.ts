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

// Extra keyword hints that map common words to likely category name fragments.
// These help match user input to real YNAB categories when the category name
// itself doesn't appear in the text (e.g., typing "pizza" should match a
// category containing "dining" or "restaurant").
const KEYWORD_HINTS: Record<string, string[]> = {
  pizza: ["dining", "restaurant", "food", "eating"],
  lunch: ["dining", "restaurant", "food", "eating"],
  dinner: ["dining", "restaurant", "food", "eating"],
  breakfast: ["dining", "restaurant", "food", "eating"],
  cafe: ["dining", "restaurant", "food", "coffee", "eating"],
  coffee: ["dining", "restaurant", "food", "coffee", "eating"],
  supermarket: ["groceries", "food"],
  carrefour: ["groceries", "food"],
  monoprix: ["groceries", "food"],
  lidl: ["groceries", "food"],
  aldi: ["groceries", "food"],
  metro: ["transport", "travel"],
  bus: ["transport", "travel"],
  uber: ["transport", "travel", "ride"],
  taxi: ["transport", "travel", "ride"],
  navigo: ["transport", "travel"],
  train: ["transport", "travel"],
  amazon: ["shopping"],
  clothes: ["shopping", "clothing"],
  shoes: ["shopping", "clothing"],
  netflix: ["subscription", "entertainment", "streaming"],
  spotify: ["subscription", "entertainment", "streaming", "music"],
  pharmacy: ["medical", "health"],
  doctor: ["medical", "health"],
  rent: ["bills", "housing", "rent"],
  electricity: ["bills", "utilities"],
  water: ["bills", "utilities"],
  internet: ["bills", "utilities"],
  phone: ["bills", "utilities", "phone"],
};

// Builds a lookup from the user's real YNAB categories.
// For each category, we generate searchable tokens from the category name.
function buildCategoryMatcher(ynabCategories: string[]): (text: string) => string {
  // Pre-compute lowercase tokens for each category
  const entries = ynabCategories.map((name) => ({
    name,
    tokens: name.toLowerCase().split(/[\s/&:,.-]+/).filter(Boolean),
  }));

  return (text: string): string => {
    const lower = text.toLowerCase();
    const words = lower.split(/\s+/);

    // 1. Direct match: a word in the input exactly matches a category token
    for (const entry of entries) {
      for (const token of entry.tokens) {
        if (token.length >= 3 && lower.includes(token)) {
          return entry.name;
        }
      }
    }

    // 2. Hint-based match: a word in the input has keyword hints, and one of
    //    those hints matches a category token
    for (const word of words) {
      const hints = KEYWORD_HINTS[word];
      if (!hints) continue;
      for (const hint of hints) {
        for (const entry of entries) {
          for (const token of entry.tokens) {
            if (token.includes(hint) || hint.includes(token)) {
              return entry.name;
            }
          }
        }
      }
    }

    return "Uncategorized";
  };
}

// All category keywords used for payee/memo extraction
function getAllCategoryKeywords(ynabCategories: string[]): Set<string> {
  const keywords = new Set<string>();
  // Add all hint keywords
  for (const key of Object.keys(KEYWORD_HINTS)) {
    keywords.add(key);
  }
  // Add tokens from real category names
  for (const name of ynabCategories) {
    for (const token of name.toLowerCase().split(/[\s/&:,.-]+/)) {
      if (token.length >= 3) keywords.add(token);
    }
  }
  return keywords;
}

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

function extractPayee(text: string, categoryKeywords: Set<string>): { payee: string; remaining: string } {
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

function removeCategoryKeywords(text: string, categoryKeywords: Set<string>): string {
  let result = text;
  for (const keyword of categoryKeywords) {
    result = result.replace(new RegExp(`\\b${keyword}\\b`, "gi"), "").trim();
  }
  // Clean up extra whitespace
  return result.replace(/\s+/g, " ").trim();
}

export function parseTransaction(
  input: string,
  ynabCategories: string[] = [],
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

  const detectCategory = buildCategoryMatcher(ynabCategories);
  const categoryKeywords = getAllCategoryKeywords(ynabCategories);

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
  const { payee, remaining: afterPayee } = extractPayee(afterAmount, categoryKeywords);

  // Step 5: Memo is whatever is left after removing category keywords
  const memo = removeCategoryKeywords(afterPayee, categoryKeywords);

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
  ynabCategories: string[] = [],
  today: Date = new Date()
): ParsedTransaction[] {
  const lines = input
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  return lines.map((line) => parseTransaction(line, ynabCategories, today));
}
