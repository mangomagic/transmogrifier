use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum OutputFormat {
    Mp4,
    WebM,
    Mkv,
    Mov,
    Gif,
    Mp3,
    Aac,
    Wav,
    Flac,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum VideoPreset {
    Highest,
    High,
    Medium,
    SmallFile,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobSettings {
    pub input_path: String,
    pub output_path: String,
    pub format: OutputFormat,
    pub video_preset: VideoPreset,
    pub trim_start: Option<f64>,
    pub trim_end: Option<f64>,
}

pub fn build_args(settings: &JobSettings) -> Vec<String> {
    let mut args: Vec<String> = vec![
        "-y".into(),
        "-i".into(),
        settings.input_path.clone(),
    ];

    if let Some(start) = settings.trim_start {
        args.extend(["-ss".into(), format!("{:.3}", start)]);
    }
    if let Some(end) = settings.trim_end {
        args.extend(["-to".into(), format!("{:.3}", end)]);
    }

    match settings.format {
        OutputFormat::Mp4 | OutputFormat::Mkv | OutputFormat::Mov => {
            let (crf, speed) = video_crf(&settings.video_preset);
            args.extend([
                "-c:v".into(), "libx264".into(),
                "-crf".into(), crf.to_string(),
                "-preset".into(), speed.into(),
                "-c:a".into(), "aac".into(),
                "-b:a".into(), "192k".into(),
                "-map_metadata".into(), "0".into(),
                "-map_chapters".into(), "0".into(),
            ]);
            if settings.format == OutputFormat::Mp4 {
                args.extend(["-movflags".into(), "+faststart".into()]);
            }
        }
        OutputFormat::WebM => {
            let crf = webm_crf(&settings.video_preset);
            args.extend([
                "-c:v".into(), "libvpx-vp9".into(),
                "-crf".into(), crf.to_string(),
                "-b:v".into(), "0".into(),
                "-c:a".into(), "libopus".into(),
                "-b:a".into(), "128k".into(),
            ]);
        }
        OutputFormat::Gif => {
            args.extend([
                "-vf".into(), "fps=15,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse".into(),
                "-loop".into(), "0".into(),
                "-an".into(),
            ]);
        }
        OutputFormat::Mp3 => {
            args.extend([
                "-vn".into(),
                "-c:a".into(), "libmp3lame".into(),
                "-q:a".into(), audio_vbr_quality(&settings.video_preset).to_string(),
            ]);
        }
        OutputFormat::Aac => {
            args.extend([
                "-vn".into(),
                "-c:a".into(), "aac".into(),
                "-b:a".into(), audio_bitrate(&settings.video_preset).into(),
            ]);
        }
        OutputFormat::Wav => {
            args.extend(["-vn".into(), "-c:a".into(), "pcm_s16le".into()]);
        }
        OutputFormat::Flac => {
            args.extend(["-vn".into(), "-c:a".into(), "flac".into()]);
        }
    }

    args.extend([
        "-progress".into(), "pipe:1".into(),
        "-nostats".into(),
        settings.output_path.clone(),
    ]);

    args
}

fn video_crf(preset: &VideoPreset) -> (u8, &'static str) {
    match preset {
        VideoPreset::Highest => (18, "slow"),
        VideoPreset::High => (20, "medium"),
        VideoPreset::Medium => (23, "medium"),
        VideoPreset::SmallFile => (28, "medium"),
    }
}

fn webm_crf(preset: &VideoPreset) -> u8 {
    match preset {
        VideoPreset::Highest => 24,
        VideoPreset::High => 30,
        VideoPreset::Medium => 33,
        VideoPreset::SmallFile => 40,
    }
}

fn audio_vbr_quality(preset: &VideoPreset) -> u8 {
    match preset {
        VideoPreset::Highest => 0,
        VideoPreset::High => 2,
        VideoPreset::Medium => 4,
        VideoPreset::SmallFile => 6,
    }
}

fn audio_bitrate(preset: &VideoPreset) -> &'static str {
    match preset {
        VideoPreset::Highest => "320k",
        VideoPreset::High => "192k",
        VideoPreset::Medium => "128k",
        VideoPreset::SmallFile => "96k",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings(format: OutputFormat, preset: VideoPreset) -> JobSettings {
        JobSettings {
            input_path: "/in/clip.mov".into(),
            output_path: "/out/clip.mp4".into(),
            format,
            video_preset: preset,
            trim_start: None,
            trim_end: None,
        }
    }

    #[test]
    fn mp4_high_golden() {
        let args = build_args(&settings(OutputFormat::Mp4, VideoPreset::High));
        assert_eq!(
            args,
            vec![
                "-y", "-i", "/in/clip.mov",
                "-c:v", "libx264", "-crf", "20", "-preset", "medium",
                "-c:a", "aac", "-b:a", "192k",
                "-map_metadata", "0", "-map_chapters", "0",
                "-movflags", "+faststart",
                "-progress", "pipe:1", "-nostats",
                "/out/clip.mp4",
            ]
        );
    }

    #[test]
    fn mp4_highest_golden() {
        let args = build_args(&settings(OutputFormat::Mp4, VideoPreset::Highest));
        let crf_idx = args.iter().position(|a| a == "-crf").unwrap();
        assert_eq!(args[crf_idx + 1], "18");
        let preset_idx = args.iter().position(|a| a == "-preset").unwrap();
        assert_eq!(args[preset_idx + 1], "slow");
    }

    #[test]
    fn mp4_always_has_faststart() {
        for preset in [VideoPreset::Highest, VideoPreset::High, VideoPreset::Medium, VideoPreset::SmallFile] {
            let args = build_args(&settings(OutputFormat::Mp4, preset));
            let movflags_idx = args.iter().position(|a| a == "-movflags").unwrap();
            assert!(args[movflags_idx + 1].contains("faststart"));
        }
    }

    #[test]
    fn mp4_always_copies_metadata() {
        let args = build_args(&settings(OutputFormat::Mp4, VideoPreset::High));
        assert!(args.windows(2).any(|w| w == ["-map_metadata", "0"]));
        assert!(args.windows(2).any(|w| w == ["-map_chapters", "0"]));
    }

    #[test]
    fn mp3_extract_audio() {
        let args = build_args(&settings(OutputFormat::Mp3, VideoPreset::High));
        assert!(args.contains(&"-vn".to_string()));
        assert!(args.windows(2).any(|w| w == ["-c:a", "libmp3lame"]));
    }

    #[test]
    fn wav_is_lossless_pcm() {
        let args = build_args(&settings(OutputFormat::Wav, VideoPreset::Highest));
        assert!(args.contains(&"-vn".to_string()));
        assert!(args.windows(2).any(|w| w == ["-c:a", "pcm_s16le"]));
    }

    #[test]
    fn trim_inserts_ss_and_to() {
        let mut s = settings(OutputFormat::Mp4, VideoPreset::High);
        s.trim_start = Some(5.0);
        s.trim_end = Some(30.0);
        let args = build_args(&s);
        let ss_idx = args.iter().position(|a| a == "-ss").unwrap();
        assert_eq!(args[ss_idx + 1], "5.000");
        let to_idx = args.iter().position(|a| a == "-to").unwrap();
        assert_eq!(args[to_idx + 1], "30.000");
    }

    #[test]
    fn progress_flag_always_last_before_output() {
        let args = build_args(&settings(OutputFormat::Mp4, VideoPreset::High));
        let n = args.len();
        // order: ... -progress pipe:1 -nostats <output>
        assert_eq!(args[n - 1], "/out/clip.mp4");
        assert_eq!(args[n - 4], "-progress");
        assert_eq!(args[n - 3], "pipe:1");
        assert_eq!(args[n - 2], "-nostats");
    }
}
