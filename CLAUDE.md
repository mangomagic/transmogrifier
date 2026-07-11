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
  - `ffmpeg_args.rs` — pure fn `JobSettings -> Vec<String>`. Most-tested file in the repo (golden tests in `tests/golden_args.rs`).
  - `codec_args.rs` — pure codec/filter/metadata arg helpers used by `build_args`.
  - `encoders.rs` — pure parser: `ffmpeg -encoders` output → available hardware encoders.
  - `media_paths.rs` — dropped-path expansion: folders → recursive media-file walk, media-extension filter, dedupe.
  - `output_naming.rs` — pure output-path resolution: clean names, collision suffixes, conflict flagging (existence predicate injected).
  - `progress.rs` — pure fn: ffmpeg `-progress` output line → `ProgressEvent`.
  - `probe.rs` — ffprobe JSON → `MediaInfo`.
  - `queue.rs` — job state machine (`queued → running → done | failed | cancelled`); `claim_next()` is the scheduler's atomic claim step.
  - `scheduler.rs` — `QueueState` (queue + concurrency) and `pump()`: claims queued jobs up to the concurrency limit, spawns them, re-pumps on completion.
  - `runner.rs` — runs one ffmpeg job: spawns the sidecar, streams progress, emits started/progress/done/error/cancelled events, returns terminal `JobStatus`.
  - `thumbs.rs` — pure fns: thumbnail cache key (path+mtime+size hash) and seek point.
  - `thumb_commands.rs` — thumbnail + filmstrip commands (frame grabs via sidecar, cached, returned as data URLs).
  - `commands.rs` — thin `#[tauri::command]` wrappers only; no logic here.
- FFmpeg/ffprobe are Tauri **sidecars** — separate processes, never linked as libraries.
- IPC event/command names are defined once in a shared constants file mirrored TS↔Rust; never inline string literals.

## Invariants — never violate

1. Never overwrite anything silently. Sources are never valid outputs. Output naming (`output_naming.rs`): clean `name.ext` when free; ` (converted)` / ` (converted N)` suffixes only to dodge collisions with sources, other batch jobs, or (on "Keep both") existing files. Pre-existing files trigger the conflict prompt (Overwrite / Keep both / Don't convert); ffmpeg runs with `-n` unless the user explicitly chose Overwrite (`-y`).
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
- Probe hardware encoders at startup (`ffmpeg -encoders`); fall back to libx264/x265 silently if unavailable. Listed ≠ usable: headless VMs (GitHub macOS runners) list VideoToolbox but fail with "cannot create compression session" — a hw encode can still fail at runtime and surfaces as a per-job error.
- Selecting an audio output format for a video input means "extract audio" — label it as such in UI.
- Fast trim = stream copy (`-c copy`, keyframe-accurate only); used automatically only when trim is set, codecs fit the target container, preset is the default High, and the advanced panel is untouched (src/lib/fasttrim.ts decides). Everything else re-encodes.
- Trim args: `-ss` goes **before** `-i` (fast seek, frame-accurate when re-encoding). That resets timestamps, so the end point must be `-t <duration>` (end − start), not `-to <end>`.
- HEVC in MP4/MOV needs `-tag:v hvc1` or QuickTime/Apple players refuse the file.
- VideoToolbox encoders have no CRF — use `-q:v` (1–100); presets map Highest/High/Medium/Small → 75/65/55/45. No `-preset` speed flag either.
- Filtergraph expressions: commas inside functions must be escaped, e.g. `scale=-2:min(720\,ih)`.
- The backend queue is the source of truth for job state; UI events (`job_started`/`progress`/`job_done`…) are best-effort delivery. macOS menu/modal interaction can starve webview event delivery mid-batch, so the UI polls `get_queue_state` once a second while work is in flight and reconciles (`src/lib/reconcile.ts`). Never make UI state depend on catching every event.

<!-- Append new gotchas here as they are discovered. -->
