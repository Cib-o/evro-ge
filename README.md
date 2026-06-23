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
src/index.js             # Worker: /api/rates → NBG proxy; HTML-ში ცოცხალი კურსის edge-SSR
scripts/build-pages.js   # გენერატორი — amount გვერდები + sitemap + robots + IndexNow key
scripts/indexnow-submit.js # IndexNow ping (Bing/Yandex/Yahoo/DuckDuckGo)
wrangler.jsonc           # კონფიგი (assets → ./public, run_worker_first → SSR-ისთვის)
```

## გვერდების გენერაცია (build step არ სჭირდება დიფლოის)
amount გვერდები, sitemap, robots და IndexNow key გენერირდება ლოკალურად და **იკომიტება**:
```bash
node scripts/build-pages.js   # შემდეგ git add -A && commit && push
```
თანხების ნაკრები: `scripts/build-pages.js`-ში `AMOUNTS`. ვალუტები: `CUR` (EUR, USD).

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
