import { describe, it, expect } from "vitest";
import { conversionProgress } from "./batch";
import type { BatchFile } from "./batch";

const f = (status: BatchFile["status"], percent = 0): BatchFile => ({ status, percent });

describe("conversionProgress", () => {
  it("single running file reads 1 of 1, not 0 of 1", () => {
    const p = conversionProgress([f("running", 40)]);
    expect(p.position).toBe(1);
    expect(p.total).toBe(1);
    expect(p.active).toBe(true);
  });

  it("counts running files into the position under concurrency", () => {
    const p = conversionProgress([f("running", 10), f("running", 5), f("pending")]);
    expect(p.position).toBe(2);
    expect(p.total).toBe(3);
  });

  it("finished and failed files advance the position", () => {
    const p = conversionProgress([f("done", 100), f("failed", 30), f("running", 50), f("pending")]);
    expect(p.position).toBe(3);
    expect(p.total).toBe(4);
  });

  it("percent averages done as 100 and others by their percent", () => {
    const p = conversionProgress([f("done", 100), f("running", 50)]);
    expect(p.percent).toBe(75);
  });

  it("inactive when nothing is running", () => {
    const p = conversionProgress([f("done", 100), f("pending")]);
    expect(p.active).toBe(false);
  });

  it("empty list is all zeros", () => {
    const p = conversionProgress([]);
    expect(p).toEqual({ position: 0, total: 0, percent: 0, active: false });
  });
});
