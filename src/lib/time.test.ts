import { describe, it, expect } from "vitest";
import { parseTimeInput, formatTime } from "./time";

describe("parseTimeInput", () => {
  it("parses plain seconds", () => {
    expect(parseTimeInput("90")).toBe(90);
    expect(parseTimeInput("2.5")).toBe(2.5);
  });

  it("parses m:ss", () => {
    expect(parseTimeInput("1:30")).toBe(90);
    expect(parseTimeInput("0:05")).toBe(5);
  });

  it("parses m:ss.d", () => {
    expect(parseTimeInput("1:30.5")).toBe(90.5);
  });

  it("parses h:mm:ss", () => {
    expect(parseTimeInput("1:02:03")).toBe(3723);
  });

  it("rejects garbage", () => {
    expect(parseTimeInput("abc")).toBeNull();
    expect(parseTimeInput("1:2:3:4")).toBeNull();
    expect(parseTimeInput("1:xx")).toBeNull();
    expect(parseTimeInput("")).toBeNull();
  });
});

describe("formatTime", () => {
  it("formats whole seconds", () => {
    expect(formatTime(90)).toBe("1:30");
    expect(formatTime(5)).toBe("0:05");
  });

  it("formats fractional seconds", () => {
    expect(formatTime(90.5)).toBe("1:30.5");
  });

  it("formats hours", () => {
    expect(formatTime(3723)).toBe("1:02:03");
  });

  it("round-trips with parseTimeInput", () => {
    for (const v of [0, 5, 90, 90.5, 3723]) {
      expect(parseTimeInput(formatTime(v))).toBeCloseTo(v, 1);
    }
  });
});
