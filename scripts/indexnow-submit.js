#!/usr/bin/env node
/*
 * IndexNow submission — აგზავნის public/sitemap.xml-ის URL-ებს ერთი ping-ით,
 * რომელიც აღწევს Bing-ს, Yandex-ს, Yahoo-სა და DuckDuckGo-ს (ბოლო ორი Bing-ზე დგას).
 * Google IndexNow-ს არ იყენებს — Google sitemap-ით/crawl-ით ინდექსავს.
 *
 *   node scripts/indexnow-submit.js
 *
 * გაუშვი დიფლოის შემდეგ (key ფაილი https://evro.ge/<key>.txt ლაივზე უნდა იყოს).
 * მხოლოდ შეცვლილ URL-ებს აგზავნი ხელახლა — უცვლელების სპამი → HTTP 429.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const HOST = "evro.ge";
const KEY = "d940979fa17f0e6139b34758501289e7";
const ENDPOINT = "https://api.indexnow.org/indexnow";

const xml = fs.readFileSync(path.join(__dirname, "..", "public", "sitemap.xml"), "utf8");
const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

async function main() {
  if (!urlList.length) {
    console.error("✗ sitemap.xml-ში URL ვერ მოიძებნა");
    process.exit(1);
  }
  const body = { host: HOST, key: KEY, keyLocation: `https://${HOST}/${KEY}.txt`, urlList };
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const txt = await res.text().catch(() => "");
  console.log(`IndexNow → HTTP ${res.status} ${res.statusText} (${urlList.length} URL)`);
  if (txt.trim()) console.log(txt.trim());
  // 200 = OK, 202 = მიღებულია (key-ს ვალიდაცია მიმდინარეობს) — ორივე წესრიგშია.
  if (res.status !== 200 && res.status !== 202) {
    console.error("✗ მოულოდნელი სტატუსი (400 bad req · 403 invalid key · 422 host/key mismatch · 429 rate-limited)");
    process.exit(1);
  }
  console.log("✓ გაიგზავნა");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
