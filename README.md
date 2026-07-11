# Transmogrifier

Cross-platform desktop video & audio converter. Drop files in, pick a format
and quality, hit Convert. Built with [Tauri v2](https://tauri.app) (Rust +
React/TypeScript) around [FFmpeg](https://ffmpeg.org).

## Features

- **Formats** — video in: MOV, MP4, MKV, AVI, WMV, WebM, MPG, TS, FLV, 3GP…;
  out: MP4 (H.264/H.265), WebM, MKV, MOV, GIF. Audio in/out: MP3, AAC/M4A,
  WAV, FLAC. Picking an audio format for a video extracts its audio track.
- **Batch queue** with configurable concurrency (1–4 parallel conversions),
  per-file and overall progress, cancel, and failure log tails.
- **Quality presets** (Highest/High/Medium/Small file) plus an advanced panel:
  codec, resolution cap, frame rate, CRF, audio bitrate, strip metadata —
  with a live preview of the resulting FFmpeg flags.
- **Hardware encoding** (VideoToolbox on macOS; NVENC/QSV/AMF/VAAPI planned)
  with silent software fallback.
- **Trim** with a filmstrip preview; trims that don't change quality or
  format use lossless stream copy (near-instant, keyframe-accurate).
- **Never overwrites silently** — clean output names when free, ` (converted)`
  suffixes to dodge collisions, and a prompt (Overwrite / Keep both) when a
  target already exists. Sources are never touched.
- Folder drops expand recursively (media files only). Settings persist.
  Light/dark follows the OS. Auto-update via signed GitHub releases.

## Development

Prerequisites: Node 22+, Rust (stable), FFmpeg on PATH (for test fixtures).

```bash
npm install
node scripts/prepare-sidecars.mjs   # provision ffmpeg/ffprobe sidecars
npm run tauri dev                    # run the app
npm run check                        # typecheck + lint + all JS & Rust tests
```

`npm run check` is the definition of done — see `CLAUDE.md` for architecture
and invariants, `docs/plan.md` for the full design, `docs/release.md` for
release/CI setup, and `docs/manual-testing.md` for GUI verification.

Logs are written to the platform log directory (macOS:
`~/Library/Logs/com.snowcrash.transmogrifier/`).

## FFmpeg licensing

Transmogrifier does not link FFmpeg; it bundles the `ffmpeg`/`ffprobe`
executables as separate sidecar processes and invokes them per conversion.
FFmpeg is licensed under the LGPL/GPL — see
[ffmpeg.org/legal](https://www.ffmpeg.org/legal.html). Binary distributions
of this app must ship alongside a link to the corresponding FFmpeg source
(see `docs/release.md`). This project is not affiliated with or endorsed by
the FFmpeg project.