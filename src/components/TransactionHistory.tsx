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
    <div className="border-t border-gray-200 pt-6">
      <h3 className="text-sm font-medium text-gray-700 mb-3">
        Recent Transactions ({history.length})
      </h3>
      <div className="space-y-2">
        {history.map((entry, i) => (
          <div
            key={`${entry.createdAt}-${i}`}
            className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm"
          >
            <div className="flex-1">
              <span className="font-medium text-gray-900">{entry.payee}</span>
              <span className="text-gray-400 ml-2">{entry.date}</span>
            </div>
            <div className="text-right">
              <span className="font-medium text-gray-900">{formatAmount(entry.amount)}</span>
              <span className="text-gray-400 text-xs ml-2 block">
                {formatTimestamp(entry.createdAt)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
