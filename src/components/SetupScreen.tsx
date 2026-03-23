import { useState } from "react";
import { fetchBudgets, fetchAccounts, fetchCategories, type Budget, type Account } from "../lib/ynab-api";
import { saveSetup, setGeminiApiKey, setParserMode, type SetupConfig } from "../lib/storage";
import { validateGeminiApiKey } from "../lib/ai-parser";

interface Props {
  onComplete: (config: SetupConfig) => void;
}

export default function SetupScreen({ onComplete }: Props) {
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [selectedBudget, setSelectedBudget] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedAccount, setSelectedAccount] = useState("");
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Step 4 state
  const [geminiKey, setGeminiKey] = useState("");
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [geminiValidating, setGeminiValidating] = useState(false);
  const [geminiError, setGeminiError] = useState("");
  const [geminiSuccess, setGeminiSuccess] = useState(false);

  // Saved config from steps 1-3 (used when proceeding to step 4)
  const [pendingConfig, setPendingConfig] = useState<SetupConfig | null>(null);

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
      const [a, cats] = await Promise.all([
        fetchAccounts(token.trim(), budgetId),
        fetchCategories(token.trim(), budgetId),
      ]);
      setAccounts(a);
      setCategories(cats.map((c) => c.name));
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch accounts");
    } finally {
      setLoading(false);
    }
  }

  function handleSaveAccount() {
    const account = accounts.find((a) => a.id === selectedAccount);
    if (!account) return;
    const config: SetupConfig = {
      token: token.trim(),
      budgetId: selectedBudget,
      accountId: selectedAccount,
      accountName: account.name,
      categories,
    };
    saveSetup(config);
    setPendingConfig(config);
    setStep(4);
  }

  async function handleSaveGeminiKey() {
    if (!geminiKey.trim() || !pendingConfig) return;
    setGeminiValidating(true);
    setGeminiError("");
    setGeminiSuccess(false);

    const result = await validateGeminiApiKey(geminiKey.trim());

    if (result.valid) {
      setGeminiApiKey(geminiKey.trim());
      setParserMode("ai");
      setGeminiSuccess(true);
      setTimeout(() => onComplete(pendingConfig), 600);
    } else if (result.error === "invalid_key") {
      setGeminiError("Invalid API key — please check and try again.");
      setGeminiValidating(false);
    } else {
      // Network error or rate limit — save anyway, don't block setup
      setGeminiApiKey(geminiKey.trim());
      setParserMode("ai");
      onComplete(pendingConfig);
    }
  }

  function handleSkipGemini() {
    if (!pendingConfig) return;
    setParserMode("local");
    onComplete(pendingConfig);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">YNAB Voice Ledger</h1>
        <p className="text-gray-500 mb-6">One-time setup to connect your YNAB account.</p>

        {/* Step indicators */}
        <div className="flex gap-2 mb-6">
          {[1, 2, 3, 4].map((s) => (
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
              onClick={handleSaveAccount}
              disabled={!selectedAccount}
              className="mt-4 w-full bg-green-600 text-white rounded-lg py-2 px-4 font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        )}

        {/* Step 4: Gemini API key (optional) */}
        {step === 4 && (
          <div>
            <h2 className="text-base font-semibold text-gray-800 mb-1">AI Parser <span className="text-xs font-normal text-gray-400">(Optional)</span></h2>
            <p className="text-sm text-gray-500 mb-4">
              Add a Google AI Studio API key to enable AI-powered parsing. This lets you describe
              multiple expenses in free-form text or voice dictation — no need to format one per line.
              Without this, the app uses the built-in rule-based parser.
            </p>

            <div className="relative mb-1">
              <input
                type={showGeminiKey ? "text" : "password"}
                value={geminiKey}
                onChange={(e) => {
                  setGeminiKey(e.target.value);
                  setGeminiError("");
                  setGeminiSuccess(false);
                }}
                placeholder="Paste your Gemini API key"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                onKeyDown={(e) => e.key === "Enter" && handleSaveGeminiKey()}
              />
              <button
                type="button"
                onClick={() => setShowGeminiKey(!showGeminiKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700"
              >
                {showGeminiKey ? "Hide" : "Show"}
              </button>
            </div>

            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-500 hover:underline"
            >
              Get a free key from Google AI Studio →
            </a>

            {geminiError && (
              <div className="mt-3 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                {geminiError}
              </div>
            )}

            {geminiSuccess && (
              <div className="mt-3 bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">
                ✓ API key validated — AI parser enabled!
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button
                onClick={handleSaveGeminiKey}
                disabled={!geminiKey.trim() || geminiValidating || geminiSuccess}
                className="flex-1 bg-blue-600 text-white rounded-lg py-2 px-4 font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {geminiValidating ? "Validating..." : "Save & Continue"}
              </button>
              <button
                onClick={handleSkipGemini}
                disabled={geminiValidating}
                className="flex-1 bg-gray-100 text-gray-700 rounded-lg py-2 px-4 font-medium hover:bg-gray-200 disabled:opacity-50"
              >
                Skip
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
