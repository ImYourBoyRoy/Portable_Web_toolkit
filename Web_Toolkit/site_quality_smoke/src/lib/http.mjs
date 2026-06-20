// ./Web_Toolkit/site_quality_smoke/src/lib/http.mjs
/**
 * Raw HTTP helpers for quality smoke checks with safe decompression.
 */

import http from 'node:http';
import https from 'node:https';
import zlib from 'node:zlib';
import { performance } from 'node:perf_hooks';

function decodeBody(buffer, headers = {}) {
  const encoding = String(headers['content-encoding'] || '').trim().toLowerCase();
  if (!buffer?.length) return '';
  try {
    if (encoding.includes('br')) return zlib.brotliDecompressSync(buffer).toString('utf8');
    if (encoding.includes('gzip')) return zlib.gunzipSync(buffer).toString('utf8');
    if (encoding.includes('deflate')) return zlib.inflateSync(buffer).toString('utf8');
  } catch {
    return buffer.toString('utf8');
  }
  return buffer.toString('utf8');
}

function requestImpl(url, options = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const startedAt = performance.now();
    const request = transport.request(parsed, {
      method: options.method || 'GET',
      headers: {
        'accept-encoding': 'gzip, deflate, br',
        'user-agent': 'portable-site-quality-smoke/1.0',
        ...(options.headers || {})
      },
      timeout: Number(options.timeoutMs || 15000)
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', async () => {
        const durationMs = Math.round(performance.now() - startedAt);
        const buffer = Buffer.concat(chunks);
        const result = {
          url,
          status: response.statusCode || 0,
          headers: response.headers,
          body: decodeBody(buffer, response.headers),
          durationMs,
          redirectChain: []
        };
        const location = String(response.headers.location || '').trim();
        if (location && options.followRedirects !== false && redirectCount < 5 && result.status >= 300 && result.status < 400) {
          try {
            const nextUrl = new URL(location, url).toString();
            const followed = await requestImpl(nextUrl, options, redirectCount + 1);
            resolve({
              ...followed,
              redirectChain: [{ status: result.status, location: nextUrl }, ...(followed.redirectChain || [])]
            });
            return;
          } catch (error) {
            reject(error);
            return;
          }
        }
        resolve(result);
      });
    });
    request.on('timeout', () => request.destroy(new Error(`Request timed out after ${options.timeoutMs || 15000}ms`)));
    request.on('error', reject);
    request.end();
  });
}

export async function requestUrl(url, options = {}) {
  try {
    return await requestImpl(url, options);
  } catch (error) {
    return {
      url,
      status: 0,
      headers: {},
      body: '',
      durationMs: 0,
      error: error instanceof Error ? error.message : String(error),
      redirectChain: []
    };
  }
}

