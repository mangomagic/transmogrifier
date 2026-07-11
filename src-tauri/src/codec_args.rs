//! Video/audio codec argument helpers for build_args. Pure functions.

use crate::ffmpeg_args::{AdvancedSettings, JobSettings, OutputFormat, VideoEncoder, VideoPreset};

pub fn video_crf(preset: &VideoPreset) -> (u8, &'static str) {
    match preset {
        VideoPreset::Highest => (18, "slow"),
        VideoPreset::High => (20, "medium"),
        VideoPreset::Medium => (23, "medium"),
        VideoPreset::SmallFile => (28, "medium"),
    }
}

/// VideoToolbox has no CRF; map presets onto its -q:v scale (1–100).
fn videotoolbox_quality(preset: &VideoPreset) -> u8 {
    match preset {
        VideoPreset::Highest => 75,
        VideoPreset::High => 65,
        VideoPreset::Medium => 55,
        VideoPreset::SmallFile => 45,
    }
}

pub fn webm_crf(preset: &VideoPreset) -> u8 {
    match preset {
        VideoPreset::Highest => 24,
        VideoPreset::High => 30,
        VideoPreset::Medium => 33,
        VideoPreset::SmallFile => 40,
    }
}

pub fn audio_vbr_quality(preset: &VideoPreset) -> u8 {
    match preset {
        VideoPreset::Highest => 0,
        VideoPreset::High => 2,
        VideoPreset::Medium => 4,
        VideoPreset::SmallFile => 6,
    }
}

pub fn audio_bitrate(preset: &VideoPreset) -> &'static str {
    match preset {
        VideoPreset::Highest => "320k",
        VideoPreset::High => "192k",
        VideoPreset::Medium => "128k",
        VideoPreset::SmallFile => "96k",
    }
}

/// -vf filter chain: resolution cap and fps. SmallFile caps at 720p by
/// default (per plan) unless advanced overrides the height.
pub fn video_filters(settings: &JobSettings) -> Option<String> {
    let adv = settings.advanced.as_ref();
    let mut filters: Vec<String> = Vec::new();

    let max_height = adv.and_then(|a| a.max_height).or({
        if settings.video_preset == VideoPreset::SmallFile {
            Some(720)
        } else {
            None
        }
    });
    if let Some(h) = max_height {
        // -2 keeps width divisible by 2; min() prevents upscaling.
        // The comma inside min() must be escaped in a filtergraph.
        filters.push(format!("scale=-2:min({h}\\,ih)"));
    }
    if let Some(fps) = adv.and_then(|a| a.fps) {
        filters.push(format!("fps={fps}"));
    }

    if filters.is_empty() {
        None
    } else {
        Some(filters.join(","))
    }
}

/// Encoder + quality args for MP4/MKV/MOV outputs.
pub fn video_codec_args(settings: &JobSettings) -> Vec<String> {
    let adv = settings.advanced.as_ref();
    let encoder = adv
        .and_then(|a| a.encoder)
        .unwrap_or(VideoEncoder::Libx264);
    let preset = &settings.video_preset;
    let mut args: Vec<String> = Vec::new();

    match encoder {
        VideoEncoder::Libx264 | VideoEncoder::Libx265 => {
            let (default_crf, speed) = video_crf(preset);
            let crf = adv.and_then(|a| a.crf).unwrap_or(default_crf);
            let codec = if encoder == VideoEncoder::Libx264 {
                "libx264"
            } else {
                "libx265"
            };
            args.extend([
                "-c:v".into(),
                codec.into(),
                "-crf".into(),
                crf.to_string(),
                "-preset".into(),
                speed.into(),
            ]);
        }
        VideoEncoder::H264VideoToolbox | VideoEncoder::HevcVideoToolbox => {
            let codec = if encoder == VideoEncoder::H264VideoToolbox {
                "h264_videotoolbox"
            } else {
                "hevc_videotoolbox"
            };
            args.extend([
                "-c:v".into(),
                codec.into(),
                "-q:v".into(),
                videotoolbox_quality(preset).to_string(),
            ]);
        }
    }

    // HEVC in MP4/MOV needs the hvc1 tag or QuickTime/Apple players refuse it
    let is_hevc = matches!(
        encoder,
        VideoEncoder::Libx265 | VideoEncoder::HevcVideoToolbox
    );
    if is_hevc && matches!(settings.format, OutputFormat::Mp4 | OutputFormat::Mov) {
        args.extend(["-tag:v".into(), "hvc1".into()]);
    }

    args
}

/// AAC audio args for video containers; bitrate overridable via advanced.
pub fn audio_codec_args(settings: &JobSettings) -> Vec<String> {
    let bitrate = settings
        .advanced
        .as_ref()
        .and_then(|a: &AdvancedSettings| a.audio_bitrate_kbps)
        .map(|k| format!("{k}k"))
        .unwrap_or_else(|| audio_bitrate(&settings.video_preset).to_string());
    vec!["-c:a".into(), "aac".into(), "-b:a".into(), bitrate]
}

/// Metadata handling: copy by default (rotation/colour survive re-encode via
/// side data; container metadata via map_metadata), or strip on request.
pub fn metadata_args(settings: &JobSettings) -> Vec<String> {
    let strip = settings
        .advanced
        .as_ref()
        .map(|a| a.strip_metadata)
        .unwrap_or(false);
    if strip {
        vec!["-map_metadata".into(), "-1".into()]
    } else {
        vec![
            "-map_metadata".into(),
            "0".into(),
            "-map_chapters".into(),
            "0".into(),
        ]
    }
}
