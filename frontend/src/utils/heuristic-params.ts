import type { ProcessingParams } from '../types/dsp'

/**
 * Genre-matched heuristic parameters for free-tier WASM rendering.
 * AUTHORITATIVE SOURCE: backend/ml/rainnet/heuristics.py (PART-4 Task 4.2)
 * Values MUST be identical for the same (genre, platform) pair.
 * If PART-4 values change, update here to match.
 */

const BASE_PARAMS: ProcessingParams = {
  target_lufs: -14.0,
  true_peak_ceiling: -1.0,
  mb_threshold_low: -20, mb_threshold_mid: -18, mb_threshold_high: -16,
  mb_ratio_low: 2.5,     mb_ratio_mid: 2.0,     mb_ratio_high: 2.0,
  mb_attack_low: 10.0,   mb_attack_mid: 5.0,    mb_attack_high: 2.0,
  mb_release_low: 150.0, mb_release_mid: 80.0,  mb_release_high: 40.0,
  eq_gains: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  analog_saturation: false, saturation_drive: 0.0, saturation_mode: 'tape',
  ms_enabled: false, mid_gain: 0.0, side_gain: 0.0, stereo_width: 1.0,
  sail_enabled: false, sail_stem_gains: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  vinyl_mode: false,
}

const GENRE_OVERRIDES: Record<string, Partial<ProcessingParams>> = {
  electronic: { mb_threshold_low: -18, mb_threshold_mid: -16, mb_threshold_high: -14,
                mb_ratio_low: 3.0,     mb_ratio_mid: 2.5,     mb_ratio_high: 2.0,
                stereo_width: 1.3,     analog_saturation: false },
  hiphop:     { mb_threshold_low: -16, mb_threshold_mid: -14, mb_threshold_high: -14,
                mb_ratio_low: 3.5,     mb_ratio_mid: 2.5,     mb_ratio_high: 2.0,
                stereo_width: 1.1,     analog_saturation: true, saturation_drive: 0.2 },
  rock:       { mb_threshold_low: -18, mb_threshold_mid: -16, mb_threshold_high: -12,
                mb_ratio_low: 2.5,     mb_ratio_mid: 2.0,     mb_ratio_high: 2.5,
                analog_saturation: true, saturation_drive: 0.15 },
  pop:        { mb_threshold_low: -20, mb_threshold_mid: -18, mb_threshold_high: -16,
                mb_ratio_low: 2.0,     mb_ratio_mid: 2.0,     mb_ratio_high: 1.8,
                stereo_width: 1.1 },
  classical:  { mb_threshold_low: -24, mb_threshold_mid: -22, mb_threshold_high: -22,
                mb_ratio_low: 1.5,     mb_ratio_mid: 1.5,     mb_ratio_high: 1.5,
                stereo_width: 0.95 },
  jazz:       { mb_threshold_low: -22, mb_threshold_mid: -20, mb_threshold_high: -20,
                mb_ratio_low: 2.0,     mb_ratio_mid: 1.8,     mb_ratio_high: 1.5,
                analog_saturation: true, saturation_drive: 0.1 },
  default:    { mb_threshold_low: -20, mb_threshold_mid: -18, mb_threshold_high: -16,
                mb_ratio_low: 2.5,     mb_ratio_mid: 2.0,     mb_ratio_high: 2.0 },
}

const PLATFORM_LUFS: Record<string, number> = {
  spotify: -14.0, apple_music: -16.0, youtube: -14.0, tidal: -14.0,
  amazon_music: -14.0, tiktok: -14.0, soundcloud: -14.0, vinyl: -14.0,
}

export function generateHeuristicParams(
  genre: string,
  targetPlatform: string,
): ProcessingParams {
  const overrides = GENRE_OVERRIDES[genre] ?? GENRE_OVERRIDES['default'] ?? {}
  const targetLufs = PLATFORM_LUFS[targetPlatform] ?? -14.0
  const vinyl = targetPlatform === 'vinyl'
  return {
    ...BASE_PARAMS,
    ...overrides,
    target_lufs: targetLufs,
    true_peak_ceiling: vinyl ? -3.0 : -1.0,
    vinyl_mode: vinyl,
  }
}
