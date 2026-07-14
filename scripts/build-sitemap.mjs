// Regenerates public/sitemap.xml with all language versions + hreflang alternates.
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\/$/, '');
const ORIGIN = 'https://evro.ge';
const LANGS = ['ka', 'en', 'ru', 'uk', 'az', 'tr', 'hy'];
const urlFor = (l, P) => ORIGIN + (l === 'ka' ? P : '/' + l + P);
const today = new Date().toISOString().slice(0, 10);

const xml = readFileSync(`${ROOT}/public/sitemap.xml`, 'utf8');
// pull existing ka entries -> path + priority/changefreq
const entries = [];
const re = /<url>([\s\S]*?)<\/url>/g;
let m;
while ((m = re.exec(xml))) {
  const block = m[1];
  const loc = /<loc>([^<]+)<\/loc>/.exec(block)?.[1] || '';
  if (!loc.startsWith(ORIGIN)) continue;
  const P = loc.slice(ORIGIN.length) || '/';
  if (/^\/(en|ru|uk|az|tr|hy)\//.test(P)) continue; // skip if already multilingual
  entries.push({
    P,
    changefreq: /<changefreq>([^<]+)</.exec(block)?.[1] || 'daily',
    priority: /<priority>([^<]+)</.exec(block)?.[1] || '0.7',
  });
}

const alts = (P) =>
  LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l}" href="${urlFor(l, P)}"/>`).join('\n') +
  `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${urlFor('ka', P)}"/>`;

let body = '';
for (const e of entries) {
  for (const l of LANGS) {
    body += `  <url>
    <loc>${urlFor(l, e.P)}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${e.priority}</priority>
${alts(e.P)}
  </url>\n`;
  }
}

const out = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${body}</urlset>\n`;
writeFileSync(`${ROOT}/public/sitemap.xml`, out);
console.log(`sitemap: ${entries.length} paths × ${LANGS.length} langs = ${entries.length * LANGS.length} urls`);
