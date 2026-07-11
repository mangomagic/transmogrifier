export interface BatchFile {
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  percent: number;
}

export interface BatchProgress {
  /// 1-based position of the file(s) currently in flight: everything that
  /// has left "pending". "Converting 1 of 1" while the only file runs.
  position: number;
  total: number;
  percent: number;
  active: boolean;
}

export function conversionProgress(files: BatchFile[]): BatchProgress {
  const total = files.length;
  const active = files.some((f) => f.status === "running");
  const position = files.filter((f) => f.status !== "pending").length;
  const percent =
    total > 0
      ? Math.round(
          files.reduce((sum, f) => sum + (f.status === "done" ? 100 : f.percent), 0) / total
        )
      : 0;
  return { position, total, percent, active };
}
