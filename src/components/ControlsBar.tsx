import { AdvancedPanel } from "./AdvancedPanel";
import type { AdvancedUi } from "../lib/advanced";
import { OUTPUT_FORMATS, VIDEO_PRESETS } from "../lib/presets";
import type { OutputFormat, VideoPreset } from "../lib/presets";
import { S } from "../lib/strings";

const VIDEO_CONTAINERS: OutputFormat[] = ["Mp4", "Mkv", "Mov"];

export interface ControlsBarProps {
  format: OutputFormat;
  setFormat: (f: OutputFormat) => void;
  preset: VideoPreset;
  setPreset: (p: VideoPreset) => void;
  concurrency: number;
  setConcurrency: (n: number) => void;
  outputDir: string | null;
  onChooseFolder: () => void;
  onResetFolder: () => void;
  advancedOpen: boolean;
  setAdvancedOpen: (open: boolean) => void;
  advancedUi: AdvancedUi;
  setAdvancedUi: (ui: AdvancedUi) => void;
  hwEncoders: string[];
  showAudioExtractNote: boolean;
  converting: boolean;
  /// True while added files are still being probed — Convert stays disabled
  loading: boolean;
  pendingCount: number;
  /// 1-based position of the file(s) currently converting
  position: number;
  totalCount: number;
  overallPct: number;
  onAddFiles: () => void;
  onClearAll: () => void;
  onConvert: () => void;
  onCancel: () => void;
}

export function ControlsBar(p: ControlsBarProps) {
  const isVideoContainer = VIDEO_CONTAINERS.includes(p.format);

  return (
    <div className="border-t border-zinc-300 dark:border-zinc-800 p-4 space-y-3">
      <div className="flex gap-3 flex-wrap items-center">
        <Selector label={S.outputFormat} value={p.format} disabled={p.converting}
          options={OUTPUT_FORMATS.map((f) => [f.id, f.label])}
          onChange={(v) => p.setFormat(v as OutputFormat)} />
        <Selector label={S.quality} value={p.preset} disabled={p.converting}
          options={VIDEO_PRESETS.map((pr) => [pr.id, pr.label])}
          onChange={(v) => p.setPreset(v as VideoPreset)} />
        <Selector label={S.parallel} value={String(p.concurrency)} disabled={p.converting}
          options={[["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"]]}
          onChange={(v) => p.setConcurrency(Number(v))} />
        {isVideoContainer && (
          <button
            onClick={() => p.setAdvancedOpen(!p.advancedOpen)}
            className={`text-sm px-2 py-1 rounded border ${
              p.advancedOpen
                ? "border-blue-400 text-blue-600 dark:text-blue-400"
                : "border-zinc-300 dark:border-zinc-700 text-zinc-500"
            }`}
          >
            ⚙ {S.advanced}
          </button>
        )}
        {p.showAudioExtractNote && (
          <span className="text-xs text-amber-600 dark:text-amber-400">{S.audioExtractNote}</span>
        )}
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500 dark:text-zinc-400">{S.saveTo}</label>
          <button
            onClick={p.onChooseFolder}
            disabled={p.converting}
            className="text-sm px-2 py-1 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded border border-zinc-300 dark:border-zinc-700 disabled:opacity-50 max-w-48 truncate"
            title={p.outputDir ?? S.sameFolderAsSource}
          >
            {p.outputDir ? p.outputDir.split("/").pop() : S.sameFolderAsSource}
          </button>
          {p.outputDir && (
            <button
              onClick={p.onResetFolder}
              disabled={p.converting}
              className="text-zinc-400 hover:text-zinc-700 dark:text-zinc-600 dark:hover:text-zinc-300 text-xs"
              aria-label="Reset to same folder as source"
            >
              ✕
            </button>
          )}
        </div>
        <button
          onClick={p.onAddFiles}
          className="ml-auto text-sm px-3 py-1 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded border border-zinc-300 dark:border-zinc-700"
        >
          {S.addFiles}
        </button>
        {p.totalCount > 0 && !p.converting && (
          <button
            onClick={p.onClearAll}
            className="text-sm px-3 py-1 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 rounded border border-zinc-300 dark:border-zinc-700"
          >
            {S.clearAll}
          </button>
        )}
      </div>

      {p.advancedOpen && isVideoContainer && (
        <AdvancedPanel
          ui={p.advancedUi}
          onChange={p.setAdvancedUi}
          hwAvailable={p.hwEncoders}
          format={p.format}
          preset={p.preset}
        />
      )}

      <div className="flex items-center gap-3">
        {p.converting && (
          <div className="flex-1">
            <div className="h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${p.overallPct}%` }} />
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              {S.converting(p.position, p.totalCount, p.overallPct)}
            </p>
          </div>
        )}
        {!p.converting && p.loading && (
          <span className="ml-auto text-xs text-zinc-500 dark:text-zinc-400 animate-pulse">
            {S.loadingFiles}
          </span>
        )}
        {p.converting ? (
          <button
            onClick={p.onCancel}
            className="ml-auto px-6 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg font-medium transition-colors"
          >
            {S.cancel}
          </button>
        ) : (
          <button
            onClick={p.onConvert}
            disabled={p.pendingCount === 0 || p.loading}
            className={`px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors ${
              p.loading ? "" : "ml-auto"
            }`}
          >
            {S.convert}
          </button>
        )}
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
