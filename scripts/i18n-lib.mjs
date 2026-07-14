// Shared helpers for the evro.ge i18n build pipeline.
// The site's pages are machine-generated and highly regular, but we still parse
// real DOM (node-html-parser) so attribute injection is safe.
import { parse } from 'node-html-parser';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { globSync } from 'node:fs';

export const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// Elements whose text we translate. Scoped to header/main/footer only (never
// touch <head> metadata, schema.org, brand, or scripts).
export const SELECTORS = [
  'title',
  'a.back', 'a.cta', 'a.chip',
  'nav.nav a',
  'h1', 'h2',
  'p.sub', 'p.sec-sub', 'p.disc', 'p.disclaimer',
  '.prose p', '.prose h2', '.prose strong', '.prose a',
  '.eyebrow', '.rate-cur', '.cur', '.card-logo',
  '.meta > span', '.rate-meta > span', '#source',
  '.rev', '.rev a',
  '.faq summary', '.faq .ans', '.faq .ans a',
  '.rates th', '.rates td', '.rates td a',
  '.card-name', '.card-desc', '.card-fee .l', '.card-cta',
  '.strip-item .pair',
  '.conv-cell label',
  '.foot a',
  '.foot-row > div', '.foot > .wrap > div',
  '[data-ssr="date"]',   // "იტვირთება…" loading placeholder
];

// Elements to never descend into as translatable (kept as opaque placeholders).
// (currency-code chips, live numbers, svg, the brand)
const OPAQUE = (el) => {
  const cls = el.getAttribute('class') || '';
  if (el.rawTagName === 'svg') return true;
  if (el.hasAttribute && el.hasAttribute('data-ssr')) return true;
  if (/\bcode\b/.test(cls)) return true;      // <span class="code">USD</span>
  if (/\blive\b/.test(cls)) return true;      // live dot
  if (/\bmark\b|\bdot\b/.test(cls)) return true;
  return false;
};

const hasGeorgian = (s) => /[Ⴀ-ჿ]/.test(s);

// Build a translation template from an element:
//  - text nodes -> literal text (numbers -> {n})
//  - child elements -> {0},{1},... placeholders (in DOM order)
// Returns {tpl, n, placeholders} or null if nothing translatable.
export function elementTemplate(el) {
  // First pass: gather text/element parts and the distinct numbers in text nodes.
  const parts = []; // {text} or {ph:index}
  let phIndex = 0;
  const numbers = new Set();
  let sawText = false;

  for (const node of el.childNodes) {
    if (node.nodeType === 3) {
      const decoded = node.rawText;
      if (hasGeorgian(decoded)) sawText = true;
      const nm = decoded.match(/\d[\d.,]*/g);
      if (nm) nm.forEach((x) => numbers.add(x));
      parts.push({ text: decoded });
    } else if (node.nodeType === 1) {
      parts.push({ ph: phIndex });
      phIndex += 1;
    }
  }
  if (!sawText) return null; // only placeholders / no Georgian -> skip

  // Decide the {n} parameter: only when exactly one distinct number appears.
  let n = null;
  const distinct = [...numbers];
  let numRe = null;
  if (distinct.length === 1) {
    n = distinct[0];
    numRe = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
  }

  // Second pass: normalize numbers inside TEXT ONLY, then insert placeholders.
  let tpl = '';
  for (const p of parts) {
    if (p.text != null) tpl += numRe ? p.text.replace(numRe, '{n}') : p.text;
    else tpl += `{${p.ph}}`;
  }
  const norm = tpl.replace(/\s+/g, ' ').trim();
  if (!norm) return null;
  return { tpl: norm, n, placeholders: phIndex };
}

export const keyFor = (tpl) => 'k' + createHash('sha1').update(tpl).digest('hex').slice(0, 10);

// Head <meta>/<title> content we translate for SEO (attribute-based, plain text).
export const META_SELECTORS = [
  { sel: 'meta[name="description"]', attr: 'content' },
  { sel: 'meta[property="og:title"]', attr: 'content' },
  { sel: 'meta[property="og:description"]', attr: 'content' },
  { sel: 'meta[name="twitter:title"]', attr: 'content' },
  { sel: 'meta[name="twitter:description"]', attr: 'content' },
];

// Turn a plain string into a {n}-normalized template (single distinct number only).
export function textTemplate(raw) {
  const s = (raw || '').replace(/\s+/g, ' ').trim();
  if (!s || !hasGeorgian(s)) return null;
  const nums = [...new Set((s.match(/\d[\d.,]*/g) || []))];
  if (nums.length === 1) {
    const re = new RegExp(nums[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    return { tpl: s.replace(re, '{n}'), n: nums[0] };
  }
  return { tpl: s, n: null };
}

// Returns [{el, attr, tpl, n}] for translatable head meta of a document.
export function metaEntries(root) {
  const out = [];
  for (const { sel, attr } of META_SELECTORS) {
    for (const el of root.querySelectorAll(sel)) {
      const t = textTemplate(el.getAttribute(attr));
      if (t) out.push({ el, attr, tpl: t.tpl, n: t.n });
    }
  }
  return out;
}

export function listPages() {
  const files = globSync('public/**/index.html', { cwd: ROOT });
  // normalize Windows backslashes so downstream path math (site paths, URLs) is portable
  return files.map((f) => (ROOT.replace(/\/$/, '') + '/' + f).replace(/\\/g, '/'));
}

export function loadDoc(path) {
  const html = readFileSync(path, 'utf8');
  const root = parse(html, {
    comment: true,
    blockTextElements: { script: true, style: true, noscript: true },
  });
  return { html, root };
}

export function translatableEls(root) {
  const scope = root.querySelectorAll('header, main, footer, title');
  const seen = new Set();
  const out = [];
  for (const sel of SELECTORS) {
    for (const el of root.querySelectorAll(sel)) {
      if (seen.has(el)) continue;
      // must be inside header/main/footer/title (title matched directly)
      seen.add(el);
      out.push(el);
    }
  }
  return out;
}

export { OPAQUE, hasGeorgian };
