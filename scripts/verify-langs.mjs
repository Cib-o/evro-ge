// Verifies generated /{lang}/ pages: html lang, hreflang, canonical, no KA leakage
// (excluding the language switcher), and internal-link prefixing.
import { parse } from 'node-html-parser';
import { readFileSync, globSync } from 'node:fs';

const hasKa = (s) => /[Ⴀ-ჿ]/.test(s);
const LANGS = ['en', 'ru', 'uk', 'az', 'tr', 'hy'];
let checked = 0, issues = 0, leaks = 0;

const files = globSync('public/**/index.html', { cwd: '.' })
  .map((f) => f.replace(/\\/g, '/'))
  .filter((f) => new RegExp('^public/(' + LANGS.join('|') + ')/').test(f));

for (const f of files) {
  const lang = f.split('/')[1];
  const root = parse(readFileSync(f, 'utf8'), { blockTextElements: { script: true, style: true } });
  checked++;
  if (root.querySelector('html').getAttribute('lang') !== lang) { console.log('BAD lang', f); issues++; }
  if (root.querySelectorAll('link[rel=alternate][hreflang]').length !== 8) { console.log('BAD hreflang', f); issues++; }
  const can = root.querySelector('link[rel=canonical]')?.getAttribute('href') || '';
  if (!can.startsWith('https://evro.ge/' + lang + '/')) { console.log('BAD canonical', can, f); issues++; }

  root.querySelectorAll('.langsel').forEach((e) => e.remove()); // switcher legitimately holds native names
  outer: for (const r of root.querySelectorAll('header,main,footer')) {
    for (const n of r.querySelectorAll('h1,h2,p,summary,.ans,.cur,td,th,label,.card-name,.card-desc,.chip,.back,.cta,.pair')) {
      const t = (n.text || '').trim();
      if (hasKa(t)) { if (leaks < 15) console.log('KA LEAK [' + lang + '] ' + f + ': «' + t.slice(0, 40) + '»'); leaks++; break outer; }
    }
  }
  const badLink = [...root.querySelectorAll('main a, header a.back, footer a')].find((a) => {
    const h = a.getAttribute('href');
    return h && h.startsWith('/') && !h.startsWith('//') && !h.startsWith('/' + lang + '/') && h !== '/' + lang + '/';
  });
  if (badLink) { console.log('UNPREFIXED LINK [' + lang + '] ' + f + ': ' + badLink.getAttribute('href')); issues++; }
}
console.log(`\nchecked ${checked} | structural issues: ${issues} | KA leaks: ${leaks}`);
