// Web_Toolkit/sourcing_doctor/src/lib/shared/downloader.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { assertPublicHttpUrl } from '../../../../shared/lib/url-safety.mjs';

/**
 * Resumable/Safe downloader for project assets.
 */
export async function downloadAsset(url, targetPath) {
  try {
    const dir = dirname(targetPath);
    await mkdir(dir, { recursive: true });
    const safeUrl = assertPublicHttpUrl(url, 'asset URL').href;
    const response = await fetch(safeUrl);
    if (!response.ok) {
      console.warn(`[WARN] Failed to download asset: ${url} (${response.status})`);
      return false;
    }
    
    const buffer = await response.arrayBuffer();
    await writeFile(targetPath, Buffer.from(buffer));
    return true;
  } catch (error) {
    console.error(`[ERROR] Asset download failed: ${url}`, error);
    return false;
  }
}

export async function downloadAssetBatch(assets, projectRoot) {
  console.log(`[INFO] Starting batch download of ${assets.length} assets...`);
  const results = { success: 0, failed: 0 };
  
  for (const asset of assets) {
    // asset: { url, localPath }
    const fullPath = join(projectRoot, asset.localPath);
    const success = await downloadAsset(asset.url, fullPath);
    if (success) results.success++;
    else results.failed++;
  }
  
  return results;
}
