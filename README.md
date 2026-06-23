# evro.ge — ევრო/ლარის კურსის საიტი

ცოცხალი EUR/GEL კურსი ეროვნული ბანკის მონაცემებით + კონვერტერი + გადარიცხვის/სესხის აფილიატ-სლოტები.
დიფლოი: **Cloudflare Worker** (სტატიკური ასეტები + API route).

## სტრუქტურა
```
public/index.html       # მთელი საიტი (HTML + CSS + JS). მხოლოდ ეს იტვირთება საჯაროდ.
src/index.js            # Worker: /api/rates → NBG proxy; დანარჩენი → public/-დან
wrangler.jsonc          # კონფიგი (assets → ./public, ანუ .git/README საჯაროდ არ ჩანს)
```

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
