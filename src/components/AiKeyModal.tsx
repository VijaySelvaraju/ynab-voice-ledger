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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Configure AI Parser</h2>
        <p className="text-sm text-gray-500 mb-4">
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
            className="w-full border border-gray-300 rounded-lg px-3 py-2 pr-16 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={(e) => e.key === "Enter" && handleSave()}
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 hover:text-gray-700"
          >
            {showKey ? "Hide" : "Show"}
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

        {error && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-3 bg-green-50 border border-green-200 text-green-700 rounded-lg p-3 text-sm">
            ✓ API key validated — AI parser enabled!
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleSave}
            disabled={!key.trim() || validating || success}
            className="flex-1 bg-blue-600 text-white rounded-lg py-2 px-4 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {validating ? "Validating..." : "Save"}
          </button>
          {existing && (
            <button
              onClick={handleRemove}
              disabled={validating}
              className="bg-red-50 text-red-600 border border-red-200 rounded-lg py-2 px-3 text-sm font-medium hover:bg-red-100"
            >
              Remove
            </button>
          )}
          <button
            onClick={onClose}
            disabled={validating}
            className="bg-gray-100 text-gray-700 rounded-lg py-2 px-3 text-sm font-medium hover:bg-gray-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
