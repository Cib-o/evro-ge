// Translate the ka catalog into en/ru/uk via Gemini, in batches.
// Output: scripts/strings.i18n.json  { key: {ka,en,ru,uk,hasN,ph} }
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\/$/, '');
const KEY = (readFileSync('C:/Users/johna/.gemini.env', 'utf8').match(/GEMINI_API_KEY=(.+)/)[1]).trim();
// Each model has its own per-day free-tier quota; rotate when one is exhausted.
const MODELS = ['gemini-flash-lite-latest', 'gemma-4-31b-it', 'gemma-4-26b-a4b-it', 'gemini-2.5-flash', 'gemini-2.0-flash'];
let mi = 0;
const urlFor = (m) => `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${KEY}`;

// Fixed runtime labels used by the inline rate scripts (not in HTML text).
const LABELS = {
  '@rate_on': 'კურსი',
  '@src_nbg': 'ეროვნული ბანკი',
  '@src_market': 'საბაზრო კურსი',
  '@failed': 'ვერ ჩაიტვირთა',
  '@loading': 'იტვირთება…',
  '@updated': 'განახლდა',
  '@rate_fail_long': 'კურსი ვერ განახლდა.',
  '@retry': 'სცადე თავიდან',
  '@rate_fail_short': 'კურსი ვერ ჩაიტვირთა',
  '@lang_name': 'ქართული',
};

const cat = JSON.parse(readFileSync(`${ROOT}/scripts/strings.ka.json`, 'utf8'));
const src = {}; // key -> ka
for (const [k, v] of Object.entries(cat)) src[k] = v.ka;
for (const [k, v] of Object.entries(LABELS)) src[k] = v;

const LANGS = ['en', 'ru', 'uk', 'az', 'tr', 'hy'];
const SYS = `You are a professional localization translator for evro.ge, a Georgian currency-exchange website (NBG official rates, EUR/USD/GEL etc.).
Translate each Georgian value into: English (en), Russian (ru), Ukrainian (uk), Azerbaijani (az), Turkish (tr), Armenian (hy).
RULES:
- Natural, concise, grammatically perfect wording a native would use on a finance site.
- Preserve ALL placeholders EXACTLY as written: {n}, {0}, {1}, {2}. You may move them to fit target grammar, but never rename, add, remove or translate them.
- Do NOT translate: currency codes (EUR, USD, GEL, GBP, TRY, RUB), symbols (₾, €), the brand "evro.ge", the domain "nbg.gov.ge".
- Latin transliterations in parentheses like "(100 evro lari, 100 EUR to GEL)" are Georgian SEO romanizations — keep them verbatim, unchanged.
- "ლარი"=GEL(lari), "ევრო"=euro, "დოლარი"=US dollar, "ფუნტი"=pound, "ლირა"=lira, "რუბლი"=ruble, "ეროვნული ბანკი"=National Bank of Georgia.
- Return ONLY minified JSON: an object mapping each input key to {"en":"...","ru":"...","uk":"...","az":"...","tr":"...","hy":"..."}. No markdown, no commentary.`;

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const stripFence = (t) => t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();

async function callGemini(batchObj, attempt = 0, wraps = 0) {
  const m = MODELS[mi];
  const isGemma = m.startsWith('gemma');
  const userText = isGemma ? SYS + '\n\nINPUT:\n' + JSON.stringify(batchObj) : JSON.stringify(batchObj);
  const body = {
    contents: [{ role: 'user', parts: [{ text: userText }] }],
    generationConfig: { temperature: 0.25, maxOutputTokens: 32768, ...(isGemma ? {} : { responseMimeType: 'application/json' }) },
    ...(isGemma ? {} : { systemInstruction: { parts: [{ text: SYS }] } }),
  };
  const r = await fetch(urlFor(m), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) {
    const txt = await r.text();
    if (r.status === 429) {
      // per-day quota on this model — rotate to the next one
      mi = (mi + 1) % MODELS.length;
      if (mi === 0) { wraps++; if (wraps > 3) throw new Error('all models exhausted: ' + txt.slice(0, 200)); console.log(`  all rotated — wait 60s`); await sleep(60000); }
      console.log(`  429 → switch model → ${MODELS[mi]}`);
      return callGemini(batchObj, attempt, wraps);
    }
    if ((r.status === 503 || r.status === 500) && attempt < 8) {
      console.log(`  ${r.status} on ${m} — retry in 10s`); await sleep(10000);
      return callGemini(batchObj, attempt + 1, wraps);
    }
    throw new Error(`Gemini ${r.status} on ${m}: ${txt.slice(0, 200)}`);
  }
  const d = await r.json();
  const text = stripFence(d.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '');
  try { return JSON.parse(text); }
  catch (e) {
    if (attempt < 4) { await sleep(2500); return callGemini(batchObj, attempt + 1, wraps); }
    throw new Error(`Bad JSON from ${m}: ` + text.slice(0, 200));
  }
}

// resume support
const outPath = `${ROOT}/scripts/strings.i18n.json`;
const out = existsSync(outPath) ? JSON.parse(readFileSync(outPath, 'utf8')) : {};

const complete = (o) => o && LANGS.every((L) => o[L]);
const keys = Object.keys(src).filter((k) => !complete(out[k]));
console.log(`to translate: ${keys.length} / ${Object.keys(src).length} (langs: ${LANGS.join(',')})`);

const BATCH = 10;
for (let i = 0; i < keys.length; i += BATCH) {
  const slice = keys.slice(i, i + BATCH);
  const batchObj = {};
  slice.forEach((k) => (batchObj[k] = src[k]));
  process.stdout.write(`batch ${i / BATCH + 1} (${slice.length})… `);
  const res = await callGemini(batchObj);
  let ok = 0;
  for (const k of slice) {
    const t = res[k];
    if (t && LANGS.every((L) => t[L])) {
      const entry = { ka: src[k], hasN: cat[k]?.hasN || /\{n\}/.test(src[k]), ph: cat[k]?.ph || 0 };
      LANGS.forEach((L) => (entry[L] = t[L]));
      out[k] = { ...out[k], ...entry };
      ok += 1;
    } else {
      console.log(`\n  MISSING: ${k} = ${JSON.stringify(src[k]).slice(0, 60)}`);
    }
  }
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`ok ${ok}/${slice.length} (saved)`);
  await new Promise((res) => setTimeout(res, 7000)); // stay under free-tier RPM
}
console.log('done. total:', Object.keys(out).length);
