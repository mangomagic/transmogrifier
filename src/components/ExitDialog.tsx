import { S } from "../lib/strings";

/// Shown when the user tries to close/quit while conversions are queued or
/// running (the backend blocks the exit until confirmed).
export function ExitDialog({
  activeCount,
  onQuit,
  onStay,
}: {
  activeCount: number;
  onQuit: () => void;
  onStay: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-md w-full mx-6 p-5 space-y-3">
        <h2 className="font-semibold">{S.exitTitle}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{S.exitBody(activeCount)}</p>
        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onStay}
            autoFocus
            className="text-sm px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white"
          >
            {S.exitStay}
          </button>
          <button
            onClick={onQuit}
            className="text-sm px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white"
          >
            {S.exitQuit}
          </button>
        </div>
      </div>
    </div>
  );
}
