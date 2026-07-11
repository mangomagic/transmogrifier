import type { JobSnapshot } from "./ipc";

export interface ReconcilableFile {
  id: string;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  percent: number;
  error: string | null;
}

const STATUS_FROM_QUEUE: Record<JobSnapshot["status"], ReconcilableFile["status"]> = {
  queued: "pending",
  running: "running",
  done: "done",
  failed: "failed",
  cancelled: "cancelled",
};

/// Overlay backend queue truth onto UI rows. Events are the fast path;
/// this heals missed ones (e.g. while a macOS menu blocks webview event
/// delivery). Returns the original array when nothing changed so React
/// state updates can be skipped.
export function reconcile<T extends ReconcilableFile>(
  files: T[],
  snapshots: JobSnapshot[]
): { files: T[]; changed: boolean } {
  const byId = new Map(snapshots.map((s) => [s.id, s]));
  let changed = false;

  const next = files.map((f) => {
    const snap = byId.get(f.id);
    if (!snap) return f; // never enqueued (or from a cleared batch)

    const status = STATUS_FROM_QUEUE[snap.status];
    const percent = status === "done" ? 100 : Math.max(f.percent, snap.progress_percent);
    const error = f.error ?? snap.error;

    if (f.status === status && f.percent === percent && f.error === error) return f;
    changed = true;
    return { ...f, status, percent, error };
  });

  return { files: changed ? next : files, changed };
}
