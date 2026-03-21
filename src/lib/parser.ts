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

// ---------------------------------------------------------------------------
// Keyword hints: common words → likely YNAB category name fragments
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Known multi-word brands (must be lowercase)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Category matching
// ---------------------------------------------------------------------------

/**
 * Builds a function that matches free-form text to the best YNAB category.
 * Matching priority: exact token → partial substring → keyword hint → Uncategorized
 */
function buildCategoryMatcher(ynabCategories: string[]): (text: string) => string {
  const entries = ynabCategories.map((name) => ({
    name,
    lower: name.toLowerCase(),
    tokens: name
      .toLowerCase()
      .split(/[\s/&:,.\-]+/)
      .filter((t) => t.length >= 2),
  }));

  return (text: string): string => {
    const lower = text.toLowerCase();
    const words = lower.split(/\s+/).filter(Boolean);

    // 1. Direct token match: an input word matches a category token
    let bestMatch = "";
    let bestScore = 0;

    for (const entry of entries) {
      let score = 0;
      for (const token of entry.tokens) {
        if (token.length < 3) continue;
        // Exact word match scores highest
        if (words.includes(token)) {
          score += 10;
        } else if (lower.includes(token)) {
          // Substring match scores lower
          score += 5;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = entry.name;
      }
    }
    if (bestScore >= 5) return bestMatch;

    // 2. Hint-based match: input word has keyword hints that match a category
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

    // 3. Check if any known brand keywords have hints
    for (const brand of KNOWN_BRANDS) {
      if (lower.includes(brand)) {
        const brandWords = brand.split(/\s+/);
        for (const bw of brandWords) {
          const hints = KEYWORD_HINTS[bw];
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
      }
    }

    return "Uncategorized";
  };
}

// ---------------------------------------------------------------------------
// Build a set of all category-related keywords for filtering payee/memo
// ---------------------------------------------------------------------------
function getAllCategoryKeywords(ynabCategories: string[]): Set<string> {
  const keywords = new Set<string>();
  for (const key of Object.keys(KEYWORD_HINTS)) {
    keywords.add(key);
  }
  for (const name of ynabCategories) {
    for (const token of name.toLowerCase().split(/[\s/&:,.\-]+/)) {
      if (token.length >= 3) keywords.add(token);
    }
  }
  return keywords;
}

// ---------------------------------------------------------------------------
// Currency words and symbols to strip
// ---------------------------------------------------------------------------
const CURRENCY_PATTERN = /\b(euros?|eur|dollars?|usd|pounds?|gbp|£|\$|€)\b/gi;

// ---------------------------------------------------------------------------
// Date parsing
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Amount parsing — uses regex match position to cleanly remove the amount
// ---------------------------------------------------------------------------
function parseAmount(text: string): { amount: number; remaining: string } {
  // Strip currency words/symbols first, remembering positions
  const cleaned = text.replace(CURRENCY_PATTERN, " ").trim();

  // Find all numeric values
  const amounts: { value: number; start: number; end: number }[] = [];
  const amountRegex = /(\d+(?:[.,]\d{1,2})?)/g;
  let match: RegExpExecArray | null;

  while ((match = amountRegex.exec(cleaned)) !== null) {
    const raw = match[1].replace(",", ".");
    const value = parseFloat(raw);
    if (!isNaN(value) && value > 0) {
      amounts.push({ value, start: match.index, end: match.index + match[0].length });
    }
  }

  if (amounts.length === 0) {
    return { amount: 0, remaining: text };
  }

  // Prefer the last number (most likely the amount)
  const chosen = amounts[amounts.length - 1];
  const milliunits = -Math.round(chosen.value * 1000);

  // Remove the amount and any adjacent currency words from the original text
  // Build a regex that matches the number + optional surrounding currency words
  const numStr = chosen.value.toString();
  const numStrComma = numStr.replace(".", ",");
  // Match: optional currency word/symbol, then the number, then optional currency word/symbol
  const removePatterns = [
    // "16 euros", "16.00 eur", "€16", etc.
    new RegExp(
      `(?:€|\\$|£)?\\s*(?:${escapeRegex(numStr)}|${escapeRegex(numStrComma)}|${escapeRegex(chosen.value.toFixed(2))}|${escapeRegex(chosen.value.toFixed(2).replace(".", ","))})\\s*(?:euros?|eur|dollars?|usd|pounds?|gbp)?`,
      "gi"
    ),
  ];

  let remaining = text;
  for (const pattern of removePatterns) {
    remaining = remaining.replace(pattern, " ");
  }

  // Also strip any leftover currency words
  remaining = remaining.replace(CURRENCY_PATTERN, " ");

  // Clean up whitespace and stray punctuation
  remaining = cleanupText(remaining);

  return { amount: milliunits, remaining };
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// Payee extraction
// ---------------------------------------------------------------------------
function extractPayee(text: string, categoryKeywords: Set<string>): { payee: string; remaining: string } {
  const lower = text.toLowerCase();

  // Check known multi-word brands first
  for (const brand of KNOWN_BRANDS) {
    if (lower.includes(brand)) {
      const payee = titleCase(brand);
      // Remove the brand from text using its position
      const idx = lower.indexOf(brand);
      const remaining = (text.slice(0, idx) + " " + text.slice(idx + brand.length)).trim();
      return { payee, remaining: cleanupText(remaining) };
    }
  }

  // Split into clean words (strip commas and punctuation from each word)
  const words = text
    .split(/\s+/)
    .map((w) => w.replace(/[,;:!?]+$/g, "").replace(/^[,;:!?]+/g, ""))
    .filter((w) => w.length > 0);

  // Take the first word(s) that aren't category keywords
  const payeeWords: string[] = [];
  let payeeEndIndex = 0;

  for (let i = 0; i < words.length; i++) {
    const wordLower = words[i].toLowerCase().replace(/[^a-z0-9]/g, "");
    if (wordLower.length < 1) continue;
    if (categoryKeywords.has(wordLower)) break;
    payeeWords.push(words[i]);
    payeeEndIndex = i + 1;
    // Take at most 3 words for payee
    if (payeeWords.length >= 3) break;
  }

  if (payeeWords.length === 0) {
    return { payee: "Unknown", remaining: text };
  }

  const payee = payeeWords
    .map((w) => {
      // Strip remaining punctuation from payee words
      const clean = w.replace(/[^a-zA-Z0-9\-'&]/g, "");
      return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
    })
    .filter((w) => w.length > 0)
    .join(" ");

  const remaining = words.slice(payeeEndIndex).join(" ").trim();
  return { payee: payee || "Unknown", remaining: cleanupText(remaining) };
}

// ---------------------------------------------------------------------------
// Memo cleanup — remove category keywords and clean up leftovers
// ---------------------------------------------------------------------------
function buildMemo(text: string, categoryKeywords: Set<string>): string {
  let words = text.split(/\s+/).filter((w) => w.length > 0);

  // Remove words that are category keywords
  words = words.filter((w) => {
    const lower = w.toLowerCase().replace(/[^a-z]/g, "");
    return lower.length > 0 && !categoryKeywords.has(lower);
  });

  // Clean each word of leading/trailing punctuation junk
  words = words.map((w) => w.replace(/^[,;:!?.]+|[,;:!?.]+$/g, "")).filter((w) => w.length > 0);

  return words.join(" ").trim();
}

// ---------------------------------------------------------------------------
// Utility: clean up stray commas, extra spaces, leading/trailing punctuation
// ---------------------------------------------------------------------------
function cleanupText(text: string): string {
  return text
    .replace(/\s*,\s*/g, " ")     // replace commas with spaces
    .replace(/\s+/g, " ")          // collapse multiple spaces
    .replace(/^[\s,;:!?.]+/, "")   // trim leading punctuation
    .replace(/[\s,;:!?.]+$/, "")   // trim trailing punctuation
    .trim();
}

function titleCase(str: string): string {
  return str
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// ---------------------------------------------------------------------------
// Main parse function
// ---------------------------------------------------------------------------
export function parseTransaction(
  input: string,
  ynabCategories: string[] = [],
  today: Date = new Date()
): ParsedTransaction {
  let needsReview = false;

  // Normalize: strip commas and extra whitespace upfront
  const trimmed = input
    .trim()
    .replace(/,/g, " ")
    .replace(/\s+/g, " ");

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
  const memo = buildMemo(afterPayee, categoryKeywords);

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
