//! Table-driven golden tests for the FFmpeg arg builder. Any behaviour
//! change must update these deliberately.

use transcodo_lib::ffmpeg_args::{
    build_args, AdvancedSettings, JobSettings, OutputFormat, VideoEncoder, VideoPreset,
};

fn settings(format: OutputFormat, preset: VideoPreset) -> JobSettings {
    JobSettings {
        input_path: "/in/clip.mov".into(),
        output_path: "/out/clip.out".into(),
        format,
        video_preset: preset,
        trim_start: None,
        trim_end: None,
        advanced: None,
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
            "/out/clip.out",
        ]
    );
}

#[test]
fn mp4_highest_uses_crf18_slow() {
    let args = build_args(&settings(OutputFormat::Mp4, VideoPreset::Highest));
    assert!(args.windows(2).any(|w| w == ["-crf", "18"]));
    assert!(args.windows(2).any(|w| w == ["-preset", "slow"]));
}

#[test]
fn mp4_always_has_faststart() {
    for preset in [
        VideoPreset::Highest,
        VideoPreset::High,
        VideoPreset::Medium,
        VideoPreset::SmallFile,
    ] {
        let args = build_args(&settings(OutputFormat::Mp4, preset));
        let idx = args.iter().position(|a| a == "-movflags").unwrap();
        assert!(args[idx + 1].contains("faststart"));
    }
}

#[test]
fn small_file_preset_caps_720p() {
    let args = build_args(&settings(OutputFormat::Mp4, VideoPreset::SmallFile));
    assert!(args.windows(2).any(|w| w == ["-vf", "scale=-2:min(720\\,ih)"]));
    assert!(args.windows(2).any(|w| w == ["-crf", "28"]));
}

#[test]
fn metadata_copied_by_default() {
    let args = build_args(&settings(OutputFormat::Mp4, VideoPreset::High));
    assert!(args.windows(2).any(|w| w == ["-map_metadata", "0"]));
    assert!(args.windows(2).any(|w| w == ["-map_chapters", "0"]));
}

#[test]
fn strip_metadata_uses_minus_one() {
    let mut s = settings(OutputFormat::Mp4, VideoPreset::High);
    s.advanced = Some(AdvancedSettings {
        strip_metadata: true,
        ..Default::default()
    });
    let args = build_args(&s);
    assert!(args.windows(2).any(|w| w == ["-map_metadata", "-1"]));
    assert!(!args.contains(&"-map_chapters".to_string()));
}

#[test]
fn trim_start_seeks_before_input() {
    let mut s = settings(OutputFormat::Mp4, VideoPreset::High);
    s.trim_start = Some(5.0);
    let args = build_args(&s);
    let ss = args.iter().position(|a| a == "-ss").unwrap();
    let i = args.iter().position(|a| a == "-i").unwrap();
    assert!(ss < i, "-ss must precede -i for fast accurate seek");
    assert_eq!(args[ss + 1], "5.000");
}

#[test]
fn trim_end_becomes_duration_after_seek() {
    let mut s = settings(OutputFormat::Mp4, VideoPreset::High);
    s.trim_start = Some(5.0);
    s.trim_end = Some(30.0);
    let args = build_args(&s);
    // -ss resets timestamps, so end 30 with start 5 is -t 25
    let t = args.iter().position(|a| a == "-t").unwrap();
    assert_eq!(args[t + 1], "25.000");
    assert!(!args.contains(&"-to".to_string()));
}

#[test]
fn trim_end_alone_is_duration_from_zero() {
    let mut s = settings(OutputFormat::Mp4, VideoPreset::High);
    s.trim_end = Some(30.0);
    let args = build_args(&s);
    let t = args.iter().position(|a| a == "-t").unwrap();
    assert_eq!(args[t + 1], "30.000");
    assert!(!args.contains(&"-ss".to_string()));
}

#[test]
fn h265_software_gets_hvc1_tag_in_mp4() {
    let mut s = settings(OutputFormat::Mp4, VideoPreset::High);
    s.advanced = Some(AdvancedSettings {
        encoder: Some(VideoEncoder::Libx265),
        ..Default::default()
    });
    let args = build_args(&s);
    assert!(args.windows(2).any(|w| w == ["-c:v", "libx265"]));
    assert!(args.windows(2).any(|w| w == ["-tag:v", "hvc1"]));
}

#[test]
fn h265_in_mkv_needs_no_tag() {
    let mut s = settings(OutputFormat::Mkv, VideoPreset::High);
    s.advanced = Some(AdvancedSettings {
        encoder: Some(VideoEncoder::Libx265),
        ..Default::default()
    });
    let args = build_args(&s);
    assert!(!args.contains(&"-tag:v".to_string()));
}

#[test]
fn videotoolbox_uses_qv_not_crf() {
    let mut s = settings(OutputFormat::Mp4, VideoPreset::High);
    s.advanced = Some(AdvancedSettings {
        encoder: Some(VideoEncoder::H264VideoToolbox),
        ..Default::default()
    });
    let args = build_args(&s);
    assert!(args.windows(2).any(|w| w == ["-c:v", "h264_videotoolbox"]));
    assert!(args.windows(2).any(|w| w == ["-q:v", "65"]));
    assert!(!args.contains(&"-crf".to_string()));
    assert!(!args.contains(&"-preset".to_string()));
}

#[test]
fn hevc_videotoolbox_gets_hvc1_tag() {
    let mut s = settings(OutputFormat::Mp4, VideoPreset::High);
    s.advanced = Some(AdvancedSettings {
        encoder: Some(VideoEncoder::HevcVideoToolbox),
        ..Default::default()
    });
    let args = build_args(&s);
    assert!(args.windows(2).any(|w| w == ["-c:v", "hevc_videotoolbox"]));
    assert!(args.windows(2).any(|w| w == ["-tag:v", "hvc1"]));
}

#[test]
fn advanced_crf_overrides_preset() {
    let mut s = settings(OutputFormat::Mp4, VideoPreset::High);
    s.advanced = Some(AdvancedSettings {
        crf: Some(26),
        ..Default::default()
    });
    let args = build_args(&s);
    assert!(args.windows(2).any(|w| w == ["-crf", "26"]));
}

#[test]
fn advanced_resolution_and_fps_build_filter_chain() {
    let mut s = settings(OutputFormat::Mp4, VideoPreset::High);
    s.advanced = Some(AdvancedSettings {
        max_height: Some(1080),
        fps: Some(30),
        ..Default::default()
    });
    let args = build_args(&s);
    assert!(args
        .windows(2)
        .any(|w| w == ["-vf", "scale=-2:min(1080\\,ih),fps=30"]));
}

#[test]
fn advanced_audio_bitrate_override() {
    let mut s = settings(OutputFormat::Mp4, VideoPreset::High);
    s.advanced = Some(AdvancedSettings {
        audio_bitrate_kbps: Some(320),
        ..Default::default()
    });
    let args = build_args(&s);
    assert!(args.windows(2).any(|w| w == ["-b:a", "320k"]));
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
fn gif_uses_palette_and_drops_audio() {
    let args = build_args(&settings(OutputFormat::Gif, VideoPreset::High));
    assert!(args.contains(&"-an".to_string()));
    let vf = args.iter().position(|a| a == "-vf").unwrap();
    assert!(args[vf + 1].contains("palettegen"));
}

#[test]
fn progress_args_precede_output() {
    let args = build_args(&settings(OutputFormat::Mp4, VideoPreset::High));
    let n = args.len();
    // order: ... -progress pipe:1 -nostats <output>
    assert_eq!(args[n - 1], "/out/clip.out");
    assert_eq!(args[n - 4], "-progress");
    assert_eq!(args[n - 3], "pipe:1");
    assert_eq!(args[n - 2], "-nostats");
}
