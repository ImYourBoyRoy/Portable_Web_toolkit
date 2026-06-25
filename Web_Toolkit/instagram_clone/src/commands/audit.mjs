// ./Web_Toolkit/instagram_clone/src/commands/audit.mjs
/**
 * Verify cloned Instagram feed JSON and local media assets.
 */

import fs from 'node:fs';
import path from 'node:path';

function assetExists(projectRoot, urlOrPath) {
  const value = String(urlOrPath || '').trim();
  if (!value) return false;
  if (value.startsWith('http')) return true;
  const relative = value.replace(/^\//, '');
  return fs.existsSync(path.join(projectRoot, 'public', relative));
}

export function runAudit({ projectRoot }) {
  const feedPath = path.join(projectRoot, 'src', 'data', 'instagram', 'feed.json');
  const issues = [];

  if (!fs.existsSync(feedPath)) {
    throw new Error(`Missing feed JSON: ${feedPath}\nRun: instagram-clone clone --project-root ${projectRoot}`);
  }

  const feed = JSON.parse(fs.readFileSync(feedPath, 'utf8'));
  const items = Array.isArray(feed.items) ? feed.items : [];

  if (!items.length) issues.push('feed.json has no items');
  if (!feed.username) issues.push('feed.json missing username');
  if (!feed.profile?.profileImageUrl) issues.push('feed.json missing profile.profileImageUrl');

  if (feed.profile?.profileImageUrl && !assetExists(projectRoot, feed.profile.profileImageUrl)) {
    issues.push(`Missing profile asset: ${feed.profile.profileImageUrl}`);
  }

  let slideCount = 0;
  let missingSlides = 0;

  for (const post of items) {
    const slides = Array.isArray(post.slides) && post.slides.length ? post.slides : [post];
    slideCount += slides.length;

    for (const slide of slides) {
      const media = slide.imageUrl || slide.videoUrl;
      if (media && !assetExists(projectRoot, media)) missingSlides += 1;
    }
  }

  if (missingSlides) {
    issues.push(`${missingSlides} slide media file(s) missing under public/assets/instagram/`);
  }

  const summary = {
    ok: issues.length === 0,
    feedPath,
    username: feed.username || '',
    fetchedAt: feed.fetchedAt || '',
    posts: items.length,
    slides: slideCount,
    issues,
  };

  console.log('[instagram-clone] Audit summary');
  console.log(`  feed: ${feedPath}`);
  console.log(`  username: ${summary.username || '(unknown)'}`);
  console.log(`  posts: ${summary.posts}, slides: ${summary.slides}`);
  console.log(`  status: ${summary.ok ? 'PASS' : 'FAIL'}`);

  if (issues.length) {
    for (const issue of issues) console.log(`  - ${issue}`);
    process.exitCode = 1;
  }

  return summary;
}
