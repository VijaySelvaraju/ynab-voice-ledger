import { getHistory } from "../lib/storage";

interface Props {
  refreshKey: number;
}

export default function TransactionHistory({ refreshKey }: Props) {
  // refreshKey triggers re-render when new transactions are created
  const history = getHistory();
  void refreshKey;

  if (history.length === 0) return null;

  function formatAmount(milliunits: number): string {
    const abs = Math.abs(milliunits) / 1000;
    return `€${abs.toFixed(2)}`;
  }

  function formatTimestamp(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString();
  }

  return (
    <div className="border-t border-surface-light pt-6 mt-6">
      <h3 className="text-sm font-semibold text-text-primary mb-4">
        Recent Transactions <span className="text-text-dim font-normal">({history.length})</span>
      </h3>
      <div className="space-y-2">
        {history.map((entry, i) => (
          <div
            key={`${entry.createdAt}-${i}`}
            className="flex items-center justify-between bg-surface rounded-[12px] px-4 py-3 text-sm"
          >
            <div className="flex-1 min-w-0">
              <span className="font-medium text-text-primary">{entry.payee}</span>
              <span className="text-text-dim text-xs ml-2">{entry.date}</span>
            </div>
            <div className="text-right shrink-0 ml-3">
              <span className="font-mono font-semibold text-cyan">{formatAmount(entry.amount)}</span>
              <span className="text-text-dim text-[10px] ml-2 block">
                {formatTimestamp(entry.createdAt)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
