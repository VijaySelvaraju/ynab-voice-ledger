import { useState } from "react";
import SetupScreen from "./components/SetupScreen";
import TransactionEntry from "./components/TransactionEntry";
import TransactionHistory from "./components/TransactionHistory";
import AiKeyModal from "./components/AiKeyModal";
import { getSetup, clearSetup, getGeminiApiKey, type SetupConfig } from "./lib/storage";

export default function App() {
  const [config, setConfig] = useState<SetupConfig | null>(getSetup);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [showAiKeyModal, setShowAiKeyModal] = useState(false);

  if (!config) {
    return <SetupScreen onComplete={(c) => setConfig(c)} />;
  }

  function handleReset() {
    clearSetup();
    setConfig(null);
  }

  const hasGeminiKey = Boolean(getGeminiApiKey());

  return (
    <div className="min-h-screen bg-navy">
      <div className="max-w-[640px] mx-auto px-4 py-6 pb-32">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-bold text-text-primary tracking-tight">
              YNAB Voice Ledger
            </h1>
            <div className="flex items-center gap-2 mt-1.5">
              <span className="inline-flex items-center gap-1.5 bg-cyan-glow text-cyan text-xs font-medium px-2.5 py-1 rounded-[8px]">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
                {config.accountName}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAiKeyModal(true)}
              className="text-xs font-medium px-3 py-1.5 rounded-[8px] transition-colors bg-surface text-text-muted hover:text-cyan hover:bg-surface-hover"
            >
              {hasGeminiKey ? "AI ✓" : "Configure AI"}
            </button>
            <button
              onClick={handleReset}
              className="text-xs font-medium px-3 py-1.5 rounded-[8px] transition-colors bg-surface text-text-muted hover:text-danger hover:bg-surface-hover"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Transaction Entry */}
        <TransactionEntry
          config={config}
          onTransactionsCreated={() => setHistoryRefreshKey((k) => k + 1)}
        />

        {/* History */}
        <TransactionHistory refreshKey={historyRefreshKey} />
      </div>

      {/* AI key modal */}
      {showAiKeyModal && (
        <AiKeyModal onClose={() => setShowAiKeyModal(false)} />
      )}
    </div>
  );
}
