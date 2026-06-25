// ./web_toolkit/instagram_clone/src/lib/caption.mjs
/**
 * Parses Instagram caption text into display fields and tag lists.
 */

export function parseCaption(raw, fallback = 'Artwork') {
  const full = (raw ?? '').trim() || fallback;
  const preview = full.length <= 140 ? full : `${full.slice(0, 137)}…`;
  const hashtags = [...new Set(full.match(/#[\p{L}\p{N}_]+/gu) ?? [])];
  const mentions = [...new Set(full.match(/@[\w.]+/g) ?? [])];
  const alt = full.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/@[\w.]+/g, '').trim() || fallback;
  return { full, preview, hashtags, mentions, alt };
}
