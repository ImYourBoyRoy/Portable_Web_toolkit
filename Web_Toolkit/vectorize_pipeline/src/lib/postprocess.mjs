// ./Web_Toolkit/vectorize_pipeline/src/lib/postprocess.mjs
/**
 * Light SVG cleanup for web use: viewBox, currentColor, drop generator noise.
 */

import { readFileSync, writeFileSync } from 'node:fs';

export function postprocessSvg(filePath, {
  currentColor = false,
  fill = null,
  pretty = false,
} = {}) {
  let svg = readFileSync(filePath, 'utf8');

  // Drop generator comment
  svg = svg.replace(/<!--[\s\S]*?-->\n?/g, '');

  // Ensure viewBox from width/height when missing
  if (!/viewBox=/.test(svg)) {
    const wh = svg.match(/<svg[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"/);
    const hw = svg.match(/<svg[^>]*\bheight="([\d.]+)"[^>]*\bwidth="([\d.]+)"/);
    const width = wh?.[1] || hw?.[2];
    const height = wh?.[2] || hw?.[1];
    if (width && height) {
      svg = svg.replace(/<svg\b/, `<svg viewBox="0 0 ${width} ${height}"`);
    }
  }

  // Add role/aria-friendly defaults for inline use
  if (!/\brole=/.test(svg)) {
    svg = svg.replace(/<svg\b/, '<svg role="img"');
  }

  if (currentColor) {
    svg = svg.replace(/\bfill="#[0-9A-Fa-f]{3,8}"/g, 'fill="currentColor"');
    svg = svg.replace(/\bstroke="#[0-9A-Fa-f]{3,8}"/g, 'stroke="currentColor"');
  } else if (fill) {
    const safe = String(fill).replace(/"/g, '');
    svg = svg.replace(/\bfill="#[0-9A-Fa-f]{3,8}"/g, `fill="${safe}"`);
  }

  if (pretty) {
    svg = svg.replace(/><path/g, '>\n  <path').replace(/<\/svg>/, '\n</svg>\n');
  }

  writeFileSync(filePath, svg, 'utf8');
  return svg;
}

export function summarizeSvg(svgText) {
  const paths = (svgText.match(/<path\b/g) || []).length;
  const fills = [...svgText.matchAll(/\bfill="([^"]+)"/g)].map((m) => m[1]);
  const uniqueFills = [...new Set(fills)];
  return { paths, uniqueFills };
}
