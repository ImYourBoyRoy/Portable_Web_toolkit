// ./Web_Toolkit/site_theme/src/lib/html.mjs
/** Static contact sheet for `compare`: themes as columns, routes as rows; no scripts, relative image paths. */

const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function renderContactSheet({ site, routes, themes, results }) {
  const head = themes.map((theme) => {
    const r = results[theme.name] ?? {};
    const flag = r.siteReadsTokens === false ? ' <span class="warn">no change: site does not read the tokens</span>' : '';
    const fails = r.textFailures === undefined ? '' : ` &middot; ${r.textFailures} low-contrast text node${r.textFailures === 1 ? '' : 's'}`;
    return `<th><strong>${esc(theme.meta.label ?? theme.name)}</strong><br><small>${esc(theme.meta.scheme)}${fails}${flag}</small></th>`;
  }).join('');
  const rows = routes.map((route) => `<tr><th scope="row">${esc(route.route)}</th>${themes.map((theme) => `<td><a href="${esc(route.files[theme.name])}"><img loading="lazy" src="${esc(route.files[theme.name])}" alt="${esc(`${site} ${route.route} in ${theme.name}`)}"></a></td>`).join('')}</tr>`).join('\n');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Theme comparison: ${esc(site)}</title>
<style>body{font:14px system-ui,sans-serif;margin:1rem;background:#f5f5f5;color:#111}table{border-collapse:collapse}th,td{padding:.4rem;vertical-align:top;text-align:left}img{width:320px;height:auto;border:1px solid #bbb;background:#fff}.warn{color:#a00}</style>
<h1>Theme comparison: ${esc(site)}</h1><table><thead><tr><th></th>${head}</tr></thead><tbody>
${rows}
</tbody></table></html>
`;
}
