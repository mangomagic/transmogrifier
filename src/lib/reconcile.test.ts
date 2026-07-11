import { describe, it, expect } from "vitest";
import { reconcile } from "./reconcile";
import type { ReconcilableFile } from "./reconcile";
import type { JobSnapshot } from "./ipc";

const file = (
  id: string,
  status: ReconcilableFile["status"],
  percent = 0
): ReconcilableFile => ({ id, status, percent, error: null });

const snap = (
  id: string,
  status: JobSnapshot["status"],
  progress = 0,
  error: string | null = null
): JobSnapshot => ({ id, status, progress_percent: progress, error });

describe("reconcile", () => {
  it("heals a missed job_done event", () => {
    const { files, changed } = reconcile([file("a", "running", 80)], [snap("a", "done", 100)]);
    expect(changed).toBe(true);
    expect(files[0].status).toBe("done");
    expect(files[0].percent).toBe(100);
  });

  it("heals rows stuck pending when the backend already ran them", () => {
    const { files } = reconcile(
      [file("a", "pending"), file("b", "pending")],
      [snap("a", "done", 100), snap("b", "running", 40)]
    );
    expect(files[0].status).toBe("done");
    expect(files[1].status).toBe("running");
    expect(files[1].percent).toBe(40);
  });

  it("carries the backend error message for missed failures", () => {
    const { files } = reconcile(
      [file("a", "running", 10)],
      [snap("a", "failed", 10, "boom")]
    );
    expect(files[0].status).toBe("failed");
    expect(files[0].error).toBe("boom");
  });

  it("never regresses progress from a stale snapshot", () => {
    const { files, changed } = reconcile(
      [file("a", "running", 60)],
      [snap("a", "running", 40)]
    );
    expect(changed).toBe(false);
    expect(files[0].percent).toBe(60);
  });

  it("ignores files the queue does not know", () => {
    const input = [file("new", "pending")];
    const { files, changed } = reconcile(input, [snap("other", "done", 100)]);
    expect(changed).toBe(false);
    expect(files).toBe(input);
  });

  it("returns the same array when nothing changed", () => {
    const input = [file("a", "done", 100)];
    const { files, changed } = reconcile(input, [snap("a", "done", 100)]);
    expect(changed).toBe(false);
    expect(files).toBe(input);
  });

  it("maps queued back to pending", () => {
    const { changed } = reconcile([file("a", "pending")], [snap("a", "queued")]);
    expect(changed).toBe(false);
  });
});
