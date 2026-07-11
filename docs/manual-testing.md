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

- ⬜ **Drag-and-drop** — drag 2–3 files from Finder onto the window. Rows appear with name, resolution, duration, size; drop-zone highlight shows during drag and clears after.
- ⬜ **Folder drop** — drag a folder in. (v1 plan: expands recursively, media files only. Not yet implemented — currently the folder path itself is probed and likely errors silently.)
- ⬜ **Add Files button** — native picker opens, multi-select works, picked files appear.
- ⬜ **Duplicate handling** — add the same file twice; only one pending row exists.
- ⬜ **Thumbnails** — video files show a real frame thumbnail; audio files (`fixtures/sample.mp3`) show the note placeholder icon.

## Conversion & queue

- ⬜ **Basic convert** — drop `fixtures/sample.mov`, Convert with defaults (MP4/High). Output `sample (converted).mp4` appears next to the source and plays in QuickTime.
- ⬜ **Progress display** — per-file bar fills with % badge; overall bar and "Converting X of Y" text update. (Fixture clips finish near-instantly — use a longer real video.)
- ⬜ **Batch of 5 with corrupt file** — drop `sample.mov`, `sample.avi`, `corrupt.mov`, `sample.mkv`, `vfr.mkv`, Convert with Parallel=2. Four complete with green ✓, `corrupt.mov` shows red *failed*; queue never stalls.
- ✅ **Cancel mid-conversion** *(2026-07-11, pre-queue implementation)* — start a long conversion, hit Cancel: ffmpeg process dies, partial output file is deleted, row shows *cancelled*.
  - ⬜ **Re-verify after M2 queue rework** — Cancel now goes through `cancel_all`: with Parallel=2 and several files queued, Cancel must kill both running jobs *and* skip all queued ones.
- ⬜ **Error log** — on the failed `corrupt.mov` row: "Show log" expands the stderr tail, "Copy log" puts it on the clipboard.
- ⬜ **Audio extract** — convert `sample.mov` to MP3; output plays. (UI labelling of "audio will be extracted" not yet wired to format selection.)

## Settings & appearance

- ⬜ **Output folder** — choose a custom folder via "Save to"; output lands there. Reset (✕) returns to same-folder-as-source behaviour.
- ⬜ **Settings persistence** — set format=MKV, quality=Medium, Parallel=3, custom output dir; quit and relaunch; all four restored.
- ⬜ **Light/dark theme** — toggle macOS appearance while the app is open; colours follow the OS in both modes and text stays readable.
- ⬜ **Window resize** — shrink to minimum (700×500); controls wrap without clipping or overlap.

## Not yet implemented (don't test)

- Trim, advanced quality panel, hardware-accel toggle, GIF export (M3)
- Per-file format overrides, "Show in Finder" link, dock badge progress
- Auto-update (M4)
