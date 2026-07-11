// Encoder resolution: user picks a codec + hardware toggle; we resolve to a
// concrete encoder based on what `ffmpeg -encoders` reported at startup.
// Falls back to software silently when hardware is unavailable.

export type VideoCodec = "h264" | "h265";

// Serde variant names of VideoEncoder in src-tauri/src/ffmpeg_args.rs
export type VideoEncoderId =
  | "Libx264"
  | "Libx265"
  | "H264VideoToolbox"
  | "HevcVideoToolbox";

const HW_BY_CODEC: Record<VideoCodec, { probe: string; encoder: VideoEncoderId }> = {
  h264: { probe: "h264_videotoolbox", encoder: "H264VideoToolbox" },
  h265: { probe: "hevc_videotoolbox", encoder: "HevcVideoToolbox" },
};

const SW_BY_CODEC: Record<VideoCodec, VideoEncoderId> = {
  h264: "Libx264",
  h265: "Libx265",
};

export function resolveEncoder(
  codec: VideoCodec,
  useHardware: boolean,
  availableHw: string[]
): VideoEncoderId {
  if (useHardware && availableHw.includes(HW_BY_CODEC[codec].probe)) {
    return HW_BY_CODEC[codec].encoder;
  }
  return SW_BY_CODEC[codec];
}
