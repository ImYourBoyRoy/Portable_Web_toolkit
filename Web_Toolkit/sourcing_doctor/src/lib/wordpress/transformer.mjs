// Web_Toolkit/sourcing_doctor/src/lib/wordpress/transformer.mjs
/**
 * Transforms raw WP API data into the specific manifest formats requested.
 */

export function transformToContentManifest(pages, posts) {
  const content = [...pages, ...posts].map((item) => {
    return {
      id: item.id,
      slug: item.slug,
      status: item.status,
      type: item.type,
      title: item.title.rendered,
      content: item.content.rendered,
      excerpt: item.excerpt?.rendered || '',
      date: item.date,
      modified: item.modified,
      link: item.link,
      author: item.author,
      featured_media: item.featured_media,
      // Metadata/Provenance
      provenance: {
        source: 'wordpress',
        original_url: item.link
      }
    };
  });
  return content;
}

export function generateUrlMap(pages, posts, _baseUrl) {
  const urlMap = [];
  [...pages, ...posts].forEach((item) => {
    const originalUrl = item.link;
    const newPath = `/${item.slug}`;
    urlMap.push({
      original_url: originalUrl,
      new_path: newPath,
      status_code: 301
    });
  });
  return urlMap;
}

export function generateImageManifest(media) {
  return media.map((item) => {
    return {
      id: item.id,
      title: item.title.rendered,
      slug: item.slug,
      source_url: item.source_url,
      mime_type: item.mime_type,
      alt_text: item.alt_text,
      width: item.media_details?.width,
      height: item.media_details?.height,
      local_path: `public/assets/sourced/${item.slug}.${item.source_url.split('.').pop()}`
    };
  });
}
