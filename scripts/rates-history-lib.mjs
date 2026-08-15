// ისტორიული კურსების საერთო ლოგიკა — იყენებს fetch-rates-history.mjs (backfill)
// და fetch-rates-day.mjs (ყოველდღიური კუდი).
//
// ფაილის ფორმატი: public/data/rates/<CUR>-<YYYY>.json
//   { "c":"EUR", "y":2026, "start":"2026-01-01", "fetched":"2026-08-15",
//     "v":[3.0186, null, 3.0301, ...] }
// v[i] = კურსი თარიღზე start+i დღე, **უკვე გაყოფილი quantity-ზე** (RUB-ს q=100 აქვს).
// null = იმ დღეს NBG-ს პუბლიკაცია არ ჰქონია (შაბათ-კვირა/უქმე) — მკითხველი წინა
// მნიშვნელობას ატარებს წინ. dense მასივი იმიტომ, რომ თარიღ-სტრინგები ფაილის
// ნახევარზე მეტს იკავებდა და გრაფიკს ისედაც ინდექსი↔პიქსელი უნდა.
//
// `fetched` = ბოლო თარიღი, რომელიც ამ წელს **ვთხოვეთ** (და არა რომელზეც პასუხი
// მოვიდა). ეს განასხვავებს „ჯერ არ გვიცდია"-ს „ვცადეთ, პუბლიკაცია არ იყო"-სგან,
// რაც backfill-ს resumable-ს ხდის.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

export const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1").replace(/\/$/, "");
export const DIR = `${ROOT}/public/data/rates`;
export const CURRENCIES = ["EUR", "USD", "RUB", "TRY", "GBP"];

const API = "https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/ka/json/";

export const iso = (d) => d.toISOString().slice(0, 10);
export const parseISO = (s) => new Date(s + "T00:00:00.000Z");
export const dayIndex = (start, date) => Math.round((parseISO(date) - parseISO(start)) / 86400000);
export const addDays = (s, n) => iso(new Date(parseISO(s).getTime() + n * 86400000));
export const daysInYear = (y) => (new Date(Date.UTC(y, 11, 31)) - new Date(Date.UTC(y, 0, 1))) / 86400000 + 1;

export const filePath = (cur, year) => `${DIR}/${cur}-${year}.json`;

export function loadYear(cur, year) {
  const p = filePath(cur, year);
  if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8"));
  return { c: cur, y: year, start: `${year}-01-01`, fetched: null, v: new Array(daysInYear(year)).fill(null) };
}

export function saveYear(doc) {
  mkdirSync(DIR, { recursive: true });
  // v-ს ერთ ხაზზე ვწერთ — 365 ელემენტი თითო ხაზზე git-ის diff-ს გამოუსადეგარს ხდიდა.
  const body = `{"c":"${doc.c}","y":${doc.y},"start":"${doc.start}","fetched":${JSON.stringify(doc.fetched)},\n"v":[${doc.v
    .map((x) => (x == null ? "null" : x))
    .join(",")}]}\n`;
  writeFileSync(filePath(doc.c, doc.y), body);
}

/**
 * ერთი დღის მოთხოვნა NBG-დან.
 * ⚠️ თუ იმ დღეს პუბლიკაცია არ იყო, NBG **წინა ჩანაწერს** აბრუნებს შეცდომის გარეშე —
 * ამიტომ ავტორიტეტული პასუხის `date`-ია, და არა ის, რაც ვთხოვეთ.
 * @returns {Promise<{date:string, rates:Record<string,number>}|null>}
 */
export async function fetchDay(date, currencies = CURRENCIES) {
  const qs = currencies.map((c) => `currencies=${c}`).join("&");
  const res = await fetch(`${API}?${qs}&date=${date}`, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`NBG ${date} → HTTP ${res.status}`);
  const json = await res.json();
  const rec = json && json[0];
  if (!rec || !rec.currencies) return null;
  const rates = {};
  for (const c of rec.currencies) {
    const q = c.quantity || 1;
    if (typeof c.rate === "number" && isFinite(c.rate)) rates[c.code] = +(c.rate / q).toFixed(6);
  }
  return { date: rec.date.slice(0, 10), rates };
}

/** მარტივი concurrency-limiter — NBG-ს არ ვტენით. */
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k], k);
      }
    })
  );
  return out;
}

/**
 * public/data/rates/latest.json — ბოლო ცნობილი კურსი ერთ პატარა ფაილში.
 * Worker-ი მას იყენებს **fallback-ად**, როცა NBG-ის API მიუწვდომელია: ჯობია
 * გუშინდელი რიცხვი გულწრფელი თარიღით, ვიდრე „—.————" crawler-ის თვალწინ.
 */
export function writeLatest(docs) {
  let best = null;
  for (const doc of Object.values(docs)) {
    for (let i = doc.v.length - 1; i >= 0; i--) {
      if (doc.v[i] == null) continue;
      const date = addDays(doc.start, i);
      if (!best || date > best.date) best = { date, rates: {} };
      if (date === best.date) best.rates[doc.c] = doc.v[i];
      break;
    }
  }
  if (!best) return null;
  // მხოლოდ იმ ვალუტებს ვწერთ, რომლებსაც ზუსტად ეს თარიღი აქვთ (ნაწილობრივ დღეს არ ვინახავთ).
  for (const doc of Object.values(docs)) {
    const i = dayIndex(doc.start, best.date);
    if (i >= 0 && i < doc.v.length && doc.v[i] != null) best.rates[doc.c] = doc.v[i];
  }
  mkdirSync(DIR, { recursive: true });
  writeFileSync(`${DIR}/latest.json`, JSON.stringify(best) + "\n");
  return best;
}

/** ჩაწერს ერთი დღის კურსებს შესაბამის წლიურ დოკუმენტებში (in-place). */
export function applyDay(docs, date, rates) {
  const year = +date.slice(0, 4);
  for (const [cur, rate] of Object.entries(rates)) {
    const doc = docs[`${cur}-${year}`];
    if (!doc) continue;
    const idx = dayIndex(doc.start, date);
    if (idx >= 0 && idx < doc.v.length) doc.v[idx] = rate;
  }
}
