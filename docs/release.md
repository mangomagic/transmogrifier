# Release & CI Setup

## One-time GitHub setup (not yet done)

The repo is local-only. To activate CI and releases:

1. Create the GitHub repo (e.g. `transmogrifier`) and push `main`.
2. Replace `OWNER` in `src-tauri/tauri.conf.json` → `plugins.updater.endpoints`
   with the GitHub owner name.
3. Add two repository secrets (Settings → Secrets → Actions):
   - `TAURI_SIGNING_PRIVATE_KEY` — contents of `~/.tauri/transmogrifier.key`
     (generated 2026-07-11 on the dev machine; **never commit it**)
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — empty string (key has no password)

## Workflows

- **ci.yml** — every push/PR: `npm run check` (typecheck, lint, Vitest, clippy,
  cargo tests incl. real-FFmpeg integration tests) on macOS, Linux, Windows.
- **release.yml** — on tag `v*`: `tauri-action` builds installers for
  macOS arm64 + x64 (`.dmg`), Linux x64 (`.AppImage`/`.deb`), Windows x64
  (`.msi`/NSIS), signs updater artifacts, and attaches everything plus
  `latest.json` to a **draft** GitHub release. Publish the draft to make the
  update visible to the auto-updater.

Cutting a release:

```bash
# bump "version" in package.json, src-tauri/tauri.conf.json, src-tauri/Cargo.toml
git tag v0.2.0 && git push origin v0.2.0
```

## Logs

App + job logs land in the platform log dir (macOS:
`~/Library/Logs/com.snowcrash.transmogrifier/Transmogrifier.log`), max 2 MB,
rotated keeping one previous file. Job lifecycle (enqueue/start/done/failed
with stderr tail), exit-with-active-jobs, and uncaught frontend errors are
all captured — first stop when diagnosing a user report.

## Auto-updater

- Wired via `tauri-plugin-updater`; public key is in `tauri.conf.json`,
  endpoint points at the latest GitHub release's `latest.json`.
- The app checks once on startup; if an update exists a banner offers
  "Restart & update". Check failures (offline, endpoint missing) are silent.
- The updater only trusts releases signed with the private key above.

## FFmpeg sidecars

- `src-tauri/binaries/` is gitignored. `scripts/prepare-sidecars.mjs` fills it
  from the `ffmpeg-static`/`ffprobe-static` npm packages, named per Rust host
  triple as Tauri's `externalBin` expects. Existing binaries are kept
  (`--force` overwrites), so local dev keeps its Homebrew copies.
- FFmpeg licence compliance for public distribution (credit, source link,
  GPL/LGPL choice) is an M5 concern — see plan §3.

### Known limitations

- `ffprobe-static`'s darwin "arm64" binary is actually x86_64 — it runs via
  Rosetta 2 on Apple Silicon. Replace with a true arm64 static ffprobe before
  a public macOS release.
- macOS builds are unsigned/un-notarized until M5 (Gatekeeper: right-click →
  Open, or `xattr -dr com.apple.quarantine`).
- Windows/Linux artifacts are produced by CI but have had no platform QA yet.