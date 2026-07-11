import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import {
  cancelAll,
  enqueueJobs,
  generateThumbnail,
  onJobCancelled,
  onJobDone,
  onJobError,
  onJobStarted,
  onProgress,
  probeFile,
  setConcurrency as ipcSetConcurrency,
} from "./lib/ipc";
import { deriveOutputPath } from "./lib/paths";
import { DEFAULT_FORMAT, DEFAULT_PRESET, OUTPUT_FORMATS, VIDEO_PRESETS } from "./lib/presets";
import type { OutputFormat, VideoPreset } from "./lib/presets";
import { loadSettings, saveSettings } from "./lib/settings";
import { S } from "./lib/strings";
import { FileRow } from "./components/FileRow";
import type { FileEntry } from "./components/FileRow";
import "./index.css";

let jobSeq = 0;
const nextId = () => `job-${++jobSeq}-${Date.now()}`;

export default function App() {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [format, setFormat] = useState<OutputFormat>(DEFAULT_FORMAT);
  const [preset, setPreset] = useState<VideoPreset>(DEFAULT_PRESET);
  const [concurrency, setConcurrency] = useState(2);
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const settingsLoaded = useRef(false);

  const updateFile = (id: string, patch: Partial<FileEntry>) => {
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  };

  useEffect(() => {
    const unlistenPromises = [
      onProgress((p) => updateFile(p.job_id, { percent: p.percent, status: "running" })),
      onJobStarted((p) => updateFile(p.job_id, { status: "running", percent: 0 })),
      onJobDone((p) => updateFile(p.job_id, { status: "done", percent: 100 })),
      onJobError((p) => updateFile(p.job_id, { status: "failed", error: p.message })),
      onJobCancelled((p) => updateFile(p.job_id, { status: "cancelled" })),
      // Tauri native file drop (not HTML5 DnD) — delivers real paths on all platforms
      listen<{ paths: string[] }>("tauri://drag-drop", (e) => addPaths(e.payload.paths)),
    ];

    loadSettings().then((s) => {
      setFormat(s.format);
      setPreset(s.preset);
      setOutputDir(s.outputDir);
      setConcurrency(s.concurrency);
      ipcSetConcurrency(s.concurrency);
      settingsLoaded.current = true;
    });

    return () => {
      unlistenPromises.forEach((p) => p.then((u) => u()));
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded.current) return;
    saveSettings({ format, preset, outputDir, concurrency });
  }, [format, preset, outputDir, concurrency]);

  const addPaths = async (paths: string[]) => {
    for (const path of paths) {
      const name = path.split("/").pop() ?? path;
      const id = nextId();
      const entry: FileEntry = {
        id,
        path,
        name,
        info: null,
        thumbnail: null,
        status: "pending",
        percent: 0,
        error: null,
      };
      let duplicate = false;
      setFiles((prev) => {
        if (prev.some((f) => f.path === path && f.status === "pending")) {
          duplicate = true;
          return prev;
        }
        return [...prev, entry];
      });
      if (duplicate) continue;

      try {
        const info = await probeFile(path);
        updateFile(id, { info });
        try {
          const thumbnail = await generateThumbnail(path, info.duration_s);
          updateFile(id, { thumbnail });
        } catch {
          // audio-only or no frame — placeholder icon stays
        }
      } catch {
        // probe failed — still allow the file to queue; conversion will surface the error
      }
    }
  };

  const handleAddFiles = async () => {
    const selected = await open({ multiple: true });
    if (!selected) return;
    await addPaths(Array.isArray(selected) ? selected : [selected]);
  };

  const handleConvert = async () => {
    const fmt = OUTPUT_FORMATS.find((f) => f.id === format)!;
    const pending = files.filter((f) => f.status === "pending");
    await enqueueJobs(
      pending.map((file) => ({
        job_id: file.id,
        settings: {
          input_path: file.path,
          output_path: deriveOutputPath(file.path, outputDir, fmt.extension),
          format,
          video_preset: preset,
          trim_start: null,
          trim_end: null,
        },
        duration_us: file.info?.duration_us ?? null,
      }))
    );
  };

  const handleChooseFolder = async () => {
    const selected = await open({ directory: true });
    if (typeof selected === "string") setOutputDir(selected);
  };

  const handleConcurrency = (n: number) => {
    setConcurrency(n);
    ipcSetConcurrency(n);
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const activeCount = files.filter((f) => f.status === "running").length;
  const doneCount = files.filter((f) => f.status === "done").length;
  const converting = activeCount > 0;
  const overallPct =
    files.length > 0
      ? Math.round(
          files.reduce((sum, f) => sum + (f.status === "done" ? 100 : f.percent), 0) /
            files.length
        )
      : 0;

  return (
    <div
      className="flex flex-col h-screen bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 select-none"
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
      <div
        className={`flex-1 overflow-y-auto p-4 transition-colors ${
          isDragOver ? "bg-blue-100 dark:bg-blue-900/20 border-2 border-dashed border-blue-500" : ""
        }`}
      >
        {files.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-3 text-zinc-400 dark:text-zinc-500">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
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
              <FileRow key={f.id} file={f} onRemove={(id) => setFiles((prev) => prev.filter((x) => x.id !== id))} />
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-zinc-300 dark:border-zinc-800 p-4 space-y-3">
        <div className="flex gap-3 flex-wrap items-center">
          <Selector label={S.outputFormat} value={format} disabled={converting}
            options={OUTPUT_FORMATS.map((f) => [f.id, f.label])}
            onChange={(v) => setFormat(v as OutputFormat)} />
          <Selector label={S.quality} value={preset} disabled={converting}
            options={VIDEO_PRESETS.map((p) => [p.id, p.label])}
            onChange={(v) => setPreset(v as VideoPreset)} />
          <Selector label={S.parallel} value={String(concurrency)} disabled={converting}
            options={[["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"]]}
            onChange={(v) => handleConcurrency(Number(v))} />
          <div className="flex items-center gap-2">
            <label className="text-xs text-zinc-500 dark:text-zinc-400">{S.saveTo}</label>
            <button
              onClick={handleChooseFolder}
              disabled={converting}
              className="text-sm px-2 py-1 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded border border-zinc-300 dark:border-zinc-700 disabled:opacity-50 max-w-48 truncate"
              title={outputDir ?? S.sameFolderAsSource}
            >
              {outputDir ? outputDir.split("/").pop() : S.sameFolderAsSource}
            </button>
            {outputDir && (
              <button
                onClick={() => setOutputDir(null)}
                disabled={converting}
                className="text-zinc-400 hover:text-zinc-700 dark:text-zinc-600 dark:hover:text-zinc-300 text-xs"
                aria-label="Reset to same folder as source"
              >
                ✕
              </button>
            )}
          </div>
          <button
            onClick={handleAddFiles}
            className="ml-auto text-sm px-3 py-1 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded border border-zinc-300 dark:border-zinc-700"
          >
            {S.addFiles}
          </button>
          {files.length > 0 && !converting && (
            <button
              onClick={() => setFiles([])}
              className="text-sm px-3 py-1 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded border border-zinc-300 dark:border-zinc-700"
            >
              {S.clearAll}
            </button>
          )}
        </div>

        <div className="flex items-center gap-3">
          {converting && (
            <div className="flex-1">
              <div className="h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${overallPct}%` }} />
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                {S.converting(doneCount, files.length, overallPct)}
              </p>
            </div>
          )}
          {converting ? (
            <button
              onClick={() => cancelAll()}
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

function Selector({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-zinc-500 dark:text-zinc-400">{label}</label>
      <select
        className="bg-white dark:bg-zinc-800 text-sm rounded px-2 py-1 border border-zinc-300 dark:border-zinc-700"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map(([id, text]) => (
          <option key={id} value={id}>{text}</option>
        ))}
      </select>
    </div>
  );
}
