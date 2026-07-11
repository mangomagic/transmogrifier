use crate::codec_args::{
    audio_codec_args, audio_vbr_quality, metadata_args, video_codec_args, video_filters, webm_crf,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum VideoPreset {
    Highest,
    High,
    Medium,
    SmallFile,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum VideoEncoder {
    Libx264,
    Libx265,
    H264VideoToolbox,
    HevcVideoToolbox,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AdvancedSettings {
    pub encoder: Option<VideoEncoder>,
    pub max_height: Option<u32>,
    pub fps: Option<u32>,
    pub crf: Option<u8>,
    pub audio_bitrate_kbps: Option<u32>,
    #[serde(default)]
    pub strip_metadata: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JobSettings {
    pub input_path: String,
    pub output_path: String,
    pub format: OutputFormat,
    pub video_preset: VideoPreset,
    pub trim_start: Option<f64>,
    pub trim_end: Option<f64>,
    #[serde(default)]
    pub advanced: Option<AdvancedSettings>,
}

pub fn build_args(settings: &JobSettings) -> Vec<String> {
    let mut args: Vec<String> = vec!["-y".into()];

    // -ss before -i: fast keyframe seek, frame-accurate when re-encoding
    if let Some(start) = settings.trim_start {
        args.extend(["-ss".into(), format!("{start:.3}")]);
    }
    args.extend(["-i".into(), settings.input_path.clone()]);
    // With -ss before -i timestamps reset to 0, so the end point becomes a
    // duration (-t), not an absolute -to.
    if let Some(end) = settings.trim_end {
        let duration = end - settings.trim_start.unwrap_or(0.0);
        args.extend(["-t".into(), format!("{duration:.3}")]);
    }

    match settings.format {
        OutputFormat::Mp4 | OutputFormat::Mkv | OutputFormat::Mov => {
            if let Some(vf) = video_filters(settings) {
                args.extend(["-vf".into(), vf]);
            }
            args.extend(video_codec_args(settings));
            args.extend(audio_codec_args(settings));
            args.extend(metadata_args(settings));
            if settings.format == OutputFormat::Mp4 {
                args.extend(["-movflags".into(), "+faststart".into()]);
            }
        }
        OutputFormat::WebM => {
            if let Some(vf) = video_filters(settings) {
                args.extend(["-vf".into(), vf]);
            }
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
            args.extend(["-vn".into()]);
            args.extend(audio_codec_args(settings));
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
