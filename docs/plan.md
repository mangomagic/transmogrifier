# Video File Converter — Project Plan

**Version:** 1.1 · **Date:** 2026-07-10 · **Development:** Claude Code–driven
**Goal:** Cross-platform (macOS, Windows, Linux) desktop app for converting video/audio files between formats with quality control. Personal use first, designed so a free public release is a packaging step, not a rewrite.

---

## 1. Requirements Summary

| Area | Decision |
|---|---|
| Platforms | macOS (primary dev target), Windows, Linux |
| Must-have formats | Input: `.mov` (QuickTime) · Output: `.mp4`, `.mp3` |
| Other formats | Common video/audio in and out (see §4) |
| File selection | Multi-file picker + drag-and-drop; user-chosen output location |
| Quality UX | Presets by default, expandable advanced panel |
| V1 features | Batch queue with progress, file thumbnails/metadata, trim (start/end), auto-update |
| Audience | Personal → possibly free public release |

---

## 2. Framework Recommendation: Tauri v2

All conversion work is delegated to FFmpeg regardless of framework, so the framework choice is about UI, footprint, packaging, and process management — not codec capability.

### Comparison

| Criterion | **Tauri v2** | Electron | Flutter Desktop | Qt (C++/Python) |
|---|---|---|---|---|
| Bundle size | ~5–15 MB | ~150 MB+ | ~30–50 MB | ~30–80 MB |
| Idle RAM | ~30–40 MB | ~200–300 MB | moderate | low |
| UI tech | HTML/CSS/JS (system WebView) | HTML/CSS/JS (Chromium) | Dart/widgets | C++/QML |
| External binary mgmt | **Built-in "sidecar"** — first-class support for bundling and spawning FFmpeg | Manual spawn/monitor | Manual | Manual |
| Drag-and-drop | Native support | Native support | Adequate | Native |
| Auto-update | Built-in updater plugin | Mature (electron-updater) | DIY | DIY |
| Licensing for public release | MIT/Apache | MIT | BSD | GPL/LGPL/commercial |
| Learning curve | Web UI + some Rust for backend | Web only | Dart | Steepest |

### Why Tauri

- **Sidecar model fits perfectly.** The whole app is essentially a UI orchestrating an FFmpeg process. Tauri's sidecar feature handles bundling, per-platform binary resolution, spawning, and stdout/stderr streaming — exactly the core plumbing this app needs.
- **Footprint.** A converter utility shipping at ~10 MB (plus FFmpeg) vs. 150 MB+ matters for a free public download.
- **Rust backend** gives clean, safe process management, progress parsing, and a job queue without blocking the UI.
- **Cost of the trade-off is low.** Tauri's known weaknesses (WebView rendering inconsistencies across OSes) barely matter for a utility UI of lists, buttons, and progress bars.

**Fallback:** if Rust proves a blocker, Electron is the drop-in alternative — the entire UI layer (HTML/CSS/JS) ports directly.

**UI stack:** React + TypeScript + Tailwind CSS, Vite build. Familiar ecosystem, fast iteration, easy theming (light/dark following OS).

---

## 3. Architecture

```
┌────────────────────────── Tauri App ──────────────────────────┐
│  Frontend (WebView)              Backend (Rust)               │
│  ┌──────────────────┐   IPC    ┌───────────────────────────┐  │
│  │ React UI          │◄───────►│ Job Queue Manager         │  │
│  │ - File list       │  events │ - queue, concurrency=1..N │  │
│  │ - Format/preset   │         │ - cancel / retry          │  │
│  │ - Progress views  │         ├───────────────────────────┤  │
│  │ - Trim controls   │         │ FFmpeg Sidecar Runner     │  │
│  └──────────────────┘          │ - arg builder             │  │
│                                │ - progress parser         │  │
│                                │ - ffprobe metadata        │  │
│                                └───────────────────────────┘  │
└──────────────────────────────┬────────────────────────────────┘
                               ▼
                 ffmpeg / ffprobe (bundled sidecar binaries)
```

### Key components

1. **FFmpeg sidecar runner (Rust).** Builds argument lists from job settings, spawns `ffmpeg`, parses `-progress pipe:1` output into percentage/ETA events pushed to the UI. One process per job; SIGTERM/kill for cancel.
2. **ffprobe metadata service.** On file add, run `ffprobe -show_format -show_streams -of json` → duration, resolution, codecs, bitrate, size. Feeds the file list UI and validates inputs.
3. **Thumbnail generator.** `ffmpeg -ss <10%> -frames:v 1` → cached JPEG per file (app cache dir, keyed by path+mtime hash). Audio files get a waveform-style placeholder icon.
4. **Job queue.** FIFO, default concurrency 2 (configurable 1–4). States: `queued → running → done | failed | cancelled`. Per-job and overall progress. Failures never halt the queue; failed jobs show the tail of FFmpeg stderr.
5. **Settings store.** JSON in app config dir: last output folder, default preset, concurrency, theme, "same folder as source" toggle.

### FFmpeg distribution strategy

- Bundle **static ffmpeg + ffprobe binaries per platform** as Tauri sidecars (macOS arm64/x64, Windows x64, Linux x64).
- Invoking FFmpeg as a **separate executable** (not linked as a library) keeps the app's code cleanly separated from FFmpeg's license — the app itself can stay MIT.
- For public release: comply with FFmpeg redistribution norms — credit in the About box, link to FFmpeg source alongside the download ([ffmpeg.org/legal](https://www.ffmpeg.org/legal.html)). Prefer GPL static builds (BtbN/gyan.dev style) since we distribute FFmpeg unmodified as a standalone binary; if legal caution warrants for a commercial pivot, switch to LGPL builds without x264 and use `libopenh264` or hardware encoders.

### Hardware acceleration

Expose "Use hardware encoding when available" (default on): VideoToolbox (macOS), NVENC/QSV/AMF (Windows), VAAPI (Linux). Probe encoder availability at startup (`ffmpeg -encoders`) and fall back to software (libx264/x265) silently.

---

## 4. Format Support

### Inputs (v1)
Video: **MOV**, MP4, M4V, MKV, AVI, WMV, WebM, MPG/MPEG, TS/M2TS, FLV, 3GP
Audio: MP3, WAV, AAC/M4A, FLAC, OGG, WMA, AIFF

FFmpeg decodes far more; the list above is what's advertised and drag-drop-filtered. Unknown extensions still attempt ffprobe and convert if decodable.

### Outputs (v1)

| Container | Video codec | Audio codec | Notes |
|---|---|---|---|
| **MP4** | H.264 (default), H.265 | AAC | The default; maximum compatibility |
| WebM | VP9 | Opus | Web use |
| MKV | H.264/H.265 | AAC/FLAC | Flexible archive |
| MOV | H.264 | AAC | Round-trip to Apple ecosystem |
| GIF | — | — | Short-clip export (pairs with trim) |
| **MP3** | — | LAME MP3 | Audio extract or audio-to-audio |
| AAC (M4A) | — | AAC | |
| WAV | — | PCM | Lossless |
| FLAC | — | FLAC | Lossless compressed |

Selecting an audio output for a video input = extract audio track (explicitly labelled in UI).

---

## 5. UI/UX Design

### Layout (single window, ~900×640 default)

```
┌───────────────────────────────────────────────────────────┐
│  ⬇ Drop zone / file list (main area)                      │
│  ┌─────────────────────────────────────────────────────┐  │
│  │ [thumb] clip01.mov  1920×1080 · 2:34 · 812 MB   ✕   │  │
│  │         ▶ trim: 0:00 – 2:34   [✂ Trim]              │  │
│  │ [thumb] intro.avi   1280×720 · 0:48 · 210 MB    ✕   │  │
│  └─────────────────────────────────────────────────────┘  │
│  [+ Add Files]                       [Clear All]          │
├───────────────────────────────────────────────────────────┤
│  Output:  [MP4 ▾]   Quality: [High ▾]   ⚙ Advanced        │
│  Save to: [Same folder as source ▾]  [Choose…]            │
├───────────────────────────────────────────────────────────┤
│  ████████████░░░░  Converting 2 of 5 · 43% · ~3 min left  │
│                                   [Convert] / [Cancel]    │
└───────────────────────────────────────────────────────────┘
```

### Interaction principles

- **Zero-config happy path:** drop files → hit Convert. Defaults: MP4/High, same folder as source, ` (converted)` suffix — never overwrite originals.
- **Drag-and-drop everywhere:** whole window is a drop target; folders are expanded recursively (media files only); duplicates deduped.
- **Empty state** shows a large friendly drop target with supported-format hints.
- **Per-file overrides:** global format/quality applies to all, but each row can override via its own dropdown (v1.1 if time-constrained).
- **Progress:** per-file bar + speed (e.g. "2.3×"), overall bar, ETA. Completed files get a ✓ and a "Show in Finder/Explorer" link. macOS dock badge / Windows taskbar progress.
- **Errors:** inline on the file row, human-readable summary + expandable FFmpeg log tail; "Copy log" button.
- **Trim:** per-file ✂ button opens inline start/end fields with a thumbnail filmstrip scrubber. v1 = keyframe-accurate fast trim where possible (stream copy `-ss/-to`), re-encode when precise cut or format change requires it.
- **Accessibility:** full keyboard operability, visible focus, ARIA labels, respects OS reduced-motion and light/dark theme.

### Quality: presets + advanced panel

Presets (video, H.264 reference):

| Preset | Strategy | Approx. behaviour |
|---|---|---|
| Highest | CRF 18, `preset slow` | Near-source quality, biggest file |
| **High (default)** | CRF 20, `preset medium` | Visually transparent for most content |
| Medium | CRF 23, `preset medium` | Good quality, smaller |
| Small file | CRF 28 + cap ≤720p | Sharing/messaging |
| Custom | unlocks Advanced panel | |

Audio presets: 320 / 192 (default) / 128 kbps, or lossless where the codec allows.

**Advanced panel (collapsible):** video codec, resolution (keep/2160/1080/720/480 or custom), fps (keep/60/30/24), CRF or target bitrate toggle, encoder speed preset, hardware acceleration toggle; audio codec, bitrate, sample rate, channels; "strip metadata" option. Panel shows the resulting FFmpeg flags in a read-only footer for power users.

---

## 6. Auto-Update & Distribution

| Platform | Package | Update path |
|---|---|---|
| macOS | `.dmg` (universal or arm64+x64) | Tauri updater plugin, signed manifest |
| Windows | NSIS `.exe` / `.msi` | Tauri updater |
| Linux | `.AppImage` (+ `.deb`) | AppImage self-update / repo |

- **Personal phase:** unsigned/ad-hoc builds are fine (macOS Gatekeeper: right-click → Open, or `xattr -dr com.apple.quarantine`).
- **Public phase:** Apple Developer ID signing + notarization (~$99/yr), Windows code-signing cert (or start with SmartScreen reputation warnings + clear docs). GitHub Releases hosts binaries, update manifests, and the FFmpeg source mirror for license compliance.
- CI: GitHub Actions matrix (macos-latest, windows-latest, ubuntu-latest) via `tauri-action`, producing all installers per tagged release.

---

## 7. Roadmap

Development is Claude Code–driven, so milestones are ordered by dependency, not time. Each milestone is sized to be a small number of Claude Code sessions and ends in a verifiable, committable state.

| Milestone | Scope | Exit criteria (verifiable) |
|---|---|---|
| **M0 — Skeleton** | Tauri app scaffold, FFmpeg/ffprobe sidecars resolving on macOS, single hardcoded MOV→MP4 conversion, progress parsed to console | `npm run tauri dev` converts a sample .mov; progress % printed; `cargo test` green |
| **M1 — Core MVP** | Drag-and-drop + picker, file list with ffprobe metadata, format/preset selectors, output location, single-file conversion with UI progress, cancel | Drop → Convert → playable MP4; cancel kills process cleanly; arg-builder unit tests pass |
| **M2 — Batch & polish** | Job queue with concurrency, per-file + overall progress, thumbnails, error surfacing, settings persistence, light/dark | Queue of 5 mixed files completes with one deliberately corrupt file failing gracefully |
| **M3 — Trim & advanced** | Trim UI with filmstrip, advanced quality panel, hardware-accel toggle, audio-extract flow, GIF export | Trimmed output duration matches request ±0.5 s (verified by ffprobe in test) |
| **M4 — Cross-platform & updates** | Windows + Linux builds via CI, platform QA, installers, auto-updater wiring | CI matrix green on all three OSes; installers produced as release artifacts |
| **M5 — Public release prep** (optional) | Signing/notarization, GitHub page with FFmpeg compliance notes, crash-safe logging, docs | Notarized dmg opens without warnings; updater upgrades a prior build |

---

## 8. Claude Code Development Notes

Practices that make Claude Code materially more effective on this codebase.

### 8.1 CLAUDE.md

A ready-to-use `CLAUDE.md` is provided alongside this plan — place it at the repo root in M0. It defines commands, architecture, invariants, testing rules, and known gotchas, and includes an append-as-discovered gotchas section. Keep it current: when an invariant or gotcha changes, update CLAUDE.md in the same commit.

### 8.2 Repo layout for agent legibility

```
src/                  # React UI
  components/         # one component per file, co-located *.test.tsx
  lib/ipc.ts          # ALL invoke()/event wiring in one typed module
  lib/presets.ts      # preset definitions (single source of truth, mirrored in Rust tests)
src-tauri/src/
  ffmpeg_args.rs      # pure fn: JobSettings -> Vec<String>   ← most-tested file
  probe.rs            # ffprobe JSON -> MediaInfo
  progress.rs         # pure fn: ffmpeg stdout line -> ProgressEvent
  queue.rs            # job state machine
  commands.rs         # thin #[tauri::command] wrappers only
fixtures/             # tiny generated sample media + gen_fixtures.sh
docs/plan.md          # this document, kept current
```

The high-value design rule: **arg-building, progress parsing, and probe parsing are pure functions with no process or UI dependency.** That makes the core logic unit-testable without launching the app — which is exactly what an agent iterates against fastest.

### 8.3 Verification loops (the critical enabler)

Claude Code is most effective when every change can be checked without human eyes on a GUI:

1. **Generated fixtures, not checked-in videos.** `fixtures/gen_fixtures.sh` uses FFmpeg itself (`-f lavfi -i testsrc=duration=2`, `sine=duration=2`) to synthesize tiny .mov/.avi/.mkv/.mp3 samples — including a rotated clip, a VFR clip, and a truncated/corrupt file. Deterministic, no large binaries in git.
2. **Golden tests on `ffmpeg_args.rs`:** table-driven tests asserting exact argument vectors per (input, format, preset) combination. Any regression in conversion behaviour shows up as a test diff, not a bad output file.
3. **Integration tests that run real FFmpeg** against fixtures and assert on **ffprobe output** of the result (container, codec, duration ±0.5 s, resolution). This is the ground truth for "the conversion works."
4. **Frontend:** Vitest + React Testing Library for queue-state rendering and preset logic; `tsc --noEmit` and ESLint as cheap always-run gates.
5. **One command:** `npm run check` runs typecheck + lint + all JS and Rust tests. Claude Code should run it after every change; it should be listed in CLAUDE.md as the definition of done.
6. **GUI verification when needed:** `tauri-driver`/WebdriverIO smoke test (app launches, drop zone renders) in CI; for interactive debugging, Claude Code can screenshot the dev app.

### 8.4 Working-method recommendations

- **One milestone = one plan-first session.** Start each milestone in plan mode against `docs/plan.md`, agree the slice, then implement. Commit at every green `npm run check`.
- **Define IPC contracts before UI.** Have Claude Code write the shared event/command type definitions (TS + Rust) first in each milestone; both sides then implement against a fixed contract, which prevents drift the agent can't see.
- **Keep FFmpeg knowledge in code, not chat.** Every discovered FFmpeg incantation (rotation fix, faststart, VFR handling) gets encoded as an arg-builder case + golden test, so knowledge survives across sessions.
- **Small files, single responsibility.** Target <300 lines per file; agents edit small focused files more reliably.
- **CI from M0.** GitHub Actions running `npm run check` on push gives Claude Code (and you) an independent signal; add the three-OS `tauri-action` build matrix in M4.
- **Custom slash command ideas:** `/fixtures` (regenerate + re-run integration tests), `/convert-smoke` (run a real MOV→MP4 through the dev binary and ffprobe the result).

---

## 9. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| FFmpeg arg complexity (odd codecs, VFR, rotation metadata, HDR MOV) | Golden-file test suite of sample inputs; always copy rotation/colour metadata; `-movflags +faststart` for MP4 |
| WebView drag-and-drop quirks per OS | Use Tauri's native file-drop event (not HTML5 DnD) — it delivers real paths on all platforms |
| Large batches exhausting disk | Pre-check free space at output location; warn before starting |
| Rust unfamiliarity | Claude Code writes the Rust; backend surface is small (spawn, parse, queue) and fully covered by `cargo test`/`clippy` gates; Electron fallback documented in §2 |
| Agent regressions across sessions | CLAUDE.md invariants + golden arg tests + `npm run check` as definition of done (§8) |
| Windows SmartScreen / macOS Gatekeeper friction on public release | Budget for signing in M5; document workarounds until then |

---

## 10. Open Questions

1. Subtitle tracks in MKV/MOV inputs — preserve, burn-in option, or drop (v1 default: preserve where container allows)?
2. Should completed-job history persist across app restarts, or clear on quit?
3. Linux priority: is `.AppImage` alone acceptable for v1, or is a `.deb` required?
4. ~~App name~~ — **resolved 2026-07-11: Transmogrifier** (bundle id `com.snowcrash.transmogrifier`).
