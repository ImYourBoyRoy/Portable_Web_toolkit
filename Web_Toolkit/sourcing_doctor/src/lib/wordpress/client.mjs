// Web_Toolkit/sourcing_doctor/src/lib/wordpress/client.mjs
/**
 * Professional WordPress REST API client for structured sourcing.
 */

import { assertPublicHttpUrl } from '../../../../shared/lib/url-safety.mjs';

export async function fetchWordPressContent(baseUrl, endpoint, queryParams = {}) {
  const origin = assertPublicHttpUrl(baseUrl, 'WordPress base URL').origin;
  const url = new URL(`${origin}/wp-json/wp/v2/${endpoint}`);
  Object.keys(queryParams).forEach(key => url.searchParams.append(key, queryParams[key]));
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`WordPress API error [${response.status}]: ${response.statusText}`);
  }
  
  // Handle pagination if needed (compact version for now)
  const data = await response.json();
  const totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1');
  
  return { data, totalPages };
}

export async function fetchAllWordPressPages(baseUrl) {
  const allPages = [];
  let page = 1;
  let total = 1;

  do {
    const { data, totalPages } = await fetchWordPressContent(baseUrl, 'pages', {
      per_page: 50,
      page: page,
      _embed: 1
    });
    allPages.push(...data);
    total = totalPages;
    page++;
  } while (page <= total);

  return allPages;
}

export async function fetchAllWordPressPosts(baseUrl) {
  const allPosts = [];
  let page = 1;
  let total = 1;

  do {
    const { data, totalPages } = await fetchWordPressContent(baseUrl, 'posts', {
      per_page: 50,
      page: page,
      _embed: 1
    });
    allPosts.push(...data);
    total = totalPages;
    page++;
  } while (page <= total);

  return allPosts;
}

export async function fetchAllWordPressMedia(baseUrl) {
  const allMedia = [];
  let page = 1;
  let total = 1;

  do {
    const { data, totalPages } = await fetchWordPressContent(baseUrl, 'media', {
      per_page: 50,
      page: page
    });
    allMedia.push(...data);
    total = totalPages;
    page++;
  } while (page <= total);

  return allMedia;
}
