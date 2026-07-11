import { useEffect, useState } from "react";
import { buildAdvancedSettings } from "../lib/advanced";
import type { AdvancedUi } from "../lib/advanced";
import { previewArgs } from "../lib/ipc";
import type { OutputFormat, VideoPreset } from "../lib/presets";
import { S } from "../lib/strings";

const inputCls =
  "w-16 px-1.5 py-0.5 text-sm rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800";
const selectCls =
  "bg-white dark:bg-zinc-800 text-sm rounded px-2 py-1 border border-zinc-300 dark:border-zinc-700";

function NumSelect({
  label,
  value,
  choices,
  onChange,
}: {
  label: string;
  value: number | null;
  choices: number[];
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-zinc-500 dark:text-zinc-400">{label}</label>
      <select
        className={selectCls}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      >
        <option value="">{S.keep}</option>
        {choices.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );
}

export function AdvancedPanel({
  ui,
  onChange,
  hwAvailable,
  format,
  preset,
}: {
  ui: AdvancedUi;
  onChange: (ui: AdvancedUi) => void;
  hwAvailable: string[];
  format: OutputFormat;
  preset: VideoPreset;
}) {
  const [flags, setFlags] = useState("");

  useEffect(() => {
    previewArgs({
      input_path: "input.mov",
      output_path: "output.mp4",
      format,
      video_preset: preset,
      trim_start: null,
      trim_end: null,
      advanced: buildAdvancedSettings(ui, hwAvailable),
      stream_copy: false,
      allow_overwrite: false,
    })
      .then((args) => setFlags(args.join(" ")))
      .catch(() => setFlags(""));
  }, [ui, hwAvailable, format, preset]);

  const set = (patch: Partial<AdvancedUi>) => onChange({ ...ui, ...patch });

  return (
    <div className="p-3 rounded-lg bg-zinc-200/60 dark:bg-zinc-900 space-y-3">
      <div className="flex gap-4 flex-wrap items-center">
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500 dark:text-zinc-400">{S.videoCodec}</label>
          <select
            className={selectCls}
            value={ui.codec}
            onChange={(e) => set({ codec: e.target.value as AdvancedUi["codec"] })}
          >
            <option value="h264">H.264</option>
            <option value="h265">H.265 (HEVC)</option>
          </select>
        </div>
        <NumSelect label={S.resolution} value={ui.maxHeight}
          choices={[2160, 1080, 720, 480]} onChange={(v) => set({ maxHeight: v })} />
        <NumSelect label={S.framerate} value={ui.fps}
          choices={[60, 30, 24]} onChange={(v) => set({ fps: v })} />
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-500 dark:text-zinc-400">{S.crfOverride}</label>
          <input
            type="number"
            min={0}
            max={51}
            className={inputCls}
            value={ui.crf ?? ""}
            placeholder={S.keep}
            onChange={(e) =>
              set({ crf: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </div>
        <NumSelect label={S.audioBitrate} value={ui.audioBitrateKbps}
          choices={[320, 192, 128, 96]} onChange={(v) => set({ audioBitrateKbps: v })} />
        <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={ui.useHardware}
            onChange={(e) => set({ useHardware: e.target.checked })}
          />
          {S.hwAccel}
        </label>
        <label className="flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={ui.stripMetadata}
            onChange={(e) => set({ stripMetadata: e.target.checked })}
          />
          {S.stripMetadata}
        </label>
      </div>
      {flags && (
        <div className="text-[11px] font-mono text-zinc-500 dark:text-zinc-400 select-text">
          <span className="text-zinc-400 dark:text-zinc-600">{S.ffmpegFlags}: </span>
          ffmpeg {flags}
        </div>
      )}
    </div>
  );
}
