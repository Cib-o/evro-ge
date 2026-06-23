# evro.ge — ევრო/ლარის კურსის საიტი

ცოცხალი EUR/GEL კურსი ეროვნული ბანკის მონაცემებით + კონვერტერი + გადარიცხვის/სესხის აფილიატ-სლოტები.

## სტრუქტურა
```
index.html              # მთელი საიტი (HTML + CSS + JS ერთ ფაილში)
functions/api/rates.js  # Cloudflare Function — NBG კურსის proxy (CORS-ის გადასაჭრელად)
```

## დიფლოი (ერთხელ) — Git + Cloudflare Pages

1. ატვირთე ეს repo GitHub-ზე (იხ. ქვემოთ ბრძანებები).
2. Cloudflare → Workers & Pages → Create → Pages → **Connect to Git** → აირჩიე ეს repo.
3. Build settings:
   - **Framework preset:** None
   - **Build command:** (ცარიელი)
   - **Build output directory:** `/`
4. Save and Deploy. `functions/` ავტომატურად ამოიცნობა.
5. Custom domains → `evro.ge`.

ამის შემდეგ ყოველი `git push` → ავტომატური დიფლოი. drag-drop აღარ სჭირდება.

## განახლება
დაარედაქტირე `index.html`, შემდეგ:
```bash
git add .
git commit -m "r.რა შეიცვალა"
git push
```
Cloudflare თავად დაბილდავს და დიფლოის ~1 წუთში.

## პირველი push GitHub-ზე
GitHub CLI-ით (უმარტივესი):
```bash
cd evro
git init
git add .
git commit -m "evro.ge: initial"
gh repo create evro-ge --public --source=. --remote=origin --push
```
ან ხელით: შექმენი repo github.com-ზე, შემდეგ:
```bash
git remote add origin https://github.com/USERNAME/evro-ge.git
git branch -M main
git push -u origin main
```

## მონაცემთა წყაროები (index.html, თვით-აღმდგენი ჯაჭვი)
1. `/api/rates` — Cloudflare Function (ოფიციალური NBG, CORS-ის გარეშე)
2. NBG პირდაპირ — ოფიციალური კურსი
3. open.er-api.com — სარეზერვო საბაზრო კურსი

## ცვლილების ისარი ▲/▼
NBG-ის `diff`-ის ნიშანზეა. თუ ისარი არასწორ მიმართულებას აჩვენებს —
`index.html`-ში შეცვალე `DIFF_SIGN = 1` → `-1`.

## შესავსები (აფილიატ-სლოტები)
`index.html`-ში `[სერვისის სახელი]`, `[საკომისიო]`, `[აფილიატ-ლინკი]` —
შეავსე მხოლოდ რეალური აფილიატ-დილების შემდეგ.
