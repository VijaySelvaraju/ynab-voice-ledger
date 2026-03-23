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

  const stepLabels = ["YNAB Token", "Budget", "Account", "AI Parser"];

  return (
    <div className="min-h-screen flex items-center justify-center bg-navy p-4">
      <div className="bg-surface rounded-[12px] shadow-[0_4px_12px_rgba(0,0,0,0.2)] p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-text-primary mb-1 tracking-tight">YNAB Voice Ledger</h1>
        <p className="text-text-muted text-sm mb-6">One-time setup to connect your YNAB account.</p>

        {/* Progress pills */}
        <div className="flex gap-2 mb-6">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="flex-1 flex flex-col items-center gap-1.5">
              <div
                className={`h-1.5 w-full rounded-full transition-colors ${
                  s <= step ? "bg-cyan" : "bg-surface-light"
                }`}
              />
              <span className={`text-[10px] font-medium ${
                s <= step ? "text-cyan" : "text-text-dim"
              }`}>
                {stepLabels[s - 1]}
              </span>
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/30 text-danger rounded-[12px] p-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Step 1: Token */}
        {step === 1 && (
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">
              YNAB Personal Access Token
            </label>
            <div className="relative">
              <input
                type={showToken ? "text" : "password"}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your token here"
                className="w-full bg-navy border border-surface-light rounded-[12px] px-3 py-2.5 pr-16 text-sm text-text-primary placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-cyan/50 focus:border-cyan"
                onKeyDown={(e) => e.key === "Enter" && handleTokenSubmit()}
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted hover:text-cyan transition-colors"
              >
                {showToken ? "Hide" : "Show"}
              </button>
            </div>
            <button
              onClick={handleTokenSubmit}
              disabled={!token.trim() || loading}
              className="mt-4 w-full bg-cyan text-navy rounded-[12px] py-2.5 px-4 font-semibold text-sm hover:bg-cyan-dim disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Connecting..." : "Connect to YNAB"}
            </button>
          </div>
        )}

        {/* Step 2: Budget */}
        {step === 2 && (
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">
              Select Budget
            </label>
            <select
              value={selectedBudget}
              onChange={(e) => handleBudgetSelect(e.target.value)}
              disabled={loading}
              className="w-full bg-navy border border-surface-light rounded-[12px] px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-cyan/50 focus:border-cyan"
            >
              <option value="">Choose a budget...</option>
              {budgets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            {loading && (
              <p className="text-sm text-text-muted mt-2">Loading accounts...</p>
            )}
          </div>
        )}

        {/* Step 3: Account */}
        {step === 3 && (
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">
              Select Staging Account
            </label>
            <select
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-full bg-navy border border-surface-light rounded-[12px] px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-cyan/50 focus:border-cyan"
            >
              <option value="">Choose an account...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-text-dim mt-1.5">
              All transactions will be created in this account only.
            </p>
            <button
              onClick={handleSaveAccount}
              disabled={!selectedAccount}
              className="mt-4 w-full bg-cyan text-navy rounded-[12px] py-2.5 px-4 font-semibold text-sm hover:bg-cyan-dim disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        )}

        {/* Step 4: Gemini API key (optional) */}
        {step === 4 && (
          <div>
            <h2 className="text-base font-semibold text-text-primary mb-1">
              AI Parser <span className="text-xs font-normal text-text-dim">(Optional)</span>
            </h2>
            <p className="text-sm text-text-muted mb-4">
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
                className="w-full bg-navy border border-surface-light rounded-[12px] px-3 py-2.5 pr-16 text-sm text-text-primary placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-cyan/50 focus:border-cyan"
                onKeyDown={(e) => e.key === "Enter" && handleSaveGeminiKey()}
              />
              <button
                type="button"
                onClick={() => setShowGeminiKey(!showGeminiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted hover:text-cyan transition-colors"
              >
                {showGeminiKey ? "Hide" : "Show"}
              </button>
            </div>

            <a
              href="https://aistudio.google.com/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-cyan hover:underline"
            >
              Get a free key from Google AI Studio →
            </a>

            {geminiError && (
              <div className="mt-3 bg-danger/10 border border-danger/30 text-danger rounded-[12px] p-3 text-sm">
                {geminiError}
              </div>
            )}

            {geminiSuccess && (
              <div className="mt-3 bg-success/10 border border-success/30 text-success rounded-[12px] p-3 text-sm">
                ✓ API key validated — AI parser enabled!
              </div>
            )}

            <div className="flex gap-2 mt-4">
              <button
                onClick={handleSaveGeminiKey}
                disabled={!geminiKey.trim() || geminiValidating || geminiSuccess}
                className="flex-1 bg-cyan text-navy rounded-[12px] py-2.5 px-4 font-semibold text-sm hover:bg-cyan-dim disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {geminiValidating ? "Validating..." : "Save & Continue"}
              </button>
              <button
                onClick={handleSkipGemini}
                disabled={geminiValidating}
                className="flex-1 bg-surface-light text-text-muted rounded-[12px] py-2.5 px-4 font-medium text-sm hover:bg-surface-hover disabled:opacity-40 transition-colors"
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
