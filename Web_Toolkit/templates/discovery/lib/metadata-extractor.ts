// ./src/lib/metadata-extractor.ts
/**
 * Scrapes Astro/Markdown source strings for sitemap, llms, and discovery metadata.
 * Copy into client sites and extend with project-specific frontmatter or layout props.
 */

export interface PageMetadata {
  title: string;
  description: string;
  images: Array<{ src: string; alt: string }>;
  links: string[];
  headings: string[];
  lastmod: string;
}

export function extractMetadataFromContent(
  content: string,
  filename: string = 'Untitled',
  fallbackLastmod: string = new Date().toISOString().split('T')[0]
): PageMetadata {
  let title = '';
  const titleMatch = content.match(/<Layout[^>]+title=["']([^"']+)["']/);
  if (titleMatch) {
    title = titleMatch[1];
  } else {
    const fmTitleMatch = content.match(/^title:\s*["']?([^"'\n]+)["']?$/m);
    title = fmTitleMatch ? fmTitleMatch[1] : filename.split('/').pop()?.split('.')[0] || 'Untitled';
    if (title === 'index') title = 'Home';
  }

  let description = '';
  const descMatch = content.match(/<Layout[^>]+description=["']([^"']+)["']/);
  if (descMatch) {
    description = descMatch[1];
  } else {
    const fmDescMatch = content.match(/^description:\s*["']?([^"'\n]+)["']?$/m);
    description = fmDescMatch ? fmDescMatch[1] : 'Summary for this page.';
  }

  const images: Array<{ src: string; alt: string }> = [];
  const imageRegex = /<(?:Image|img)[^>]+src={?["']?([^"'} ]+)["']?}?[^>]+alt=["']([^"']+)["']/g;
  let imgMatch;
  while ((imgMatch = imageRegex.exec(content)) !== null) {
    images.push({ src: imgMatch[1], alt: imgMatch[2] });
  }

  const links: string[] = [];
  const linkRegex = /<a[^>]+href=["']([^"']+)["']/g;
  let linkMatch;
  while ((linkMatch = linkRegex.exec(content)) !== null) {
    const href = linkMatch[1];
    if (href.startsWith('http') || (href.startsWith('/') && !href.startsWith('//'))) {
      links.push(href);
    }
  }

  const headings: string[] = [];
  const headingRegex = /<h([23])[^>]*>([\s\S]*?)<\/h\1>/g;
  let headMatch;
  while ((headMatch = headingRegex.exec(content)) !== null) {
    const text = headMatch[2].replace(/<[^>]*>/g, '').replace(/\{[^}]+\}/g, '').trim();
    if (text && text.length < 100) headings.push(text);
  }

  const fmDateMatch = content.match(/^(?:lastmod|date):\s*["']?([\d-]{10})["']?$/m);
  const lastmod = fmDateMatch ? fmDateMatch[1] : fallbackLastmod;

  return {
    title,
    description,
    images: Array.from(new Set(images.map((entry) => JSON.stringify(entry)))).map((entry) => JSON.parse(entry)),
    links: Array.from(new Set(links)),
    headings: Array.from(new Set(headings)),
    lastmod
  };
}
