// ყოველდღიური კუდი — ერთი NBG მოთხოვნა, მიმდინარე წლის ფაილების განახლება.
// გაშვება: GitHub Actions (.github/workflows/rates-tail.yml), დღეში ერთხელ.
//
//   node scripts/fetch-rates-day.mjs [--date YYYY-MM-DD]
//
// exit 0 + „no change" — თუ იმ დღეს პუბლიკაცია არ ყოფილა (კვირა/ორშაბათი/უქმე).
// workflow ამ შემთხვევაში კომიტს არ აკეთებს.

import { CURRENCIES, iso, loadYear, saveYear, fetchDay, applyDay, writeLatest } from "./rates-history-lib.mjs";

const i = process.argv.indexOf("--date");
const DATE = i > -1 ? process.argv[i + 1] : iso(new Date());
const YEAR = +DATE.slice(0, 4);

const day = await fetchDay(DATE);
if (!day) { console.log(`NBG-მ ${DATE}-ზე ჩანაწერი არ დააბრუნა`); process.exit(0); }
if (day.date !== DATE) {
  // უპუბლიკაციო დღე — NBG წინა ჩანაწერს აბრუნებს. არაფერს ვცვლით.
  console.log(`no change: ${DATE}-ზე პუბლიკაცია არ იყო (NBG-მ ${day.date} დააბრუნა)`);
  process.exit(0);
}

const docs = {};
for (const cur of CURRENCIES) docs[`${cur}-${YEAR}`] = loadYear(cur, YEAR);

// უკვე გვაქვს? მაშინ ხელახლა გაშვება no-op-ია.
const already = CURRENCIES.every((c) => {
  const doc = docs[`${c}-${YEAR}`];
  return doc.v[Math.round((new Date(DATE) - new Date(doc.start)) / 86400000)] != null;
});
if (already) { console.log(`no change: ${DATE} უკვე ჩაწერილია`); process.exit(0); }

applyDay(docs, DATE, day.rates);
for (const doc of Object.values(docs)) {
  if (!doc.fetched || doc.fetched < DATE) doc.fetched = DATE;
  saveYear(doc);
}
writeLatest(docs);

console.log(`updated ${DATE}: ${Object.entries(day.rates).map(([c, r]) => `${c}=${r}`).join(" ")}`);
