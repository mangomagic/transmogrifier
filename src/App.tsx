import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { cancelJob, convertFile, onJobCancelled, onJobDone, onJobError, onProgress, probeFile } from "./lib/ipc";
import type { MediaInfo } from "./lib/ipc";
import { deriveOutputPath } from "./lib/paths";
import { DEFAULT_FORMAT, DEFAULT_PRESET, OUTPUT_FORMATS, VIDEO_PRESETS } from "./lib/presets";
import type { OutputFormat, VideoPreset } from "./lib/presets";
import { S } from "./lib/strings";
import "./index.css";

interface FileEntry {
  id: string;
  path: string;
  name: string;
  info: MediaInfo | null;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  percent: number;
  error: string | null;
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

let jobSeq = 0;
function nextId() {
  return `job-${++jobSeq}-${Date.now()}`;
}

export default function App() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [format, setFormat] = useState<OutputFormat>(DEFAULT_FORMAT);
  const [preset, setPreset] = useState<VideoPreset>(DEFAULT_PRESET);
  const [converting, setConverting] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const unlisteners = useRef<Array<() => void>>([]);
  const cancelRequested = useRef(false);
  const runningJobId = useRef<string | null>(null);

  useEffect(() => {
    const setup = async () => {
      const unlisten = [
        await onProgress((p) => {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === p.job_id ? { ...f, percent: p.percent, status: "running" } : f
            )
          );
        }),
        await onJobDone((p) => {
          setFiles((prev) =>
            prev.map((f) => (f.id === p.job_id ? { ...f, status: "done", percent: 100 } : f))
          );
        }),
        await onJobError((p) => {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === p.job_id ? { ...f, status: "failed", error: p.message } : f
            )
          );
        }),
        await onJobCancelled((p) => {
          setFiles((prev) =>
            prev.map((f) => (f.id === p.job_id ? { ...f, status: "cancelled" } : f))
          );
        }),
      ];
      unlisteners.current = unlisten;
    };
    setup();

    // Use Tauri native file drop (not HTML5 DnD) — delivers real file paths on all platforms
    const unlistenDrop = listen<{ paths: string[] }>("tauri://drag-drop", async (e) => {
      await addPaths(e.payload.paths);
    });

    return () => {
      unlisteners.current.forEach((u) => u());
      unlistenDrop.then((u) => u());
    };
  }, []);

  const addPaths = async (paths: string[]) => {
    for (const path of paths) {
      const name = path.split("/").pop() ?? path;
      const id = nextId();
      const entry: FileEntry = {
        id,
        path,
        name,
        info: null,
        status: "pending",
        percent: 0,
        error: null,
      };
      setFiles((prev) => {
        if (prev.some((f) => f.path === path)) return prev;
        return [...prev, entry];
      });
      try {
        const info = await probeFile(path);
        setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, info } : f)));
      } catch {
        // probe failed — still allow the file to queue
      }
    }
  };

  const handleAddFiles = async () => {
    const selected = await open({ multiple: true });
    if (!selected) return;
    await addPaths(Array.isArray(selected) ? selected : [selected]);
  };

  const handleRemove = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleConvert = async () => {
    setConverting(true);
    cancelRequested.current = false;
    const fmt = OUTPUT_FORMATS.find((f) => f.id === format)!;

    for (const file of files) {
      if (cancelRequested.current) break;
      if (file.status !== "pending") continue;
      const outputPath = deriveOutputPath(file.path, outputDir, fmt.extension);

      runningJobId.current = file.id;
      try {
        await convertFile(
          {
            input_path: file.path,
            output_path: outputPath,
            format,
            video_preset: preset,
            trim_start: null,
            trim_end: null,
          },
          file.id,
          file.info?.duration_us ?? null
        );
      } catch {
        // error handled via job_error event
      } finally {
        runningJobId.current = null;
      }
    }

    setConverting(false);
  };

  const handleCancel = async () => {
    cancelRequested.current = true;
    const jobId = runningJobId.current;
    if (jobId) {
      try {
        await cancelJob(jobId);
      } catch {
        // job may have already finished
      }
    }
  };

  const handleChooseFolder = async () => {
    const selected = await open({ directory: true });
    if (typeof selected === "string") setOutputDir(selected);
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const runningCount = files.filter((f) => f.status === "running").length;
  const doneCount = files.filter((f) => f.status === "done").length;
  const overallPct =
    files.length > 0
      ? Math.round(
          files.reduce((sum, f) => sum + (f.status === "done" ? 100 : f.percent), 0) /
            files.length
        )
      : 0;

  return (
    <div
      className="flex flex-col h-screen bg-zinc-950 text-zinc-100 select-none"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
      }}
    >
      {/* File list / drop zone */}
      <div
        className={`flex-1 overflow-y-auto p-4 transition-colors ${
          isDragOver ? "bg-blue-900/20 border-2 border-dashed border-blue-500" : ""
        }`}
      >
        {files.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-500">
            <svg
              width="64"
              height="64"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="text-lg font-medium">{S.dropZoneHint}</p>
            <p className="text-sm">{S.dropZoneSub}</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {files.map((f) => (
              <li key={f.id} className="bg-zinc-900 rounded-lg p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-sm">{f.name}</span>
                    {f.info && (
                      <span className="text-xs text-zinc-500 shrink-0">
                        {f.info.width && f.info.height
                          ? `${f.info.width}×${f.info.height} · `
                          : ""}
                        {formatDuration(f.info.duration_s)}
                        {f.info.size_bytes ? ` · ${formatSize(f.info.size_bytes)}` : ""}
                      </span>
                    )}
                  </div>
                  {(f.status === "running" || f.status === "done") && (
                    <div className="mt-1 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          f.status === "done" ? "bg-green-500" : "bg-blue-500"
                        }`}
                        style={{ width: `${f.percent}%` }}
                      />
                    </div>
                  )}
                  {f.status === "failed" && (
                    <p className="text-xs text-red-400 mt-1 truncate">
                      {f.error ?? "Conversion failed"}
                    </p>
                  )}
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
                    f.status === "done"
                      ? "bg-green-900 text-green-300"
                      : f.status === "failed"
                      ? "bg-red-900 text-red-300"
                      : f.status === "running"
                      ? "bg-blue-900 text-blue-300"
                      : "bg-zinc-800 text-zinc-400"
                  }`}
                >
                  {f.status === "running" ? `${Math.round(f.percent)}%` : f.status}
                </span>
                {f.status === "pending" && (
                  <button
                    onClick={() => handleRemove(f.id)}
                    className="text-zinc-600 hover:text-zinc-300 shrink-0"
                    aria-label="Remove"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Controls bar */}
      <div className="border-t border-zinc-800 p-4 space-y-3">
        <div className="flex gap-3 flex-wrap items-center">
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400">{S.outputFormat}</label>
            <select
              className="bg-zinc-800 text-sm rounded px-2 py-1 border border-zinc-700"
              value={format}
              onChange={(e) => setFormat(e.target.value as OutputFormat)}
              disabled={converting}
            >
              {OUTPUT_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400">{S.quality}</label>
            <select
              className="bg-zinc-800 text-sm rounded px-2 py-1 border border-zinc-700"
              value={preset}
              onChange={(e) => setPreset(e.target.value as VideoPreset)}
              disabled={converting}
            >
              {VIDEO_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-400">{S.saveTo}</label>
            <button
              onClick={handleChooseFolder}
              disabled={converting}
              className="text-sm px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 disabled:opacity-50 max-w-48 truncate"
              title={outputDir ?? S.sameFolderAsSource}
            >
              {outputDir ? outputDir.split("/").pop() : S.sameFolderAsSource}
            </button>
            {outputDir && (
              <button
                onClick={() => setOutputDir(null)}
                disabled={converting}
                className="text-zinc-600 hover:text-zinc-300 text-xs"
                aria-label="Reset to same folder as source"
              >
                ✕
              </button>
            )}
          </div>
          <button
            onClick={handleAddFiles}
            disabled={converting}
            className="ml-auto text-sm px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 disabled:opacity-50"
          >
            {S.addFiles}
          </button>
          {files.length > 0 && (
            <button
              onClick={() => setFiles([])}
              disabled={converting}
              className="text-sm px-3 py-1 bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 disabled:opacity-50"
            >
              {S.clearAll}
            </button>
          )}
        </div>

        {/* Progress + Convert button */}
        <div className="flex items-center gap-3">
          {(converting || runningCount > 0) && (
            <div className="flex-1">
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${overallPct}%` }}
                />
              </div>
              <p className="text-xs text-zinc-400 mt-1">
                {S.converting(doneCount, files.length, overallPct)}
              </p>
            </div>
          )}
          {converting ? (
            <button
              onClick={handleCancel}
              className="ml-auto px-6 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
            >
              {S.cancel}
            </button>
          ) : (
            <button
              onClick={handleConvert}
              disabled={pendingCount === 0}
              className="ml-auto px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {S.convert}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
