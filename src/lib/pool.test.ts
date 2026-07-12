import { describe, it, expect } from "vitest";
import { runWithConcurrency } from "./pool";

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

describe("runWithConcurrency", () => {
  it("processes every item exactly once", async () => {
    const seen: number[] = [];
    await runWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => {
      await tick();
      seen.push(n);
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    await runWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight--;
    });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it("continues past rejections-free failures handled by fn", async () => {
    const done: number[] = [];
    await runWithConcurrency([1, 2, 3], 1, async (n) => {
      try {
        if (n === 2) throw new Error("boom");
        done.push(n);
      } catch {
        // fn swallows its own errors, pool keeps going
      }
    });
    expect(done).toEqual([1, 3]);
  });

  it("handles empty input", async () => {
    await expect(runWithConcurrency([], 4, async () => {})).resolves.toBeUndefined();
  });
});
