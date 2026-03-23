import { useState } from "react";
import { getGeminiApiKey, setGeminiApiKey, clearGeminiApiKey, setParserMode } from "../lib/storage";
import { validateGeminiApiKey } from "../lib/ai-parser";

interface Props {
  onClose: () => void;
}

export default function AiKeyModal({ onClose }: Props) {
  const existing = getGeminiApiKey();
  const [key, setKey] = useState(existing ?? "");
  const [showKey, setShowKey] = useState(false);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  async function handleSave() {
    if (!key.trim()) return;
    setValidating(true);
    setError("");
    setSuccess(false);

    const result = await validateGeminiApiKey(key.trim());

    if (result.valid) {
      setGeminiApiKey(key.trim());
      setParserMode("ai");
      setSuccess(true);
      setTimeout(() => onClose(), 700);
    } else if (result.error === "invalid_key") {
      setError("Invalid API key — please check and try again.");
      setValidating(false);
    } else {
      // Network/rate-limit: save anyway
      setGeminiApiKey(key.trim());
      setParserMode("ai");
      onClose();
    }
  }

  function handleRemove() {
    clearGeminiApiKey();
    setParserMode("local");
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-[12px] shadow-[0_4px_12px_rgba(0,0,0,0.2)] p-6 w-full max-w-sm">
        <h2 className="text-base font-semibold text-text-primary mb-1">Configure AI Parser</h2>
        <p className="text-sm text-text-muted mb-4">
          Enter your Google AI Studio API key to enable Gemini 2.0 Flash parsing.
        </p>

        <div className="relative mb-1">
          <input
            type={showKey ? "text" : "password"}
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setError("");
              setSuccess(false);
            }}
            placeholder="Paste your Gemini API key"
            className="w-full bg-navy border border-surface-light rounded-[12px] px-3 py-2.5 pr-16 text-sm text-text-primary placeholder:text-text-dim focus:outline-none focus:ring-2 focus:ring-cyan/50 focus:border-cyan"
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted hover:text-cyan transition-colors"
          >
            {showKey ? "Hide" : "Show"}
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

        {error && (
          <div className="mt-3 bg-danger/10 border border-danger/30 text-danger rounded-[12px] p-3 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-3 bg-success/10 border border-success/30 text-success rounded-[12px] p-3 text-sm">
            ✓ API key validated — AI parser enabled!
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleSave}
            disabled={!key.trim() || validating || success}
            className="flex-1 bg-cyan text-navy rounded-[12px] py-2.5 px-4 text-sm font-semibold hover:bg-cyan-dim disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {validating ? "Validating..." : "Save"}
          </button>
          {existing && (
            <button
              onClick={handleRemove}
              disabled={validating}
              className="bg-danger/10 text-danger border border-danger/30 rounded-[12px] py-2.5 px-3 text-sm font-medium hover:bg-danger/20 transition-colors"
            >
              Remove
            </button>
          )}
          <button
            onClick={onClose}
            disabled={validating}
            className="bg-surface-light text-text-muted rounded-[12px] py-2.5 px-3 text-sm font-medium hover:bg-surface-hover transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
