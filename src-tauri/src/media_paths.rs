//! Expand dropped paths: directories are walked recursively keeping only
//! known media files; explicit files are kept as-is (unknown extensions
//! still get a probe attempt per the plan). Order-preserving dedupe.

use std::path::Path;

/// Advertised input extensions (plan §4) — used only to filter folder drops.
pub const MEDIA_EXTENSIONS: &[&str] = &[
    // video
    "mov", "mp4", "m4v", "mkv", "avi", "wmv", "webm", "mpg", "mpeg", "ts", "m2ts", "flv", "3gp",
    // audio
    "mp3", "wav", "aac", "m4a", "flac", "ogg", "wma", "aiff",
];

pub fn is_media_path(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| MEDIA_EXTENSIONS.contains(&e.to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn walk_dir(dir: &Path, out: &mut Vec<String>) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    let mut entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let path = entry.path();
        if path.is_dir() {
            walk_dir(&path, out);
        } else if let Some(s) = path.to_str() {
            if is_media_path(s) {
                out.push(s.to_string());
            }
        }
    }
}

/// Files pass through untouched; directories expand to their media files.
/// Duplicates removed, first occurrence wins.
pub fn expand_media_paths(paths: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for p in paths {
        if Path::new(&p).is_dir() {
            walk_dir(Path::new(&p), &mut out);
        } else {
            out.push(p);
        }
    }
    let mut seen = std::collections::HashSet::new();
    out.retain(|p| seen.insert(p.clone()));
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn recognises_media_extensions_case_insensitive() {
        assert!(is_media_path("/a/clip.MOV"));
        assert!(is_media_path("/a/song.mp3"));
        assert!(!is_media_path("/a/readme.txt"));
        assert!(!is_media_path("/a/noextension"));
    }

    #[test]
    fn files_pass_through_even_with_unknown_extension() {
        let paths = vec!["/a/clip.xyz".to_string(), "/b/clip.mov".to_string()];
        assert_eq!(expand_media_paths(paths.clone()), paths);
    }

    #[test]
    fn dedupes_preserving_order() {
        let paths = vec![
            "/a/one.mov".to_string(),
            "/a/two.mov".to_string(),
            "/a/one.mov".to_string(),
        ];
        assert_eq!(expand_media_paths(paths), vec!["/a/one.mov", "/a/two.mov"]);
    }

    #[test]
    fn directory_expands_recursively_media_only() {
        let root = std::env::temp_dir().join(format!("transmog_walk_{}", std::process::id()));
        let sub = root.join("nested");
        fs::create_dir_all(&sub).unwrap();
        fs::write(root.join("a.mov"), b"x").unwrap();
        fs::write(root.join("notes.txt"), b"x").unwrap();
        fs::write(sub.join("b.mp3"), b"x").unwrap();

        let result = expand_media_paths(vec![root.to_string_lossy().into_owned()]);

        assert_eq!(result.len(), 2, "expected only the two media files: {result:?}");
        assert!(result[0].ends_with("a.mov"));
        assert!(result[1].ends_with("b.mp3"));

        fs::remove_dir_all(&root).unwrap();
    }
}