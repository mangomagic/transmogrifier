import { describe, it, expect } from "vitest";
import { OUTPUT_FORMATS, VIDEO_PRESETS, DEFAULT_FORMAT, DEFAULT_PRESET } from "./presets";

describe("presets", () => {
  it("default format is Mp4", () => {
    expect(DEFAULT_FORMAT).toBe("Mp4");
  });

  it("default preset is High", () => {
    expect(DEFAULT_PRESET).toBe("High");
  });

  it("all output formats have unique ids", () => {
    const ids = OUTPUT_FORMATS.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("all video presets have unique ids", () => {
    const ids = VIDEO_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("audio-only formats are marked correctly", () => {
    const audioFormats = OUTPUT_FORMATS.filter((f) => f.audioOnly).map((f) => f.id);
    expect(audioFormats).toContain("Mp3");
    expect(audioFormats).toContain("Wav");
    expect(audioFormats).toContain("Flac");
    expect(audioFormats).toContain("Aac");
  });

  it("video formats are not marked as audio-only", () => {
    const videoFormats = OUTPUT_FORMATS.filter((f) => !f.audioOnly).map((f) => f.id);
    expect(videoFormats).toContain("Mp4");
    expect(videoFormats).toContain("Mkv");
    expect(videoFormats).toContain("WebM");
  });

  it("Mp4 extension is mp4", () => {
    const mp4 = OUTPUT_FORMATS.find((f) => f.id === "Mp4");
    expect(mp4?.extension).toBe("mp4");
  });
});
