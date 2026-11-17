import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const template = path.join(root, 'Web_Toolkit/templates/discovery');
const { htmlToMarkdown } = await import(path.join(template, 'scripts/lib/html-to-markdown.mjs'));

const page = (title, body, canonical) => `<!doctype html><html><head><title>${title}</title><meta name="description" content="${title} description"><link rel="canonical" href="${canonical}"></head><body><nav>menu</nav><main>${body}</main><footer>foot</footer></body></html>`;

function makeProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-template-'));
  fs.cpSync(path.join(template, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
  const dist = path.join(dir, 'dist/client');
  const write = (file, body) => { fs.mkdirSync(path.dirname(path.join(dist, file)), { recursive: true }); fs.writeFileSync(path.join(dist, file), body); };
  const site = 'https://example.com';
  write('index.html', page('Demo Home', '<h1>Demo</h1><p>Welcome to the demo site with enough words to be useful to a reader.</p><ul><li>One</li><li><a href="/about/">About</a></li></ul>', `${site}/`));
  write('about/index.html', page('About Demo', '<h1>About</h1><p>We build demos. <strong>Bold</strong> and <em>soft</em>.</p><table><tr><th>Plan</th><th>Price</th></tr><tr><td>Basic</td><td>$10</td></tr></table>', `${site}/about/`));
  write('sitemap.xml', `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${site}/</loc></url><url><loc>${site}/about/</loc></url><url><loc>${site}/contact/</loc></url></urlset>`);
  write('api/content.json', JSON.stringify({
    siteName: 'Demo', siteUrl: site,
    routes: [
      { path: '/', url: `${site}/`, markdownUrl: `${site}/index.md`, title: 'Demo Home', description: 'Home', type: 'page', lastmod: '2026-01-02' },
      { path: '/about/', url: `${site}/about/`, markdownUrl: `${site}/about/index.md`, title: 'About Demo', description: 'About', type: 'page', lastmod: null },
      { path: '/contact/', url: `${site}/contact/`, title: 'Contact', description: 'Server rendered form', type: 'form', lastmod: null },
    ],
  }));
  write('llms.txt', `# Demo\n\n> Demo.\n\n## Pages\n- [Home](${site}/index.md): x\n- [About](${site}/about/index.md): x\n- [Contact](${site}/contact/): x\n`);
  write('robots.txt', `User-agent: *\nContent-Signal: search=yes, ai-input=yes, ai-train=yes\nAllow: /\nSitemap: ${site}/sitemap.xml\n`);
  write('.well-known/api-catalog', JSON.stringify({ linkset: [{ anchor: `${site}/api/content.json`, 'service-doc': [{ href: `${site}/llms-full.txt` }] }] }));
  write('_headers', '/*\n  X-Frame-Options: DENY\n');
  return { dir, dist };
}

describe('html-to-markdown', () => {
  it('converts the main element and drops chrome, scripts and hidden content', () => {
    const { markdown } = htmlToMarkdown('<body><nav>menu</nav><main><h1>Title</h1><p>Hi <a href="/x/">link</a></p><script>bad()</script><div hidden>secret</div><ol><li>a</li><li>b</li></ol></main></body>', { baseUrl: 'https://e.com' });
    assert.match(markdown, /^# Title/);
    assert.match(markdown, /\[link\]\(https:\/\/e\.com\/x\/\)/);
    assert.match(markdown, /1\. a\n2\. b/);
    assert.doesNotMatch(markdown, /menu|bad\(\)|secret/);
  });
  it('keeps spaces between sibling elements and renders tables', () => {
    const { markdown } = htmlToMarkdown('<main><ul><li><div>17+</div><div>years</div></li></ul><table><tr><th>A</th></tr><tr><td>1</td></tr></table></main>');
    assert.match(markdown, /- 17\+ years/);
    assert.match(markdown, /\| A \|\n\| --- \|\n\| 1 \|/);
  });
});

describe('discovery post-build and check scripts', () => {
  it('writes twins, the whole-site bundle and an idempotent _headers block, skipping server-rendered pages', () => {
    const { dir, dist } = makeProject();
    const run = () => spawnSync(process.execPath, [path.join(dir, 'scripts/discovery-postbuild.mjs'), dist], { encoding: 'utf8', cwd: dir });
    const first = run();
    assert.equal(first.status, 0, first.stdout + first.stderr);
    assert.match(first.stdout, /skipped \/contact\//);
    const about = fs.readFileSync(path.join(dist, 'about/index.md'), 'utf8');
    assert.match(about, /canonical: https:\/\/example\.com\/about\//);
    assert.match(about, /\*\*Bold\*\*/);
    assert.ok(!fs.existsSync(path.join(dist, 'contact/index.md')));
    const site = fs.readFileSync(path.join(dist, 'site.md'), 'utf8');
    assert.match(site, /Source: https:\/\/example\.com\/about\//);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dist, 'api/site.json'), 'utf8')).pageCount, 2);
    const headers = fs.readFileSync(path.join(dist, '_headers'), 'utf8');
    assert.match(headers, /\/about\/\n\s+Link: <https:\/\/example\.com\/about\/>; rel="canonical", <https:\/\/example\.com\/about\/index\.md>; rel="alternate"; type="text\/markdown"/);
    assert.match(headers, /\/\.well-known\/api-catalog\n\s+Content-Type: application\/linkset\+json/);
    assert.match(headers, /X-Frame-Options: DENY/);
    assert.equal(run().status, 0);
    assert.equal(fs.readFileSync(path.join(dist, '_headers'), 'utf8').split('BEGIN discovery headers').length, 2, 'block must not be duplicated');
  });

  it('runs when invoked through a symlinked directory (macOS tmpdir /var -> /private/var)', () => {
    const { dir, dist } = makeProject();
    const alias = `${dir}-alias`;
    fs.symlinkSync(dir, alias, 'dir');
    const result = spawnSync(process.execPath, [path.join(alias, 'scripts/discovery-postbuild.mjs'), path.join(alias, 'dist/client')], { encoding: 'utf8', cwd: alias });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /skipped \/contact\//, 'the script must do its work, not silently exit');
    assert.ok(fs.existsSync(path.join(dist, 'about/index.md')));
  });

  it('fails when a page with a Markdown URL has no HTML', () => {
    const { dir, dist } = makeProject();
    fs.rmSync(path.join(dist, 'about/index.html'));
    const result = spawnSync(process.execPath, [path.join(dir, 'scripts/discovery-postbuild.mjs'), dist], { encoding: 'utf8', cwd: dir });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /does not exist/);
  });

  it('the consistency check passes on a good build and fails on a no-slash sitemap', () => {
    const { dir, dist } = makeProject();
    spawnSync(process.execPath, [path.join(dir, 'scripts/discovery-postbuild.mjs'), dist], { cwd: dir });
    fs.mkdirSync(path.join(dir, 'src/pages'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/pages/index.astro'), '---\n---\n');
    spawnSync(process.execPath, [path.join(dir, 'scripts/refresh-page-lastmod.mjs')], { cwd: dir });
    const check = () => spawnSync(process.execPath, [path.join(dir, 'scripts/discovery-check.mjs'), dist], { encoding: 'utf8', cwd: dir });
    const good = check();
    assert.equal(good.status, 0, good.stdout);
    assert.match(good.stdout, /Server-rendered pages have no static HTML/);
    fs.writeFileSync(path.join(dist, 'sitemap.xml'), fs.readFileSync(path.join(dist, 'sitemap.xml'), 'utf8').replace('/about/<', '/about<'));
    const bad = check();
    assert.equal(bad.status, 1);
    assert.match(bad.stdout, /Sitemap URLs are canonical/);
  });
});

describe('refresh-page-lastmod baseline', () => {
  it('keeps baseline dates for pages whose last commit is the import checkpoint, and uses git dates after an edit', () => {
    const { dir } = makeProject();
    const git = (...args) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { cwd: dir, encoding: 'utf8' });
    const run = () => spawnSync(process.execPath, [path.join(dir, 'scripts/refresh-page-lastmod.mjs')], { cwd: dir, encoding: 'utf8' });
    const data = () => JSON.parse(fs.readFileSync(path.join(dir, 'src/data/page-lastmod.json'), 'utf8')).pages;
    fs.mkdirSync(path.join(dir, 'src/pages'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/pages/index.astro'), '---\n---\n');
    fs.writeFileSync(path.join(dir, 'src/pages/about.astro'), '---\n---\n');
    git('init', '-q'); git('add', 'src'); git('commit', '-q', '-m', 'checkpoint');
    const commit = git('rev-parse', 'HEAD').stdout.trim();
    fs.mkdirSync(path.join(dir, 'src/data'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'src/data/page-lastmod-baseline.json'), JSON.stringify({ commit, pages: { '/': '2026-08-12', '/about/': '2026-08-10' } }));
    git('add', 'src/data'); git('commit', '-q', '-m', 'baseline');
    assert.equal(run().status, 0);
    assert.deepEqual(data(), { '/': '2026-08-12', '/about/': '2026-08-10' });
    fs.writeFileSync(path.join(dir, 'src/pages/about.astro'), '---\n---\n<p>edited</p>\n');
    git('add', 'src'); git('commit', '-q', '-m', 'edit about');
    run();
    assert.equal(data()['/'], '2026-08-12');
    assert.match(data()['/about/'], /^\d{4}-\d{2}-\d{2}$/);
    assert.notEqual(data()['/about/'], '2026-08-10');
  });
});
