import { describe, it, expect } from "vitest";
import { deriveOutputPath } from "./paths";

describe("deriveOutputPath", () => {
  it("same folder as source when outputDir is null", () => {
    expect(deriveOutputPath("/movies/clip.mov", null, "mp4")).toBe(
      "/movies/clip (converted).mp4"
    );
  });

  it("uses chosen output directory", () => {
    expect(deriveOutputPath("/movies/clip.mov", "/out", "mp4")).toBe(
      "/out/clip (converted).mp4"
    );
  });

  it("strips trailing separator from output directory", () => {
    expect(deriveOutputPath("/movies/clip.mov", "/out/", "mp4")).toBe(
      "/out/clip (converted).mp4"
    );
  });

  it("never produces a path equal to the input", () => {
    const out = deriveOutputPath("/movies/clip.mp4", null, "mp4");
    expect(out).not.toBe("/movies/clip.mp4");
    expect(out).toBe("/movies/clip (converted).mp4");
  });

  it("handles filenames with multiple dots", () => {
    expect(deriveOutputPath("/m/my.holiday.video.mov", null, "mp4")).toBe(
      "/m/my.holiday.video (converted).mp4"
    );
  });

  it("handles windows-style paths", () => {
    expect(deriveOutputPath("C:\\videos\\clip.mov", null, "mp4")).toBe(
      "C:\\videos\\clip (converted).mp4"
    );
  });
});
