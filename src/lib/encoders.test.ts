import { describe, it, expect } from "vitest";
import { resolveEncoder } from "./encoders";

const MAC_HW = ["h264_videotoolbox", "hevc_videotoolbox"];

describe("resolveEncoder", () => {
  it("uses hardware when available and enabled", () => {
    expect(resolveEncoder("h264", true, MAC_HW)).toBe("H264VideoToolbox");
    expect(resolveEncoder("h265", true, MAC_HW)).toBe("HevcVideoToolbox");
  });

  it("falls back to software silently when hardware unavailable", () => {
    expect(resolveEncoder("h264", true, [])).toBe("Libx264");
    expect(resolveEncoder("h265", true, ["h264_nvenc"])).toBe("Libx265");
  });

  it("uses software when hardware disabled", () => {
    expect(resolveEncoder("h264", false, MAC_HW)).toBe("Libx264");
    expect(resolveEncoder("h265", false, MAC_HW)).toBe("Libx265");
  });
});
