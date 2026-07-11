import type { AdvancedUi } from "./advanced";
import { DEFAULT_ADVANCED_UI } from "./advanced";
import type { MediaInfo } from "./ipc";
import type { OutputFormat, VideoPreset } from "./presets";

// Codecs each container can hold without re-encoding.
const CONTAINER_CODECS: Partial<Record<OutputFormat, { video: string[]; audio: string[] }>> = {
  Mp4: { video: ["h264", "hevc", "av1"], audio: ["aac", "mp3"] },
  Mov: { video: ["h264", "hevc", "prores"], audio: ["aac", "pcm_s16le"] },
  // MKV holds nearly anything
  Mkv: {
    video: ["h264", "hevc", "av1", "vp9", "vp8", "mpeg4", "mpeg2video"],
    audio: ["aac", "mp3", "opus", "vorbis", "flac", "ac3"],
  },
};

function advancedUntouched(ui: AdvancedUi): boolean {
  return JSON.stringify(ui) === JSON.stringify(DEFAULT_ADVANCED_UI);
}

/// Fast trim (remux, no re-encode) is used only when it can't change what
/// the user asked for: a trim is set, the source codecs fit the target
/// container, and no quality intent was expressed (default preset, advanced
/// panel untouched). Keyframe-accurate rather than frame-accurate.
export function canFastTrim(
  info: MediaInfo | null,
  format: OutputFormat,
  preset: VideoPreset,
  advancedUi: AdvancedUi
): boolean {
  if (preset !== "High") return false; // non-default preset = quality intent
  if (!advancedUntouched(advancedUi)) return false;
  const allowed = CONTAINER_CODECS[format];
  if (!allowed || !info) return false;
  if (!info.video_codec || !allowed.video.includes(info.video_codec)) return false;
  if (info.audio_codec && !allowed.audio.includes(info.audio_codec)) return false;
  return true;
}
