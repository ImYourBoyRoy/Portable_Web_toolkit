// ./Web_Toolkit/vectorize_pipeline/src/lib/presets.mjs
/**
 * Named quality presets for VTracer.
 * `logo` is tuned for high-contrast wordmarks / icons (B&W silhouettes).
 */

export const PRESETS = {
  logo: {
    description: 'High-contrast logos & wordmarks (recommended)',
    colormode: 'bw',
    mode: 'spline',
    filter_speckle: '4',
    corner_threshold: '30',
    segment_length: '3.5',
    splice_threshold: '45',
    path_precision: '2',
  },
  logo_smooth: {
    description: 'Low-res/aliased masters — upscale+blur prep, smoother spline fit',
    colormode: 'bw',
    mode: 'spline',
    filter_speckle: '12',
    corner_threshold: '70',
    segment_length: '10',
    splice_threshold: '55',
    path_precision: '3',
    prepScale: 4,
    prepBlur: 1.6,
  },
  logo_polygon: {
    description: 'Same as logo but polygon fits — smaller files, slightly sharper corners',
    colormode: 'bw',
    mode: 'polygon',
    filter_speckle: '4',
    corner_threshold: '40',
    path_precision: '2',
  },
  poster: {
    description: 'Limited-color posters / flat illustrations',
    vtracerPreset: 'poster',
  },
  photo: {
    description: 'Photographic / gradient-heavy art (heavier SVG)',
    vtracerPreset: 'photo',
  },
};

export function resolvePreset(name = 'logo') {
  const key = String(name || 'logo').toLowerCase().replace(/-/g, '_');
  const preset = PRESETS[key];
  if (!preset) {
    const known = Object.keys(PRESETS).join(', ');
    throw new Error(`Unknown preset "${name}". Known: ${known}`);
  }
  return { name: key, ...preset };
}
