/// Parse user time input: "90", "1:30", "1:30.5", "1:02:03" → seconds.
/// Returns null for unparseable input.
export function parseTimeInput(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;
  const parts = trimmed.split(":");
  if (parts.length > 3) return null;
  let seconds = 0;
  for (const part of parts) {
    if (!/^\d+(\.\d+)?$/.test(part)) return null;
    seconds = seconds * 60 + Number(part);
  }
  return seconds;
}

/// Format seconds for display: 90.5 → "1:30.5", 3723 → "1:02:03".
export function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const secStr =
    Number.isInteger(s) || Math.abs(s - Math.round(s)) < 0.05
      ? String(Math.round(s)).padStart(2, "0")
      : s.toFixed(1).padStart(4, "0");
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${secStr}`;
  return `${m}:${secStr}`;
}
