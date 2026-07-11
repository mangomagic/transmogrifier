export type VideoPreset = "Highest" | "High" | "Medium" | "SmallFile";
export type OutputFormat = "Mp4" | "WebM" | "Mkv" | "Mov" | "Gif" | "Mp3" | "Aac" | "Wav" | "Flac";

export interface PresetDef {
  id: VideoPreset;
  label: string;
  description: string;
}

export const VIDEO_PRESETS: PresetDef[] = [
  { id: "Highest", label: "Highest quality", description: "CRF 18, slow — near-lossless, largest file" },
  { id: "High",    label: "High quality",    description: "CRF 20 — visually transparent, recommended" },
  { id: "Medium",  label: "Medium quality",  description: "CRF 23 — good quality, smaller file" },
  { id: "SmallFile", label: "Small file",    description: "CRF 28 — sharing/messaging" },
];

export const DEFAULT_PRESET: VideoPreset = "High";

export interface FormatDef {
  id: OutputFormat;
  label: string;
  extension: string;
  audioOnly: boolean;
}

export const OUTPUT_FORMATS: FormatDef[] = [
  { id: "Mp4",  label: "MP4",       extension: "mp4",  audioOnly: false },
  { id: "WebM", label: "WebM",      extension: "webm", audioOnly: false },
  { id: "Mkv",  label: "MKV",       extension: "mkv",  audioOnly: false },
  { id: "Mov",  label: "MOV",       extension: "mov",  audioOnly: false },
  { id: "Gif",  label: "GIF",       extension: "gif",  audioOnly: false },
  { id: "Mp3",  label: "MP3 (audio extract)", extension: "mp3", audioOnly: true },
  { id: "Aac",  label: "AAC / M4A", extension: "m4a",  audioOnly: true },
  { id: "Wav",  label: "WAV",       extension: "wav",  audioOnly: true },
  { id: "Flac", label: "FLAC",      extension: "flac", audioOnly: true },
];

export const DEFAULT_FORMAT: OutputFormat = "Mp4";
