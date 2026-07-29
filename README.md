# evro.ge — ევრო/ლარის კურსის საიტი

ცოცხალი EUR/GEL კურსი ეროვნული ბანკის მონაცემებით + კონვერტერი + გადარიცხვის/სესხის აფილიატ-სლოტები.
დიფლოი: **Cloudflare Worker** (სტატიკური ასეტები + API route).

## სტრუქტურა
```
public/index.html        # მთავარი გვერდი — ევროს კურსი (HTML + CSS + JS)
public/dolari-lari/      # დოლარის სადესანტო გვერდი — დოლარის კურსი
public/<N>-evro-lari/    # amount გვერდები (EUR↔GEL, USD↔GEL) — გენერირებული
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
თანხების ნაკრები: `scripts/build-pages.js`-ში `AMOUNTS`. ვალუტები: `CUR` (EUR, USD).

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

## IndexNow (Bing/Yandex/Yahoo/DuckDuckGo სწრაფი ინდექსაცია)
დიფლოის **შემდეგ** (key ფაილი ლაივზე უნდა იყოს):
```bash
node scripts/indexnow-submit.js   # მხოლოდ შეცვლილ URL-ებზე გაუშვი (სპამი → 429)
```
Google IndexNow-ს არ იყენებს — ის sitemap-ით/crawl-ით ინდექსავს.

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
