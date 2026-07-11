/// Hardware encoders we know how to drive, in the order the UI should
/// prefer them. Probed at startup from `ffmpeg -encoders`.
pub const KNOWN_HW_ENCODERS: &[&str] = &[
    "h264_videotoolbox",
    "hevc_videotoolbox",
    "h264_nvenc",
    "hevc_nvenc",
    "h264_qsv",
    "hevc_qsv",
    "h264_amf",
    "hevc_amf",
    "h264_vaapi",
    "hevc_vaapi",
];

/// Parse `ffmpeg -encoders` output into the list of known hardware
/// encoders that are actually available on this machine.
pub fn parse_hw_encoders(output: &str) -> Vec<String> {
    KNOWN_HW_ENCODERS
        .iter()
        .filter(|name| {
            output.lines().any(|line| {
                // Encoder lines look like: " V....D h264_videotoolbox  VideoToolbox..."
                line.split_whitespace().nth(1) == Some(**name)
            })
        })
        .map(|s| s.to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "\
Encoders:
 V..... = Video
 A..... = Audio
 ------
 V....D libx264              libx264 H.264 / AVC / MPEG-4 AVC (codec h264)
 V....D h264_videotoolbox    VideoToolbox H.264 Encoder (codec h264)
 V....D hevc_videotoolbox    VideoToolbox H.265 Encoder (codec hevc)
 A....D aac                  AAC (Advanced Audio Coding)
";

    #[test]
    fn finds_available_hw_encoders() {
        let found = parse_hw_encoders(SAMPLE);
        assert_eq!(found, vec!["h264_videotoolbox", "hevc_videotoolbox"]);
    }

    #[test]
    fn ignores_software_encoders() {
        assert!(!parse_hw_encoders(SAMPLE).contains(&"libx264".to_string()));
    }

    #[test]
    fn empty_output_gives_empty_list() {
        assert!(parse_hw_encoders("").is_empty());
    }

    #[test]
    fn does_not_match_encoder_name_in_description() {
        // "h264_nvenc" appearing in a description column must not count
        let tricky = " V....D libx264   like h264_nvenc but software\n";
        assert!(parse_hw_encoders(tricky).is_empty());
    }
}
