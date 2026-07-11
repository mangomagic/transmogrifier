// Provision ffmpeg/ffprobe sidecar binaries for the current platform.
// Copies static builds from the ffmpeg-static / ffprobe-static npm packages
// into src-tauri/binaries/<name>-<target-triple>[.exe], which is where
// tauri.conf.json's externalBin expects them.
//
// Existing binaries are kept (local dev may use newer Homebrew copies);
// pass --force to overwrite.

import { execSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const binDir = join(root, "src-tauri", "binaries");
const force = process.argv.includes("--force");

const hostLine = execSync("rustc -vV").toString().split("\n").find((l) => l.startsWith("host:"));
if (!hostLine) throw new Error("could not determine rust host triple");
const triple = hostLine.split(" ")[1].trim();
const exe = process.platform === "win32" ? ".exe" : "";

const sources = {
  ffmpeg: require("ffmpeg-static"),
  ffprobe: require("ffprobe-static").path,
};

mkdirSync(binDir, { recursive: true });

for (const [name, src] of Object.entries(sources)) {
  const dest = join(binDir, `${name}-${triple}${exe}`);
  if (existsSync(dest) && !force) {
    console.log(`keep     ${dest} (exists; use --force to overwrite)`);
    continue;
  }
  if (!src || !existsSync(src)) {
    throw new Error(`${name} static binary not found (looked at: ${src})`);
  }
  copyFileSync(src, dest);
  chmodSync(dest, 0o755);
  console.log(`provided ${dest}`);
}