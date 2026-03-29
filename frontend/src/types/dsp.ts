/**
 * Canonical ProcessingParams — must match CLAUDE.md §Canonical ProcessingParams Schema exactly.
 * No optional fields. No extra fields. Field names are immutable.
 */
export interface ProcessingParams {
  // Loudness target
  target_lufs: number
  true_peak_ceiling: number

  // Multiband dynamics
  mb_threshold_low: number
  mb_threshold_mid: number
  mb_threshold_high: number
  mb_ratio_low: number
  mb_ratio_mid: number
  mb_ratio_high: number
  mb_attack_low: number
  mb_attack_mid: number
  mb_attack_high: number
  mb_release_low: number
  mb_release_mid: number
  mb_release_high: number

  // EQ (8-band)
  eq_gains: [number, number, number, number, number, number, number, number]

  // Analog saturation
  analog_saturation: boolean
  saturation_drive: number
  saturation_mode: 'tape' | 'tube' | 'transistor'

  // Mid/Side
  ms_enabled: boolean
  mid_gain: number
  side_gain: number
  stereo_width: number

  // SAIL
  sail_enabled: boolean
  sail_stem_gains: [number, number, number, number, number, number]

  // Vinyl
  vinyl_mode: boolean
}
