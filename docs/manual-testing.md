# Manual Testing Checklist

GUI flows that automated tests cannot cover (`npm run check` covers everything
else). Each item lists steps and expected behaviour. Update this doc in the
same commit as the change that adds or alters a manual-only behaviour:
add new items, and reset an item's status to **pending** when a change could
plausibly have broken it. Mark items **verified** with the date once checked.

Generate test media first if needed: `./fixtures/gen_fixtures.sh`

| Status legend | |
|---|---|
| ⬜ pending | not yet checked, or invalidated by a later change |
| ✅ verified (date) | confirmed working by a human |

## File input

- ✅ **Drag-and-drop** *(2026-07-22)* — drag 2–3 files from Finder onto the window. Rows appear with name, resolution, duration, size; drop-zone highlight shows during drag and clears after.
- ✅ **Folder drop** *(2026-07-22)* — drag a folder containing media + non-media files (and a nested subfolder) onto the window: only the media files appear as rows, including those from the subfolder; non-media files are skipped.
- ✅ **Add Files button** *(2026-07-22)* — native picker opens, multi-select works, picked files appear.
- ✅ **Duplicate handling** *(2026-07-22)* — add the same file twice; only one pending row exists.
- ✅ **Thumbnails** *(2026-07-22)* — video files show a real frame thumbnail; audio files (`fixtures/sample.mp3`) show the note placeholder icon.
- ✅ **Bulk add gating** *(2026-07-22, regression: 2026-07-12 Convert was clickable mid-load)* — drop 20+ files at once: every row appears immediately with a pulsing "Reading…", the Convert button stays disabled with "Reading files…" shown beside it, and only enables once all rows have metadata. Files probe ~4 at a time (list fills with thumbnails progressively).

## Conversion & queue

- ✅ **Basic convert** *(2026-07-22)* — drop `fixtures/sample.mov`, Convert with defaults (MP4/High). Output is `sample.mp4` (clean name — no suffix, since the extension differs) next to the source and plays in QuickTime.
- ✅ **Same-extension convert** *(2026-07-22)* — convert an `.mp4` to MP4: output is `name (converted).mp4` (never touches the source).
- ✅ **Conflict prompt** *(2026-07-22)* — convert `sample.mov` to MP4 twice. Second run shows the "Files already exist" dialog listing `sample.mp4`. Verify all three buttons: *Don't convert* leaves the file untouched; *Keep both* produces `sample (converted).mp4` (then `(converted 2)` on a third run); *Overwrite* replaces it (check mtime changes).
- ✅ **Batch name collisions** *(2026-07-22)* — add `clip.mov` and `clip.avi` from the same folder, convert both to MP4: outputs are `clip.mp4` and `clip (converted).mp4`, no prompt, nothing clobbered.
- ✅ **Progress display** *(2026-07-22)* — per-file bar fills with % badge; overall bar and "Converting X of Y" text update.
- ✅ **Batch of 5 with corrupt file** *(2026-07-22)* — drop `sample.mov`, `sample.avi`, `corrupt.mov`, `sample.mkv`, `vfr.mkv`, Convert with Parallel=2. Four complete with green ✓, `corrupt.mov` shows red *failed*; queue never stalls.
- ✅ **Cancel mid-conversion** *(2026-07-22, re-verified after M2 queue rework)* — Cancel goes through `cancel_all`: with Parallel=2 and several files queued, Cancel kills both running jobs *and* skips all queued ones; ffmpeg processes die, partial output files are deleted, rows show *cancelled*.
- ✅ **Error log** *(2026-07-22)* — on the failed `corrupt.mov` row: "Show log" expands the stderr tail, "Copy log" puts it on the clipboard.
- ✅ **Menu interaction during batch** *(2026-07-22, regression: 2026-07-11 batch appeared to stop after opening About)* — start a batch of 6+ files (Parallel=4), then open menus, the About panel, and drag the window around while it runs. Rows keep progressing and the batch completes.
- ✅ **Exit guard: window close** *(2026-07-22, regression: 2026-07-11 app quit silently mid-batch)* — start a long conversion, click the red close button: the "Conversions in progress" dialog appears. *Keep converting* resumes; *Quit anyway* kills ffmpeg, removes the partial output file, and quits.
- ✅ **Exit guard: ⌘Q** *(2026-07-22)* — same as above but via ⌘Q and via menu → Quit.
- ✅ **Exit when idle** *(2026-07-22)* — with no batch running, close and ⌘Q quit immediately, no dialog. Files merely listed (never converted) don't count as active; a finished batch doesn't either.
- ✅ **Audio extract** *(2026-07-22)* — convert `sample.mov` to MP3; output plays. Selecting an audio format with video files pending shows the "Audio will be extracted from video" note next to the format selector.

## Trim & advanced (M3)

- ✅ **Trim panel** *(2026-07-22)* — on a pending video row, click ✂ Trim: a filmstrip of 6 frames with timestamps appears, plus Start/End fields. Enter `0:00.5` / `0:01.5` on `sample.mov`, convert; output is ~1 s (the trim badge on the row shows the range).
- ✅ **Trim validation** *(2026-07-22)* — end ≤ start, times past clip end, or garbage input show the inline error and don't commit.
- ✅ **Trim on audio file** *(2026-07-22)* — ✂ on `sample.mp3`: no filmstrip (audio has no frames), but Start/End fields still work.
- ✅ **Fast trim (stream copy)** *(2026-07-22)* — with defaults (MP4, High, advanced untouched), set a trim on `keyframes.mp4`: the trim badge turns ⚡ (tooltip explains keyframe snapping) and conversion is near-instant with codecs unchanged. Changing preset to Small file flips the badge back to ✂ (re-encode).
- ✅ **Advanced panel** *(2026-07-22)* — ⚙ Advanced (only for MP4/MKV/MOV): codec, resolution, FPS, CRF, audio kbps, hardware toggle, strip metadata. The FFmpeg flags footer updates live as options change.
- ✅ **Hardware encoding** *(2026-07-22)* — with "Hardware encoding" on (default), the flags footer shows `h264_videotoolbox`; unticking switches it to `libx264`. Convert a file each way; both outputs play.
- ✅ **H.265 output** *(2026-07-22)* — Advanced → codec H.265, convert `sample.mov` to MP4; output plays in QuickTime (hvc1 tag).
- ✅ **GIF export** *(2026-07-22)* — format GIF + trim to ~1 s on `sample.mov`; output is an animated GIF that loops, reasonable colours (palette pass).
- ✅ **Resolution cap** *(2026-07-22)* — Advanced → 480; convert a 720p+ file; output height is ≤480 with aspect preserved. Small-file preset alone also caps at 720.

- ✅ **Log file** *(2026-07-22)* — after a batch with one failure, `~/Library/Logs/com.snowcrash.transmogrifier/Transmogrifier.log` contains enqueue/start/done lines and the failure with its stderr tail.
- ✅ **FFmpeg credit** *(2026-07-22)* — "Powered by FFmpeg" in the empty drop zone opens ffmpeg.org in the browser.

## Settings & appearance

- ✅ **Output folder** *(2026-07-22)* — choose a custom folder via "Save to"; output lands there. Reset (✕) returns to same-folder-as-source behaviour.
- ✅ **Settings persistence** *(2026-07-22)* — set format=MKV, quality=Medium, Parallel=3, custom output dir; quit and relaunch; all four restored.
- ✅ **Light/dark theme** *(2026-07-22)* — toggle macOS appearance while the app is open; colours follow the OS in both modes and text stays readable.
- ✅ **Window resize** *(2026-07-22)* — shrink to minimum (700×500); controls wrap without clipping or overlap.

## Cross-platform & updates (M4)

- ✅ **CI matrix** *(2026-07-22)* — ci.yml green on macOS, Linux, Windows.
- ✅ **Release artifacts** *(2026-07-22)* — v0.1.0 and v0.1.1 tags produced draft releases with .dmg (arm64 + x64), .AppImage/.deb/.rpm, .msi/.exe and `latest.json`; verified anonymously fetchable end-to-end (repo made public, both the manifest and asset URLs return 200 with no auth).
- ✅ **Auto-update end-to-end** *(2026-07-22)* — installed v0.1.0 build, published v0.1.1; on launch the update banner appeared; "Restart & update" installed and relaunched as the new version.
- ⬜ **Windows QA** — drag-drop, convert, cancel, trim on a Windows machine (path handling uses `\` — output-naming and path logic are unit-tested but the full GUI flow is not).
- ⬜ **Linux QA** — same sweep on the AppImage.

## Not yet implemented (don't test)

- Per-file format overrides, "Show in Finder" link, dock badge progress
- Code signing / notarization (M5)
