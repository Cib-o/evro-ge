// Master multilingual build for evro.ge.
// Reads CLEAN Georgian source pages and produces, for each language:
//   - ka  -> augments the root page (hreflang + switcher + lang cookie script)
//   - L   -> writes public/{L}/<path>/index.html fully translated (text+meta),
//            with rewritten internal links, canonical, og, hreflang, switcher.
// Live rates stay as [data-ssr] placeholders (Worker fills them per request).
// Idempotent: strips any previously-injected i18n bits before re-injecting.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { parse } from 'node-html-parser';
import {
  ROOT, listPages, translatableEls, elementTemplate, keyFor,
  META_SELECTORS, textTemplate,
} from './i18n-lib.mjs';

const DICT = JSON.parse(readFileSync(new URL('./strings.i18n.json', import.meta.url), 'utf8'));
const ORIGIN = 'https://evro.ge';
const LANGS = ['ka', 'en', 'ru', 'uk', 'az', 'tr', 'hy'];
const NON_KA = LANGS.filter((l) => l !== 'ka');
const NAMES = { ka: 'ქართული', en: 'English', ru: 'Русский', uk: 'Українська', az: 'Azərbaycanca', tr: 'Türkçe', hy: 'Հայերեն' };
const LOCALE = { ka: 'ka_GE', en: 'en_US', ru: 'ru_RU', uk: 'uk_UA', az: 'az_AZ', tr: 'tr_TR', hy: 'hy_AM' };
const DIR = (l) => (['ar', 'he', 'fa'].includes(l) ? 'rtl' : 'ltr'); // all ours are ltr

const pubDir = ROOT.replace(/\/$/, '') + '/public';

// ka source path on disk -> site path ("/", "/100-evro-lari/", ...)
const sitePath = (file) => {
  const rel = file.slice(pubDir.length).replace(/index\.html$/, '');
  return rel === '/' ? '/' : rel;
};
const urlFor = (lang, P) => ORIGIN + (lang === 'ka' ? P : '/' + lang + P);
const pathFor = (lang, P) => (lang === 'ka' ? P : '/' + lang + P);

// ---- translation helpers -----------------------------------------------------
const tt = (raw) => { const t = textTemplate(raw); return t ? { key: keyFor(t.tpl), n: t.n } : null; };

function fill(tpl, phEls, n) {
  let html = tpl.replace(/\{(\d+)\}/g, (_, i) => (phEls[i] != null ? phEls[i] : ''));
  if (n != null) html = html.replace(/\{n\}/g, n);
  return html;
}
function childOuter(el) { return el.childNodes.filter((c) => c.nodeType === 1).map((c) => c.outerHTML); }
function depth(el) { let d = 0; for (let p = el.parentNode; p; p = p.parentNode) d++; return d; }

// translate visible text (deepest-first so nested translatable children resolve first)
function translateText(root, lang) {
  const els = translatableEls(root).map((el) => {
    const t = elementTemplate(el);
    return t ? { el, key: keyFor(t.tpl), n: t.n } : null;
  }).filter(Boolean);
  els.sort((a, b) => depth(b.el) - depth(a.el));
  for (const { el, key, n } of els) {
    const d = DICT[key]; if (!d) continue;
    const tpl = d[lang]; if (tpl == null) continue;
    el.set_content(fill(tpl, childOuter(el), n));
  }
}

function translateMeta(root, lang) {
  for (const { sel, attr } of META_SELECTORS) {
    for (const el of root.querySelectorAll(sel)) {
      const m = tt(el.getAttribute(attr)); if (!m) continue;
      const d = DICT[m.key]; if (!d || d[lang] == null) continue;
      el.setAttribute(attr, fill(d[lang], [], m.n));
    }
  }
}

// rewrite internal <a href> to keep navigation inside the language section
function rewriteLinks(root, lang) {
  if (lang === 'ka') return;
  for (const a of root.querySelectorAll('a')) {
    const h = a.getAttribute('href');
    if (!h || !h.startsWith('/') || h.startsWith('//')) continue; // external/protocol-relative
    a.setAttribute('href', '/' + lang + h);
  }
}

// ---- head: canonical, og, hreflang, locale ----------------------------------
function setHead(root, lang, P) {
  const head = root.querySelector('head');
  const htmlEl = root.querySelector('html');
  if (htmlEl) htmlEl.setAttribute('lang', lang);

  const set = (sel, attr, val) => { const e = root.querySelector(sel); if (e) e.setAttribute(attr, val); };
  set('link[rel="canonical"]', 'href', urlFor(lang, P));
  set('meta[property="og:url"]', 'content', urlFor(lang, P));
  set('meta[property="og:locale"]', 'content', LOCALE[lang]);

  // strip old hreflang + add fresh set (all langs + x-default -> ka)
  root.querySelectorAll('link[rel="alternate"][hreflang]').forEach((e) => e.remove());
  const alts = LANGS.map((l) => `<link rel="alternate" hreflang="${l}" href="${urlFor(l, P)}">`).join('\n');
  const xdef = `<link rel="alternate" hreflang="x-default" href="${urlFor('ka', P)}">`;
  const canon = head.querySelector('link[rel="canonical"]');
  const block = '\n' + alts + '\n' + xdef + '\n'; // ბოლო "\n" — რომ build-pages-ის ახალ გვერდზეც მეორე გაშვება იგივე იყოს
  if (canon) canon.insertAdjacentHTML('afterend', block);
  else head.insertAdjacentHTML('beforeend', block);
}

// update JSON-LD: inLanguage + prefix internal item URLs; best-effort FAQ text
function fixSchema(root, lang, P) {
  for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
    let json;
    try { json = JSON.parse(s.textContent); } catch { continue; }
    const walk = (o) => {
      if (Array.isArray(o)) return o.map(walk);
      if (o && typeof o === 'object') {
        for (const k of Object.keys(o)) {
          if (k === 'inLanguage') o[k] = lang;
          else if ((k === 'url' || k === 'item') && typeof o[k] === 'string' && o[k].startsWith(ORIGIN + '/')) {
            const rest = o[k].slice(ORIGIN.length);
            o[k] = lang === 'ka' ? o[k] : ORIGIN + '/' + lang + rest;
          } else if ((k === 'name' || k === 'text' || k === 'description') && typeof o[k] === 'string') {
            const m = tt(o[k]); const d = m && DICT[m.key];
            if (d && d[lang] != null) o[k] = fill(d[lang], [], m.n);
          } else o[k] = walk(o[k]);
        }
      }
      return o;
    };
    s.set_content(JSON.stringify(walk(json)));
  }
}

// ---- bake per-language labels into the inline rate scripts ------------------
// (dynamic date/source/error strings the rate script writes at runtime)
const SCRIPT_LABELS = [
  ['კურსი ვერ ჩაიტვირთა', '@rate_fail_short'],
  ['კურსი ვერ განახლდა.', '@rate_fail_long'],
  ['ეროვნული ბანკი', '@src_nbg'],
  ['საბაზრო კურსი', '@src_market'],
  ['ვერ ჩაიტვირთა', '@failed'],
  ['სცადე თავიდან', '@retry'],
  ['იტვირთება…', '@loading'],
  ['განახლდა', '@updated'],
  ['კურსი ', '@rate_on '], // trailing space: "კურსი "+date -> "<T> "+date
];
function patchScripts(root, lang) {
  if (lang === 'ka') return;
  for (const s of root.querySelectorAll('script')) {
    let js = s.textContent || '';
    if (!/SOURCES/.test(js) || !/fetch\(/.test(js)) continue;
    for (const [lit, key] of SCRIPT_LABELS) {
      const bareKey = key.replace(/ $/, '');
      const tr = DICT[bareKey] && DICT[bareKey][lang];
      if (tr == null) continue;
      const repl = key.endsWith(' ') ? tr + ' ' : tr;
      js = js.split(lit).join(repl);
    }
    s.set_content(js);
  }
}

// ---- switcher + cookie script + css -----------------------------------------
const SWITCHER_CSS = `<style id="langsel-css">.langsel{position:relative;font-family:inherit;margin-left:auto}.top-in .langsel,.top-in>.langsel{margin-left:14px}.langsel-btn{display:inline-flex;align-items:center;gap:6px;background:var(--panel,#fff);border:1px solid var(--line,rgba(11,21,48,.14));color:var(--muted,#5A6478);border-radius:999px;padding:6px 12px;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;line-height:1}.langsel-btn:hover{border-color:var(--euro,#1B3A8F);color:var(--ink,#0B1530)}.langsel-btn svg{opacity:.8}.langsel-menu{position:absolute;top:calc(100% + 8px);right:0;background:var(--panel,#fff);border:1px solid var(--line,rgba(11,21,48,.12));border-radius:12px;box-shadow:0 10px 30px rgba(11,21,48,.14);padding:6px;min-width:160px;display:none;z-index:60}.langsel.open .langsel-menu{display:block}.langsel-menu a{display:block;text-decoration:none;font-size:14.5px;color:var(--ink,#0B1530);padding:9px 12px;border-radius:8px}.langsel-menu a:hover{background:var(--paper,#F1F4F7)}.langsel-menu a[aria-current=true]{color:var(--euro,#1B3A8F);font-weight:700}@media(max-width:560px){.langsel-btn .langsel-cur{display:none}}</style>`;

const GLOBE = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.8 2.6 15.2 0 18M12 3c-2.6 2.8-2.6 15.2 0 18"/></svg>';

function switcherHTML(lang, P) {
  const items = LANGS.map((l) =>
    `<a href="${pathFor(l, P)}" hreflang="${l}"${l === lang ? ' aria-current="true"' : ''}>${NAMES[l]}</a>`).join('');
  return `<div class="langsel" data-cur="${lang}"><button class="langsel-btn" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Language">${GLOBE}<span class="langsel-cur">${NAMES[lang]}</span></button><div class="langsel-menu">${items}</div></div>`;
}

const setCookieJS = 'function(l){document.cookie="lang="+l+"; path=/; max-age=31536000; SameSite=Lax";}';
const LANG_SCRIPT = (lang) => `<script>(function(){try{var sc=${setCookieJS};sc("${lang}");var w=document.querySelector(".langsel");if(w){var b=w.querySelector(".langsel-btn");b.addEventListener("click",function(e){e.stopPropagation();var o=w.classList.toggle("open");b.setAttribute("aria-expanded",o?"true":"false");});document.addEventListener("click",function(){w.classList.remove("open");b.setAttribute("aria-expanded","false");});w.querySelectorAll(".langsel-menu a").forEach(function(a){a.addEventListener("click",function(){sc(a.getAttribute("hreflang"));});});}${THEME_TOGGLE_JS}}catch(e){}})();</script>`;

// ---- თემა: სისტემის (prefers-color-scheme) → თუ დაუდგენელია, ნათელი; არჩევანი localStorage-ში ----
// head-ის თავში, CSS-მდე — რომ ბნელ სისტემაზე თეთრი „ციმციმი" არ ჩანდეს. data-theme ყოველთვის
// დგება JS-ით, ამიტომ ბნელი წესები ერთხელ წერია (:root[data-theme=dark]); JS-ის გარეშე — ნათელი.
const THEME_HEAD = `<meta name="color-scheme" content="light dark">
<script id="theme-js">(function(){var d=document.documentElement,k="evro:theme",t=null;try{t=localStorage.getItem(k)}catch(e){}var m=window.matchMedia&&matchMedia("(prefers-color-scheme: dark)");d.setAttribute("data-theme",t==="dark"||t==="light"?t:m&&m.matches?"dark":"light");if(!t&&m&&m.addEventListener)m.addEventListener("change",function(e){var s=null;try{s=localStorage.getItem(k)}catch(x){}if(!s)d.setAttribute("data-theme",e.matches?"dark":"light")});})();</script>`;
const D = ':root[data-theme=dark]';
const THEME_CSS = `<style id="theme-css">${D}{--paper:#0D1322;--panel:#151D31;--ink:#E7ECF6;--muted:#9AA5BC;--line:rgba(255,255,255,.09);--line-strong:rgba(255,255,255,.16);--euro:#8EA9FF;--euro-2:#B3C6FF;--gold:#D9B45A;--up:#3DD196;--down:#FF7B6E;color-scheme:dark}
${D} .top{background:rgba(13,19,34,.96)}
${D} .prose p,${D} .faq .ans,${D} .rev,${D} .hero-rate .inv{color:#C3CBDB}
${D} .disclaimer,${D} .foot .disc{color:#8C97AD}
${D} .sec-num{color:#D9B45A}
${D} .conv-cell,${D} .conv-swap,${D} .step,${D} .today,${D} .crow input,${D} .crow select,${D} .dpick input{border-color:rgba(255,255,255,.14)}
${D} .conv-swap:hover{background:#1C2640}
${D} .conv-cell:focus-within{box-shadow:0 0 0 3px rgba(142,169,255,.2)}
${D} .chart-area{fill:rgba(142,169,255,.14)}
${D} .chart-tip{background:#E7ECF6;color:#0D1322}
${D} .chart-rng button[aria-pressed=true],${D} .cta{color:#0D1322}
${D} .err,${D} .tnote.err{color:#FF7B6E}
${D} .chart-cap .down{color:#FF7B6E}${D} .chart-cap .up{color:#3DD196}
${D} .foot .fb{color:#6AA6FF}
${D} .brand .mark{background:#1B3A8F;color:#D9B45A}
${D} .cur-pop{box-shadow:0 14px 40px rgba(0,0,0,.5)}
${D} .flag{box-shadow:0 0 0 1px rgba(255,255,255,.15)}
.theme-btn{display:inline-grid;place-items:center;flex:0 0 auto;width:34px;height:34px;margin-left:8px;border-radius:999px;border:1px solid var(--line,rgba(11,21,48,.14));background:var(--panel,#fff);color:var(--muted,#5A6478);cursor:pointer;padding:0}
.theme-btn:hover{color:var(--ink);border-color:var(--euro)}
.theme-btn svg{width:16px;height:16px}
.theme-btn .sun,${D} .theme-btn .moon{display:none}
${D} .theme-btn .sun{display:block}</style>`;
const THEME_BTN = '<button class="theme-btn" type="button" aria-label="Theme"><svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg><svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>';
const THEME_TOGGLE_JS = 'var tb=document.querySelector(".theme-btn");if(tb)tb.addEventListener("click",function(){var d=document.documentElement,n=d.getAttribute("data-theme")==="dark"?"light":"dark";d.setAttribute("data-theme",n);try{localStorage.setItem("evro:theme",n)}catch(e){}});';

function injectChrome(root, lang, P) {
  const head = root.querySelector('head');
  root.querySelectorAll('#langsel-css, #theme-css, #theme-js, meta[name="color-scheme"]').forEach((e) => e.remove());
  const vp = head.querySelector('meta[name="viewport"]');
  // ბოლო "\n" — რომ build-pages-ის ახალ გვერდზეც პირველი და მეორე გაშვება byte-იდენტური იყოს
  if (vp) vp.insertAdjacentHTML('afterend', '\n' + THEME_HEAD + '\n'); else head.insertAdjacentHTML('afterbegin', THEME_HEAD);
  head.insertAdjacentHTML('beforeend', '\n' + SWITCHER_CSS + '\n' + THEME_CSS);
  const host = root.querySelector('header .top-in') || root.querySelector('header .wrap');
  if (host) {
    host.querySelectorAll('.langsel, .theme-btn').forEach((e) => e.remove());
    host.insertAdjacentHTML('beforeend', switcherHTML(lang, P) + THEME_BTN);
  }
  const body = root.querySelector('body');
  body.querySelectorAll('script[data-langscript]').forEach((e) => e.remove());
  body.insertAdjacentHTML('beforeend', '\n' + LANG_SCRIPT(lang).replace('<script>', '<script data-langscript>'));
}

// ---- build -------------------------------------------------------------------
function buildPage(file, lang) {
  const html = readFileSync(file, 'utf8');
  const root = parse(html, { comment: true, blockTextElements: { script: true, style: true, noscript: true } });
  const P = sitePath(file);

  if (lang !== 'ka') {
    translateText(root, lang); translateMeta(root, lang); patchScripts(root, lang); rewriteLinks(root, lang);
    root.querySelectorAll('link[data-ka-only]').forEach((e) => e.remove()); // ქართული შრიფტის preload
  }
  setHead(root, lang, P);
  fixSchema(root, lang, P);
  injectChrome(root, lang, P);

  // Re-injection removes the old hreflang/switcher/script nodes but leaves their "\n"
  // text siblings behind — without collapsing blank-line runs every rebuild grew each
  // page by ~10 empty lines (whitespace churn on all 714 files).
  let out = root.toString()
    .replace(/(<path\b[^>]*?)><\/path>/g, '$1/>')
    .replace(/\r\n/g, '\n')
    .replace(/\n(?:[ \t]*\n){2,}/g, '\n\n');
  const dest = lang === 'ka' ? file : `${pubDir}/${lang}${P}index.html`;
  mkdirSync(dirname(dest), { recursive: true });
  writeRetry(dest, out);
  return dest;
}

// Windows: right after a full rebuild the Search indexer / Defender briefly hold the
// just-written files, and the next rewrite fails with "UNKNOWN: open". Back off and retry.
function writeRetry(dest, data) {
  for (let i = 0; ; i++) {
    try { return writeFileSync(dest, data); } catch (e) {
      if (i >= 8 || !['UNKNOWN', 'EBUSY', 'EPERM'].includes(e.code)) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150 * (i + 1));
    }
  }
}

const sources = listPages().filter((f) => !new RegExp(`/public/(${NON_KA.join('|')})/`).test(f));
let n = 0;
for (const f of sources) for (const lang of LANGS) { buildPage(f, lang); n++; }
console.log(`built ${n} page-variants from ${sources.length} source pages × ${LANGS.length} langs`);
