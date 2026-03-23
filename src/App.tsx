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
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto p-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">YNAB Voice Ledger</h1>
            <div className="flex items-center gap-2 mt-1">
              <span className="inline-block bg-blue-100 text-blue-800 text-xs font-medium px-2 py-0.5 rounded">
                {config.accountName}
              </span>
              <span className="text-xs text-gray-400">
                Creating transactions in this account only
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowAiKeyModal(true)}
              className="text-sm text-gray-400 hover:text-blue-500"
            >
              {hasGeminiKey ? "AI key ✓" : "Configure AI"}
            </button>
            <button
              onClick={handleReset}
              className="text-sm text-gray-400 hover:text-red-500"
            >
              Reset Setup
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
