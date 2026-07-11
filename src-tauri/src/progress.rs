use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressEvent {
    pub job_id: String,
    pub percent: f32,
    pub speed: Option<f32>,
    pub out_time_us: Option<i64>,
    pub frame: Option<u64>,
}

/// Parse a block of `key=value` lines from ffmpeg `-progress pipe:1` output.
/// Returns None if the block does not contain `out_time_us` (incomplete block).
pub fn parse_progress_block(job_id: &str, block: &str, duration_us: Option<i64>) -> Option<ProgressEvent> {
    let mut out_time_us: Option<i64> = None;
    let mut speed: Option<f32> = None;
    let mut frame: Option<u64> = None;

    for line in block.lines() {
        let Some((key, val)) = line.split_once('=') else { continue };
        match key.trim() {
            "out_time_us" => out_time_us = val.trim().parse().ok(),
            "speed" => {
                let s = val.trim().trim_end_matches('x');
                speed = s.parse().ok();
            }
            "frame" => frame = val.trim().parse().ok(),
            _ => {}
        }
    }

    let out_us = out_time_us?;
    let percent = match duration_us {
        Some(dur) if dur > 0 => ((out_us as f64 / dur as f64) * 100.0).min(100.0) as f32,
        _ => 0.0,
    };

    Some(ProgressEvent {
        job_id: job_id.to_string(),
        percent,
        speed,
        out_time_us: Some(out_us),
        frame,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_typical_block() {
        let block = "frame=120\nfps=30.00\nbitrate=2000.0kbits/s\nout_time_us=4000000\nspeed=2.5x\nprogress=continue\n";
        let ev = parse_progress_block("job-1", block, Some(10_000_000)).unwrap();
        assert_eq!(ev.job_id, "job-1");
        assert!((ev.percent - 40.0).abs() < 0.1);
        assert_eq!(ev.speed, Some(2.5));
        assert_eq!(ev.frame, Some(120));
        assert_eq!(ev.out_time_us, Some(4_000_000));
    }

    #[test]
    fn percent_capped_at_100() {
        let block = "out_time_us=20000000\n";
        let ev = parse_progress_block("j", block, Some(10_000_000)).unwrap();
        assert_eq!(ev.percent, 100.0);
    }

    #[test]
    fn unknown_duration_gives_zero_percent() {
        let block = "out_time_us=5000000\n";
        let ev = parse_progress_block("j", block, None).unwrap();
        assert_eq!(ev.percent, 0.0);
    }

    #[test]
    fn missing_out_time_returns_none() {
        let block = "frame=10\nspeed=1.0x\n";
        assert!(parse_progress_block("j", block, Some(10_000_000)).is_none());
    }
}
