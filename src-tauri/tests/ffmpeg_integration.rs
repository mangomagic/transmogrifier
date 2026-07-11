//! Integration tests: run the real FFmpeg sidecar binary against generated
//! fixtures and assert on ffprobe output of the result. Ground truth for
//! "the conversion works".

use std::path::PathBuf;
use std::process::Command;
use transmogrifier_lib::encoders::parse_hw_encoders;
use transmogrifier_lib::ffmpeg_args::{
    build_args, AdvancedSettings, JobSettings, OutputFormat, VideoEncoder, VideoPreset,
};
use transmogrifier_lib::probe::{parse_probe, MediaInfo};

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .to_path_buf()
}

/// Resolve the sidecar binary from src-tauri/binaries (any target triple),
/// falling back to PATH.
fn sidecar(name: &str) -> PathBuf {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries");
    std::fs::read_dir(&dir)
        .ok()
        .and_then(|entries| {
            entries
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .find(|p| {
                    p.file_name()
                        .map(|f| f.to_string_lossy().starts_with(&format!("{name}-")))
                        .unwrap_or(false)
                })
        })
        .unwrap_or_else(|| PathBuf::from(name))
}

/// Fixtures are gitignored; regenerate them if missing (requires ffmpeg on PATH).
fn ensure_fixtures() -> PathBuf {
    let fixtures = repo_root().join("fixtures");
    if !fixtures.join("sample.mov").exists() || !fixtures.join("keyframes.mp4").exists() {
        let status = Command::new("bash")
            .arg(fixtures.join("gen_fixtures.sh"))
            .status()
            .expect("failed to run gen_fixtures.sh");
        assert!(status.success(), "gen_fixtures.sh failed");
    }
    fixtures
}

fn convert_and_probe(settings: &JobSettings) -> MediaInfo {
    let args = build_args(settings);
    let output = Command::new(sidecar("ffmpeg"))
        .args(&args)
        .output()
        .expect("failed to spawn ffmpeg");
    assert!(
        output.status.success(),
        "ffmpeg failed: {}",
        String::from_utf8_lossy(&output.stderr)
    );

    let probe_out = Command::new(sidecar("ffprobe"))
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            &settings.output_path,
        ])
        .output()
        .expect("failed to spawn ffprobe");
    assert!(probe_out.status.success(), "ffprobe failed on output file");

    parse_probe(&String::from_utf8(probe_out.stdout).unwrap()).unwrap()
}

fn out_path(name: &str) -> String {
    let path = std::env::temp_dir().join(name);
    let _ = std::fs::remove_file(&path);
    path.to_string_lossy().into_owned()
}

#[test]
fn mov_to_mp4_produces_valid_h264_aac() {
    let fixtures = ensure_fixtures();
    let settings = JobSettings {
        input_path: fixtures.join("sample.mov").to_string_lossy().into_owned(),
        output_path: out_path("transmogrifier_it_sample (converted).mp4"),
        format: OutputFormat::Mp4,
        video_preset: VideoPreset::Medium,
        trim_start: None,
        trim_end: None,
        advanced: None,
        stream_copy: false,
        allow_overwrite: false,
    };

    let info = convert_and_probe(&settings);

    assert_eq!(info.video_codec.as_deref(), Some("h264"));
    assert_eq!(info.audio_codec.as_deref(), Some("aac"));
    assert_eq!(info.width, Some(320));
    assert_eq!(info.height, Some(240));
    let duration = info.duration_s.expect("output has duration");
    assert!(
        (duration - 2.0).abs() < 0.5,
        "duration {duration} not within ±0.5s of 2s"
    );
}

#[test]
fn mov_to_mp3_extracts_audio() {
    let fixtures = ensure_fixtures();
    let settings = JobSettings {
        input_path: fixtures.join("sample.mov").to_string_lossy().into_owned(),
        output_path: out_path("transmogrifier_it_sample (converted).mp3"),
        format: OutputFormat::Mp3,
        video_preset: VideoPreset::High,
        trim_start: None,
        trim_end: None,
        advanced: None,
        stream_copy: false,
        allow_overwrite: false,
    };

    let info = convert_and_probe(&settings);

    assert_eq!(info.audio_codec.as_deref(), Some("mp3"));
    assert!(info.video_codec.is_none(), "audio extract must drop video");
    let duration = info.duration_s.expect("output has duration");
    assert!((duration - 2.0).abs() < 0.5);
}

#[test]
fn mkv_to_mp4_converts() {
    let fixtures = ensure_fixtures();
    let settings = JobSettings {
        input_path: fixtures.join("sample.mkv").to_string_lossy().into_owned(),
        output_path: out_path("transmogrifier_it_mkv (converted).mp4"),
        format: OutputFormat::Mp4,
        video_preset: VideoPreset::SmallFile,
        trim_start: None,
        trim_end: None,
        advanced: None,
        stream_copy: false,
        allow_overwrite: false,
    };

    let info = convert_and_probe(&settings);

    assert_eq!(info.video_codec.as_deref(), Some("h264"));
    assert_eq!(info.audio_codec.as_deref(), Some("aac"));
}

/// M2 exit criterion at the process level: a batch of 5 mixed files with
/// 2-way concurrency completes; the corrupt file fails without affecting
/// the other four.
#[test]
fn batch_of_five_with_one_corrupt_completes() {
    let fixtures = ensure_fixtures();
    let inputs = [
        ("sample.mov", true),
        ("sample.avi", true),
        ("corrupt.mov", false),
        ("sample.mkv", true),
        ("vfr.mkv", true),
    ];

    let handles: Vec<_> = inputs
        .iter()
        .enumerate()
        .map(|(i, (name, _))| {
            let input = fixtures.join(name).to_string_lossy().into_owned();
            let output = out_path(&format!("transmogrifier_it_batch_{i} (converted).mp4"));
            std::thread::spawn(move || {
                let settings = JobSettings {
                    input_path: input,
                    output_path: output.clone(),
                    format: OutputFormat::Mp4,
                    video_preset: VideoPreset::SmallFile,
                    trim_start: None,
                    trim_end: None,
                    advanced: None,
                    stream_copy: false,
                    allow_overwrite: false,
                };
                let status = Command::new(sidecar("ffmpeg"))
                    .args(&build_args(&settings))
                    .output()
                    .expect("spawn ffmpeg")
                    .status;
                (status.success(), output)
            })
        })
        .collect();

    let results: Vec<(bool, String)> = handles.into_iter().map(|h| h.join().unwrap()).collect();

    for (i, (_, expect_ok)) in inputs.iter().enumerate() {
        let (ok, output) = &results[i];
        assert_eq!(ok, expect_ok, "job {i} unexpected outcome");
        if *expect_ok {
            let probe_out = Command::new(sidecar("ffprobe"))
                .args(["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", output])
                .output()
                .expect("spawn ffprobe");
            let info = parse_probe(&String::from_utf8(probe_out.stdout).unwrap()).unwrap();
            assert_eq!(info.video_codec.as_deref(), Some("h264"), "job {i} bad codec");
        }
    }
}

/// M3 exit criterion: trimmed output duration matches the request ±0.5 s.
#[test]
fn trimmed_output_duration_matches_request() {
    let fixtures = ensure_fixtures();
    let settings = JobSettings {
        input_path: fixtures.join("sample.mov").to_string_lossy().into_owned(),
        output_path: out_path("transmogrifier_it_trim (converted).mp4"),
        format: OutputFormat::Mp4,
        video_preset: VideoPreset::Medium,
        trim_start: Some(0.5),
        trim_end: Some(1.5),
        advanced: None,
        stream_copy: false,
        allow_overwrite: false,
    };

    let info = convert_and_probe(&settings);
    let duration = info.duration_s.expect("output has duration");
    assert!(
        (duration - 1.0).abs() < 0.5,
        "trimmed duration {duration} not within ±0.5s of requested 1.0s"
    );
}

#[test]
fn gif_export_with_trim() {
    let fixtures = ensure_fixtures();
    let settings = JobSettings {
        input_path: fixtures.join("sample.mov").to_string_lossy().into_owned(),
        output_path: out_path("transmogrifier_it_clip (converted).gif"),
        format: OutputFormat::Gif,
        video_preset: VideoPreset::Medium,
        trim_start: Some(0.0),
        trim_end: Some(1.0),
        advanced: None,
        stream_copy: false,
        allow_overwrite: false,
    };

    let info = convert_and_probe(&settings);
    assert_eq!(info.video_codec.as_deref(), Some("gif"));
    assert!(info.audio_codec.is_none(), "GIF must have no audio");
}

#[test]
fn advanced_resolution_cap_downscales() {
    let fixtures = ensure_fixtures();
    let settings = JobSettings {
        input_path: fixtures.join("sample.mov").to_string_lossy().into_owned(),
        output_path: out_path("transmogrifier_it_scaled (converted).mp4"),
        format: OutputFormat::Mp4,
        video_preset: VideoPreset::High,
        trim_start: None,
        trim_end: None,
        advanced: Some(AdvancedSettings {
            max_height: Some(120),
            ..Default::default()
        }),
        stream_copy: false,
        allow_overwrite: false,
    };

    let info = convert_and_probe(&settings);
    assert_eq!(info.height, Some(120));
    assert_eq!(info.width, Some(160), "aspect ratio must be preserved");
}

/// Hardware encode path — only runs where VideoToolbox is available
/// (probed the same way the app does at startup).
#[test]
fn videotoolbox_encode_works_when_available() {
    let probe = Command::new(sidecar("ffmpeg"))
        .args(["-hide_banner", "-encoders"])
        .output()
        .expect("spawn ffmpeg -encoders");
    let available = parse_hw_encoders(&String::from_utf8_lossy(&probe.stdout));
    if !available.contains(&"h264_videotoolbox".to_string()) {
        eprintln!("skipping: h264_videotoolbox not available");
        return;
    }

    let fixtures = ensure_fixtures();
    let settings = JobSettings {
        input_path: fixtures.join("sample.mov").to_string_lossy().into_owned(),
        output_path: out_path("transmogrifier_it_vt (converted).mp4"),
        format: OutputFormat::Mp4,
        video_preset: VideoPreset::High,
        trim_start: None,
        trim_end: None,
        advanced: Some(AdvancedSettings {
            encoder: Some(VideoEncoder::H264VideoToolbox),
            ..Default::default()
        }),
        stream_copy: false,
        allow_overwrite: false,
    };

    // Listed in -encoders does NOT mean usable: headless VMs (GitHub macOS
    // runners) list VideoToolbox but cannot create a compression session.
    let output = Command::new(sidecar("ffmpeg"))
        .args(&build_args(&settings))
        .output()
        .expect("spawn ffmpeg");
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        if stderr.contains("cannot create compression session") {
            eprintln!("skipping: VideoToolbox listed but unusable (headless VM)");
            return;
        }
        panic!("ffmpeg failed: {stderr}");
    }

    let probe_out = Command::new(sidecar("ffprobe"))
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            &settings.output_path,
        ])
        .output()
        .expect("spawn ffprobe");
    let info = parse_probe(&String::from_utf8(probe_out.stdout).unwrap()).unwrap();
    assert_eq!(info.video_codec.as_deref(), Some("h264"));
    assert_eq!(info.audio_codec.as_deref(), Some("aac"));
}

#[test]
fn corrupt_input_fails_cleanly() {
    let fixtures = ensure_fixtures();
    let settings = JobSettings {
        input_path: fixtures.join("corrupt.mov").to_string_lossy().into_owned(),
        output_path: out_path("transmogrifier_it_corrupt (converted).mp4"),
        format: OutputFormat::Mp4,
        video_preset: VideoPreset::Medium,
        trim_start: None,
        trim_end: None,
        advanced: None,
        stream_copy: false,
        allow_overwrite: false,
    };

    let args = build_args(&settings);
    let output = Command::new(sidecar("ffmpeg"))
        .args(&args)
        .output()
        .expect("failed to spawn ffmpeg");
    assert!(
        !output.status.success(),
        "ffmpeg should fail on a truncated input"
    );
}

/// Fast trim (stream copy) on a keyframe-dense clip: duration within
/// keyframe-accuracy tolerance and codecs unchanged (no re-encode).
#[test]
fn stream_copy_trim_is_keyframe_accurate() {
    let fixtures = ensure_fixtures();
    let settings = JobSettings {
        input_path: fixtures.join("keyframes.mp4").to_string_lossy().into_owned(),
        output_path: out_path("transmogrifier_it_fasttrim (converted).mp4"),
        format: OutputFormat::Mp4,
        video_preset: VideoPreset::High,
        trim_start: Some(1.0),
        trim_end: Some(2.0),
        advanced: None,
        stream_copy: true,
        allow_overwrite: false,
    };

    let info = convert_and_probe(&settings);
    let duration = info.duration_s.expect("output has duration");
    assert!(
        (duration - 1.0).abs() < 0.5,
        "stream-copy trim duration {duration} not within keyframe tolerance of 1.0s"
    );
    // -c copy must preserve the source codecs
    assert_eq!(info.video_codec.as_deref(), Some("h264"));
    assert_eq!(info.audio_codec.as_deref(), Some("aac"));
}
