// Provision ffmpeg/ffprobe sidecar binaries into
// src-tauri/binaries/<name>-<target-triple>[.exe], which is where
// tauri.conf.json's externalBin expects them.
//
// Sources: the ffmpeg-static / ffprobe-static npm packages. By default the
// host triple is used; pass --triple=<rust-triple> when cross-compiling
// (e.g. x86_64-apple-darwin on an arm64 runner — run
// `npm_config_arch=x64 npm rebuild ffmpeg-static` first so the downloaded
// ffmpeg matches).
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
const tripleArg = process.argv
  .find((a) => a.startsWith("--triple="))
  ?.split("=")[1];

function hostTriple() {
  const hostLine = execSync("rustc -vV")
    .toString()
    .split("\n")
    .find((l) => l.startsWith("host:"));
  if (!hostLine) throw new Error("could not determine rust host triple");
  return hostLine.split(" ")[1].trim();
}

const triple = tripleArg ?? hostTriple();

// Rust triple → ffprobe-static's bin/<platform>/<arch> layout
function tripleToNode(t) {
  const platform = t.includes("windows") ? "win32" : t.includes("darwin") ? "darwin" : "linux";
  const arch = t.startsWith("aarch64") ? "arm64" : "x64";
  return { platform, arch };
}

const { platform, arch } = tripleToNode(triple);
const exe = platform === "win32" ? ".exe" : "";

// ffprobe-static bundles every platform/arch; pick by triple, not host.
const ffprobeDir = dirname(require.resolve("ffprobe-static/package.json"));
const sources = {
  // ffmpeg-static downloads one binary at install time (npm_config_arch
  // controls which); its path is arch-independent.
  ffmpeg: require("ffmpeg-static"),
  ffprobe: join(ffprobeDir, "bin", platform, arch, `ffprobe${exe}`),
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
  console.log(`provided ${dest} (from ${src})`);
}
