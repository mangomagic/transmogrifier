use std::hash::{DefaultHasher, Hash, Hasher};

/// Cache key for a thumbnail: stable for a given (path, mtime, size) so a
/// re-encoded or replaced file gets a fresh thumbnail.
pub fn thumb_cache_key(path: &str, mtime_secs: u64, size_bytes: u64) -> String {
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    mtime_secs.hash(&mut hasher);
    size_bytes.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

/// Seek point for the thumbnail frame: 10% into the clip, capped at 30s.
pub fn thumb_seek_seconds(duration_s: Option<f64>) -> f64 {
    match duration_s {
        Some(d) if d > 0.0 => (d * 0.1).min(30.0),
        _ => 0.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_is_stable() {
        assert_eq!(
            thumb_cache_key("/a/b.mov", 100, 5000),
            thumb_cache_key("/a/b.mov", 100, 5000)
        );
    }

    #[test]
    fn key_changes_with_mtime() {
        assert_ne!(
            thumb_cache_key("/a/b.mov", 100, 5000),
            thumb_cache_key("/a/b.mov", 101, 5000)
        );
    }

    #[test]
    fn key_changes_with_path() {
        assert_ne!(
            thumb_cache_key("/a/b.mov", 100, 5000),
            thumb_cache_key("/a/c.mov", 100, 5000)
        );
    }

    #[test]
    fn seek_is_ten_percent_capped() {
        assert_eq!(thumb_seek_seconds(Some(20.0)), 2.0);
        assert_eq!(thumb_seek_seconds(Some(600.0)), 30.0);
        assert_eq!(thumb_seek_seconds(None), 0.0);
        assert_eq!(thumb_seek_seconds(Some(0.0)), 0.0);
    }
}
