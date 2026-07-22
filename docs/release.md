# Release & CI Setup

## One-time GitHub setup (completed 2026-07-11)

Repo: github.com/mangomagic/transmogrifier (private). Steps that were done:

1. Done — repo created and main pushed (SSH remote).
2. Done — updater endpoint points at `mangomagic/transmogrifier`. ~~Replace `OWNER` in `src-tauri/tauri.conf.json`~~ → `plugins.updater.endpoints`
   with the GitHub owner name.
3. Done — `TAURI_SIGNING_PRIVATE_KEY` secret added (password secret unnecessary: GitHub rejects empty secrets and a missing secret resolves to "", matching the passwordless key):
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
nvm use 22 && rm -rf node_modules package-lock.json && npm install
cargo update -p tauri-plugin-log -p tauri-plugin-updater -p tauri-plugin-store \
  -p tauri-plugin-dialog -p tauri-plugin-shell -p tauri-plugin-opener \
  -p tauri-plugin-process --manifest-path src-tauri/Cargo.toml
git tag v0.2.0 && git push origin v0.2.0
```

Every Tauri plugin is declared as a loose range on both sides (`"2.8.0"` in
Cargo.toml behaves like `^2.8.0`; `"^2.8.0"` in package.json). `npm install`
re-resolves to whatever's newest on npm at release time, but Cargo.lock stays
pinned to whatever was newest on crates.io whenever it was last generated —
so the two drift independently. `tauri build` refuses to proceed on a
mismatch ("Found version mismatched Tauri packages"), and it hit every OS at
once cutting v0.1.1 (`tauri-plugin-log` npm had reached 2.9.0, Cargo.lock was
still on 2.8.0). Run `cargo update` for the plugins in the same release-prep
step as the npm lockfile regen, not just when something breaks.

Regenerate the lockfile under **Node 22** (ci.yml/release.yml's `node-version`),
not whatever Node the dev machine defaults to. Tailwind v4's oxide engine ships
a wasm32-wasi fallback with its own optionalDependencies (`@emnapi/core`,
`@emnapi/runtime`, `tslib`); different npm versions decide differently whether
those belong in the lockfile. A lockfile written by a newer local npm can omit
them, and `npm ci` then fails with `Missing: @emnapi/... from lock file` on
every CI runner — not a platform-specific failure, all four jobs die at the
same `npm ci` step (this happened cutting v0.1.1: `--package-lock-only` under
Node 24 was the first suspect, but the real fix was matching CI's Node version
before regenerating). `npm ci` passing locally right after `npm install` only
proves self-consistency on your machine's npm — it doesn't prove CI's npm
agrees.

If a tag's build fails and needs a fix, move the tag rather than adding a new
one: `git tag -d vX.Y.Z && git push origin :refs/tags/vX.Y.Z`, fix, commit,
re-tag, push.

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