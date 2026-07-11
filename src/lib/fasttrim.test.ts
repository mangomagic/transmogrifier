import { describe, it, expect } from "vitest";
import { canFastTrim } from "./fasttrim";
import { DEFAULT_ADVANCED_UI } from "./advanced";
import type { MediaInfo } from "./ipc";

const h264aac: MediaInfo = {
  duration_s: 10,
  duration_us: 10_000_000,
  size_bytes: 1000,
  width: 1920,
  height: 1080,
  video_codec: "h264",
  audio_codec: "aac",
  bit_rate: null,
  rotation: null,
};

describe("canFastTrim", () => {
  it("allows h264/aac into mp4 with default settings", () => {
    expect(canFastTrim(h264aac, "Mp4", "High", DEFAULT_ADVANCED_UI)).toBe(true);
  });

  it("rejects when a non-default preset expresses quality intent", () => {
    expect(canFastTrim(h264aac, "Mp4", "SmallFile", DEFAULT_ADVANCED_UI)).toBe(false);
    expect(canFastTrim(h264aac, "Mp4", "Highest", DEFAULT_ADVANCED_UI)).toBe(false);
  });

  it("rejects when advanced settings were touched", () => {
    expect(
      canFastTrim(h264aac, "Mp4", "High", { ...DEFAULT_ADVANCED_UI, maxHeight: 720 })
    ).toBe(false);
    expect(
      canFastTrim(h264aac, "Mp4", "High", { ...DEFAULT_ADVANCED_UI, codec: "h265" })
    ).toBe(false);
  });

  it("rejects incompatible codec for the container", () => {
    const vp9 = { ...h264aac, video_codec: "vp9" };
    expect(canFastTrim(vp9, "Mp4", "High", DEFAULT_ADVANCED_UI)).toBe(false);
  });

  it("mkv accepts vp9/opus", () => {
    const webmish = { ...h264aac, video_codec: "vp9", audio_codec: "opus" };
    expect(canFastTrim(webmish, "Mkv", "High", DEFAULT_ADVANCED_UI)).toBe(true);
  });

  it("rejects unprobed files and non-container formats", () => {
    expect(canFastTrim(null, "Mp4", "High", DEFAULT_ADVANCED_UI)).toBe(false);
    expect(canFastTrim(h264aac, "Gif", "High", DEFAULT_ADVANCED_UI)).toBe(false);
    expect(canFastTrim(h264aac, "Mp3", "High", DEFAULT_ADVANCED_UI)).toBe(false);
  });

  it("audio-only file cannot fast trim into a video container", () => {
    const audio = { ...h264aac, video_codec: null };
    expect(canFastTrim(audio, "Mp4", "High", DEFAULT_ADVANCED_UI)).toBe(false);
  });
});
