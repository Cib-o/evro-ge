// ისტორიული კურსების backfill NBG-დან — ერთჯერადი (და resumable) სამუშაო.
// NBG-ს range-endpoint არ აქვს, ანუ დღეზე ერთი მოთხოვნაა. მონაცემები 2003-მდე მიდის.
//
//   node scripts/fetch-rates-history.mjs --from 2020-01-01 [--to 2026-08-15] [--conc 5]
//
// resumable: თითო წლის ფაილში `fetched` ველია — ხელახლა გაშვებისას იმაზე ადრეულ
// დღეებს აღარ ითხოვს. ანუ გაწყვეტის შემდეგ უბრალოდ თავიდან გაუშვი.

import { CURRENCIES, iso, addDays, loadYear, saveYear, fetchDay, mapLimit, applyDay, writeLatest } from "./rates-history-lib.mjs";

const arg = (name, def) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : def;
};

const FROM = arg("--from", "2020-01-01");
const TO = arg("--to", iso(new Date()));
const CONC = +arg("--conc", 5);

// ── რომელი დღეები დაგვრჩა ────────────────────────────────────────────────────
const years = [];
for (let y = +FROM.slice(0, 4); y <= +TO.slice(0, 4); y++) years.push(y);

const docs = {};
for (const cur of CURRENCIES) for (const y of years) docs[`${cur}-${y}`] = loadYear(cur, y);

// წელი „დამუშავებულია" თუ **ყველა** ვალუტის ფაილს გავლილი აქვს ის დღე.
const fetchedThrough = (date) => {
  const y = +date.slice(0, 4);
  return CURRENCIES.every((c) => {
    const f = docs[`${c}-${y}`]?.fetched;
    return f && f >= date;
  });
};

const todo = [];
for (let d = FROM; d <= TO; d = addDays(d, 1)) if (!fetchedThrough(d)) todo.push(d);

console.log(`ვალუტები: ${CURRENCIES.join(", ")} | დიაპაზონი ${FROM} … ${TO}`);
console.log(`დასამუშავებელი დღეები: ${todo.length} (უკვე გვაქვს ${(1 + (new Date(TO) - new Date(FROM)) / 86400000) - todo.length})`);
if (!todo.length) { console.log("ყველაფერი უკვე ჩამოტვირთულია."); process.exit(0); }

// ── ჩამოტვირთვა ──────────────────────────────────────────────────────────────
let done = 0, published = 0, failed = 0;

await mapLimit(todo, CONC, async (date) => {
  try {
    const day = await fetchDay(date);
    // NBG უპუბლიკაციო დღეზე წინა ჩანაწერს აბრუნებს — ვწერთ მხოლოდ მაშინ,
    // როცა პასუხის თარიღი ნამდვილად ის დღეა, რომელიც ვთხოვეთ.
    if (day && day.date === date) { applyDay(docs, date, day.rates); published++; }
  } catch (e) {
    failed++;
    console.error(`  ✗ ${date}: ${e.message}`);
  }
  if (++done % 200 === 0) console.log(`  … ${done}/${todo.length}`);
});

// ── `fetched` და ჩაწერა ──────────────────────────────────────────────────────
// `fetched` მხოლოდ **უწყვეტად** იზრდება: თუ ამ გაშვების FROM ხვრელს ტოვებს წინა
// `fetched`-სა და თავის თავს შორის, მარკერს არ ვწევთ (მონაცემი მაინც იწერება).
// თორემ „--from 2026-08-01"-ის შემდეგ „--from 2015-01-01" მთელ 2026-ს გამოტოვებდა.
for (const doc of Object.values(docs)) {
  const yStart = `${doc.y}-01-01`;
  const last = TO < `${doc.y}-12-31` ? TO : `${doc.y}-12-31`;
  const contiguousFrom = doc.fetched ? addDays(doc.fetched, 1) : yStart;
  if (!failed && last >= yStart && FROM <= contiguousFrom && last > (doc.fetched || "")) doc.fetched = last;
  saveYear(doc);
}

const latest = writeLatest(docs);
if (latest) console.log(`latest.json → ${latest.date}`);

const cov = (cur) => years.map((y) => `${y}:${docs[`${cur}-${y}`].v.filter((x) => x != null).length}`).join(" ");
console.log(`\nჩამოტვირთული პუბლიკაციები: ${published}/${todo.length}${failed ? ` | შეცდომა: ${failed}` : ""}`);
for (const c of CURRENCIES) console.log(`  ${c}  ${cov(c)}`);
if (failed) console.log("\n⚠️ შეცდომები იყო — გაუშვი ხელახლა, დარჩენილს ჩამოტვირთავს.");
