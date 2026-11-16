// ./Web_Toolkit/templates/layout/tests/layout.test.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const layout = path.resolve(here, '..');
const read = (file) => fs.readFileSync(path.join(layout, file), 'utf8');
const json = (file) => JSON.parse(read(file));
const contract = JSON.parse(fs.readFileSync(path.join(layout, '../theme/tokens.contract.json'), 'utf8'));

const astroFiles = fs.readdirSync(layout).filter((file) => file.endsWith('.astro')).sort();
const cssFiles = fs.readdirSync(path.join(layout, 'styles')).filter((file) => file.endsWith('.css')).sort();
const stripCssComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const tokens = new Set(
  ['color', 'font', 'radius', 'space', 'shadow', 'motion', 'layout'].flatMap((group) => contract[group].map((entry) => entry.name)),
);

describe('template inventory', () => {
  it('ships the five components and the six sheets plus layout.css', () => {
    assert.deepEqual(astroFiles, ['BaseHead.astro', 'BaseLayout.astro', 'Breadcrumbs.astro', 'SiteFooter.astro', 'SiteHeader.astro']);
    assert.deepEqual(cssFiles, ['breadcrumbs.css', 'footer.css', 'header.css', 'layout-shell.css', 'layout.css', 'nav.css', 'skip-link.css']);
  });
  it('layout.css imports every other sheet and nothing missing', () => {
    const imports = [...read('styles/layout.css').matchAll(/@import\s+'\.\/([^']+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual(imports, cssFiles.filter((file) => file !== 'layout.css'));
  });
  it('every source file starts with a path comment', () => {
    for (const file of astroFiles) assert.match(read(file).split('\n')[1], /^\/\/ \.\/src\/components\/layout\//, file);
    for (const file of cssFiles) assert.match(read(`styles/${file}`), /^\/\* \.\/src\/styles\/layout\//, file);
    for (const file of ['lib/head.ts', 'lib/nav.ts']) assert.match(read(file), /^\/\/ \.\/src\/lib\//, file);
    for (const file of fs.readdirSync(here)) assert.match(read(`tests/${file}`), /^\/\/ \.\/Web_Toolkit\/templates\/layout\/tests\//, file);
  });
});

describe('astro components', () => {
  for (const file of astroFiles) {
    it(`${file} has a frontmatter block`, () => {
      const source = read(file);
      assert.match(source, /^---\r?\n[\s\S]*?\r?\n---\r?\n/, 'opens with --- and closes with ---');
      assert.ok(source.indexOf('\n---') > 3);
    });
  }
  it('no component hardcodes a colour', () => {
    for (const file of astroFiles) {
      const markup = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
      assert.doesNotMatch(markup, /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b|\brgba?\(|\bhsla?\(/i, file);
    }
  });
});

describe('layout CSS uses the token contract only', () => {
  for (const file of cssFiles) {
    it(`${file}: every var(--x) is a contract token; no literal colours; no new custom properties`, () => {
      const css = stripCssComments(read(`styles/${file}`));
      for (const match of css.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
        assert.ok(tokens.has(match[1]), `${file} uses ${match[1]} which is not in tokens.contract.json`);
      }
      assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, `${file} has a hex colour`);
      assert.doesNotMatch(css, /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i, `${file} has a literal colour function`);
      assert.doesNotMatch(css, /(^|[;{\s])--[a-z0-9-]+\s*:/i, `${file} declares a custom property; the layout may only read the contract`);
    });
  }
  it('honors prefers-reduced-motion and shows a focus ring from --color-focus', () => {
    const all = cssFiles.map((file) => read(`styles/${file}`)).join('\n');
    assert.match(all, /prefers-reduced-motion: no-preference/);
    assert.match(read('styles/skip-link.css'), /outline:[^;]*var\(--color-focus\)/);
    for (const file of ['header.css', 'footer.css', 'breadcrumbs.css']) assert.match(read(`styles/${file}`), /focus-visible[\s\S]*var\(--color-focus\)/, file);
  });
  it('transitions only live inside the no-preference media query', () => {
    for (const file of cssFiles) {
      const css = stripCssComments(read(`styles/${file}`));
      const outside = css.replace(/@media \(prefers-reduced-motion: no-preference\)\s*\{(?:[^{}]|\{[^{}]*\}|\{(?:[^{}]|\{[^{}]*\})*\})*\}/g, '');
      assert.doesNotMatch(outside, /\btransition\s*:/, `${file} has an unguarded transition`);
    }
  });
  it('keeps targets at 44px and a scroll offset for the sticky header', () => {
    assert.match(read('styles/nav.css'), /min-height:\s*2\.75rem/);
    assert.match(read('styles/layout-shell.css'), /scroll-padding-top:\s*calc\(var\(--header-height\)/);
  });
});

describe('example data files', () => {
  it('site.example.json has the documented keys', () => {
    const site = json('site.example.json');
    for (const key of ['siteName', 'defaultDescription', 'defaultOgImage', 'locale', 'twitter', 'origin', 'titleTemplate', 'themeColor']) assert.ok(key in site, key);
    assert.equal(typeof site.twitter.site, 'string');
    assert.match(site.origin, /^https:\/\/[^/]+$/);
    assert.match(site.locale, /^[a-z]{2}_[A-Z]{2}$/);
    assert.match(site.titleTemplate, /%s/);
  });
  it('nav.example.json has brand, items (one level of children) and cta', () => {
    const nav = json('nav.example.json');
    assert.ok(nav.brand && Array.isArray(nav.items) && nav.cta);
    assert.ok(nav.items.length >= 3);
    for (const item of nav.items) {
      assert.equal(typeof item.label, 'string');
      assert.ok(item.href || item.children, 'href or children');
      for (const child of item.children ?? []) {
        assert.ok(child.label && child.href);
        assert.equal(child.children, undefined, 'only one level of children');
      }
    }
    // The shipped items link only routes a fresh site has (no dead links on the first build); the submenu shape is documented.
    assert.match(nav.$comment, /children/, 'the comment documents the submenu shape');
    for (const item of nav.items) assert.match(item.href, /^\/(about\/|contact\/)?$/, `${item.label} must point at a route a fresh site has`);
  });
  it('footer.example.json has columns, legal, social and copyright', () => {
    const footer = json('footer.example.json');
    for (const key of ['tagline', 'columns', 'legal', 'social', 'copyright']) assert.ok(key in footer, key);
    for (const column of footer.columns) {
      assert.ok(column.title);
      assert.ok(column.links.every((link) => link.label && link.href));
    }
    assert.ok(footer.legal.every((link) => link.label && link.href));
  });
});

describe('accessibility wiring', () => {
  const header = read('SiteHeader.astro');
  const baseLayout = read('BaseLayout.astro');
  it('the header uses a disclosure pattern with aria-expanded, aria-controls and aria-current', () => {
    assert.match(header, /aria-expanded="false"/);
    assert.match(header, /aria-controls="site-nav-panel"/);
    assert.match(header, /id="site-nav-panel"/);
    assert.match(header, /aria-controls=\{submenuId\}/);
    assert.match(header, /id=\{submenuId\}/);
    assert.match(header, /aria-current=\{[^}]*'page'/);
    assert.match(header, /<nav class="site-nav" aria-label=/);
  });
  it('the header script handles Escape, focus return, outside click and aria-expanded', () => {
    assert.match(header, /event\.key !== 'Escape'/);
    assert.match(header, /\.focus\(\)/);
    assert.match(header, /document\.addEventListener\('click'/);
    assert.match(header, /setAttribute\('aria-expanded'/);
  });
  it('the menu works without JS: toggles are hidden by CSS until the script marks the header ready', () => {
    assert.match(header, /data-needs-js/);
    assert.match(header, /header\.setAttribute\('data-nav-ready'/);
    const css = read('styles/nav.css');
    assert.match(css, /:not\(\[data-nav-ready\]\) \[data-needs-js\]/);
  });
  it('the skip link is first in <body> and targets an id that exists in BaseLayout', () => {
    const body = baseLayout.slice(baseLayout.indexOf('<body class'));
    const targets = [...body.matchAll(/<a class="skip-link" href="#([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(targets, ['main']);
    assert.ok(body.indexOf('class="skip-link"') < body.indexOf('<slot name="header"'));
    assert.ok(body.indexOf('class="skip-link"') < body.indexOf('<main'));
    assert.match(body.replace(/^<body[^>]*>\s*/, ''), /^<a class="skip-link"/, 'skip link is the first child of body');
    assert.match(baseLayout, /<main id="main"[^>]*tabindex="-1"/);
  });
  it('BaseLayout wires html lang + data-theme, the schema slot and ThemeInit through BaseHead', () => {
    assert.match(baseLayout, /<html lang=\{lang\} data-theme=\{themes\.default\}/);
    assert.match(baseLayout, /<slot name="schema">/);
    assert.match(baseLayout, /import Schema from '\.\.\/Schema\.astro'/);
    const head = read('BaseHead.astro');
    assert.match(head, /import ThemeInit from '\.\.\/theme\/ThemeInit\.astro'/);
    const markup = head.slice(head.indexOf('\n---', 4));
    assert.ok(markup.indexOf('<meta name="theme-color"') < markup.indexOf('<ThemeInit'), 'theme-color exists before ThemeInit runs');
    assert.ok(markup.indexOf('<ThemeInit') < markup.indexOf('<title>'), 'ThemeInit precedes everything else');
    assert.ok(markup.indexOf('<slot name="head"') > markup.indexOf('og:image'), 'page extras come last');
    assert.match(markup, /<slot name="preload"/);
  });
  it('Breadcrumbs marks the current crumb and reuses the Schema.astro @id convention', () => {
    const crumbs = read('Breadcrumbs.astro');
    assert.match(crumbs, /aria-current="page"/);
    assert.match(crumbs, /aria-label=\{label\}/);
    assert.match(read('lib/nav.ts'), /#breadcrumb/);
    const schema = fs.readFileSync(path.join(layout, '../discovery/components/Schema.astro'), 'utf8');
    assert.match(schema, /breadcrumb: `\$\{pageUrl\}#breadcrumb`/);
  });
});

describe('erasable TypeScript', () => {
  for (const file of ['lib/head.ts', 'lib/nav.ts']) {
    it(`${file} avoids enums, namespaces and parameter properties`, () => {
      const source = read(file);
      assert.doesNotMatch(source, /^\s*(export\s+)?(const\s+)?enum\s/m);
      assert.doesNotMatch(source, /^\s*(export\s+)?(declare\s+)?namespace\s/m);
      assert.doesNotMatch(source, /constructor\s*\([^)]*\b(public|private|protected|readonly)\b/);
    });
  }
});
