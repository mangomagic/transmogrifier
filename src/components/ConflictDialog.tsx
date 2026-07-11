import { S } from "../lib/strings";

/// Modal shown before converting when resolved output paths already exist
/// on disk. Overwrite passes -y for exactly those jobs; Keep both re-resolves
/// with unique suffixed names; cancel converts nothing.
export function ConflictDialog({
  conflictPaths,
  onOverwrite,
  onKeepBoth,
  onCancel,
}: {
  conflictPaths: string[];
  onOverwrite: () => void;
  onKeepBoth: () => void;
  onCancel: () => void;
}) {
  const fileName = (p: string) => p.split(/[/\\]/).pop() ?? p;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-zinc-900 rounded-xl shadow-xl max-w-md w-full mx-6 p-5 space-y-3">
        <h2 className="font-semibold">{S.conflictTitle}</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {S.conflictBody(conflictPaths.length)}
        </p>
        <ul className="text-sm max-h-40 overflow-y-auto bg-zinc-100 dark:bg-zinc-950 rounded p-2 space-y-0.5">
          {conflictPaths.map((p) => (
            <li key={p} className="truncate font-mono text-xs" title={p}>
              {fileName(p)}
            </li>
          ))}
        </ul>
        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onCancel}
            className="text-sm px-3 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            {S.conflictCancel}
          </button>
          <button
            onClick={onKeepBoth}
            className="text-sm px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-500 text-white"
          >
            {S.conflictKeepBoth}
          </button>
          <button
            onClick={onOverwrite}
            className="text-sm px-3 py-1.5 rounded bg-red-700 hover:bg-red-600 text-white"
          >
            {S.conflictOverwrite}
          </button>
        </div>
      </div>
    </div>
  );
}
