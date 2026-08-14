# evro.ge — არქიტექტურა

ვალუტის კურსის SEO-საიტი: **წინასწარ-გენერირებული სტატიკური HTML** (7 ენა) Cloudflare
Worker-ზე, სადაც **ცოცხალი კურსი edge-SSR-ით** ივსება ყოველ request-ზე. README = ბრძანებები;
ეს ფაილი = კომპონენტები, მონაცემთა ნაკადი და უცვლელი წესები (invariants).

## რენდერის მოდელი (ორ ფაზად)
1. **build-time (ლოკალურად, იკომიტება):** `build-pages.js` → KA HTML; `build-i18n.mjs` → 6 ენის
   თარგმანი. სულ ~379 სტატიკური ფაილი `public/`-ში. რიცხვები **არსად hardcode არ არის**.
2. **request-time (Worker):** `data-ssr` ატრიბუტებს ცოცხალი NBG კურსით ავსებს ედჯზე (crawler-იც
   ხედავს რიცხვს), client JS არეფრეშებს. `wrangler.jsonc: run_worker_first` — SSR ასეტამდე გაეშვას.

## კომპონენტები და პასუხისმგებლობა
| კომპონენტი | პასუხისმგებლობა |
|---|---|
| `scripts/build-pages.js` | **KA-გვერდების ერთადერთი წყარო.** amount გვერდები (EUR/USD↔GEL), landing-ები (`dolari-lari`, `funtis/liris/rublis-kursi`), hub (`valutis-kursi`), sitemap, robots, IndexNow key. |
| `scripts/build-i18n.mjs` | KA-დან 6 ენას თარგმნის (ტექსტი+meta+schema), შიდა ბმულებს `/<lang>`-ით ცვლის, hreflang/canonical/og აწყობს, ენის სვიჩერს ამატებს. |
| `scripts/strings.i18n.json` | **თარგმანის source of truth** — hash-key → 7 ენა. |
| `scripts/i18n-lib.mjs` | `keyFor` (ჰეშირება), `textTemplate`/`elementTemplate` (რიცხვი→`{n}`), SELECTORS/META_SELECTORS. |
| `src/index.js` (Worker) | (1) `/api/rates` → NBG proxy (CORS-ის გარეშე); (2) edge-SSR `data-ssr`; (3) `maybeRedirect` Accept-Language-ით; (4) `/sitemap.xml`-ის `lastmod` ცოცხალი; (5) `public/ev.js`-ის ჩართვა; (6) `scheduled()` → ყოველდღიური IndexNow. |
| `public/ev.js` | GA4 ინტერაქციის ივენთები. **HTML-ში არ წერია** — Worker-ი ედჯზე ურთავს. |

## მონაცემთა ნაკადი (ცოცხალი კურსი, self-healing ჯაჭვი)
```
NBG API ──→ Worker /api/rates ──→ edge-SSR (data-ssr) ──→ HTML
   └ fallback: NBG პირდაპირ ──→ open.er-api.com (საბაზრო)
```

## i18n დიზაინი — რატომ ასე
- **URL-subdirs (არა client-side switcher):** თითო ენა ცალკე ინდექსირებადი URL-ია → უკრაინულად/
  სომხურად მძებნელი პირდაპირ სწორ გვერდზე ხვდება. (გადაწყდა 2026-07-14, SEO-მოთხოვნის შეცვლისას.)
- **Hash-keyed dict:** თარგმანი დაკლავიშებულია **KA-ტემპლეიტის** ჰეშით. ⇒ KA-ს შეცვლა key-ს ცვლის
  (თარგმანი „იკარგება"); მხოლოდ თარგმანის-value-ს შეცვლა key-ს **არ** ცვლის — ამიტომ snippet-ის
  რედაქტირება უსაფრთხოა non-KA value-ზე, KA ხელუხლებელი.
- **`{n}` ნორმალიზაცია:** ერთადერთი განსხვავებული რიცხვი ტექსტში → `{n}` (fill-ზე უკან ჯდება).
  landing/homepage title-ებზე `{n}` ყოველთვის 1-ია.

## SEO/CTR კონვენციები
- **non-KA landing title = ინტენტი + geo:** „<ვალუტა> к лари … в Грузии" (არა გენერიკული
  „Курс рубля", რომელიც არასწორ RUB↔USD/EUR ინტენტს იზიდავს Yandex-ში).
- **transliteration-artifact „(rublis kursi)":** **მხოლოდ KA-ზე** (ქართველი ლათინურად ეძებს);
  არა-ქართული snippet-იდან მოცილებულია.
- **description question-form:** „Сколько лари стоит 1 X…" — Yandex query-match + snippet-ში bold.
- **IndexNow** deploy-ის შემდეგ (Bing/Yandex/Yahoo/DuckDuckGo; Google — sitemap/crawl).
- **სიახლის სიგნალი (freshness):** კურსი ყოველ სამუშაო დღეს იცვლება, ანუ გვერდების შიგთავსი
  მართლა ახლდება — ამიტომ `lastmod` ედჯზე NBG-ის `validFromDate`-ს უტოლდება (სტატიკურ
  sitemap-ში ბილდის თარიღი იყინებოდა), ხოლო cron ყოველდღე პინგავს IndexNow-ს.

## გაზომვა (GA4)
`public/ev.js` აგზავნის: `converter_used`, `amount_link_click`, `lang_switch`, `outbound_click`,
`engaged_90`, `rate_missing`. GA4-ის ინტერფეისში **key event-ებად მოსანიშნია `converter_used` და
`amount_link_click`** — ეს ორი განასხვავებს „კურსს დახედა და წავიდა"-ს რეალური გამოყენებისგან.
`rate_missing` = ედჯზე კურსი ვერ ჩაისვა (SSR-ის ჯანმრთელობის საზომი).

## უცვლელი წესები (INVARIANTS — არ დაარღვიო)
1. **KA არის წყარო.** `/<lang>/` build output-ია — არასდროს ასწორო ხელით; შეასწორე KA + rebuild,
   ან (პატარა ცვლილებაზე) `strings.i18n.json` + targeted-patch (იხ. README).
2. **build-i18n სუფთა KA-ს საჭიროებს** — ყოველთვის `git checkout public/` მის წინ, თორემ whitespace
   გროვდება და diff 378-ვე გვერდზე იშლება.
3. **რიცხვები არ hardcode-დება HTML-ში** — მხოლოდ `data-ssr`; Worker ავსებს.
4. **KA-ს title/description ცვლილება = ჰეშ-key იცვლება** ⇒ ყველა ენის თარგმანი უნდა გადამოწმდეს/
   ხელახლა-დაებას იმ key-ს.
