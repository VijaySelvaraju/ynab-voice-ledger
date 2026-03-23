import { useState } from "react";
import { type ParsedTransaction } from "../lib/parser";
import { parseTransactions } from "../lib/ai-parser";
import { createTransactions } from "../lib/ynab-api";
import { addToHistory, getGeminiApiKey, getParserMode, setParserMode } from "../lib/storage";
import type { SetupConfig } from "../lib/storage";

interface Props {
  config: SetupConfig;
  onTransactionsCreated: () => void;
}

interface ReviewRow extends ParsedTransaction {
  status: "pending" | "success" | "error";
  errorMessage?: string;
}

// Max single-transaction amount in euros before showing a warning
const LARGE_AMOUNT_THRESHOLD = 500;
// Max transactions per day
const DAILY_TRANSACTION_LIMIT = 20;
const DAILY_COUNT_KEY = "ynab-daily-count";

function getDailyCount(): { date: string; count: number } {
  const raw = localStorage.getItem(DAILY_COUNT_KEY);
  if (!raw) return { date: "", count: 0 };
  try {
    return JSON.parse(raw);
  } catch {
    return { date: "", count: 0 };
  }
}

function incrementDailyCount(n: number): void {
  const today = new Date().toISOString().slice(0, 10);
  const current = getDailyCount();
  const count = current.date === today ? current.count + n : n;
  localStorage.setItem(DAILY_COUNT_KEY, JSON.stringify({ date: today, count }));
}

function getTodayCount(): number {
  const today = new Date().toISOString().slice(0, 10);
  const current = getDailyCount();
  return current.date === today ? current.count : 0;
}

// ---------------------------------------------------------------------------
// Toast types
// ---------------------------------------------------------------------------
type ToastKind = "rate_limit" | "ai_fallback" | "ai_success";

interface Toast {
  kind: ToastKind;
  message: string;
}

export default function TransactionEntry({ config, onTransactionsCreated }: Props) {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // Parser mode — read from storage, fall back to local if no key
  const hasGeminiKey = Boolean(getGeminiApiKey());
  const [parserMode, setParserModeState] = useState<"ai" | "local">(() =>
    getParserMode()
  );

  function switchMode(mode: "ai" | "local") {
    setParserModeState(mode);
    setParserMode(mode);
  }

  function showToast(kind: ToastKind, message: string) {
    setToast({ kind, message });
    setTimeout(() => setToast(null), 4000);
  }

  async function handleParse() {
    if (!input.trim()) return;
    setParsing(true);
    setToast(null);

    const apiKey = getGeminiApiKey();
    const result = await parseTransactions(
      input,
      config.categories || [],
      apiKey,
      parserMode
    );

    setRows(result.transactions.map((p) => ({ ...p, status: "pending" as const })));
    setSubmitted(false);
    setShowConfirm(false);
    setParsing(false);

    // Show appropriate toast
    if (result.error === "rate_limit") {
      showToast("rate_limit", result.errorDetail
        ? `Gemini quota error: ${result.errorDetail} — used local parser.`
        : "Gemini rate limit reached — used local parser. Try AI again in a minute.");
    } else if (result.error && result.usedParser === "local" && parserMode === "ai") {
      showToast("ai_fallback", result.error.startsWith("AI parser failed:")
        ? `${result.error} — used local parser.`
        : "AI parser unavailable — used local parser instead.");
    } else if (result.usedParser === "ai") {
      showToast("ai_success", "Parsed with AI ✓");
    }
  }

  function updateRow(index: number, field: keyof ParsedTransaction, value: string | number) {
    setRows((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r;
        if (field === "amount") {
          return { ...r, [field]: value as number, needsReview: false };
        }
        return { ...r, [field]: value, needsReview: false };
      })
    );
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setShowConfirm(false);
  }

  // --- Guardrails ---
  const pendingRows = rows.filter((r) => r.status === "pending");
  const totalAmount = pendingRows.reduce((sum, r) => sum + Math.abs(r.amount), 0) / 1000;
  const largeAmountRows = pendingRows.filter(
    (r) => Math.abs(r.amount) / 1000 > LARGE_AMOUNT_THRESHOLD
  );
  const todayCount = getTodayCount();
  const wouldExceedLimit = todayCount + pendingRows.length > DAILY_TRANSACTION_LIMIT;

  function handleSubmitClick() {
    if (pendingRows.length === 0) return;
    setShowConfirm(true);
  }

  async function handleConfirmedSubmit() {
    setShowConfirm(false);
    setSubmitting(true);
    try {
      const transactions = pendingRows.map((r) => ({
        date: r.date,
        amount: r.amount,
        payee_name: r.payee,
        category_name: r.category,
        memo: r.memo,
      }));

      await createTransactions(config.token, config.budgetId, config.accountId, transactions);

      // Mark all as success
      setRows((prev) =>
        prev.map((r) => (r.status === "pending" ? { ...r, status: "success" as const } : r))
      );

      // Track daily count
      incrementDailyCount(pendingRows.length);

      // Add to history
      addToHistory(
        pendingRows.map((r) => ({
          date: r.date,
          payee: r.payee,
          amount: r.amount,
          createdAt: new Date().toISOString(),
        }))
      );

      setSubmitted(true);
      onTransactionsCreated();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to create transactions";
      setRows((prev) =>
        prev.map((r) =>
          r.status === "pending" ? { ...r, status: "error" as const, errorMessage: msg } : r
        )
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleClear() {
    setInput("");
    setRows([]);
    setSubmitted(false);
    setShowConfirm(false);
    setToast(null);
  }

  const hasPendingRows = rows.some((r) => r.status === "pending");
  const hasReviewRows = rows.some((r) => r.needsReview && r.status === "pending");

  // Build category options from config
  const categoryOptions = ["Uncategorized", ...(config.categories || []).filter((c) => c !== "Uncategorized")];

  const isAiMode = parserMode === "ai" && hasGeminiKey;

  return (
    <div>
      {/* Toast notification */}
      {toast && (
        <div
          className={`mb-4 rounded-lg p-3 text-sm font-medium ${
            toast.kind === "rate_limit"
              ? "bg-orange-50 border border-orange-200 text-orange-700"
              : toast.kind === "ai_fallback"
                ? "bg-yellow-50 border border-yellow-200 text-yellow-700"
                : "bg-green-50 border border-green-200 text-green-700"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Input area */}
      <div className="mb-6">
        {/* Parser mode toggle */}
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Parser</span>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button
              onClick={() => switchMode("local")}
              className={`px-3 py-1.5 font-medium transition-colors ${
                parserMode === "local"
                  ? "bg-gray-800 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              Local
            </button>
            <button
              onClick={() => hasGeminiKey && switchMode("ai")}
              disabled={!hasGeminiKey}
              title={hasGeminiKey ? undefined : "Add Gemini API key in settings"}
              className={`px-3 py-1.5 font-medium transition-colors ${
                isAiMode
                  ? "bg-blue-600 text-white"
                  : hasGeminiKey
                    ? "bg-white text-gray-600 hover:bg-gray-50"
                    : "bg-white text-gray-300 cursor-not-allowed"
              }`}
            >
              AI
            </button>
          </div>
          {isAiMode && (
            <span className="text-xs text-blue-500">Gemini 2.0 Flash</span>
          )}
          {!hasGeminiKey && (
            <span className="text-xs text-gray-400">
              No AI key — <span className="text-blue-400">add one in settings</span>
            </span>
          )}
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1">
          {isAiMode ? "Describe your expenses" : "Enter transactions (one per line)"}
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={
            isAiMode
              ? "Describe your expenses naturally — type or dictate multiple transactions in any format...\n\nExample: \"Had lunch at Domino's, two pizzas 16 euros. Then grabbed coffee at Starbucks for 4.50. Oh and yesterday I paid 45 at Carrefour for groceries\""
              : `Examples:\n20th march dominos pizza dining out two pizzas 16 euros\ntoday metro transport going to office 1.90\nyesterday amazon shopping new headphones 29.99`
          }
          rows={5}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleParse}
            disabled={!input.trim() || parsing}
            className="bg-blue-600 text-white rounded-lg py-2 px-4 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {parsing && isAiMode ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Parsing with AI...
              </>
            ) : parsing ? (
              "Parsing..."
            ) : isAiMode ? (
              "Parse with AI"
            ) : (
              "Parse"
            )}
          </button>
          <button
            onClick={handleClear}
            className="bg-gray-200 text-gray-700 rounded-lg py-2 px-4 text-sm font-medium hover:bg-gray-300"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Review table */}
      {rows.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            Review Transactions ({rows.length})
          </h3>
          {hasReviewRows && (
            <p className="text-xs text-amber-600 mb-2">
              Rows highlighted in yellow need review — please check and edit before submitting.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left p-2 font-medium text-gray-600">Date</th>
                  <th className="text-left p-2 font-medium text-gray-600">Payee</th>
                  <th className="text-left p-2 font-medium text-gray-600">Category</th>
                  <th className="text-left p-2 font-medium text-gray-600">Memo</th>
                  <th className="text-right p-2 font-medium text-gray-600">Amount</th>
                  <th className="text-center p-2 font-medium text-gray-600">Status</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-t border-gray-200 ${
                      row.status === "success"
                        ? "bg-green-50"
                        : row.status === "error"
                          ? "bg-red-50"
                          : row.needsReview
                            ? "bg-yellow-50"
                            : Math.abs(row.amount) / 1000 > LARGE_AMOUNT_THRESHOLD
                              ? "bg-orange-50"
                              : ""
                    }`}
                  >
                    <td className="p-2">
                      <input
                        type="date"
                        value={row.date}
                        onChange={(e) => updateRow(i, "date", e.target.value)}
                        disabled={row.status !== "pending"}
                        className="border border-gray-300 rounded px-1.5 py-1 text-sm w-36 disabled:bg-gray-100"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={row.payee}
                        onChange={(e) => updateRow(i, "payee", e.target.value)}
                        disabled={row.status !== "pending"}
                        className="border border-gray-300 rounded px-1.5 py-1 text-sm w-28 disabled:bg-gray-100"
                      />
                    </td>
                    <td className="p-2">
                      <select
                        value={row.category}
                        onChange={(e) => updateRow(i, "category", e.target.value)}
                        disabled={row.status !== "pending"}
                        className="border border-gray-300 rounded px-1.5 py-1 text-sm w-36 disabled:bg-gray-100"
                      >
                        {categoryOptions.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                        {/* If the parsed category isn't in the list, show it anyway */}
                        {!categoryOptions.includes(row.category) && (
                          <option value={row.category}>{row.category} (custom)</option>
                        )}
                      </select>
                    </td>
                    <td className="p-2">
                      <input
                        type="text"
                        value={row.memo}
                        onChange={(e) => updateRow(i, "memo", e.target.value)}
                        disabled={row.status !== "pending"}
                        className="border border-gray-300 rounded px-1.5 py-1 text-sm w-32 disabled:bg-gray-100"
                      />
                    </td>
                    <td className="p-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        value={Math.abs(row.amount) / 1000}
                        onChange={(e) =>
                          updateRow(i, "amount", -Math.round(parseFloat(e.target.value || "0") * 1000))
                        }
                        disabled={row.status !== "pending"}
                        className="border border-gray-300 rounded px-1.5 py-1 text-sm w-20 text-right disabled:bg-gray-100"
                      />
                    </td>
                    <td className="p-2 text-center">
                      {row.status === "success" && (
                        <span className="text-green-600 font-medium">Created</span>
                      )}
                      {row.status === "error" && (
                        <span className="text-red-600 font-medium" title={row.errorMessage}>
                          Error
                        </span>
                      )}
                      {row.status === "pending" && row.needsReview && (
                        <span className="text-amber-600 font-medium">Review</span>
                      )}
                      {row.status === "pending" && !row.needsReview && Math.abs(row.amount) / 1000 > LARGE_AMOUNT_THRESHOLD && (
                        <span className="text-orange-600 font-medium" title={`Amount exceeds €${LARGE_AMOUNT_THRESHOLD}`}>⚠️ Large</span>
                      )}
                      {row.status === "pending" && !row.needsReview && Math.abs(row.amount) / 1000 <= LARGE_AMOUNT_THRESHOLD && (
                        <span className="text-gray-400">Ready</span>
                      )}
                    </td>
                    <td className="p-2">
                      {row.status === "pending" && (
                        <button
                          onClick={() => removeRow(i)}
                          className="text-red-400 hover:text-red-600 text-sm"
                          title="Remove"
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Summary & guardrails */}
          {hasPendingRows && (
            <div className="mt-4 space-y-3">
              {/* Total summary */}
              <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
                <div className="flex justify-between">
                  <span>Transactions to create:</span>
                  <span className="font-medium">{pendingRows.length}</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span>Total amount:</span>
                  <span className="font-medium">€{totalAmount.toFixed(2)}</span>
                </div>
                {todayCount > 0 && (
                  <div className="flex justify-between mt-1 text-xs text-gray-500">
                    <span>Created today:</span>
                    <span>{todayCount} / {DAILY_TRANSACTION_LIMIT}</span>
                  </div>
                )}
              </div>

              {/* Warnings */}
              {largeAmountRows.length > 0 && (
                <div className="bg-orange-50 border border-orange-200 text-orange-700 rounded-lg p-3 text-sm">
                  ⚠️ {largeAmountRows.length} transaction{largeAmountRows.length > 1 ? "s" : ""} exceed{largeAmountRows.length === 1 ? "s" : ""} €{LARGE_AMOUNT_THRESHOLD}. Please double-check.
                </div>
              )}

              {wouldExceedLimit && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                  🚫 This would exceed the daily limit of {DAILY_TRANSACTION_LIMIT} transactions ({todayCount} already created today).
                </div>
              )}

              {/* Confirmation dialog */}
              {!showConfirm ? (
                <button
                  onClick={handleSubmitClick}
                  disabled={submitting || wouldExceedLimit}
                  className="bg-green-600 text-white rounded-lg py-2 px-6 text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? "Creating..." : "Create All"}
                </button>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-900 font-medium mb-3">
                    Create {pendingRows.length} transaction{pendingRows.length > 1 ? "s" : ""} totaling €{totalAmount.toFixed(2)} in "{config.accountName}"?
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleConfirmedSubmit}
                      disabled={submitting}
                      className="bg-green-600 text-white rounded-lg py-2 px-4 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      {submitting ? "Creating..." : "Yes, create"}
                    </button>
                    <button
                      onClick={() => setShowConfirm(false)}
                      disabled={submitting}
                      className="bg-gray-200 text-gray-700 rounded-lg py-2 px-4 text-sm font-medium hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {submitted && !hasPendingRows && (
            <div className="mt-4 bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">
              All transactions created successfully!
            </div>
          )}
        </div>
      )}
    </div>
  );
}
