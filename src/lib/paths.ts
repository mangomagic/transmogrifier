import { S } from "./strings";

/// Derive the output path for a conversion. Never equals the input path:
/// the " (converted)" suffix is always appended to the base name.
export function deriveOutputPath(
  inputPath: string,
  outputDir: string | null,
  extension: string
): string {
  const sep = inputPath.includes("\\") ? "\\" : "/";
  const lastSep = inputPath.lastIndexOf(sep);
  const dir = outputDir ?? (lastSep >= 0 ? inputPath.slice(0, lastSep) : ".");
  const fileName = lastSep >= 0 ? inputPath.slice(lastSep + 1) : inputPath;
  const baseName = fileName.replace(/\.[^.]+$/, "");
  const cleanDir = dir.endsWith(sep) ? dir.slice(0, -1) : dir;
  return `${cleanDir}${sep}${baseName}${S.suffix}.${extension}`;
}
