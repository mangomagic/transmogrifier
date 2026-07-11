import type { AdvancedSettings } from "./ipc";
import { resolveEncoder } from "./encoders";
import type { VideoCodec } from "./encoders";

/// UI state of the advanced panel; null/`keep` means "don't override".
export interface AdvancedUi {
  codec: VideoCodec;
  useHardware: boolean;
  maxHeight: number | null;
  fps: number | null;
  crf: number | null;
  audioBitrateKbps: number | null;
  stripMetadata: boolean;
}

export const DEFAULT_ADVANCED_UI: AdvancedUi = {
  codec: "h264",
  useHardware: true, // plan: default on, silent software fallback
  maxHeight: null,
  fps: null,
  crf: null,
  audioBitrateKbps: null,
  stripMetadata: false,
};

export function buildAdvancedSettings(
  ui: AdvancedUi,
  availableHw: string[]
): AdvancedSettings {
  return {
    encoder: resolveEncoder(ui.codec, ui.useHardware, availableHw),
    max_height: ui.maxHeight,
    fps: ui.fps,
    crf: ui.crf,
    audio_bitrate_kbps: ui.audioBitrateKbps,
    strip_metadata: ui.stripMetadata,
  };
}
