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
- ⬜ **Audio extract** — convert `sample.mov` to MP3; output plays. Selecting an audio format with video files pending shows the "Audio will be extracted from video" note next to the format selector.

## Trim & advanced (M3)

- ⬜ **Trim panel** — on a pending video row, click ✂ Trim: a filmstrip of 6 frames with timestamps appears, plus Start/End fields. Enter `0:00.5` / `0:01.5` on `sample.mov`, convert; output is ~1 s (the trim badge on the row shows the range).
- ⬜ **Trim validation** — end ≤ start, times past clip end, or garbage input show the inline error and don't commit.
- ⬜ **Trim on audio file** — ✂ on `sample.mp3`: no filmstrip (audio has no frames), but Start/End fields still work.
- ⬜ **Advanced panel** — ⚙ Advanced (only for MP4/MKV/MOV): codec, resolution, FPS, CRF, audio kbps, hardware toggle, strip metadata. The FFmpeg flags footer updates live as options change.
- ⬜ **Hardware encoding** — with "Hardware encoding" on (default), the flags footer shows `h264_videotoolbox`; unticking switches it to `libx264`. Convert a file each way; both outputs play.
- ⬜ **H.265 output** — Advanced → codec H.265, convert `sample.mov` to MP4; output plays in QuickTime (hvc1 tag).
- ⬜ **GIF export** — format GIF + trim to ~1 s on `sample.mov`; output is an animated GIF that loops, reasonable colours (palette pass).
- ⬜ **Resolution cap** — Advanced → 480; convert a 720p+ file; output height is ≤480 with aspect preserved. Small-file preset alone also caps at 720.

## Settings & appearance

- ⬜ **Output folder** — choose a custom folder via "Save to"; output lands there. Reset (✕) returns to same-folder-as-source behaviour.
- ⬜ **Settings persistence** — set format=MKV, quality=Medium, Parallel=3, custom output dir; quit and relaunch; all four restored.
- ⬜ **Light/dark theme** — toggle macOS appearance while the app is open; colours follow the OS in both modes and text stays readable.
- ⬜ **Window resize** — shrink to minimum (700×500); controls wrap without clipping or overlap.

## Not yet implemented (don't test)

- Per-file format overrides, "Show in Finder" link, dock badge progress
- Fast trim via stream copy (all trims currently re-encode)
- Folder drop with recursive expansion
- Auto-update (M4)
