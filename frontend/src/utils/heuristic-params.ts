import type { ProcessingParams } from '../types/dsp'

/**
 * RAIN Heuristic Fallback — Canonical ProcessingParams per CLAUDE.md
 *
 * When RAIN_NORMALIZATION_VALIDATED=false, this module produces a deterministic
 * ProcessingParams from (genre, platform) pairs.
 *
 * AUTHORITATIVE SOURCE: backend/app/services/heuristic_params.py (PART-4 Task 4.2)
 * Values MUST be identical for the same (genre, platform) pair.
 * If the backend values change, update here to match.
 *
 * Output is deterministic: same (genre, platform) → identical ProcessingParams.
 */

/**
 * Canonical ProcessingParams with all defaults per CLAUDE.md.
 * Must match backend BASE_PARAMS in ml/rainnet/heuristics.py exactly.
 */
function defaultParams(): ProcessingParams {
  return {
    // Loudness target
    target_lufs: -14.0,
    true_peak_ceiling: -1.0,

    // Multiband dynamics (3-band: low/mid/high) — match backend BASE_PARAMS
    mb_threshold_low: -20.0,
    mb_threshold_mid: -18.0,
    mb_threshold_high: -16.0,
    mb_ratio_low: 2.5,
    mb_ratio_mid: 2.0,
    mb_ratio_high: 2.0,
    mb_attack_low: 10.0,
    mb_attack_mid: 5.0,
    mb_attack_high: 2.0,
    mb_release_low: 150.0,
    mb_release_mid: 80.0,
    mb_release_high: 40.0,

    // EQ (8-band parametric)
    eq_gains: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],

    // Analog saturation
    analog_saturation: false,
    saturation_drive: 0.0,
    saturation_mode: 'tape',

    // Mid/Side processing
    ms_enabled: false,
    mid_gain: 0.0,
    side_gain: 0.0,
    stereo_width: 1.0,

    // SAIL (Stem-Aware Intelligent Limiting)
    sail_enabled: false,
    sail_stem_gains: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0], // float[6] NOT float[5]

    // Vinyl mode
    vinyl_mode: false,

    // Macro controls — match backend BASE_PARAMS
    macro_brighten: 5.0,
    macro_glue: 5.0,
    macro_width: 5.0,
    macro_punch: 5.0,
    macro_warmth: 5.0,
    macro_space: 5.0,
    macro_repair: 0.0,
  }
}

/**
 * Genre-specific overrides. AUTHORITATIVE SOURCE: ml/rainnet/heuristics.py GENRE_PRESETS.
 * Values here MUST be identical to the backend for the same genre.
 * The backend uses a preset merge approach — these overrides produce the same final result.
 */
const GENRE_OVERRIDES: Record<string, Partial<ProcessingParams>> = {
  electronic: {
    mb_threshold_low: -18.0, mb_threshold_mid: -16.0, mb_threshold_high: -14.0,
    mb_ratio_low: 3.0, mb_ratio_mid: 2.5, mb_ratio_high: 2.0,
    stereo_width: 1.3, analog_saturation: false,
    macro_brighten: 5.0, macro_glue: 6.0, macro_width: 7.0,
    macro_punch: 5.0, macro_warmth: 3.0, macro_space: 6.0, macro_repair: 0.0,
  },
  hiphop: {
    mb_threshold_low: -16.0, mb_threshold_mid: -14.0, mb_threshold_high: -14.0,
    mb_ratio_low: 3.5, mb_ratio_mid: 2.5, mb_ratio_high: 2.0,
    stereo_width: 1.1, analog_saturation: true, saturation_drive: 0.2,
    macro_brighten: 4.0, macro_glue: 7.0, macro_width: 4.0,
    macro_punch: 8.0, macro_warmth: 5.0, macro_space: 3.0, macro_repair: 0.0,
  },
  rock: {
    mb_threshold_low: -18.0, mb_threshold_mid: -16.0, mb_threshold_high: -12.0,
    mb_ratio_low: 2.5, mb_ratio_mid: 2.0, mb_ratio_high: 2.5,
    analog_saturation: true, saturation_drive: 0.15,
    macro_brighten: 5.0, macro_glue: 5.0, macro_width: 5.0,
    macro_punch: 7.0, macro_warmth: 6.0, macro_space: 4.0, macro_repair: 0.0,
  },
  pop: {
    mb_threshold_low: -20.0, mb_threshold_mid: -18.0, mb_threshold_high: -16.0,
    mb_ratio_low: 2.0, mb_ratio_mid: 2.0, mb_ratio_high: 1.8,
    stereo_width: 1.1,
    macro_brighten: 6.0, macro_glue: 5.0, macro_width: 5.0,
    macro_punch: 5.0, macro_warmth: 4.0, macro_space: 5.0, macro_repair: 0.0,
  },
  classical: {
    mb_threshold_low: -24.0, mb_threshold_mid: -22.0, mb_threshold_high: -22.0,
    mb_ratio_low: 1.5, mb_ratio_mid: 1.5, mb_ratio_high: 1.5,
    stereo_width: 0.95,
    macro_brighten: 3.0, macro_glue: 2.0, macro_width: 4.0,
    macro_punch: 2.0, macro_warmth: 3.0, macro_space: 7.0, macro_repair: 0.0,
  },
  jazz: {
    mb_threshold_low: -22.0, mb_threshold_mid: -20.0, mb_threshold_high: -20.0,
    mb_ratio_low: 2.0, mb_ratio_mid: 1.8, mb_ratio_high: 1.5,
    analog_saturation: true, saturation_drive: 0.1,
    macro_brighten: 3.0, macro_glue: 4.0, macro_width: 4.0,
    macro_punch: 3.0, macro_warmth: 6.0, macro_space: 6.0, macro_repair: 0.0,
  },
  default: {
    // Matches backend default preset exactly
    mb_threshold_low: -20.0, mb_threshold_mid: -18.0, mb_threshold_high: -16.0,
    mb_ratio_low: 2.5, mb_ratio_mid: 2.0, mb_ratio_high: 2.0,
    macro_brighten: 5.0, macro_glue: 5.0, macro_width: 5.0,
    macro_punch: 5.0, macro_warmth: 5.0, macro_space: 5.0, macro_repair: 0.0,
  },
}

/**
 * Platform loudness targets. Must match backend/app/services/platform_targets.py exactly.
 * Maps platform slug to { target_lufs, true_peak_ceiling }.
 *
 * Falls back to spotify defaults (same as backend get_platform_target fallback).
 */
const PLATFORM_TARGETS: Record<string, { target_lufs: number; true_peak_ceiling: number }> = {
  // Tier 1 — Major streaming
  spotify: { target_lufs: -14.0, true_peak_ceiling: -1.0 },
  spotify_loud: { target_lufs: -11.0, true_peak_ceiling: -1.0 },
  apple_music: { target_lufs: -16.0, true_peak_ceiling: -1.0 },
  apple_music_spatial: { target_lufs: -16.0, true_peak_ceiling: -1.0 },
  dolby_atmos: { target_lufs: -18.0, true_peak_ceiling: -1.0 },
  youtube: { target_lufs: -14.0, true_peak_ceiling: -1.0 },
  youtube_music: { target_lufs: -14.0, true_peak_ceiling: -1.0 },
  tidal: { target_lufs: -14.0, true_peak_ceiling: -1.0 },
  amazon_music: { target_lufs: -14.0, true_peak_ceiling: -2.0 },
  amazon_ultra_hd: { target_lufs: -14.0, true_peak_ceiling: -1.0 },

  // Tier 2 — Secondary streaming
  deezer: { target_lufs: -15.0, true_peak_ceiling: -1.0 },
  soundcloud: { target_lufs: -14.0, true_peak_ceiling: -1.0 },
  pandora: { target_lufs: -14.0, true_peak_ceiling: -1.0 },
  tiktok: { target_lufs: -14.0, true_peak_ceiling: -1.0 },
  instagram: { target_lufs: -14.0, true_peak_ceiling: -1.0 },

  // Tier 3 — Physical & broadcast
  cd: { target_lufs: -9.0, true_peak_ceiling: -0.3 },
  vinyl: { target_lufs: -14.0, true_peak_ceiling: -1.0 },
  broadcast_ebu: { target_lufs: -23.0, true_peak_ceiling: -1.0 },
  broadcast_atsc: { target_lufs: -24.0, true_peak_ceiling: -2.0 },

  // Tier 4 — Specialty
  audiobook_acx: { target_lufs: -20.0, true_peak_ceiling: -3.0 },
  podcast: { target_lufs: -16.0, true_peak_ceiling: -1.0 },
  game_audio: { target_lufs: -18.0, true_peak_ceiling: -1.0 },

  // Tier 5 — Niche/regional
  qobuz: { target_lufs: -14.0, true_peak_ceiling: -1.0 },
  anghami: { target_lufs: -14.0, true_peak_ceiling: -1.0 },
  jiosaavn: { target_lufs: -14.0, true_peak_ceiling: -1.0 },
  boomplay: { target_lufs: -14.0, true_peak_ceiling: -1.0 },
  netease: { target_lufs: -14.0, true_peak_ceiling: -1.0 },
}

/** Fallback platform target (spotify) — matches backend get_platform_target fallback. */
const DEFAULT_PLATFORM = PLATFORM_TARGETS.spotify

/**
 * Generate a deterministic ProcessingParams from (genre, platform).
 *
 * This is the MANDATORY fallback when RAIN_NORMALIZATION_VALIDATED=false.
 * Output is deterministic: same inputs always produce identical output.
 *
 * Logic order (matches backend generate_heuristic_params exactly):
 *   1. Start with default params
 *   2. Apply platform target (target_lufs + true_peak_ceiling)
 *   3. Apply vinyl override if platform === 'vinyl'
 *   4. Apply genre overrides (can overwrite any field)
 */
export function generateHeuristicParams(
  genre: string,
  platform: string,
): ProcessingParams {
  const params = defaultParams()

  // Apply platform target (matches backend get_heuristic_params logic)
  const target = PLATFORM_TARGETS[platform] ?? DEFAULT_PLATFORM
  params.target_lufs = target.target_lufs

  // Vinyl mode override — matches backend: vinyl gets -3.0 dBTP
  if (platform === 'vinyl') {
    params.vinyl_mode = true
    params.true_peak_ceiling = -3.0
  } else {
    params.true_peak_ceiling = target.true_peak_ceiling
  }

  // Apply genre overrides
  const overrides = GENRE_OVERRIDES[genre] ?? GENRE_OVERRIDES.default
  Object.assign(params, overrides)

  return params
}
