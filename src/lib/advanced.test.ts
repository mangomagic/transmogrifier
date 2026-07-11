import { describe, it, expect } from "vitest";
import { buildAdvancedSettings, DEFAULT_ADVANCED_UI } from "./advanced";

const MAC_HW = ["h264_videotoolbox", "hevc_videotoolbox"];

describe("buildAdvancedSettings", () => {
  it("defaults resolve to hardware h264 when available", () => {
    const s = buildAdvancedSettings(DEFAULT_ADVANCED_UI, MAC_HW);
    expect(s.encoder).toBe("H264VideoToolbox");
    expect(s.max_height).toBeNull();
    expect(s.strip_metadata).toBe(false);
  });

  it("defaults resolve to libx264 without hardware", () => {
    const s = buildAdvancedSettings(DEFAULT_ADVANCED_UI, []);
    expect(s.encoder).toBe("Libx264");
  });

  it("passes through overrides", () => {
    const s = buildAdvancedSettings(
      {
        ...DEFAULT_ADVANCED_UI,
        codec: "h265",
        useHardware: false,
        maxHeight: 1080,
        fps: 30,
        crf: 26,
        audioBitrateKbps: 320,
        stripMetadata: true,
      },
      MAC_HW
    );
    expect(s.encoder).toBe("Libx265");
    expect(s.max_height).toBe(1080);
    expect(s.fps).toBe(30);
    expect(s.crf).toBe(26);
    expect(s.audio_bitrate_kbps).toBe(320);
    expect(s.strip_metadata).toBe(true);
  });
});
