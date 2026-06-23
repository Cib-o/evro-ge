#!/usr/bin/env node
/*
 * evro.ge — programmatic amount-page generator.
 *
 * აგენერირებს თითო სტატიკურ გვერდს ხშირად ძებნად თანხებზე (EUR→GEL და GEL→EUR),
 * + robots.txt + sitemap.xml. ყველაფერი იწერება public/-ში და ICOMMIT-დება,
 * ანუ `npx wrangler deploy`-ს დამატებითი build ნაბიჯი არ სჭირდება.
 *
 *   node scripts/build-pages.js
 *
 * კურსი არსად არ არის hardcode — ყველა გვერდი /api/rates-დან ცოცხლად ითვლის.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const SITE = "https://evro.ge";
const PUBLIC = path.join(__dirname, "..", "public");

// გონივრული, ხშირად ძებნადი ნაკრები — განზრახ მცირე (thin/doorway ჯარიმის თავიდან ასაცილებლად).
const AMOUNTS = [1, 5, 10, 20, 50, 88, 100, 150, 200, 300, 500, 1000];

// დღევანდელი თარიღი sitemap-ის lastmod-ისთვის (YYYY-MM-DD).
const TODAY = new Date().toISOString().slice(0, 10);

// ── დამხმარეები ──────────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// უახლოესი 4 თანხა (იმავე მიმართულების შიდა ბმულებისთვის).
function relatedAmounts(a) {
  return AMOUNTS.filter((x) => x !== a)
    .sort((p, q) => Math.abs(p - a) - Math.abs(q - a))
    .slice(0, 4)
    .sort((p, q) => p - q);
}

// უნიკალური აბზაცი — ვარიანტი თანხის პოზიციის მიხედვით (დუბლი-კონტენტის თავიდან ასაცილებლად).
function paragraph(a, dir) {
  const idx = AMOUNTS.indexOf(a);
  const eur2gel = [
    `${a} ევრო ლარში გადაიყვანება დღევანდელ EUR/GEL კურსზე გამრავლებით. კურსს ადგენს საქართველოს ეროვნული ბანკი და ის დღეში ერთხელ ახლდება, ამიტომ ზემოთ ნაჩვენები თანხა ყოველთვის უახლეს ოფიციალურ მაჩვენებელს ასახავს.`,
    `რამდენი ლარია ${a} ევრო? პასუხი დღევანდელ კურსზეა დამოკიდებული, რომელიც ავტომატურად ჩაიტვირთა გვერდის თავში. თუ ${a} ევროს გადარიცხვას ან გადაცვლას აპირებ, ჯობია წინასწარ შეადარო ბანკებისა და გადარიცხვის სერვისების პირობები.`,
    `${a} ევროს ღირებულება ლარში მუდმივად მერყეობს ვალუტის ბაზრის მიხედვით. აქ ნაჩვენები რიცხვი ეროვნული ბანკის ოფიციალურ კურსს ეყრდნობა — იმავე კურსს, რომელსაც ბანკები საბაზისოდ იყენებენ.`,
    `${a} ევრო დღეს რამდენ ლარს უდრის? გამოთვლა მარტივია — ${a} მრავლდება ერთი ევროს მიმდინარე კურსზე. ქვემოთ ასევე ნახავ უკუმიმართულებას, ანუ ${a} ლარი რამდენი ევროა.`,
  ];
  const gel2eur = [
    `${a} ლარი ევროში გადაიყვანება დღევანდელ კურსზე გაყოფით. კურსს ადგენს საქართველოს ეროვნული ბანკი და ის დღეში ერთხელ ახლდება, ამიტომ ${a} ლარის ღირებულება ევროში დროთა განმავლობაში იცვლება.`,
    `რამდენი ევროა ${a} ლარი? ზემოთ ნაჩვენები თანხა გამოითვალა ეროვნული ბანკის უახლესი EUR/GEL კურსით. თუ ევროში თანხის გადარიცხვა გჭირდება, შეადარე სხვადასხვა სერვისის საკომისიო და კურსი.`,
    `${a} ლარის ღირებულება ევროში დამოკიდებულია მიმდინარე გაცვლით კურსზე. აქ ნაჩვენები რიცხვი ოფიციალურ NBG კურსს ეყრდნობა და ავტომატურად ახლდება.`,
    `${a} ლარი დღეს რამდენი ევროა? გამოთვლა ხდება ${a}-ის ერთ ევროზე გაყოფით მიმდინარე კურსით. ქვემოთ ნახავ უკუმიმართულებასაც — ${a} ევრო რამდენი ლარია.`,
  ];
  return (dir === "eur2gel" ? eur2gel : gel2eur)[idx % 4];
}

// ── გვერდის შაბლონი ───────────────────────────────────────────────────────────
function buildPage(a, dir) {
  const isE2G = dir === "eur2gel";
  const slug = isE2G ? `${a}-evro-lari` : `${a}-lari-evro`;
  const canonical = `${SITE}/${slug}/`;

  const h1 = isE2G
    ? `${a} ევრო რამდენი ლარია — ${a} EUR to GEL`
    : `${a} ლარი რამდენი ევროა — ${a} GEL to EUR`;
  const sub = isE2G
    ? `${a} ევროს ღირებულება ლარში დღევანდელი ოფიციალური კურსით`
    : `${a} ლარის ღირებულება ევროში დღევანდელი ოფიციალური კურსით`;
  const title = isE2G
    ? `${a} ევრო რამდენი ლარია — ${a} EUR to GEL დღეს | evro.ge`
    : `${a} ლარი რამდენი ევროა — ${a} GEL to EUR დღეს | evro.ge`;
  const desc = isE2G
    ? `${a} ევრო (EUR) რამდენი ლარია (GEL) დღეს? ნახე ${a} ევროს ღირებულება ლარში ეროვნული ბანკის ოფიციალური კურსით — ცოცხალი, ყოველდღიურად განახლებადი გადათვლა.`
    : `${a} ლარი (GEL) რამდენი ევროა (EUR) დღეს? ნახე ${a} ლარის ღირებულება ევროში ეროვნული ბანკის ოფიციალური კურსით — ცოცხალი, ყოველდღიურად განახლებადი გადათვლა.`;

  // შედეგის ვალუტა (დიდი რიცხვის გვერდით).
  const resultCur = isE2G ? "₾ ლარი" : "€ ევრო";

  // დაკავშირებული თანხები (იმავე მიმართულება) — შიდა ბმულები.
  const rel = relatedAmounts(a)
    .map((x) => {
      const rslug = isE2G ? `${x}-evro-lari` : `${x}-lari-evro`;
      const label = isE2G ? `${x} ევრო` : `${x} ლარი`;
      return `<a class="chip" href="/${rslug}/">${label}</a>`;
    })
    .join("");

  // უკუმიმართულების ბმული.
  const revSlug = isE2G ? `${a}-lari-evro` : `${a}-evro-lari`;

  const breadcrumb = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "მთავარი", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: h1, item: canonical },
    ],
  });

  return `<!DOCTYPE html>
<html lang="ka">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="evro.ge">
<meta property="og:locale" content="ka_GE">
<meta property="og:title" content="${esc(h1)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}/og.svg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(h1)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}/og.svg">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%231B3A8F'/%3E%3Ctext x='16' y='23' font-family='Georgia,serif' font-size='20' font-weight='700' fill='%23C19A2E' text-anchor='middle'%3E%E2%82%AC%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Georgian:wght@400;500;600;700&family=Noto+Serif+Georgian:wght@600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<script type="application/ld+json">${breadcrumb}</script>
<style>
:root{--paper:#F1F4F7;--panel:#FFFFFF;--ink:#0B1530;--euro:#1B3A8F;--euro-2:#2E54B8;--gold:#B58A23;--muted:#5A6478;--line:rgba(11,21,48,.10);--radius:18px}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{font-family:"Noto Sans Georgian",system-ui,sans-serif;background:var(--paper);color:var(--ink);line-height:1.55;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
.num{font-family:"Space Grotesk",monospace;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.wrap{width:100%;max-width:720px;margin:0 auto;padding:0 20px}
a{color:inherit}
:focus-visible{outline:2.5px solid var(--euro);outline-offset:3px;border-radius:6px}
.top{border-bottom:1px solid var(--line);background:var(--paper)}
.top-in{display:flex;align-items:center;justify-content:space-between;height:60px}
.brand{display:flex;align-items:center;gap:9px;font-weight:700;font-size:19px;letter-spacing:-.02em;text-decoration:none}
.brand .mark{width:30px;height:30px;border-radius:8px;background:var(--euro);color:var(--gold);display:grid;place-items:center;font-family:Georgia,serif;font-size:19px;font-weight:700}
.brand .dot{color:var(--euro)}
.back{font-size:14px;color:var(--muted);text-decoration:none}
.back:hover{color:var(--ink)}
main{padding:42px 0 10px}
h1{font-family:"Noto Serif Georgian",serif;font-size:clamp(23px,5.2vw,33px);font-weight:700;letter-spacing:-.01em;margin-bottom:8px}
.sub{color:var(--muted);font-size:15px;margin-bottom:26px}
.result{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:26px 24px;box-shadow:0 1px 2px rgba(11,21,48,.04)}
.result .big{font-size:clamp(40px,11vw,72px);font-weight:600;line-height:1;color:var(--ink)}
.result .cur{font-size:clamp(19px,5vw,28px);color:var(--euro);font-weight:500;margin-left:6px}
.result .meta{margin-top:14px;font-size:13.5px;color:var(--muted);display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.live{width:7px;height:7px;border-radius:50%;background:#0E8A5F;display:inline-block}
.rev{margin-top:16px;font-size:15px;color:#33405A}
.rev a{color:var(--euro);font-weight:600;text-decoration:none}
.rev a:hover{text-decoration:underline}
.prose{margin-top:28px}
.prose p{color:#33405A;font-size:15.5px;margin-bottom:14px;max-width:64ch}
.related{margin-top:30px}
.related h2{font-family:"Noto Serif Georgian",serif;font-size:18px;margin-bottom:12px;font-weight:700}
.chips{display:flex;flex-wrap:wrap;gap:10px}
.chip{background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:8px 14px;font-size:14px;text-decoration:none;font-weight:500;transition:border-color .15s,color .15s}
.chip:hover{border-color:var(--euro);color:var(--euro)}
.cta{display:inline-block;margin-top:24px;background:var(--euro);color:#fff;font-weight:600;font-size:15px;padding:11px 18px;border-radius:10px;text-decoration:none}
.cta:hover{background:var(--euro-2)}
.foot{border-top:1px solid var(--line);margin-top:36px;padding:24px 0 50px;color:var(--muted);font-size:13px}
.foot .disc{margin-top:10px;font-size:12px;color:#8A92A3;max-width:60ch}
.err{color:#C0392B;font-weight:500}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>
<header class="top">
  <div class="wrap top-in">
    <a class="brand" href="/"><span class="mark">€</span>evro<span class="dot">.ge</span></a>
    <a class="back" href="/">← მთავარი</a>
  </div>
</header>

<main>
  <div class="wrap">
    <h1>${h1}</h1>
    <p class="sub">${sub}</p>

    <div class="result">
      <div><span class="big num" id="result">—</span><span class="cur">${resultCur}</span></div>
      <div class="meta">
        <span class="num" id="rate">—</span>
        <span class="pill"><span class="live"></span> <span id="date">იტვირთება…</span></span>
      </div>
      <div class="rev" id="reverse"></div>
    </div>

    <div class="prose">
      <p>${paragraph(a, dir)}</p>
    </div>

    <div class="related">
      <h2>სხვა თანხები</h2>
      <div class="chips">${rel}<a class="chip" href="/${revSlug}/">${isE2G ? `${a} ლარი ევროში` : `${a} ევრო ლარში`}</a></div>
    </div>

    <a class="cta" href="/">ყველა კურსი და კონვერტერი →</a>
  </div>
</main>

<footer class="foot">
  <div class="wrap">
    <div>© <span id="yr"></span> evro.ge — ევრო ლარის კურსი</div>
    <p class="disc">კურსები ინფორმაციული დანიშნულებისაა და ეყრდნობა საქართველოს ეროვნული ბანკის ოფიციალურ მონაცემებს. ბანკის ან გადამცვლელის რეალური კურსი შესაძლოა განსხვავდებოდეს.</p>
  </div>
</footer>

<script>
(function(){
  "use strict";
  var AMOUNT=${a}, DIR="${dir}";
  var SOURCES=[
    {url:"/api/rates",p:nbg},
    {url:"https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/ka/json",p:nbg},
    {url:"https://open.er-api.com/v6/latest/EUR",p:er}
  ];
  var resultEl=document.getElementById("result"),
      rateEl=document.getElementById("rate"),
      revEl=document.getElementById("reverse"),
      dateEl=document.getElementById("date");
  var y=document.getElementById("yr"); if(y) y.textContent=new Date().getFullYear();
  function fmt(n,d){d=(d==null?2:d);return n.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});}
  function nbg(data){var day=Array.isArray(data)?data[0]:data;if(!day||!day.currencies)return null;var e=null;day.currencies.forEach(function(c){if(c.code==="EUR")e=c;});if(!e||!e.rate)return null;return{rate:e.rate/e.quantity,date:(e.validFromDate||day.date||"").slice(0,10),src:"ეროვნული ბანკი"};}
  function er(d){var r=d.rates||d.conversion_rates;if(!r||!r.GEL)return null;return{rate:r.GEL,date:d.time_last_update_utc?new Date(d.time_last_update_utc).toISOString().slice(0,10):"",src:"საბაზრო კურსი"};}
  function paint(m){
    var rate=m.rate;
    rateEl.textContent="1 ევრო = "+fmt(rate,4)+" ₾";
    if(dateEl) dateEl.textContent=m.date?("კურსი "+m.date+" · "+m.src):m.src;
    if(DIR==="eur2gel"){
      resultEl.textContent=fmt(AMOUNT*rate,2);
      revEl.innerHTML='ან: '+AMOUNT+' ლარი = <strong class="num">'+fmt(AMOUNT/rate,2)+'</strong> ევრო · <a href="/'+AMOUNT+'-lari-evro/">'+AMOUNT+' ლარი ევროში →</a>';
    } else {
      resultEl.textContent=fmt(AMOUNT/rate,2);
      revEl.innerHTML='ან: '+AMOUNT+' ევრო = <strong class="num">'+fmt(AMOUNT*rate,2)+'</strong> ლარი · <a href="/'+AMOUNT+'-evro-lari/">'+AMOUNT+' ევრო ლარში →</a>';
    }
  }
  function fail(){resultEl.innerHTML='<span class="err">ვერ ჩაიტვირთა</span>';if(dateEl)dateEl.textContent="";}
  (function go(i){
    if(i>=SOURCES.length){fail();return;}
    var s=SOURCES[i];
    fetch(s.url,{cache:"no-store"})
      .then(function(r){if(!r.ok)throw 0;return r.json();})
      .then(function(d){var m=s.p(d);if(m&&m.rate)paint(m);else throw 0;})
      .catch(function(){go(i+1);});
  })(0);
})();
</script>
</body>
</html>
`;
}

// ── robots.txt ───────────────────────────────────────────────────────────────
function buildRobots() {
  return `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`;
}

// ── sitemap.xml ──────────────────────────────────────────────────────────────
function buildSitemap(urls) {
  const body = urls
    .map(
      (u) =>
        `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// ── გაშვება ──────────────────────────────────────────────────────────────────
function main() {
  const urls = [{ loc: `${SITE}/`, priority: "1.0" }];
  let count = 0;

  AMOUNTS.forEach((a) => {
    ["eur2gel", "gel2eur"].forEach((dir) => {
      const slug = dir === "eur2gel" ? `${a}-evro-lari` : `${a}-lari-evro`;
      const dir2 = path.join(PUBLIC, slug);
      fs.mkdirSync(dir2, { recursive: true });
      fs.writeFileSync(path.join(dir2, "index.html"), buildPage(a, dir), "utf8");
      urls.push({ loc: `${SITE}/${slug}/`, priority: "0.8" });
      count++;
    });
  });

  fs.writeFileSync(path.join(PUBLIC, "robots.txt"), buildRobots(), "utf8");
  fs.writeFileSync(path.join(PUBLIC, "sitemap.xml"), buildSitemap(urls), "utf8");

  console.log(`✓ ${count} amount pages generated`);
  console.log(`✓ robots.txt + sitemap.xml (${urls.length} URLs) written`);
  console.log("URLs:");
  urls.forEach((u) => console.log("  " + u.loc));
}

main();
