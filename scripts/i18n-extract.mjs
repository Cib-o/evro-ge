// DRY-RUN cataloguer: extracts translatable templates from all pages, dedupes,
// and writes scripts/strings.ka.json. Does NOT modify any HTML.
import { writeFileSync } from 'node:fs';
import { listPages, loadDoc, translatableEls, elementTemplate, metaEntries, schemaEntries, keyFor, ROOT } from './i18n-lib.mjs';

const pages = listPages();
const catalog = new Map(); // key -> { ka, hasN, count, sample }
let elCount = 0;

const add = (tpl, n, ph, path) => {
  const key = keyFor(tpl);
  const prev = catalog.get(key);
  if (prev) prev.count += 1;
  else catalog.set(key, { ka: tpl, hasN: n != null, ph, count: 1, sample: path.split('/public/')[1] });
};

for (const path of pages) {
  const { root } = loadDoc(path);
  for (const el of translatableEls(root)) {
    const t = elementTemplate(el);
    if (!t) continue;
    elCount += 1;
    add(t.tpl, t.n, t.placeholders, path);
  }
  for (const m of metaEntries(root)) { elCount += 1; add(m.tpl, m.n, 0, path); }
  for (const s of schemaEntries(root)) { elCount += 1; add(s.tpl, s.n, 0, path); }
}

const obj = {};
for (const [k, v] of catalog) obj[k] = v;
writeFileSync(ROOT.replace(/\/$/, '') + '/scripts/strings.ka.json', JSON.stringify(obj, null, 2));

console.log('pages:', pages.length);
console.log('translatable element instances:', elCount);
console.log('unique templates:', catalog.size);
console.log('with {n}:', [...catalog.values()].filter((v) => v.hasN).length);
console.log('with placeholders:', [...catalog.values()].filter((v) => v.ph > 0).length);
console.log('\n--- first 30 unique templates ---');
let i = 0;
for (const [k, v] of catalog) {
  if (i++ >= 30) break;
  process.stdout.write(`${k} n=${v.hasN?1:0} ph=${v.ph} ×${v.count}  ${JSON.stringify(v.ka).slice(0, 100)}\n`);
}
