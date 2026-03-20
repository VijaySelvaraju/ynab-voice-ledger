import { useState } from "react";
import { parseMultipleTransactions, type ParsedTransaction } from "../lib/parser";
import { createTransactions } from "../lib/ynab-api";
import { addToHistory } from "../lib/storage";
import type { SetupConfig } from "../lib/storage";

interface Props {
  config: SetupConfig;
  onTransactionsCreated: () => void;
}

interface ReviewRow extends ParsedTransaction {
  status: "pending" | "success" | "error";
  errorMessage?: string;
}

export default function TransactionEntry({ config, onTransactionsCreated }: Props) {
  const [input, setInput] = useState("");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function handleParse() {
    const parsed = parseMultipleTransactions(input, config.categories || []);
    setRows(parsed.map((p) => ({ ...p, status: "pending" as const })));
    setSubmitted(false);
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
  }

  async function handleSubmit() {
    const pendingRows = rows.filter((r) => r.status === "pending");
    if (pendingRows.length === 0) return;

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
  }

  const hasPendingRows = rows.some((r) => r.status === "pending");
  const hasReviewRows = rows.some((r) => r.needsReview && r.status === "pending");

  return (
    <div>
      {/* Input area */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Enter transactions (one per line)
        </label>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Examples:\n20th march dominos pizza dining out two pizzas 16 euros\ntoday metro transport going to office 1.90\nyesterday amazon shopping new headphones 29.99`}
          rows={5}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y"
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleParse}
            disabled={!input.trim()}
            className="bg-blue-600 text-white rounded-lg py-2 px-4 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Parse
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
                      <input
                        type="text"
                        value={row.category}
                        onChange={(e) => updateRow(i, "category", e.target.value)}
                        disabled={row.status !== "pending"}
                        className="border border-gray-300 rounded px-1.5 py-1 text-sm w-28 disabled:bg-gray-100"
                      />
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
                      {row.status === "pending" && !row.needsReview && (
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

          {hasPendingRows && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="mt-4 bg-green-600 text-white rounded-lg py-2 px-6 text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Creating..." : "Create All"}
            </button>
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
