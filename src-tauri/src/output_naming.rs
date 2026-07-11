//! Output path resolution. Clean `name.ext` when free; ` (converted)` /
//! ` (converted N)` suffixes only to avoid collisions. Never yields a path
//! equal to any batch input (case-insensitive), and never reuses a path
//! within a batch. Pre-existing disk files are either surfaced (`exists`)
//! for the UI to prompt on, or skipped when `avoid_existing` is set.

use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::Path;

#[derive(Debug, Deserialize)]
pub struct NamingRequest {
    pub input_path: String,
    pub output_dir: Option<String>,
    pub extension: String,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct ResolvedOutput {
    pub path: String,
    /// True when the resolved path already exists on disk (only possible
    /// with `avoid_existing == false`) — the UI must prompt before using it.
    pub exists: bool,
}

fn candidate_name(base: &str, extension: &str, attempt: usize) -> String {
    match attempt {
        0 => format!("{base}.{extension}"),
        1 => format!("{base} (converted).{extension}"),
        n => format!("{base} (converted {n}).{extension}"),
    }
}

pub fn resolve_outputs(
    reqs: &[NamingRequest],
    avoid_existing: bool,
    exists: impl Fn(&str) -> bool,
) -> Vec<ResolvedOutput> {
    // Case-insensitive: macOS/Windows filesystems are; on Linux this is
    // merely conservative (an extra suffix, never a wrong overwrite).
    let mut reserved: HashSet<String> = reqs.iter().map(|r| r.input_path.to_lowercase()).collect();

    reqs.iter()
        .map(|req| {
            let input = Path::new(&req.input_path);
            let dir = req.output_dir.clone().unwrap_or_else(|| {
                input
                    .parent()
                    .map(|p| p.to_string_lossy().into_owned())
                    .filter(|p| !p.is_empty())
                    .unwrap_or_else(|| ".".into())
            });
            let base = input
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| "output".into());

            let mut attempt = 0;
            let path = loop {
                let name = candidate_name(&base, &req.extension, attempt);
                let candidate = Path::new(&dir).join(&name).to_string_lossy().into_owned();
                let clash_reserved = reserved.contains(&candidate.to_lowercase());
                let clash_disk = avoid_existing && exists(&candidate);
                if !clash_reserved && !clash_disk {
                    break candidate;
                }
                attempt += 1;
            };

            reserved.insert(path.to_lowercase());
            let on_disk = exists(&path);
            ResolvedOutput { path, exists: on_disk }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn req(input: &str, dir: Option<&str>, ext: &str) -> NamingRequest {
        NamingRequest {
            input_path: input.into(),
            output_dir: dir.map(String::from),
            extension: ext.into(),
        }
    }

    fn no_disk(_: &str) -> bool {
        false
    }

    #[test]
    fn different_extension_gets_clean_name() {
        let out = resolve_outputs(&[req("/m/clip.mov", None, "mp4")], false, no_disk);
        assert_eq!(out[0].path, "/m/clip.mp4");
        assert!(!out[0].exists);
    }

    #[test]
    fn same_extension_falls_back_to_suffix() {
        let out = resolve_outputs(&[req("/m/clip.mp4", None, "mp4")], false, no_disk);
        assert_eq!(out[0].path, "/m/clip (converted).mp4");
    }

    #[test]
    fn source_clash_is_case_insensitive() {
        let out = resolve_outputs(&[req("/m/Clip.MP4", None, "mp4")], false, no_disk);
        assert_eq!(out[0].path, "/m/Clip (converted).mp4");
    }

    #[test]
    fn never_targets_another_batch_input() {
        // clip.mov and clip.mp4 converted together: clip.mov's clean target
        // IS the other source — must be suffixed, silently.
        let reqs = [req("/m/clip.mov", None, "mp4"), req("/m/clip.mp4", None, "mp4")];
        let out = resolve_outputs(&reqs, false, no_disk);
        assert_eq!(out[0].path, "/m/clip (converted).mp4");
        assert_eq!(out[1].path, "/m/clip (converted 2).mp4");
    }

    #[test]
    fn intra_batch_outputs_never_collide() {
        // Same file name from two folders into one output dir.
        let reqs = [
            req("/a/clip.mov", Some("/out"), "mp4"),
            req("/b/clip.mov", Some("/out"), "mp4"),
        ];
        let out = resolve_outputs(&reqs, false, no_disk);
        assert_eq!(out[0].path, "/out/clip.mp4");
        assert_eq!(out[1].path, "/out/clip (converted).mp4");
    }

    #[test]
    fn existing_file_is_surfaced_not_skipped() {
        let disk = |p: &str| p == "/m/clip.mp4";
        let out = resolve_outputs(&[req("/m/clip.mov", None, "mp4")], false, disk);
        assert_eq!(out[0].path, "/m/clip.mp4");
        assert!(out[0].exists, "conflict must be flagged for the prompt");
    }

    #[test]
    fn avoid_existing_uniquifies_past_disk_files() {
        let disk = |p: &str| p == "/m/clip.mp4" || p == "/m/clip (converted).mp4";
        let out = resolve_outputs(&[req("/m/clip.mov", None, "mp4")], true, disk);
        assert_eq!(out[0].path, "/m/clip (converted 2).mp4");
        assert!(!out[0].exists);
    }

    #[test]
    fn output_dir_overrides_source_folder() {
        let out = resolve_outputs(&[req("/m/clip.mov", Some("/elsewhere"), "mp4")], false, no_disk);
        assert_eq!(out[0].path, "/elsewhere/clip.mp4");
    }

    #[test]
    fn suffix_numbering_increments() {
        assert_eq!(candidate_name("clip", "mp4", 0), "clip.mp4");
        assert_eq!(candidate_name("clip", "mp4", 1), "clip (converted).mp4");
        assert_eq!(candidate_name("clip", "mp4", 2), "clip (converted 2).mp4");
        assert_eq!(candidate_name("clip", "mp4", 3), "clip (converted 3).mp4");
    }
}
