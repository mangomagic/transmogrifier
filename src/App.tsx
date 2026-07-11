import { useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { listen } from "@tauri-apps/api/event";
import {
  cancelAll,
  confirmExit,
  enqueueJobs,
  expandPaths,
  generateThumbnail,
  onJobCancelled,
  onJobDone,
  onJobError,
  onExitRequested,
  onJobStarted,
  onProgress,
  probeFile,
  getQueueState,
  probeHwEncoders,
  resolveOutputPaths,
  setConcurrency as ipcSetConcurrency,
} from "./lib/ipc";
import type { ResolvedOutput } from "./lib/ipc";
import { reconcile } from "./lib/reconcile";
import { buildAdvancedSettings, DEFAULT_ADVANCED_UI } from "./lib/advanced";
import type { AdvancedUi } from "./lib/advanced";
import { conversionProgress } from "./lib/batch";
import { canFastTrim } from "./lib/fasttrim";
import { DEFAULT_FORMAT, DEFAULT_PRESET, OUTPUT_FORMATS } from "./lib/presets";
import type { OutputFormat, VideoPreset } from "./lib/presets";
import { loadSettings, saveSettings } from "./lib/settings";
import { S } from "./lib/strings";
import { FileRow } from "./components/FileRow";
import type { FileEntry } from "./components/FileRow";
import { ConflictDialog } from "./components/ConflictDialog";
import { ControlsBar } from "./components/ControlsBar";
import { ExitDialog } from "./components/ExitDialog";
import { UpdateBanner } from "./components/UpdateBanner";
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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [advancedUi, setAdvancedUi] = useState<AdvancedUi>(DEFAULT_ADVANCED_UI);
  const [hwEncoders, setHwEncoders] = useState<string[]>([]);
  const [conflict, setConflict] = useState<{
    pending: FileEntry[];
    resolved: ResolvedOutput[];
    extension: string;
  } | null>(null);
  const [exitPromptOpen, setExitPromptOpen] = useState(false);
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
      // Backend blocked a close/quit because conversions are active
      onExitRequested(() => setExitPromptOpen(true)),
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

    // Probe hardware encoders once; fall back to software silently if empty
    probeHwEncoders().then(setHwEncoders).catch(() => setHwEncoders([]));

    return () => {
      unlistenPromises.forEach((p) => p.then((u) => u()));
    };
  }, []);

  useEffect(() => {
    if (!settingsLoaded.current) return;
    saveSettings({ format, preset, outputDir, concurrency });
  }, [format, preset, outputDir, concurrency]);

  // Reconcile UI rows against the backend queue while work may be in
  // flight. Events are the fast path; this heals any missed ones (e.g.
  // a macOS menu/About panel blocking webview event delivery mid-batch).
  const hasOpenWork = files.some((f) => f.status === "pending" || f.status === "running");
  useEffect(() => {
    if (!hasOpenWork) return;
    const timer = setInterval(async () => {
      try {
        const snapshots = await getQueueState();
        setFiles((prev) => reconcile(prev, snapshots).files);
      } catch {
        // backend unavailable — try again next tick
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [hasOpenWork]);

  const addPaths = async (rawPaths: string[]) => {
    // Folders expand recursively to their media files (backend walk)
    let paths = rawPaths;
    try {
      paths = await expandPaths(rawPaths);
    } catch {
      // fall back to the raw list; non-files will fail at probe time
    }
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
        trimStart: null,
        trimEnd: null,
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

  // Progress percent is measured against the output length, so trims
  // shorten the reference duration.
  const effectiveDurationUs = (f: FileEntry): number | null => {
    const durS = f.info?.duration_s;
    if (durS == null) return null;
    const start = f.trimStart ?? 0;
    const end = f.trimEnd ?? durS;
    const us = Math.round(Math.max(0, end - start) * 1e6);
    return us > 0 ? us : null;
  };

  const namingRequests = (pending: FileEntry[], extension: string) =>
    pending.map((f) => ({
      input_path: f.path,
      output_dir: outputDir,
      extension,
    }));

  const enqueueBatch = async (pending: FileEntry[], outputs: ResolvedOutput[]) => {
    // Advanced settings only shape video-container outputs
    const advanced = ["Mp4", "Mkv", "Mov"].includes(format)
      ? buildAdvancedSettings(advancedUi, hwEncoders)
      : null;
    await enqueueJobs(
      pending.map((file, i) => {
        const hasTrim = file.trimStart != null || file.trimEnd != null;
        const streamCopy = hasTrim && canFastTrim(file.info, format, preset, advancedUi);
        return {
          job_id: file.id,
          settings: {
            input_path: file.path,
            output_path: outputs[i].path,
            format,
            video_preset: preset,
            trim_start: file.trimStart,
            trim_end: file.trimEnd,
            advanced: streamCopy ? null : advanced,
            stream_copy: streamCopy,
            // -y only for files the user explicitly chose to overwrite
            allow_overwrite: outputs[i].exists,
          },
          duration_us: effectiveDurationUs(file),
        };
      })
    );
  };

  const handleConvert = async () => {
    const fmt = OUTPUT_FORMATS.find((f) => f.id === format)!;
    const pending = files.filter((f) => f.status === "pending");
    if (pending.length === 0) return;
    const resolved = await resolveOutputPaths(namingRequests(pending, fmt.extension), false);
    if (resolved.some((r) => r.exists)) {
      setConflict({ pending, resolved, extension: fmt.extension });
      return;
    }
    await enqueueBatch(pending, resolved);
  };

  const handleConflictOverwrite = async () => {
    if (!conflict) return;
    setConflict(null);
    await enqueueBatch(conflict.pending, conflict.resolved);
  };

  const handleConflictKeepBoth = async () => {
    if (!conflict) return;
    setConflict(null);
    // Re-resolve, this time steering around every existing file
    const resolved = await resolveOutputPaths(
      namingRequests(conflict.pending, conflict.extension),
      true
    );
    await enqueueBatch(conflict.pending, resolved);
  };

  const handleTrimChange = (id: string, trim: { start: number | null; end: number | null }) => {
    updateFile(id, { trimStart: trim.start, trimEnd: trim.end });
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
  const progress = conversionProgress(files);
  const converting = progress.active;

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
      <UpdateBanner />
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
            <button
              onClick={() => openUrl("https://ffmpeg.org").catch(() => {})}
              className="text-xs text-zinc-400 dark:text-zinc-600 hover:underline mt-4"
            >
              {S.poweredByFfmpeg}
            </button>
          </div>
        ) : (
          <ul className="space-y-2">
            {files.map((f) => (
              <FileRow
                key={f.id}
                file={f}
                fastTrim={canFastTrim(f.info, format, preset, advancedUi)}
                onRemove={(id) => setFiles((prev) => prev.filter((x) => x.id !== id))}
                onTrimChange={handleTrimChange}
              />
            ))}
          </ul>
        )}
      </div>

      <ControlsBar
        format={format}
        setFormat={setFormat}
        preset={preset}
        setPreset={setPreset}
        concurrency={concurrency}
        setConcurrency={handleConcurrency}
        outputDir={outputDir}
        onChooseFolder={handleChooseFolder}
        onResetFolder={() => setOutputDir(null)}
        advancedOpen={advancedOpen}
        setAdvancedOpen={setAdvancedOpen}
        advancedUi={advancedUi}
        setAdvancedUi={setAdvancedUi}
        hwEncoders={hwEncoders}
        showAudioExtractNote={
          (OUTPUT_FORMATS.find((f) => f.id === format)?.audioOnly ?? false) &&
          files.some((f) => f.status === "pending" && f.info?.video_codec)
        }
        converting={converting}
        pendingCount={pendingCount}
        position={progress.position}
        totalCount={progress.total}
        overallPct={progress.percent}
        onAddFiles={handleAddFiles}
        onClearAll={() => setFiles([])}
        onConvert={handleConvert}
        onCancel={() => cancelAll()}
      />
      {conflict && (
        <ConflictDialog
          conflictPaths={conflict.resolved.filter((r) => r.exists).map((r) => r.path)}
          onOverwrite={handleConflictOverwrite}
          onKeepBoth={handleConflictKeepBoth}
          onCancel={() => setConflict(null)}
        />
      )}
      {exitPromptOpen && (
        <ExitDialog
          activeCount={files.filter((f) => f.status === "pending" || f.status === "running").length}
          onQuit={() => confirmExit()}
          onStay={() => setExitPromptOpen(false)}
        />
      )}
    </div>
  );
}
