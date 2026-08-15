# evro.ge — ევრო/ლარის კურსის საიტი

ცოცხალი EUR/GEL კურსი ეროვნული ბანკის მონაცემებით + კონვერტერი + გადარიცხვის/სესხის აფილიატ-სლოტები.
დიფლოი: **Cloudflare Worker** (სტატიკური ასეტები + API route).

## სტრუქტურა
```
public/index.html        # მთავარი გვერდი — ევროს კურსი (HTML + CSS + JS)
public/dolari-lari/      # დოლარის სადესანტო გვერდი — დოლარის კურსი
public/<N>-evro-lari/    # amount გვერდები (EUR/USD/RUB/TRY ↔ GEL) — გენერირებული
public/sitemap.xml       # გენერირებული (homepage + ყველა amount გვერდი + /dolari-lari/)
public/robots.txt        # გენერირებული (Allow: / + Sitemap)
public/<key>.txt         # IndexNow key ფაილი (გენერირებული)
public/<lang>/           # /en/ /ru/ /uk/ /az/ /tr/ /hy/ — თარგმნილი გვერდები (build output)
src/index.js             # Worker: /api/rates → NBG proxy; HTML-ში ცოცხალი კურსის edge-SSR
scripts/build-pages.js   # KA გვერდების გენერატორი — amount + landing + sitemap + robots + IndexNow key
scripts/build-i18n.mjs   # i18n გენერატორი — KA-დან თარგმნის ყველა /<lang>/ გვერდს
scripts/strings.i18n.json # თარგმანების ბაზა (hash-key → 7 ენა) — თარგმანის source of truth
scripts/indexnow-submit.js # IndexNow ping (Bing/Yandex/Yahoo/DuckDuckGo)
wrangler.jsonc           # კონფიგი (assets → ./public, run_worker_first → SSR-ისთვის)
```

## გვერდების გენერაცია (build step არ სჭირდება დიფლოის)
amount გვერდები, sitemap, robots და IndexNow key გენერირდება ლოკალურად და **იკომიტება**:
```bash
node scripts/build-pages.js   # შემდეგ git add -A && commit && push
```
ვალუტები: `scripts/build-pages.js`-ში `CUR` (EUR, USD, RUB, TRY) + `ORDER`.
თანხების ნაკრები **ვალუტაზეა მიბმული** — ლარის მხარეს ყოველთვის `AMOUNTS` (1…1000), ხოლო
უცხოური ვალუტის მხარეს მისი მასშტაბი: `RUB_AMOUNTS` (100…100000), `TRY_AMOUNTS` (50…50000).
მიზეზი: 1 რუბლი ≈ 0.03 ლარი, ანუ „1 რუბლი ლარში" უაზრო გვერდია — რეალურად 1000/5000/10000
рублей იძებნება. სულ 96 amount გვერდი × 7 ენა.

## მრავალენოვანი სისტემა (i18n) — 7 ენა
საიტი 7 ენაზეა, თითო **ცალკე ინდექსირებად URL-ზე** (SEO-ისთვის):
- `ka` = root (`/`, `/100-evro-lari/`, …) — კანონიკური ქართული, **წყარო**.
- `en ru uk az tr hy` = ქვე-დირექტორიები (`/ru/…`, `/az/…`) — **build output, ხელით არ ასწორო**.

თითო `/<lang>/` გვერდი სრულად თარგმნილი სტატიკური HTML-ია (ტექსტი + `<title>` + meta description
+ og/twitter + JSON-LD schema), შიდა ბმულებით `/<lang>`-პრეფიქსით და hreflang-ალტერნატივებით
(7 ენა + x-default). **თარგმანის source of truth:** `scripts/strings.i18n.json` — დაკლავიშებულია
KA-ტექსტის ჰეშით (`keyFor`, `scripts/i18n-lib.mjs`). `build-i18n.mjs` კითხულობს სუფთა KA გვერდებს,
ამოიღებს სათარგმნ სტრიქონებს (ტექსტი + meta + schema), ჰეშავს და ცვლის თარგმანით.

### გადაგენერაცია — სწორი თანმიმდევრობა
```bash
git checkout public/**/*.html          # ⚠️ სავალდებულო — build-i18n სუფთა KA-ს საჭიროებს
node scripts/build-i18n.mjs            # წერს ka root-ს + ყველა /<lang>/ გვერდს
node scripts/build-sitemap.mjs         # sitemap ყველა ენით
node scripts/verify-langs.mjs          # 0 structural issue / 0 KA leak
```
**⚠️ Gotcha:** `build-i18n.mjs` **არ არის idempotentური** whitespace-ზე — უკვე build-ებულ გვერდზე
(git checkout-ის გარეშე) გაშვება ცარიელ ხაზებს აგროვებს, სრული rebuild კი **378-ვე გვერდის** diff-ს
გამოიღებს. ამიტომ ყოველთვის `git checkout public/` ჯერ.

### პატარა title/description ცვლილება (რამდენიმე გვერდზე, სუფთა diff)
სრული rebuild-ის churn-ის ასარიდებლად:
1. შეასწორე შესაბამისი **ენის** მნიშვნელობა `strings.i18n.json`-ში (**KA არ შეეხო** — ჰეშ-key სტაბილურია).
2. targeted-patch-ით ჩაასწორე მხოლოდ დაზარალებული built HTML ფაილები (regex-replace head-tag-ები:
   `<title>`, `og:title`, `twitter:title`, `description`, `og:description`, `twitter:description`).
3. deploy-ის მერე: `node scripts/indexnow-submit.js`.

`keywords` meta **არ ითარგმნება** pipeline-ით (ყველა ენაზე KA რჩება) — რანჟირებაზე გავლენა უმნიშვნელოა.

### SEO/CTR კონვენცია (non-KA landing-ები)
Yandex-ისთვის title-ები იწყება **კონკრეტული ინტენტით + geo**-თი: „<ვალუტა> к лари … в Грузии"
(არა გენერიკული „Курс рубля"). ლათინური transliteration-artifact „(rublis kursi)" **მოცილებულია
არა-ქართული ენებიდან** (KA-ზე რჩება — ქართველები ლათინურად ეძებენ). იხ. `ARCHITECTURE.md`.

### ენის დამატება
`LANGS/NAMES/LOCALE` → `build-i18n.mjs` + `i18n-translate.mjs` + Worker `LANGS/RATE_ON`; hreflang; მერე rebuild.

## ცოცხალი კურსი HTML-ში (edge SSR)
რიცხვი არსად არ არის hardcode. გვერდებზე `data-ssr` ატრიბუტებია (მაგ. `data-ssr="100*EUR"`),
რომელსაც **Worker ედჯზე ავსებს** ყოველ მოთხოვნაზე NBG-დან (crawler-ებიც ხედავენ რიცხვს),
ხოლო client JS იმავეს არეფრეშებს. ამისთვის `wrangler.jsonc`-ში `run_worker_first: true`.

## ისტორიული კურსები (`public/data/rates/`)
NBG-ს **ნებისმიერი თარიღი** შეუძლია (`?date=YYYY-MM-DD`), მაგრამ range-endpoint არ აქვს —
დღეზე ერთი მოთხოვნაა. მონაცემები 2003-მდე მიდის; ჩვენ **2015-დან** გვაქვს ჩამოტვირთული.

```
public/data/rates/EUR-2025.json   # {"c","y","start","fetched","v":[3.0186,null,…]}
public/data/rates/latest.json     # {"date","rates":{EUR,USD,RUB,TRY,GBP}} — Worker-ის fallback
```
`v[i]` = კურსი `start + i` დღეზე, **უკვე გაყოფილი `quantity`-ზე** (RUB-ს NBG-ში `quantity=100` აქვს).
`null` = იმ დღეს პუბლიკაცია არ იყო (2021 წლის ბოლომდე NBG ყოველდღე აქვეყნებდა, მერე მხოლოდ
სამშ–შაბ). მკითხველი წინა მნიშვნელობას ატარებს წინ.

```bash
node scripts/fetch-rates-history.mjs --from 2015-01-01   # backfill, resumable
node scripts/fetch-rates-day.mjs                          # ერთი დღე (cron-ისთვის)
```
⚠️ **NBG throttle-ს აკეთებს:** ~4000 მოთხოვნის შემდეგ API 307-ლუპში ვარდება ~5 წუთით.
`--conc` 5-ზე მეტი არ ღირს.

კუდს **GitHub Action** ავსებს (`.github/workflows/rates-tail.yml`, 06:20 UTC): ერთი მოთხოვნა,
და მხოლოდ თუ რამე შეიცვალა — commit `public/data/`-ზე → ავტომატური დიფლოი. Cloudflare-ის
cron-ს ეს ვერ გააკეთებდა (რეპოში ვერ წერს), KV კი მეორე source of truth გახდებოდა.

### რატომ არის ეს fallback-იც
2026-08-15-ს NBG-ის API ~10 წუთით redirect-ლუპში ჩავარდა და გვერდები crawler-ს `—.————`-ს
აჩვენებდნენ. ახლა Worker-ი ასეთ დროს `latest.json`-ს კითხულობს (ერთი ASSETS subrequest) და
**ბოლო ცნობილ კურსს გულწრფელი თარიღით** ასმევს — `/api/rates`-იც იმავეს აბრუნებს NBG-ის
ფორმატში, ანუ client-ის parser-ს ცვლილება არ სჭირდება.

## IndexNow (Bing/Yandex/Yahoo/DuckDuckGo სწრაფი ინდექსაცია)
**ავტომატურია.** Worker-ის cron (`wrangler.jsonc` → `triggers.crons`, 06:00 UTC = 10:00 თბილისი)
ყოველდღე პინგავს: ყველა landing (42 URL) + amount-გვერდების 1/7 როტაციით (~96 URL) ≈ 140/დღე,
ანუ თითოეული გვერდი კვირაში ერთხელ. სრული სია (714) ყოველდღე რომ იგზავნებოდეს → 429.

ხელით (მაგ. დიდი კონტენტ-ცვლილების მერე; key ფაილი ლაივზე უნდა იყოს):
```bash
node scripts/indexnow-submit.js   # აგზავნის sitemap-ის სრულ სიას
```
Google IndexNow-ს არ იყენებს — ის sitemap-ით/crawl-ით ინდექსავს.

## ანალიტიკა (GA4)
`public/ev.js` — ინტერაქციის ივენთები. **გენერირებულ HTML-ში არ წერია**: Worker-ი ედჯზე ურთავს
`</body>`-მდე, რომ ერთი `<script>`-ისთვის 378 გვერდის rebuild (და i18n whitespace churn) არ დაგვჭირდეს.
ივენთები: `converter_used`, `amount_link_click`, `lang_switch`, `outbound_click`, `engaged_90`,
`rate_missing`. GA4-ში ხელით მოსანიშნია key event-ებად: **`converter_used`, `amount_link_click`**
(Admin → Events → „Mark as key event").

## sitemap-ის lastmod
`public/sitemap.xml` სტატიკურია, მაგრამ `lastmod`-ს **Worker ცვლის ედჯზე** NBG-ის რეალური
`validFromDate`-ით — თორემ ყოველდღიური კურსის საიტს ბილდის თარიღი რჩებოდა და საძიებოებს
„აქ ახალი არაფერია" ეუბნებოდა.

## რატომ public/ საქაღალდე
`wrangler.jsonc`-ში `assets.directory = "./public"` — ანუ საჯაროდ **მხოლოდ** public/-ის შიგთავსი იტვირთება.
`.git`, `wrangler.jsonc`, `src/`, `README` — public/-ის გარეთაა, ანუ ბრაუზერით ვერ გაიხსნება.

## დიფლოი
Cloudflare Pages/Workers → Connect to Git → build/deploy command: `npx wrangler deploy`
(wrangler.jsonc რომ არსებობს, კონფიგი ავტომატურად აიყვანება. Custom domain → evro.ge.)
ყოველი `git push` → ავტომატური დიფლოი.

## განახლება
დაარედაქტირე `public/index.html`, შემდეგ:
```bash
git add -A
git commit -m "რა შეიცვალა"
git push
```

## მონაცემთა წყაროები (public/index.html, თვით-აღმდგენი ჯაჭვი)
1. /api/rates — Worker → ოფიციალური NBG, CORS-ის გარეშე
2. NBG პირდაპირ — სარეზერვო
3. open.er-api.com — სარეზერვო საბაზრო კურსი

## ცვლილების ისარი ▲/▼
NBG-ის diff-ის ნიშანზეა. თუ შებრუნებულია — public/index.html-ში `DIFF_SIGN = 1` → `-1`.

## შესავსები
public/index.html-ში `[სერვისის სახელი]`, `[საკომისიო]`, `[აფილიატ-ლინკი]` — შეავსე რეალური აფილიატ-დილების შემდეგ.
