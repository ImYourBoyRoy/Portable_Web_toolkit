// ./Web_Toolkit/instagram_clone/src/commands/clone.mjs
/**
 * Clones a public Instagram profile into local feed JSON, albums, and profile photo.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { downloadAsset } from '../../../sourcing_doctor/src/lib/shared/downloader.mjs';
import { fetchPublicProfile, normalizeNodes } from '../lib/instagram-public.mjs';

function extFromUrl(url, fallback = '.jpg') {
  try {
    const pathname = new URL(url).pathname;
    const ext = extname(pathname).toLowerCase();
    if (['.jpg', '.jpeg', '.png', '.webp', '.mp4'].includes(ext)) return ext;
  } catch {
    /* ignore */
  }
  return fallback;
}

async function downloadToLocal(remoteUrl, projectRoot, relativePath) {
  if (!remoteUrl?.startsWith('http')) return remoteUrl;
  const localAbs = join(projectRoot, 'public', relativePath.replace(/^\//, ''));
  const ok = await downloadAsset(remoteUrl, localAbs);
  return ok ? relativePath : remoteUrl;
}

async function localizeSlide(slide, projectRoot, shortcode, index) {
  const suffix = index === 0 && slide.mediaType !== 'VIDEO' ? '' : `_${index}`;
  const imageExt = extFromUrl(slide.imageUrl, '.jpg');
  const imagePath = `/assets/instagram/${shortcode}${suffix}${imageExt}`;
  const imageUrl = await downloadToLocal(slide.imageUrl, projectRoot, imagePath);

  let videoUrl = slide.videoUrl;
  if (slide.mediaType === 'VIDEO' && slide.videoUrl?.startsWith('http')) {
    const videoPath = `/assets/instagram/${shortcode}${suffix}.mp4`;
    videoUrl = await downloadToLocal(slide.videoUrl, projectRoot, videoPath);
  }

  return { ...slide, imageUrl, videoUrl };
}

export async function runClone({ projectRoot, username, limit = 24, downloadMedia = true }) {
  console.log(`[instagram-clone] Fetching @${username} (limit ${limit})…`);
  const { nodes, profile: rawProfile } = await fetchPublicProfile(username, { limit });
  const normalized = normalizeNodes(nodes);

  if (!normalized.length) {
    throw new Error('No posts returned — profile may be private or rate-limited.');
  }

  const dataDir = join(projectRoot, 'src', 'data', 'instagram');
  await mkdir(dataDir, { recursive: true });
  if (downloadMedia) {
    await mkdir(join(projectRoot, 'public', 'assets', 'instagram'), { recursive: true });
  }

  let profile = rawProfile;
  if (downloadMedia && rawProfile.profileImageUrl?.startsWith('http')) {
    const localProfile = await downloadToLocal(
      rawProfile.profileImageUrl,
      projectRoot,
      '/assets/instagram/profile.jpg',
    );
    profile = { ...rawProfile, profileImageUrl: localProfile };
    console.log(`[instagram-clone] Profile photo → ${localProfile}`);
  }

  const items = [];
  for (const post of normalized) {
    const slides = downloadMedia
      ? await Promise.all(
          post.slides.map((slide, index) => localizeSlide(slide, projectRoot, post.shortcode, index)),
        )
      : post.slides;

    const cover = slides[0];
    items.push({
      id: post.id,
      shortcode: post.shortcode,
      caption: post.caption,
      captionPreview: post.captionPreview,
      hashtags: post.hashtags,
      mentions: post.mentions,
      mediaType: post.mediaType,
      imageUrl: cover?.imageUrl ?? post.imageUrl,
      videoUrl: cover?.videoUrl,
      slides,
      permalink: post.permalink,
      timestamp: post.timestamp,
      alt: post.alt,
    });
  }

  const feed = {
    fetchedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    username,
    profile,
    items,
    source: 'static',
  };

  const feedPath = join(dataDir, 'feed.json');
  await writeFile(feedPath, `${JSON.stringify(feed, null, 2)}\n`, 'utf8');

  const slideCount = items.reduce((sum, post) => sum + post.slides.length, 0);
  console.log(`[instagram-clone] Wrote ${items.length} posts (${slideCount} media files) → ${feedPath}`);

  return { feedPath, count: items.length, slideCount };
}
