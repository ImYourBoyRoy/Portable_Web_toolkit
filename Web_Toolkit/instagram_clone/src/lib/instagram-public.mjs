// ./web_toolkit/instagram_clone/src/lib/instagram-public.mjs
/**
 * Public Instagram profile fetch with browser-like headers and 429 backoff.
 */

import { parseCaption } from './caption.mjs';

const IG_WEB_APP_ID = '936619743392459';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function profileHeaders(username) {
  return {
    'User-Agent': BROWSER_UA,
    'X-IG-App-ID': IG_WEB_APP_ID,
    'X-ASBD-ID': '129477',
    'X-IG-WWW-Claim': '0',
    'X-Requested-With': 'XMLHttpRequest',
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    Referer: `https://www.instagram.com/${username}/`,
    Origin: 'https://www.instagram.com',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mediaTypeFromNode(node) {
  if (node.__typename === 'GraphSidecar') return 'CAROUSEL_ALBUM';
  if (node.__typename === 'GraphVideo' || node.is_video) return 'VIDEO';
  return 'IMAGE';
}

function captionFromNode(node) {
  return node.edge_media_to_caption?.edges?.[0]?.node?.text ?? '';
}

function permalinkFor(node) {
  const path = node.is_video ? 'reel' : 'p';
  return `https://www.instagram.com/${path}/${node.shortcode}/`;
}

function slideFromNode(node, alt) {
  const isVideo = node.is_video || node.__typename === 'GraphVideo';
  const imageUrl = isVideo
    ? node.thumbnail_src || node.display_url || ''
    : node.display_url || node.thumbnail_src || '';
  if (!imageUrl) return null;

  return {
    id: node.id,
    mediaType: isVideo ? 'VIDEO' : 'IMAGE',
    imageUrl,
    videoUrl: isVideo ? node.video_url : undefined,
    alt,
  };
}

function slidesFromNode(node, alt) {
  if (node.edge_sidecar_to_children?.edges?.length) {
    return node.edge_sidecar_to_children.edges
      .map((edge) => (edge.node ? slideFromNode(edge.node, alt) : null))
      .filter(Boolean);
  }
  const single = slideFromNode(node, alt);
  return single ? [single] : [];
}

export function normalizeNodes(nodes) {
  return nodes
    .map((node) => {
      const parsed = parseCaption(captionFromNode(node));
      const mediaType = mediaTypeFromNode(node);
      const slides = slidesFromNode(node, parsed.alt);
      if (!slides.length) return null;

      const cover = slides[0];
      return {
        id: node.id,
        shortcode: node.shortcode,
        caption: parsed.full,
        captionPreview: parsed.preview,
        hashtags: parsed.hashtags,
        mentions: parsed.mentions,
        mediaType,
        imageUrl: cover.imageUrl,
        videoUrl: cover.videoUrl,
        slides,
        permalink: permalinkFor(node),
        timestamp: node.taken_at_timestamp
          ? new Date(node.taken_at_timestamp * 1000).toISOString()
          : new Date().toISOString(),
        alt: parsed.alt,
      };
    })
    .filter(Boolean);
}

export function normalizeProfileUser(user, username) {
  return {
    username: user.username ?? username,
    fullName: user.full_name?.trim() || undefined,
    biography: user.biography?.trim() || undefined,
    profileImageUrl: user.profile_pic_url_hd || user.profile_pic_url || '',
  };
}

export async function fetchPublicProfile(username, options = {}) {
  const limit = options.limit ?? 24;
  const retries = options.retries ?? 4;
  const backoffMs = options.backoffMs ?? [5000, 15000, 45000, 90000];

  const apiSegments = ['api', 'v1', 'users', 'web_profile_info'];
  const url = new URL(`https://www.instagram.com/${apiSegments.join('/')}/`);
  url.searchParams.set('username', username);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(url.toString(), { headers: profileHeaders(username) });
    const raw = await response.text();

    if (response.status === 429 && attempt < retries) {
      const wait = backoffMs[attempt] ?? 90000;
      console.warn(
        `[instagram-clone] Rate limited (429). Waiting ${wait / 1000}s before retry ${attempt + 1}/${retries}…`,
      );
      await sleep(wait);
      continue;
    }

    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error(`Instagram returned non-JSON (${response.status}).`);
    }

    if (!response.ok) {
      throw new Error(payload.message ?? `Instagram responded with ${response.status}.`);
    }

    const user = payload?.data?.user;
    const edges = user?.edge_owner_to_timeline_media?.edges ?? [];
    const nodes = edges.map((edge) => edge.node).filter(Boolean).slice(0, limit);

    return {
      nodes,
      profile: user ? normalizeProfileUser(user, username) : { username, profileImageUrl: '' },
    };
  }

  throw new Error('Instagram rate limit persisted after retries (429).');
}

/** @deprecated use fetchPublicProfile */
export async function fetchPublicProfileNodes(username, options = {}) {
  const result = await fetchPublicProfile(username, options);
  return result.nodes;
}
