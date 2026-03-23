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

  // Status color helpers
  function getCardBorder(row: ReviewRow) {
    if (row.status === "success") return "border-success/40";
    if (row.status === "error") return "border-danger/40";
    if (row.needsReview) return "border-warning/40";
    if (Math.abs(row.amount) / 1000 > LARGE_AMOUNT_THRESHOLD) return "border-warning/30";
    return "border-surface-light";
  }

  function getStatusBadge(row: ReviewRow) {
    if (row.status === "success")
      return <span className="text-[10px] font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full">Created</span>;
    if (row.status === "error")
      return <span className="text-[10px] font-semibold text-danger bg-danger/10 px-2 py-0.5 rounded-full" title={row.errorMessage}>Error</span>;
    if (row.needsReview)
      return <span className="text-[10px] font-semibold text-warning bg-warning/10 px-2 py-0.5 rounded-full">Review</span>;
    if (Math.abs(row.amount) / 1000 > LARGE_AMOUNT_THRESHOLD)
      return <span className="text-[10px] font-semibold text-warning bg-warning/10 px-2 py-0.5 rounded-full">Large</span>;
    return <span className="text-[10px] font-semibold text-success bg-success/10 px-2 py-0.5 rounded-full">Ready</span>;
  }

  return (
    <div>
      {/* Toast notification */}
      {toast && (
        <div
          className={`mb-4 rounded-[12px] p-3 text-sm font-medium ${
            toast.kind === "rate_limit"
              ? "bg-warning/10 border border-warning/30 text-warning"
              : toast.kind === "ai_fallback"
                ? "bg-warning/10 border border-warning/30 text-warning"
                : "bg-success/10 border border-success/30 text-success"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Input area */}
      <div className="mb-6">
        {/* Parser mode toggle */}
        <div className="flex items-center gap-3 mb-3">
          <span className="text-[10px] font-semibold text-text-dim uppercase tracking-widest">Parser</span>
          <div className="flex rounded-[8px] overflow-hidden text-sm border border-surface-light">
            <button
              onClick={() => switchMode("local")}
              className={`px-3 py-1.5 font-medium transition-colors ${
                parserMode === "local"
                  ? "bg-surface-light text-text-primary"
                  : "bg-surface text-text-muted hover:bg-surface-hover"
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
                  ? "bg-cyan/20 text-cyan"
                  : hasGeminiKey
                    ? "bg-surface text-text-muted hover:bg-surface-hover"
                    : "bg-surface text-text-dim cursor-not-allowed"
              }`}
            >
              AI
            </button>
          </div>
          {isAiMode && (
            <span className="text-xs text-cyan font-medium">Gemini 2.0 Flash</span>
          )}
          {!hasGeminiKey && (
            <span className="text-xs text-text-dim">
              No AI key — <span className="text-cyan">add one in settings</span>
            </span>
          )}
        </div>

        <label className="block text-sm font-medium text-text-muted mb-1.5">
          {isAiMode ? "Describe your expenses" : "Enter transactions (one per line)"}
        </label>
        <div className="relative">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isAiMode
                ? "Describe your expenses naturally — type or dictate multiple transactions in any format...\n\nExample: \"Had lunch at Domino's, two pizzas 16 euros. Then grabbed coffee at Starbucks for 4.50.\""
                : `Examples:\n20th march dominos pizza dining out two pizzas 16 euros\ntoday metro transport going to office 1.90\nyesterday amazon shopping new headphones 29.99`
            }
            rows={5}
            className="w-full bg-navy border border-surface-light rounded-[12px] px-4 py-3 pr-14 text-sm text-text-primary placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-cyan/50 focus:border-cyan resize-y"
          />
          {/* Floating microphone button */}
          <button
            type="button"
            onClick={() => {
              // Voice dictation: use Web Speech API if available
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
              if (!SR) return;
              const recognition = new SR();
              recognition.continuous = false;
              recognition.interimResults = false;
              recognition.lang = "en-US";
              recognition.onresult = (event: { results: { 0: { 0: { transcript: string } } } }) => {
                const transcript = event.results[0][0].transcript;
                setInput((prev) => (prev ? prev + " " + transcript : transcript));
              };
              recognition.start();
            }}
            className="absolute right-3 bottom-3 w-10 h-10 rounded-full bg-cyan text-navy flex items-center justify-center shadow-[0_4px_12px_rgba(0,229,255,0.3)] hover:bg-cyan-dim transition-colors"
            title="Voice dictation"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
              <line x1="12" y1="19" x2="12" y2="23"/>
              <line x1="8" y1="23" x2="16" y2="23"/>
            </svg>
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={handleParse}
            disabled={!input.trim() || parsing}
            className="bg-cyan text-navy rounded-[12px] py-2.5 px-5 text-sm font-semibold hover:bg-cyan-dim disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
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
            className="bg-surface text-text-muted rounded-[12px] py-2.5 px-5 text-sm font-medium hover:bg-surface-hover transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Transaction cards */}
      {rows.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-text-primary mb-3">
            Review Transactions <span className="text-text-dim font-normal">({rows.length})</span>
          </h3>
          {hasReviewRows && (
            <p className="text-xs text-warning mb-3">
              Cards highlighted in yellow need review — please check and edit before submitting.
            </p>
          )}

          <div className="space-y-3">
            {rows.map((row, i) => (
              <div
                key={i}
                className={`bg-surface rounded-[12px] border p-4 ${getCardBorder(row)}`}
              >
                {/* Card header: payee + status + delete */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {getStatusBadge(row)}
                    {row.status === "pending" ? (
                      <input
                        type="text"
                        value={row.payee}
                        onChange={(e) => updateRow(i, "payee", e.target.value)}
                        className="bg-transparent text-text-primary font-semibold text-sm focus:outline-none focus:underline focus:decoration-cyan"
                      />
                    ) : (
                      <span className="text-text-primary font-semibold text-sm">{row.payee}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {/* Amount */}
                    {row.status === "pending" ? (
                      <div className="flex items-center">
                        <span className="text-text-dim text-sm mr-0.5">€</span>
                        <input
                          type="number"
                          step="0.01"
                          value={Math.abs(row.amount) / 1000}
                          onChange={(e) =>
                            updateRow(i, "amount", -Math.round(parseFloat(e.target.value || "0") * 1000))
                          }
                          className="bg-transparent font-mono text-cyan font-semibold text-base w-20 text-right focus:outline-none focus:underline focus:decoration-cyan"
                        />
                      </div>
                    ) : (
                      <span className="font-mono text-cyan font-semibold text-base">
                        €{(Math.abs(row.amount) / 1000).toFixed(2)}
                      </span>
                    )}
                    {row.status === "pending" && (
                      <button
                        onClick={() => removeRow(i)}
                        className="text-text-dim hover:text-danger transition-colors ml-1"
                        title="Remove"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    )}
                  </div>
                </div>

                {/* Card body: date, category, memo */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-[10px] text-text-dim uppercase tracking-wider block mb-0.5">Date</span>
                    {row.status === "pending" ? (
                      <input
                        type="date"
                        value={row.date}
                        onChange={(e) => updateRow(i, "date", e.target.value)}
                        className="bg-navy border border-surface-light rounded-[8px] px-2 py-1 text-xs text-text-primary w-full focus:outline-none focus:ring-1 focus:ring-cyan/50"
                      />
                    ) : (
                      <span className="text-xs text-text-muted">{row.date}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] text-text-dim uppercase tracking-wider block mb-0.5">Category</span>
                    {row.status === "pending" ? (
                      <select
                        value={row.category}
                        onChange={(e) => updateRow(i, "category", e.target.value)}
                        className="bg-navy border border-surface-light rounded-[8px] px-2 py-1 text-xs text-text-primary w-full focus:outline-none focus:ring-1 focus:ring-cyan/50"
                      >
                        {categoryOptions.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                        {!categoryOptions.includes(row.category) && (
                          <option value={row.category}>{row.category} (custom)</option>
                        )}
                      </select>
                    ) : (
                      <span className="text-xs text-text-muted">{row.category}</span>
                    )}
                  </div>
                  <div>
                    <span className="text-[10px] text-text-dim uppercase tracking-wider block mb-0.5">Memo</span>
                    {row.status === "pending" ? (
                      <input
                        type="text"
                        value={row.memo}
                        onChange={(e) => updateRow(i, "memo", e.target.value)}
                        className="bg-navy border border-surface-light rounded-[8px] px-2 py-1 text-xs text-text-primary w-full focus:outline-none focus:ring-1 focus:ring-cyan/50"
                      />
                    ) : (
                      <span className="text-xs text-text-muted">{row.memo}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Summary & guardrails */}
          {hasPendingRows && (
            <div className="mt-4 space-y-3">
              {/* Total summary */}
              <div className="bg-surface rounded-[12px] p-3 text-sm">
                <div className="flex justify-between text-text-muted">
                  <span>Transactions to create:</span>
                  <span className="font-medium text-text-primary">{pendingRows.length}</span>
                </div>
                <div className="flex justify-between mt-1 text-text-muted">
                  <span>Total amount:</span>
                  <span className="font-mono font-semibold text-cyan">€{totalAmount.toFixed(2)}</span>
                </div>
                {todayCount > 0 && (
                  <div className="flex justify-between mt-1 text-xs text-text-dim">
                    <span>Created today:</span>
                    <span>{todayCount} / {DAILY_TRANSACTION_LIMIT}</span>
                  </div>
                )}
              </div>

              {/* Warnings */}
              {largeAmountRows.length > 0 && (
                <div className="bg-warning/10 border border-warning/30 text-warning rounded-[12px] p-3 text-sm">
                  {largeAmountRows.length} transaction{largeAmountRows.length > 1 ? "s" : ""} exceed{largeAmountRows.length === 1 ? "s" : ""} €{LARGE_AMOUNT_THRESHOLD}. Please double-check.
                </div>
              )}

              {wouldExceedLimit && (
                <div className="bg-danger/10 border border-danger/30 text-danger rounded-[12px] p-3 text-sm">
                  This would exceed the daily limit of {DAILY_TRANSACTION_LIMIT} transactions ({todayCount} already created today).
                </div>
              )}

              {/* Bottom-anchored Action Bar */}
              {!showConfirm ? (
                <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-surface-light p-4 z-40">
                  <div className="max-w-[640px] mx-auto flex items-center justify-between">
                    <div>
                      <span className="text-text-muted text-sm">{pendingRows.length} transaction{pendingRows.length !== 1 ? "s" : ""}</span>
                      <span className="font-mono font-semibold text-cyan text-base ml-2">€{totalAmount.toFixed(2)}</span>
                    </div>
                    <button
                      onClick={handleSubmitClick}
                      disabled={submitting || wouldExceedLimit}
                      className="bg-success text-white rounded-[12px] py-2.5 px-6 text-sm font-semibold hover:bg-success/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {submitting ? "Creating..." : "Create All"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="fixed bottom-0 left-0 right-0 bg-surface border-t border-surface-light p-4 z-40">
                  <div className="max-w-[640px] mx-auto">
                    <p className="text-sm text-text-primary font-medium mb-3">
                      Create {pendingRows.length} transaction{pendingRows.length > 1 ? "s" : ""} totaling <span className="font-mono text-cyan">€{totalAmount.toFixed(2)}</span> in "{config.accountName}"?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleConfirmedSubmit}
                        disabled={submitting}
                        className="flex-1 bg-success text-white rounded-[12px] py-2.5 px-4 text-sm font-semibold hover:bg-success/80 disabled:opacity-40 transition-colors"
                      >
                        {submitting ? "Creating..." : "Yes, create"}
                      </button>
                      <button
                        onClick={() => setShowConfirm(false)}
                        disabled={submitting}
                        className="flex-1 bg-surface-light text-text-muted rounded-[12px] py-2.5 px-4 text-sm font-medium hover:bg-surface-hover transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {submitted && !hasPendingRows && (
            <div className="mt-4 bg-success/10 border border-success/30 text-success rounded-[12px] p-3 text-sm">
              All transactions created successfully!
            </div>
          )}
        </div>
      )}
    </div>
  );
}
