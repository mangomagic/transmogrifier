# CLAUDE.md — Video File Converter

Cross-platform (macOS/Windows/Linux) video/audio converter. Tauri v2 + React/TypeScript frontend, Rust backend, FFmpeg as a bundled sidecar binary. Full design: `docs/plan.md`.

## Commands

```bash
npm run tauri dev      # run app in dev mode
npm run check          # typecheck + lint + all JS and Rust tests — DEFINITION OF DONE
npm test               # frontend tests (Vitest)
cargo test --manifest-path src-tauri/Cargo.toml   # Rust tests
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
./fixtures/gen_fixtures.sh   # regenerate sample media (requires ffmpeg on PATH)
```

Run `npm run check` after every change. Do not consider a task complete while it fails.

## Architecture

- `src/` — React UI. `src/lib/ipc.ts` is the ONLY place invoke()/event wiring lives. `src/lib/presets.ts` is the single source of truth for quality presets.
- `src-tauri/src/` — Rust backend:
  - `ffmpeg_args.rs` — pure fn `JobSettings -> Vec<String>`. Most-tested file in the repo.
  - `progress.rs` — pure fn: ffmpeg `-progress` output line → `ProgressEvent`.
  - `probe.rs` — ffprobe JSON → `MediaInfo`.
  - `queue.rs` — job state machine (`queued → running → done | failed | cancelled`); `claim_next()` is the scheduler's atomic claim step.
  - `scheduler.rs` — `QueueState` (queue + concurrency) and `pump()`: claims queued jobs up to the concurrency limit, spawns them, re-pumps on completion.
  - `runner.rs` — runs one ffmpeg job: spawns the sidecar, streams progress, emits started/progress/done/error/cancelled events, returns terminal `JobStatus`.
  - `thumbs.rs` — pure fns: thumbnail cache key (path+mtime+size hash) and seek point.
  - `commands.rs` — thin `#[tauri::command]` wrappers only; no logic here.
- FFmpeg/ffprobe are Tauri **sidecars** — separate processes, never linked as libraries.
- IPC event/command names are defined once in a shared constants file mirrored TS↔Rust; never inline string literals.

## Invariants — never violate

1. Never overwrite source files. Default output name appends ` (converted)`.
2. All FFmpeg arguments flow through `ffmpeg_args.rs`. The UI never constructs FFmpeg args.
3. Every MP4 output gets `-movflags +faststart`.
4. Rotation and colour metadata must be copied from input to output.
5. Arg-building, progress parsing, and probe parsing stay pure functions — no process, filesystem, or UI dependency — so they remain unit-testable.
6. All user-visible strings live in one module (`src/lib/strings.ts`).
7. Keep files under ~300 lines; split rather than grow.

## Testing

- `fixtures/` contains tiny generated media (testsrc/sine via FFmpeg): .mov, .avi, .mkv, .mp3, plus a rotated clip, a VFR clip, and a deliberately corrupt file. Regenerate with `gen_fixtures.sh`; never commit real videos.
- `ffmpeg_args.rs` has table-driven golden tests asserting exact argument vectors per (input, format, preset). Any behaviour change must update these deliberately.
- Integration tests run real FFmpeg against fixtures and assert on **ffprobe output** of the result (container, codec, duration ±0.5 s, resolution). This is ground truth for "conversion works."
- New FFmpeg knowledge (flag fixes, edge cases) must be encoded as an arg-builder case + golden test, not left in chat/comments.
- `docs/manual-testing.md` tracks GUI flows automated tests can't cover. Maintain it in the same commit as the change: add items for new manual-only behaviour, and reset an item to pending when a change could plausibly break it. Only a human marks items verified.

## Gotchas

- Use Tauri's native file-drop event, NOT HTML5 drag-and-drop — HTML5 DnD does not deliver real file paths.
- Parse progress from `-progress pipe:1` key=value output, not stderr scraping.
- Probe hardware encoders at startup (`ffmpeg -encoders`); fall back to libx264/x265 silently if unavailable.
- Selecting an audio output format for a video input means "extract audio" — label it as such in UI.
- Fast trim = stream copy with `-ss/-to` (keyframe-accurate only); re-encode when precise cuts or format change require it.

<!-- Append new gotchas here as they are discovered. -->
