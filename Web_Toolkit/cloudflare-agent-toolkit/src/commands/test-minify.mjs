// ./Web_Toolkit/cloudflare-agent-toolkit/src/commands/test-minify.mjs
/**
 * Minification smoke-test command.
 *
 * Fetches live HTML pages and their linked CSS/JS assets, then applies
 * whitespace heuristics to determine whether each resource is minified.
 * Reports per-asset results and writes a JSON report.
 *
 * Usage: cf-agent test minify --zone <name> [--hosts a,b] [--output-dir <dir>]
 * Inputs: zone name (flag or CF_ZONE_NAME env), hosts CSV, output directory.
 * Outputs: JSON report in CF_OUTPUT_DIR, console summary.
 * Notes: Read-only operation — no zone settings are changed. Requires network
 *        access to target hosts. Conservative heuristic: flags "likely not
 *        minified" rather than guaranteeing minification quality.
 */

import fs from 'node:fs';
import path from 'node:path';
import { mergedEnv, envValue } from '../lib/env.mjs';
import { DEFAULT_OUTPUT_DIR } from '../lib/paths.mjs';
import { prettyJson, utcStamp } from '../lib/format.mjs';

const DEPRECATION_NOTICE =
    '⚠ Cloudflare Auto Minify was deprecated Aug 2024. ' +
    'Best practice: minify at build time (Vite, esbuild, Terser, CSSNano) before deploying.';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseHosts(hostsCsv, zoneName) {
    const trimmed = String(hostsCsv || '').trim();
    if (!trimmed) {
        return [`https://${zoneName}`];
    }
    return trimmed
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) =>
            entry.startsWith('http://') || entry.startsWith('https://') ? entry : `https://${entry}`
        );
}

/**
 * Heuristic: estimate whether a text resource is minified.
 *
 * Checks:
 *  1. Average line length — minified files pack into very long lines.
 *  2. Blank-line ratio — minified files have essentially zero blank lines.
 *  3. Indentation ratio — minified files almost never start lines with spaces/tabs.
 *
 * Returns { minified: boolean, avgLineLen, blankRatio, indentRatio, lineCount }.
 */
function analyzeMinification(body) {
    const lines = body.split('\n');
    const lineCount = lines.length;
    if (lineCount === 0) {
        return { minified: true, avgLineLen: 0, blankRatio: 0, indentRatio: 0, lineCount: 0 };
    }

    const totalChars = lines.reduce((sum, line) => sum + line.length, 0);
    const avgLineLen = Math.round(totalChars / lineCount);
    const blankLines = lines.filter((line) => line.trim().length === 0).length;
    const blankRatio = +(blankLines / lineCount).toFixed(3);
    const indentedLines = lines.filter((line) => /^[ \t]{2,}/.test(line)).length;
    const indentRatio = +(indentedLines / lineCount).toFixed(3);

    // Conservative thresholds — flag "likely not minified" only when indicators
    // are clearly above limits typical for minified output.
    const minified = avgLineLen > 200 || (blankRatio < 0.05 && indentRatio < 0.05);

    return { minified, avgLineLen, blankRatio, indentRatio, lineCount };
}

/**
 * Extract the first CSS <link> and first JS <script src="..."> URLs from HTML.
 */
function extractLinkedAssets(html, baseUrl) {
    const assets = [];

    const cssMatch = html.match(/<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["']/i);
    if (cssMatch?.[1]) {
        assets.push({ type: 'css', url: new URL(cssMatch[1], baseUrl).href });
    }

    const jsMatch = html.match(/<script[^>]+src=["']([^"']+)["']/i);
    if (jsMatch?.[1]) {
        assets.push({ type: 'js', url: new URL(jsMatch[1], baseUrl).href });
    }

    return assets;
}

/**
 * Fetch a URL and return { url, type, status, body, sizeBytes, cfMinify, error }.
 */
async function fetchAsset(url, type) {
    try {
        const response = await fetch(url, {
            headers: { 'User-Agent': 'cf-agent/minify-test' },
            redirect: 'follow'
        });
        const body = await response.text();
        return {
            url,
            type,
            status: response.status,
            sizeBytes: Buffer.byteLength(body, 'utf8'),
            contentType: response.headers.get('content-type') || null,
            cfMinify: response.headers.get('cf-minify') || null,
            body
        };
    } catch (error) {
        return {
            url,
            type,
            status: null,
            sizeBytes: 0,
            contentType: null,
            cfMinify: null,
            body: null,
            error: error instanceof Error ? error.message : String(error)
        };
    }
}

/* ------------------------------------------------------------------ */
/*  Main runner                                                        */
/* ------------------------------------------------------------------ */

export async function runTestMinify(flags = {}) {
    const env = mergedEnv();
    const zoneName = String(flags.zone || envValue(env, 'CF_ZONE_NAME', '')).trim();
    if (!zoneName) throw new Error('Missing zone name. Set CF_ZONE_NAME or pass --zone.');

    const outputDir = String(flags['output-dir'] || envValue(env, 'CF_OUTPUT_DIR', DEFAULT_OUTPUT_DIR));
    const hosts = parseHosts(flags.hosts || envValue(env, 'CF_HOSTS_OF_INTEREST', ''), zoneName);

    console.log('\nCloudflare minification smoke test');
    console.log(DEPRECATION_NOTICE);
    console.log(`- Hosts: ${hosts.join(', ')}\n`);

    const results = [];

    for (const hostUrl of hosts) {
        const htmlAsset = await fetchAsset(hostUrl, 'html');
        if (htmlAsset.error || !htmlAsset.body) {
            results.push({
                host: hostUrl,
                html: { url: hostUrl, error: htmlAsset.error || 'empty response' },
                linkedAssets: []
            });
            continue;
        }

        const htmlAnalysis = analyzeMinification(htmlAsset.body);
        const hostResult = {
            host: hostUrl,
            html: {
                url: hostUrl,
                status: htmlAsset.status,
                sizeBytes: htmlAsset.sizeBytes,
                cfMinify: htmlAsset.cfMinify,
                ...htmlAnalysis
            },
            linkedAssets: []
        };

        const linked = extractLinkedAssets(htmlAsset.body, hostUrl);
        for (const asset of linked) {
            const fetched = await fetchAsset(asset.url, asset.type);
            if (fetched.error || !fetched.body) {
                hostResult.linkedAssets.push({
                    type: asset.type,
                    url: asset.url,
                    error: fetched.error || 'empty response'
                });
                continue;
            }
            const analysis = analyzeMinification(fetched.body);
            hostResult.linkedAssets.push({
                type: asset.type,
                url: asset.url,
                status: fetched.status,
                sizeBytes: fetched.sizeBytes,
                contentType: fetched.contentType,
                cfMinify: fetched.cfMinify,
                ...analysis
            });
        }

        results.push(hostResult);
    }

    // Console summary
    let notMinifiedCount = 0;
    let totalChecked = 0;

    for (const entry of results) {
        if (entry.html.error) {
            console.log(`  ❌ ${entry.host}: ${entry.html.error}`);
            continue;
        }
        totalChecked++;
        const htmlStatus = entry.html.minified ? '✅ minified' : '⚠ not minified';
        if (!entry.html.minified) notMinifiedCount++;
        console.log(`  ${entry.host}`);
        console.log(`    HTML: ${htmlStatus} (${entry.html.sizeBytes} bytes, avgLine: ${entry.html.avgLineLen})`);

        for (const asset of entry.linkedAssets) {
            if (asset.error) {
                console.log(`    ${asset.type.toUpperCase()}: ❌ ${asset.error}`);
                continue;
            }
            totalChecked++;
            const status = asset.minified ? '✅ minified' : '⚠ not minified';
            if (!asset.minified) notMinifiedCount++;
            console.log(`    ${asset.type.toUpperCase()}: ${status} (${asset.sizeBytes} bytes, avgLine: ${asset.avgLineLen})`);
        }
    }

    console.log(`\nSummary: ${totalChecked - notMinifiedCount}/${totalChecked} assets appear minified`);
    if (notMinifiedCount > 0) {
        console.log(DEPRECATION_NOTICE);
    }

    // Write report (strip body fields to keep report lean)
    const report = {
        checkedAt: new Date().toISOString(),
        zone: zoneName,
        deprecationNotice: DEPRECATION_NOTICE,
        results: results.map((entry) => ({
            ...entry,
            html: { ...entry.html },
            linkedAssets: entry.linkedAssets.map((a) => ({ ...a }))
        })),
        summary: {
            totalChecked,
            minified: totalChecked - notMinifiedCount,
            notMinified: notMinifiedCount
        }
    };

    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(
        outputDir,
        `minify-test-${zoneName.replaceAll('.', '_')}-${utcStamp()}.json`
    );
    fs.writeFileSync(outputPath, prettyJson(report), 'utf8');
    console.log(`- Report: ${outputPath}`);

    return notMinifiedCount > 0 ? 2 : 0;
}

