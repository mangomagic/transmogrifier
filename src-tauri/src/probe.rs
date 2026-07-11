use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaInfo {
    pub duration_s: Option<f64>,
    pub duration_us: Option<i64>,
    pub size_bytes: Option<u64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub bit_rate: Option<u64>,
    pub rotation: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct FfprobeOutput {
    streams: Option<Vec<FfprobeStream>>,
    format: Option<FfprobeFormat>,
}

#[derive(Debug, Deserialize)]
struct FfprobeStream {
    codec_type: Option<String>,
    codec_name: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
    side_data_list: Option<Vec<SideData>>,
}

#[derive(Debug, Deserialize)]
struct SideData {
    side_data_type: Option<String>,
    rotation: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct FfprobeFormat {
    duration: Option<String>,
    size: Option<String>,
    bit_rate: Option<String>,
}

pub fn parse_probe(json: &str) -> Result<MediaInfo, serde_json::Error> {
    let probe: FfprobeOutput = serde_json::from_str(json)?;

    let mut info = MediaInfo {
        duration_s: None,
        duration_us: None,
        size_bytes: None,
        width: None,
        height: None,
        video_codec: None,
        audio_codec: None,
        bit_rate: None,
        rotation: None,
    };

    if let Some(fmt) = &probe.format {
        if let Some(dur) = &fmt.duration {
            if let Ok(d) = dur.parse::<f64>() {
                info.duration_s = Some(d);
                info.duration_us = Some((d * 1_000_000.0) as i64);
            }
        }
        if let Some(sz) = &fmt.size {
            info.size_bytes = sz.parse().ok();
        }
        if let Some(br) = &fmt.bit_rate {
            info.bit_rate = br.parse().ok();
        }
    }

    for stream in probe.streams.as_deref().unwrap_or(&[]) {
        match stream.codec_type.as_deref() {
            Some("video") if info.video_codec.is_none() => {
                info.video_codec = stream.codec_name.clone();
                info.width = stream.width;
                info.height = stream.height;
                if let Some(side_data) = &stream.side_data_list {
                    for sd in side_data {
                        if sd.side_data_type.as_deref() == Some("Display Matrix") {
                            info.rotation = sd.rotation;
                        }
                    }
                }
            }
            Some("audio") if info.audio_codec.is_none() => {
                info.audio_codec = stream.codec_name.clone();
            }
            _ => {}
        }
    }

    Ok(info)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_video_probe() {
        let json = r#"{
            "streams": [
                {"codec_type": "video", "codec_name": "h264", "width": 1920, "height": 1080},
                {"codec_type": "audio", "codec_name": "aac"}
            ],
            "format": {"duration": "10.5", "size": "1048576", "bit_rate": "800000"}
        }"#;
        let info = parse_probe(json).unwrap();
        assert_eq!(info.video_codec.as_deref(), Some("h264"));
        assert_eq!(info.audio_codec.as_deref(), Some("aac"));
        assert_eq!(info.width, Some(1920));
        assert_eq!(info.height, Some(1080));
        assert!((info.duration_s.unwrap() - 10.5).abs() < 0.001);
        assert_eq!(info.duration_us, Some(10_500_000));
        assert_eq!(info.size_bytes, Some(1_048_576));
    }

    #[test]
    fn parses_audio_only() {
        let json = r#"{
            "streams": [{"codec_type": "audio", "codec_name": "mp3"}],
            "format": {"duration": "3.14", "size": "50000"}
        }"#;
        let info = parse_probe(json).unwrap();
        assert!(info.video_codec.is_none());
        assert_eq!(info.audio_codec.as_deref(), Some("mp3"));
        assert!((info.duration_s.unwrap() - 3.14).abs() < 0.001);
    }

    #[test]
    fn handles_missing_fields_gracefully() {
        let json = r#"{"streams": [], "format": {}}"#;
        let info = parse_probe(json).unwrap();
        assert!(info.duration_s.is_none());
        assert!(info.video_codec.is_none());
    }
}
