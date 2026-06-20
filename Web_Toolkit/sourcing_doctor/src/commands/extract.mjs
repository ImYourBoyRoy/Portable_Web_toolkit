// Web_Toolkit/sourcing_doctor/src/commands/extract.mjs
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchAllWordPressPages, fetchAllWordPressPosts, fetchAllWordPressMedia } from '../lib/wordpress/client.mjs';
import { transformToContentManifest, generateUrlMap, generateImageManifest } from '../lib/wordpress/transformer.mjs';
import { downloadAssetBatch } from '../lib/shared/downloader.mjs';

/**
 * Executes the full extraction workflow for WordPress.
 */
export async function runExtract(profile, projectRoot) {
  const { url, includeMedia } = profile.sourcing;
  console.log(`[INFO] Starting extraction for ${profile.siteId} from ${url}`);

  // 1. Fetch
  console.log(`[INFO] Fetching Pages...`);
  const pages = await fetchAllWordPressPages(url);
  console.log(`[INFO] Fetching Posts...`);
  const posts = await fetchAllWordPressPosts(url);
  
  let media = [];
  if (includeMedia) {
    console.log(`[INFO] Fetching Media...`);
    media = await fetchAllWordPressMedia(url);
  }

  // 2. Transform
  console.log(`[INFO] Transforming data...`);
  const contentManifest = transformToContentManifest(pages, posts);
  const urlMap = generateUrlMap(pages, posts, url);
  const imageManifest = generateImageManifest(media);

  // 3. Write Artifacts
  console.log(`[INFO] Writing manifests...`);
  await writeFile(join(projectRoot, 'ContentManifest.json'), JSON.stringify(contentManifest, null, 2));
  
  // URL Map as CSV
  const csvHeaders = 'original_url,new_path,status_code\n';
  const csvContent = urlMap.map(r => `"${r.original_url}","${r.new_path}",${r.status_code}`).join('\n');
  await writeFile(join(projectRoot, 'URLMap.csv'), csvHeaders + csvContent);
  
  // Image Manifest as CSV
  const imgHeaders = 'source_url,local_path,alt_text\n';
  const imgContent = imageManifest.map(r => `"${r.source_url}","${r.local_path}","${r.alt_text}"`).join('\n');
  await writeFile(join(projectRoot, 'ImageManifest.csv'), imgHeaders + imgContent);

  // 4. Media Download
  if (includeMedia && imageManifest.length > 0) {
    console.log(`[INFO] Starting media download...`);
    const assetsToDownload = imageManifest.map(img => ({
      url: img.source_url,
      localPath: img.local_path
    }));
    const downloadResults = await downloadAssetBatch(assetsToDownload, projectRoot);
    console.log(`[INFO] Media download complete: ${downloadResults.success} success, ${downloadResults.failed} failed.`);
  }

  console.log(`[SUCCESS] Extraction complete for ${profile.siteId}.`);
}
