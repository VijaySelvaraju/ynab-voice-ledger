import { useState } from "react";
import { fetchBudgets, fetchAccounts, type Budget, type Account } from "../lib/ynab-api";
import { saveSetup, type SetupConfig } from "../lib/storage";

interface Props {
  onComplete: (config: SetupConfig) => void;
}

export default function SetupScreen({ onComplete }: Props) {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedBudget, setSelectedBudget] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleTokenSubmit() {
    if (!token.trim()) return;
    setLoading(true);
    setError("");
    try {
      const b = await fetchBudgets(token.trim());
      setBudgets(b);
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch budgets");
    } finally {
      setLoading(false);
    }
  }

  async function handleBudgetSelect(budgetId: string) {
    setSelectedBudget(budgetId);
    setLoading(true);
    setError("");
    try {
      const a = await fetchAccounts(token.trim(), budgetId);
      setAccounts(a);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch accounts");
    } finally {
      setLoading(false);
    }
  }

  function handleSave() {
    const account = accounts.find((a) => a.id === selectedAccount);
    if (!account) return;
    const config: SetupConfig = {
      token: token.trim(),
      budgetId: selectedBudget,
      accountId: selectedAccount,
      accountName: account.name,
    };
    saveSetup(config);
    onComplete(config);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">YNAB Voice Ledger</h1>
        <p className="text-gray-500 mb-6">One-time setup to connect your YNAB account.</p>

        {/* Step indicators */}
        <div className="flex gap-2 mb-6">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${
                s <= step ? "bg-blue-500" : "bg-gray-200"
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Step 1: Token */}
        {step === 1 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              YNAB Personal Access Token
            </label>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your token here"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                onKeyDown={(e) => e.key === "Enter" && handleTokenSubmit()}
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700"
              >
                {showToken ? "Hide" : "Show"}
              </button>
            </div>
            <button
              onClick={handleTokenSubmit}
              disabled={!token.trim() || loading}
              className="mt-4 w-full bg-blue-600 text-white rounded-lg py-2 px-4 font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Connecting..." : "Connect to YNAB"}
            </button>
          </div>
        )}

        {/* Step 2: Budget */}
        {step === 2 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Budget
            </label>
            <select
              value={selectedBudget}
              onChange={(e) => handleBudgetSelect(e.target.value)}
              disabled={loading}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Choose a budget...</option>
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {loading && (
              <p className="text-sm text-gray-500 mt-2">Loading accounts...</p>
            )}
          </div>
        )}

        {/* Step 3: Account */}
        {step === 3 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Staging Account
            </label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Choose an account...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              All transactions will be created in this account only.
            </p>
            <button
              onClick={handleSave}
              disabled={!selectedAccount}
              className="mt-4 w-full bg-green-600 text-white rounded-lg py-2 px-4 font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save Setup
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
