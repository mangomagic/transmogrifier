import { useState } from "react";
import type { MediaInfo } from "../lib/ipc";
import { S } from "../lib/strings";
import { formatTime } from "../lib/time";
import { TrimPanel } from "./TrimPanel";
import type { TrimValue } from "./TrimPanel";

export interface FileEntry {
  id: string;
  path: string;
  name: string;
  info: MediaInfo | null;
  thumbnail: string | null;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  percent: number;
  error: string | null;
  trimStart: number | null;
  trimEnd: number | null;
  /// True until the probe/thumbnail pass finishes; Convert stays disabled
  /// while any file in the list is still loading.
  probing: boolean;
}

function formatDuration(s: number | null): string {
  if (s == null) return "—";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return "";
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${(bytes / 1e6).toFixed(0)} MB`;
}

const STATUS_STYLES: Record<FileEntry["status"], string> = {
  done: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  running: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  cancelled: "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300",
  pending: "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

function AudioPlaceholder() {
  return (
    <div className="w-12 h-9 rounded bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center shrink-0">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-500">
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </svg>
    </div>
  );
}

export function FileRow({
  file,
  fastTrim,
  onRemove,
  onTrimChange,
}: {
  file: FileEntry;
  /// True when a set trim will use stream copy (no re-encode)
  fastTrim: boolean;
  onRemove: (id: string) => void;
  onTrimChange: (id: string, trim: TrimValue) => void;
}) {
  const [logOpen, setLogOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [trimOpen, setTrimOpen] = useState(false);

  const hasTrim = file.trimStart != null || file.trimEnd != null;
  const trimLabel = hasTrim
    ? `${fastTrim ? "⚡" : "✂"} ${formatTime(file.trimStart ?? 0)}–${
        file.trimEnd != null ? formatTime(file.trimEnd) : "end"
      }`
    : `✂ ${S.trim}`;

  const copyLog = async () => {
    if (!file.error) return;
    await navigator.clipboard.writeText(file.error);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <li className="bg-white dark:bg-zinc-900 rounded-lg p-3 shadow-sm">
      <div className="flex items-center gap-3">
        {file.thumbnail ? (
          <img src={file.thumbnail} alt="" className="w-12 h-9 rounded object-cover shrink-0" />
        ) : (
          <AudioPlaceholder />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium text-sm">{file.name}</span>
            {!file.info && file.probing && (
              <span className="text-xs text-zinc-400 dark:text-zinc-600 animate-pulse shrink-0">
                {S.reading}
              </span>
            )}
            {file.info && (
              <span className="text-xs text-zinc-500 shrink-0">
                {file.info.width && file.info.height
                  ? `${file.info.width}×${file.info.height} · `
                  : ""}
                {formatDuration(file.info.duration_s)}
                {file.info.size_bytes ? ` · ${formatSize(file.info.size_bytes)}` : ""}
              </span>
            )}
          </div>
          {(file.status === "running" || file.status === "done") && (
            <div className="mt-1 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  file.status === "done" ? "bg-green-500" : "bg-blue-500"
                }`}
                style={{ width: `${file.percent}%` }}
              />
            </div>
          )}
        </div>
        {file.status === "pending" && file.info?.duration_s != null && (
          <button
            onClick={() => setTrimOpen(!trimOpen)}
            title={hasTrim && fastTrim ? S.fastTrimHint : undefined}
            className={`text-xs px-2 py-0.5 rounded shrink-0 border ${
              hasTrim
                ? "border-blue-400 text-blue-600 dark:text-blue-400"
                : "border-zinc-300 dark:border-zinc-700 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            }`}
          >
            {trimLabel}
          </button>
        )}
        <span
          className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[file.status]}`}
        >
          {file.status === "running" ? `${Math.round(file.percent)}%` : file.status}
        </span>
        {(file.status === "pending" || file.status === "done" || file.status === "failed" || file.status === "cancelled") && (
          <button
            onClick={() => onRemove(file.id)}
            className="text-zinc-400 hover:text-zinc-700 dark:text-zinc-600 dark:hover:text-zinc-300 shrink-0"
            aria-label="Remove"
          >
            ✕
          </button>
        )}
      </div>
      {trimOpen && file.status === "pending" && (
        <TrimPanel
          path={file.path}
          durationS={file.info?.duration_s ?? null}
          hasVideo={file.info?.video_codec != null}
          value={{ start: file.trimStart, end: file.trimEnd }}
          onChange={(trim) => onTrimChange(file.id, trim)}
        />
      )}
      {file.status === "failed" && (
        <div className="mt-2 text-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setLogOpen(!logOpen)}
              className="text-red-500 dark:text-red-400 hover:underline"
            >
              {S.showLog} {logOpen ? "▾" : "▸"}
            </button>
            <button
              onClick={copyLog}
              className="text-zinc-500 hover:underline"
            >
              {copied ? S.copied : S.copyLog}
            </button>
          </div>
          {logOpen && (
            <pre className="mt-1 p-2 bg-zinc-100 dark:bg-zinc-950 rounded overflow-x-auto text-red-600 dark:text-red-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
              {file.error ?? "Conversion failed"}
            </pre>
          )}
        </div>
      )}
    </li>
  );
}
