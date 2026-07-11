import { useEffect, useState } from "react";
import { generateFilmstrip } from "../lib/ipc";
import { formatTime, parseTimeInput } from "../lib/time";
import { S } from "../lib/strings";

const FILMSTRIP_FRAMES = 6;

export interface TrimValue {
  start: number | null;
  end: number | null;
}

export function TrimPanel({
  path,
  durationS,
  hasVideo,
  value,
  onChange,
}: {
  path: string;
  durationS: number | null;
  hasVideo: boolean;
  value: TrimValue;
  onChange: (value: TrimValue) => void;
}) {
  const [startText, setStartText] = useState(value.start != null ? formatTime(value.start) : "");
  const [endText, setEndText] = useState(value.end != null ? formatTime(value.end) : "");
  const [frames, setFrames] = useState<string[]>([]);
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (hasVideo && durationS != null && durationS > 0) {
      generateFilmstrip(path, durationS, FILMSTRIP_FRAMES)
        .then(setFrames)
        .catch(() => setFrames([]));
    }
  }, [path, durationS, hasVideo]);

  const commit = (startStr: string, endStr: string) => {
    const start = startStr.trim() === "" ? null : parseTimeInput(startStr);
    const end = endStr.trim() === "" ? null : parseTimeInput(endStr);

    const startBad = startStr.trim() !== "" && start == null;
    const endBad = endStr.trim() !== "" && end == null;
    const orderBad = start != null && end != null && end <= start;
    const rangeBad = durationS != null && ((start ?? 0) > durationS || (end ?? 0) > durationS);

    if (startBad || endBad || orderBad || rangeBad) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onChange({ start, end });
  };

  return (
    <div className="mt-2 p-2 rounded bg-zinc-100 dark:bg-zinc-950 text-xs space-y-2">
      {frames.length > 0 && (
        <div className="flex gap-0.5">
          {frames.map((src, i) => {
            const t = durationS != null ? (durationS * (i + 0.5)) / FILMSTRIP_FRAMES : 0;
            return (
              <div key={i} className="flex flex-col items-center flex-1 min-w-0">
                <img src={src} alt="" className="w-full rounded-sm object-cover" />
                <span className="text-[10px] text-zinc-500">{formatTime(t)}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-zinc-500">{S.trimStart}</label>
        <input
          type="text"
          value={startText}
          placeholder="0:00"
          onChange={(e) => {
            setStartText(e.target.value);
            commit(e.target.value, endText);
          }}
          className="w-16 px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800"
        />
        <label className="text-zinc-500">{S.trimEnd}</label>
        <input
          type="text"
          value={endText}
          placeholder={durationS != null ? formatTime(durationS) : "0:00"}
          onChange={(e) => {
            setEndText(e.target.value);
            commit(startText, e.target.value);
          }}
          className="w-16 px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800"
        />
        {(value.start != null || value.end != null) && (
          <button
            onClick={() => {
              setStartText("");
              setEndText("");
              setInvalid(false);
              onChange({ start: null, end: null });
            }}
            className="text-zinc-500 hover:underline"
          >
            {S.trimClear}
          </button>
        )}
        {invalid && <span className="text-red-500">{S.trimInvalid}</span>}
      </div>
    </div>
  );
}
