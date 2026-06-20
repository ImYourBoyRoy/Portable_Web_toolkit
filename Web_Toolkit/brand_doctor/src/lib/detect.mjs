// ./src/lib/detect.mjs
/**
 * Source-level detection helpers for branding/meta assets.
 * Broadened for recursive discovery and intent-based scoring.
 */

import fs from 'node:fs';
import path from 'node:path';

function matchAttribute(content, tagPattern, attrName) {
  const tagMatch = content.match(tagPattern);
  if (!tagMatch) return '';
  const tagContent = tagMatch[0];
  
  // Handle both standard HTML static attributes and Astro dynamic attributes
  // Standard: attr="value" or attr='value'
  // Astro: attr={value}
  const staticPattern = new RegExp(`${attrName}=["']([^"']+)["']`);
  const astroPattern = new RegExp(`${attrName}=\\{([^\\}]+)\\}`);
  
  const staticMatch = tagContent.match(staticPattern);
  if (staticMatch) return staticMatch[1].trim();
  
  const astroMatch = tagContent.match(astroPattern);
  if (astroMatch) return astroMatch[1].trim();
  
  return '';
}

/**
 * Detects SEO headers in common framework layouts.
 */
export function detectSeoHead(projectRoot) {
  const commonLayouts = [
    'src/layouts/Layout.astro',
    'src/layouts/BaseLayout.astro',
    'src/components/head/SEOHead.astro',
    'src/components/SEO.astro',
    'src/app/layout.tsx',
    'src/app/layout.jsx',
    'src/pages/_app.tsx',
    'index.html'
  ];

  let seoPath = '';
  let content = '';

  for (const p of commonLayouts) {
    const fullPath = path.join(projectRoot, p);
    if (fs.existsSync(fullPath)) {
      seoPath = fullPath;
      content = fs.readFileSync(fullPath, 'utf8');
      break;
    }
  }

  return {
    filePath: seoPath,
    exists: Boolean(content),
    hasCanonical: /rel="canonical"/.test(content),
    hasMetaDescription: /name="description"/.test(content) || /meta\s+name="description"/.test(content),
    hasThemeColor: /name="theme-color"/.test(content),
    hasOgImage: /property="og:image"/.test(content),
    hasTwitterImage: /property="twitter:image"/.test(content),
    ogImagePath: matchAttribute(content, /<meta property="og:image"[^>]+>/, 'content') || matchAttribute(content, /ogImage = "([^"]+)"/, ''), 
    faviconPath: matchAttribute(content, /<link rel="icon"[^>]+>/, 'href') || matchAttribute(content, /<link rel="shortcut icon"[^>]+>/, 'href'),
    appleTouchIconPath: matchAttribute(content, /<link rel="apple-touch-icon"[^>]+>/, 'href'),
    manifestPath: matchAttribute(content, /<link rel="manifest"[^>]+>/, 'href'),
    siteName: matchAttribute(content, /<meta property="og:site_name"[^>]+>/, 'content'),
    titleDefault: matchAttribute(content, /<title>([^<]+)<\/title>/, '') || matchAttribute(content, /title\s*=\s*"([^"]+)"/, ''),
    descriptionDefault: matchAttribute(content, /description = "([^"]+)"/, '')
  };
}

/**
 * Detects manifest.webmanifest or manifest.json.
 */
export function detectManifest(projectRoot) {
  let manifestPath = path.join(projectRoot, 'public', 'manifest.webmanifest');
  if (!fs.existsSync(manifestPath)) {
    manifestPath = path.join(projectRoot, 'public', 'manifest.json');
  }
  
  const exists = fs.existsSync(manifestPath);
  let data = null;
  if (exists) {
    try {
      data = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch (e) {}
  }

  return {
    filePath: manifestPath,
    exists,
    data,
    icons: Array.isArray(data?.icons) ? data.icons : []
  };
}

/**
 * Recursive asset discovery with scoring.
 */
export function detectBrandingCandidates(projectRoot) {
  const searchRoots = ['src/assets', 'src/assets/images', 'public/assets', 'public', 'src/images', 'assets/images'];
  const extensions = ['.svg', '.png', '.webp', '.jpg', '.jpeg'];
  const candidates = [];

  const ignorePatterns = loadIgnorePatterns(projectRoot);
  const visit = (dir, depth = 0) => {
    if (depth > 5) return; // Slightly deeper for complex assets
    if (!fs.existsSync(dir)) return;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const relPath = path.relative(projectRoot, path.join(dir, entry.name));
      const fullPath = path.join(dir, entry.name);

      // Skip ignored paths
      if (shouldIgnore(relPath, ignorePatterns)) continue;

      if (entry.isDirectory()) {
        visit(fullPath, depth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (extensions.includes(ext)) {
          candidates.push(scoreCandidate(fullPath, entry.name));
        }
      }
    }
  };

  for (const root of searchRoots) {
    const fullRoot = path.join(projectRoot, root);
    if (!shouldIgnore(root, ignorePatterns)) {
      visit(fullRoot);
    }
  }

  // Handle explicit candidates if they exist outside standard roots
  const explicit = ['src/assets/logo', 'src/assets/profile', 'src/assets/images/logo', 'src/assets/images/profile'].map(p => {
    for (const ext of extensions) {
      const full = path.join(projectRoot, p + ext);
      if (fs.existsSync(full) && !shouldIgnore(p + ext, ignorePatterns)) {
        return scoreCandidate(full, path.basename(p + ext));
      }
    }
    return null;
  }).filter(Boolean);

  return [...candidates, ...explicit].sort((a,b) => b.source_quality_score - a.source_quality_score);
}

/**
 * Loads ignore patterns from .gitignore and adds hardcoded defaults.
 */
function loadIgnorePatterns(projectRoot) {
  const patterns = ['node_modules', '.git', '.runtime', 'dist', 'build', '.astro', '.temp', 'tmp'];
  const gitignorePath = path.join(projectRoot, '.gitignore');
  
  if (fs.existsSync(gitignorePath)) {
    const lines = fs.readFileSync(gitignorePath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        patterns.push(trimmed);
      }
    }
  }
  return [...new Set(patterns)];
}

function shouldIgnore(relPath, patterns) {
  const normalized = relPath.replace(/\\/g, '/');
  return patterns.some(p => {
    const normalizedPattern = p.replace(/\\/g, '/').replace(/\/$/, '');
    // Basic glob-like matching: exact match or starts with pattern
    return normalized === normalizedPattern || 
           normalized.startsWith(normalizedPattern + '/') ||
           normalized.split('/').includes(normalizedPattern);
  });
}

function scoreCandidate(filePath, fileName) {
  const ext = path.extname(fileName).toLowerCase();
  const name = fileName.toLowerCase();
  
  let source_quality_score = 50;
  let renderability_score = 100; // Assume 100 as base
  let is_vector = ext === '.svg';
  let is_raster = !is_vector;

  // Extension scoring
  if (is_vector) source_quality_score += 40;
  if (ext === '.png') source_quality_score += 20;

  // Intent scoring
  if (name.includes('logo')) source_quality_score += 30;
  if (name.includes('profile')) source_quality_score += 25;
  if (name.includes('favicon')) source_quality_score -= 40; // favicons are usually small/output-quality
  if (name.includes('icon')) source_quality_score -= 10;
  if (name.includes('master')) source_quality_score += 20;

  // Folder intent
  if (filePath.includes('src/assets')) source_quality_score += 10;
  if (filePath.includes('.runtime')) source_quality_score -= 100; // discard runtime assets

  return {
    path: filePath,
    name: fileName,
    ext,
    is_vector,
    is_raster,
    source_quality_score: Math.min(100, Math.max(0, source_quality_score)),
    renderability_score
  };
}

/**
 * Detects background and accent colors from CSS variables.
 */
export function detectThemeColors(projectRoot) {
  const cssCandidates = [
    'src/styles/global.css',
    'src/styles/app.css',
    'src/index.css',
    'public/global.css'
  ].map((p) => path.join(projectRoot, p));
  
  let background = '#08080d';
  let accent = '#c45142';

  for (const file of cssCandidates) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      
      const bgMatch = content.match(/--bg-base:\s*([^;]+);/);
      if (bgMatch) background = bgMatch[1].trim();

      const accentMatch = content.match(/--accent:\s*([^;]+);/);
      if (accentMatch && !accentMatch[1].includes('var')) {
        accent = accentMatch[1].trim();
      } else {
        const hMatch = content.match(/--accent-h:\s*([\d.]+);/);
        const sMatch = content.match(/--accent-s:\s*([\d.]+%?);/);
        const lMatch = content.match(/--accent-l:\s*([\d.]+%?);/);
        if (hMatch && sMatch && lMatch) {
          accent = `hsl(${hMatch[1].trim()}, ${sMatch[1].trim()}, ${lMatch[1].trim()})`;
        }
      }
      break; 
    }
  }

  return { background, accent };
}
