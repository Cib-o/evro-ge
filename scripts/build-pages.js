#!/usr/bin/env node
/*
 * evro.ge — programmatic page generator (multi-currency, edge-SSR ready).
 *
 * აგენერირებს:
 *   • amount გვერდებს ხშირად ძებნად თანხებზე — EUR↔GEL და USD↔GEL.
 *   • დოლარის სადესანტო გვერდს /dolari-lari/ ("დოლარის კურსი").
 *   • robots.txt + sitemap.xml + IndexNow key ფაილს.
 *
 *   node scripts/build-pages.js
 *
 * კურსი არსად არ არის hardcode. რიცხვები ცარიელია ("—"), ხოლო:
 *   • Worker (src/index.js) ცოცხალ კურსს ედჯზე ასმევს [data-ssr] ელემენტებში (crawler-ებისთვის).
 *   • client JS იმავე [data-ssr]-ს ავსებს /api/rates-დან (მომხმარებლისთვის, refresh).
 * data-ssr ენა: "EUR" (1 ერთეულის კურსი), "100*EUR", "100/EUR", "date".
 */

"use strict";

const fs = require("fs");
const path = require("path");

const SITE = "https://evro.ge";
const PUBLIC = path.join(__dirname, "..", "public");

const AMOUNTS = [1, 5, 10, 20, 50, 88, 100, 150, 200, 300, 500, 1000];

// IndexNow key (Bing/Yandex/Yahoo/DuckDuckGo). key ფაილი public/-ში ცხოვრობს.
const INDEXNOW_KEY = "d940979fa17f0e6139b34758501289e7";

const TODAY = new Date().toISOString().slice(0, 10);

// ვალუტის ფორმები (ქართული ბრუნვები ხელით).
const CUR = {
  EUR: { code: "EUR", sym: "€", slug: "evro", latin: "evro", nom: "ევრო", gen: "ევროს", loc: "ევროში", a: "ევროა" },
  USD: { code: "USD", sym: "$", slug: "dolari", latin: "dolari", nom: "დოლარი", gen: "დოლარის", loc: "დოლარში", a: "დოლარია" },
};

// ── დამხმარეები ──────────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function relatedAmounts(a) {
  return AMOUNTS.filter((x) => x !== a)
    .sort((p, q) => Math.abs(p - a) - Math.abs(q - a))
    .slice(0, 4)
    .sort((p, q) => p - q);
}

// ვარიანტის ინდექსი — დამოკიდებულია თანხაზე, მიმართულებასა და ვალუტაზე,
// რომ მეზობელი/პარალელური გვერდები ერთსა და იმავე ტექსტს არ იმეორებდნენ.
function variantIndex(a, c, toGel) {
  return (AMOUNTS.indexOf(a) + (toGel ? 0 : 1) + (c.code === "USD" ? 2 : 0)) % 4;
}

function paragraph(a, c, toGel) {
  const toGelV = [
    `${a} ${c.nom} ლარში გადაიყვანება დღევანდელ ${c.code}/GEL კურსზე გამრავლებით. კურსს ადგენს საქართველოს ეროვნული ბანკი და ის დღეში ერთხელ ახლდება, ამიტომ ზემოთ ნაჩვენები თანხა ყოველთვის უახლეს ოფიციალურ მაჩვენებელს ასახავს.`,
    `რამდენი ლარია ${a} ${c.nom}? პასუხი დღევანდელ კურსზეა დამოკიდებული, რომელიც ავტომატურად ჩაიტვირთა გვერდის თავში. თუ ${a} ${c.gen} გადარიცხვას ან გადაცვლას აპირებ, ჯობია წინასწარ შეადარო ბანკებისა და გადარიცხვის სერვისების პირობები.`,
    `${a} ${c.gen} ღირებულება ლარში მუდმივად მერყეობს ვალუტის ბაზრის მიხედვით. აქ ნაჩვენები რიცხვი ეროვნული ბანკის ოფიციალურ კურსს ეყრდნობა — იმავე კურსს, რომელსაც ბანკები საბაზისოდ იყენებენ.`,
    `${a} ${c.nom} დღეს რამდენ ლარს უდრის? გამოთვლა მარტივია — ${a} მრავლდება ერთი ${c.gen} მიმდინარე კურსზე. ქვემოთ ასევე ნახავ საპირისპირო გადათვლასაც, ანუ ${a} ლარი რამდენი ${c.a}.`,
  ];
  const fromGelV = [
    `${a} ლარი ${c.loc} გადაიყვანება ერთი ${c.gen} დღევანდელ კურსზე გაყოფით. კურსს ადგენს საქართველოს ეროვნული ბანკი და ის დღეში ერთხელ ახლდება, ამიტომ ${a} ლარის ღირებულება ${c.loc} დროთა განმავლობაში იცვლება.`,
    `${a} ლარი რამდენი ${c.a}? ზემოთ ნაჩვენები თანხა გამოითვალა ეროვნული ბანკის უახლესი ${c.code}/GEL კურსით. თუ ${c.loc} თანხის გადარიცხვა გჭირდება, შეადარე სხვადასხვა სერვისის საკომისიო და კურსი.`,
    `${a} ლარის ღირებულება ${c.loc} დამოკიდებულია მიმდინარე გაცვლით კურსზე. აქ ნაჩვენები რიცხვი ოფიციალურ NBG კურსს ეყრდნობა და ავტომატურად ახლდება.`,
    `${a} ლარი დღეს რამდენი ${c.a}? გამოთვლა მარტივია — ${a} ლარი იყოფა ერთი ${c.gen} მიმდინარე კურსზე. ქვემოთ ნახავ საპირისპირო გადათვლასაც — ${a} ${c.nom} რამდენი ლარია.`,
  ];
  return (toGel ? toGelV : fromGelV)[variantIndex(a, c, toGel)];
}

// worked-example აბზაცი — ცოცხალი (SSR) რიცხვებით + ლათინური ტრანსლიტერაცია.
// ამით თითო გვერდს უნიკალური, რეალური მონაცემი აქვს (thin-content-ის საწინააღმდეგოდ).
function workedExample(a, c, toGel) {
  const exprResult = toGel ? `${a}*${c.code}` : `${a}/${c.code}`;
  const exprRev = toGel ? `${a}/${c.code}` : `${a}*${c.code}`;
  const span = (e) => `<span class="num" data-ssr="${e}" data-dp="2">—</span>`;
  if (toGel) {
    const latin = `${a} ${c.latin} lari, ${a} ${c.code} to GEL`;
    return `${a} ${c.nom} დღევანდელი ოფიციალური კურსით არის ${span(exprResult)} ლარი (${latin}). მაჩვენებელი საქართველოს ეროვნული ბანკის კურსს ეყრდნობა და დღეში ერთხელ ახლდება. საპირისპიროდ, ${a} ლარი დაახლოებით ${span(exprRev)} ${c.nom}.`;
  }
  const latin = `${a} lari ${c.latin}, ${a} GEL to ${c.code}`;
  return `${a} ლარი დღევანდელი ოფიციალური კურსით არის ${span(exprResult)} ${c.nom} (${latin}). მაჩვენებელი საქართველოს ეროვნული ბანკის კურსს ეყრდნობა და დღეში ერთხელ ახლდება. საპირისპიროდ, ${a} ${c.nom} დაახლოებით ${span(exprRev)} ლარი.`;
}

// ── საერთო CSS / head ─────────────────────────────────────────────────────────
const BASE_CSS = `:root{--paper:#F1F4F7;--panel:#FFFFFF;--ink:#0B1530;--euro:#1B3A8F;--euro-2:#2E54B8;--gold:#B58A23;--muted:#5A6478;--line:rgba(11,21,48,.10);--radius:18px}
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
.result .big{font-size:clamp(40px,11vw,72px);font-weight:600;line-height:1;color:var(--ink);display:inline-block;min-width:3.5ch}
.result .cur{font-size:clamp(19px,5vw,28px);color:var(--euro);font-weight:500;margin-left:6px}
.result .meta{margin-top:14px;font-size:13.5px;color:var(--muted);display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.live{width:7px;height:7px;border-radius:50%;background:#0E8A5F;display:inline-block}
.pill{display:inline-flex;align-items:center;gap:6px;background:var(--paper);border:1px solid var(--line);border-radius:999px;padding:4px 11px;font-size:12.5px}
.rev{margin-top:16px;font-size:15px;color:#33405A}
.rev a{color:var(--euro);font-weight:600;text-decoration:none}
.rev a:hover{text-decoration:underline}
.prose{margin-top:28px}
.prose h2{font-family:"Noto Serif Georgian",serif;font-size:20px;margin-bottom:10px;font-weight:700}
.prose p{color:#33405A;font-size:15.5px;margin-bottom:14px;max-width:64ch}
.prose .num{color:var(--ink);font-weight:600}
.related{margin-top:30px}
.related h2{font-family:"Noto Serif Georgian",serif;font-size:18px;margin-bottom:12px;font-weight:700}
.chips{display:flex;flex-wrap:wrap;gap:10px}
.chip{background:var(--panel);border:1px solid var(--line);border-radius:999px;padding:8px 14px;font-size:14px;text-decoration:none;font-weight:500;transition:border-color .15s,color .15s}
.chip:hover{border-color:var(--euro);color:var(--euro)}
.cta{display:inline-block;margin-top:24px;background:var(--euro);color:#fff;font-weight:600;font-size:15px;padding:11px 18px;border-radius:10px;text-decoration:none}
.cta:hover{background:var(--euro-2)}
.foot{border-top:1px solid var(--line);margin-top:36px;padding:24px 0 50px;color:var(--muted);font-size:13px}
.foot .disc{margin-top:10px;font-size:12px;color:#5A6478;max-width:60ch}
.err{color:#C0392B;font-weight:500}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`;

const FONT_LINKS = `<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%231B3A8F'/%3E%3Ctext x='16' y='23' font-family='Georgia,serif' font-size='20' font-weight='700' fill='%23C19A2E' text-anchor='middle'%3E%E2%82%AC%3C/text%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Georgian:wght@400;500;600;700&family=Noto+Serif+Georgian:wght@600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">`;

// client-side helpers — ავსებს [data-ssr]-ს /api/rates-დან (Worker-ის edge SSR-ის სარკე).
const SSR_HELPERS_JS = `
  function fmt(n,d){d=(d==null?4:d);return n.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d});}
  function evalSSR(spec,map){var x=/^(?:(\\d+(?:\\.\\d+)?)([*\\/]))?([A-Z]{3})$/.exec(spec);if(!x)return null;var r=map[x[3]];if(r==null||!isFinite(r))return null;if(!x[1])return r;var a=parseFloat(x[1]);return x[2]==="*"?a*r:a/r;}
  function fillSSR(map){var ns=document.querySelectorAll("[data-ssr]");for(var i=0;i<ns.length;i++){var el=ns[i],spec=el.getAttribute("data-ssr");if(spec==="date")continue;var dp=parseInt(el.getAttribute("data-dp")||"4",10);var v=evalSSR(spec,map);if(v==null)continue;var s=fmt(v,dp);if(el.tagName==="INPUT")el.value=s;else el.textContent=s;}}
  function nbgMap(data,codes){var day=Array.isArray(data)?data[0]:data;if(!day||!day.currencies)return null;var m={};day.currencies.forEach(function(c){m[c.code]=c;});var map={},ok=false;codes.forEach(function(c){if(m[c]&&m[c].rate){map[c]=m[c].rate/m[c].quantity;ok=true;}});if(!ok)return null;var an=m[codes[0]];return{map:map,date:((an&&an.validFromDate)||day.date||"").slice(0,10),src:"ეროვნული ბანკი"};}
  function erMap(d,codes){var r=d.rates||d.conversion_rates;if(!r||!r.GEL)return null;var map={},ok=false;codes.forEach(function(c){if(c==="EUR"){map[c]=r.GEL;ok=true;}else if(r[c]){map[c]=r.GEL/r[c];ok=true;}});if(!ok)return null;return{map:map,date:d.time_last_update_utc?new Date(d.time_last_update_utc).toISOString().slice(0,10):"",src:"საბაზრო კურსი"};}`;

const SOURCES_JS = `[{url:"/api/rates",p:"nbg"},{url:"https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/ka/json",p:"nbg"},{url:"https://open.er-api.com/v6/latest/EUR",p:"er"}]`;

// ── amount გვერდის შაბლონი ────────────────────────────────────────────────────
function buildAmountPage(a, curKey, toGel) {
  const c = CUR[curKey];
  const slug = toGel ? `${a}-${c.slug}-lari` : `${a}-lari-${c.slug}`;
  const canonical = `${SITE}/${slug}/`;

  const h1 = toGel
    ? `${a} ${c.nom} რამდენი ლარია — ${a} ${c.code} to GEL`
    : `${a} ლარი რამდენი ${c.a} — ${a} GEL to ${c.code}`;
  const sub = toGel
    ? `${a} ${c.gen} ღირებულება ლარში დღევანდელი ოფიციალური კურსით`
    : `${a} ლარის ღირებულება ${c.loc} დღევანდელი ოფიციალური კურსით`;
  const title = toGel
    ? `${a} ${c.nom} რამდენი ლარია დღეს | evro.ge`
    : `${a} ლარი რამდენი ${c.a} დღეს | evro.ge`;
  const desc = toGel
    ? `${a} ${c.nom} (${c.code}) რამდენი ლარია (GEL) დღეს? ნახე ${a} ${c.gen} ღირებულება ლარში ეროვნული ბანკის ოფიციალური კურსით — ცოცხალი, ყოველდღიურად განახლებადი გადათვლა.`
    : `${a} ლარი (GEL) რამდენი ${c.a} (${c.code}) დღეს? ნახე ${a} ლარის ღირებულება ${c.loc} ეროვნული ბანკის ოფიციალური კურსით — ცოცხალი, ყოველდღიურად განახლებადი გადათვლა.`;
  const keywords = toGel
    ? `${a} ${c.nom} ლარი, ${a} ${c.latin} lari, ${a} ${c.code} GEL, ${a} ${c.nom} რამდენი ლარია`
    : `${a} ლარი ${c.nom}, ${a} lari ${c.latin}, ${a} GEL ${c.code}, ${a} ლარი რამდენი ${c.a}`;

  const resultCur = toGel ? "₾ ლარი" : `${c.sym} ${c.nom}`;
  const resultExpr = toGel ? `${a}*${c.code}` : `${a}/${c.code}`;
  const revExpr = toGel ? `${a}/${c.code}` : `${a}*${c.code}`;

  const revSlug = toGel ? `${a}-lari-${c.slug}` : `${a}-${c.slug}-lari`;
  const revLabel = toGel ? `${a} ლარი ${c.loc}` : `${a} ${c.nom} ლარში`;
  const revStatic = toGel
    ? `ან: ${a} ლარი = <span class="num" data-ssr="${revExpr}" data-dp="2">—</span> ${c.nom} · <a href="/${revSlug}/">${revLabel} →</a>`
    : `ან: ${a} ${c.nom} = <span class="num" data-ssr="${revExpr}" data-dp="2">—</span> ლარი · <a href="/${revSlug}/">${revLabel} →</a>`;

  const rel = relatedAmounts(a)
    .map((x) => {
      const rslug = toGel ? `${x}-${c.slug}-lari` : `${x}-lari-${c.slug}`;
      const label = toGel ? `${x} ${c.nom}` : `${x} ლარი`;
      return `<a class="chip" href="/${rslug}/">${label}</a>`;
    })
    .join("");

  // ჯვარედინი ბმული მეორე ვალუტის კლასტერზე (link-equity ორ კლასტერს შორის).
  const oc = CUR[curKey === "EUR" ? "USD" : "EUR"];
  const crossSlug = toGel ? `${a}-${oc.slug}-lari` : `${a}-lari-${oc.slug}`;
  const crossLabel = toGel ? `${a} ${oc.nom} ლარში` : `${a} ლარი ${oc.loc}`;
  const crossChip = `<a class="chip" href="/${crossSlug}/">${crossLabel}</a>`;

  const proseH2 = toGel ? `${a} ${c.nom} ლარში დღეს` : `${a} ლარი ${c.loc} დღეს`;

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
<meta name="keywords" content="${esc(keywords)}">
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
${FONT_LINKS}
<script type="application/ld+json">${breadcrumb}</script>
<style>
${BASE_CSS}
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
      <div><span class="big num" id="result" data-ssr="${resultExpr}" data-dp="2">—</span><span class="cur">${resultCur}</span></div>
      <div class="meta">
        <span>1 ${c.nom} = <span class="num" data-ssr="${c.code}" data-dp="4">—</span> ₾</span>
        <span class="pill"><span class="live"></span> <span id="date" data-ssr="date">იტვირთება…</span></span>
      </div>
      <div class="rev">${revStatic}</div>
    </div>

    <div class="prose">
      <h2>${proseH2}</h2>
      <p>${workedExample(a, c, toGel)}</p>
      <p>${paragraph(a, c, toGel)}</p>
    </div>

    <div class="related">
      <h2>სხვა თანხები</h2>
      <div class="chips">${rel}<a class="chip" href="/${revSlug}/">${revLabel}</a>${crossChip}</div>
    </div>

    <a class="cta" href="/">ყველა კურსი და კონვერტერი →</a>
  </div>
</main>

<footer class="foot">
  <div class="wrap">
    <div>© <span id="yr">${TODAY.slice(0, 4)}</span> evro.ge — ევრო ლარის კურსი</div>
    <p class="disc">კურსები ინფორმაციული დანიშნულებისაა და ეყრდნობა საქართველოს ეროვნული ბანკის ოფიციალურ მონაცემებს. ბანკის ან გადამცვლელის რეალური კურსი შესაძლოა განსხვავდებოდეს.</p>
  </div>
</footer>

<script>
(function(){
  "use strict";
  var CODE="${c.code}";
  var SOURCES=${SOURCES_JS};
  var dateEl=document.getElementById("date");
  var y=document.getElementById("yr"); if(y) y.textContent=new Date().getFullYear();
${SSR_HELPERS_JS}
  function paint(o){ fillSSR(o.map); if(dateEl) dateEl.textContent=o.date?("კურსი "+o.date+" · "+o.src):o.src; }
  function fail(){ var r=document.getElementById("result"); if(r) r.innerHTML='<span class="err">ვერ ჩაიტვირთა</span>'; if(dateEl) dateEl.textContent=""; }
  (function go(i){
    if(i>=SOURCES.length){fail();return;}
    var s=SOURCES[i];
    fetch(s.url,{cache:"no-store"})
      .then(function(r){if(!r.ok)throw 0;return r.json();})
      .then(function(d){var o=s.p==="nbg"?nbgMap(d,[CODE]):erMap(d,[CODE]);if(o&&o.map[CODE]!=null)paint(o);else throw 0;})
      .catch(function(){go(i+1);});
  })(0);
})();
</script>
</body>
</html>
`;
}

// ── დოლარის სადესანტო გვერდი /dolari-lari/ ────────────────────────────────────
function buildDollarLanding() {
  const canonical = `${SITE}/dolari-lari/`;
  const title = `დოლარის კურსი დღეს — USD/GEL ოფიციალური კურსი | evro.ge`;
  const ogTitle = `დოლარის კურსი დღეს — USD/GEL ოფიციალური კურსი`;
  const desc = `დოლარის კურსი ლარში დღეს — 1 დოლარი რამდენი ლარია ეროვნული ბანკის ოფიციალური კურსით. გადათვალე დოლარი ლარში ცოცხალი კონვერტერით (dolaris kursi).`;
  const keywords = `დოლარის კურსი, დოლარი ლარი, რა ღირს დოლარი, dolaris kursi, dolari lari, dollar lari, USD GEL`;
  const h1 = `დოლარის კურსი დღეს — დოლარი ლარი`;

  const faq = [
    { q: `რა ღირს 1 დოლარი დღეს?`, a: `1 დოლარის დღევანდელი ოფიციალური კურსი ლარში ნაჩვენებია გვერდის თავში, საქართველოს ეროვნული ბანკის მონაცემებით. კურსი ავტომატურად ახლდება, ამიტომ ყოველთვის უახლეს მაჩვენებელს ხედავ.`, aHtml: `1 დოლარის დღევანდელი ოფიციალური კურსი ლარში ნაჩვენებია გვერდის თავში, საქართველოს ეროვნული ბანკის მონაცემებით. კურსი ავტომატურად ახლდება, ამიტომ ყოველთვის უახლეს მაჩვენებელს ხედავ.` },
    { q: `100 დოლარი რამდენი ლარია?`, a: `100 დოლარის ღირებულება ლარში გამოითვლება დღევანდელ კურსზე გამრავლებით. ზუსტი თანხის სანახავად გამოიყენე კონვერტერი ან გახსენი გვერდი „100 დოლარი ლარში“.`, aHtml: `100 დოლარის ღირებულება ლარში გამოითვლება დღევანდელ კურსზე გამრავლებით. ზუსტი თანხის სანახავად გამოიყენე კონვერტერი ან გახსენი გვერდი <a href="/100-dolari-lari/">„100 დოლარი ლარში“</a>.` },
    { q: `სად ვნახო დოლარის ოფიციალური კურსი?`, a: `დოლარის ოფიციალურ კურსს ადგენს საქართველოს ეროვნული ბანკი (nbg.gov.ge) ყოველ სამუშაო დღეს. evro.ge სწორედ ამ მონაცემებს იყენებს და გიჩვენებს ცოცხალ კურსს.`, aHtml: `დოლარის ოფიციალურ კურსს ადგენს საქართველოს ეროვნული ბანკი (nbg.gov.ge) ყოველ სამუშაო დღეს. evro.ge სწორედ ამ მონაცემებს იყენებს და გიჩვენებს ცოცხალ კურსს.` },
  ];

  const faqLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: "ka",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  });
  const graphLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "მთავარი", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "დოლარის კურსი", item: canonical },
        ],
      },
      { "@type": "Organization", name: "evro.ge", url: SITE, logo: `${SITE}/og.svg` },
    ],
  });

  const popular = [50, 100, 200, 500, 1000]
    .map((x) => `<a class="chip" href="/${x}-dolari-lari/">${x} დოლარი ლარში</a>`)
    .join("");

  const faqHtml = faq
    .map((f) => `        <details>\n          <summary>${f.q}</summary>\n          <div class="ans">${f.aHtml}</div>\n        </details>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="ka">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="keywords" content="${esc(keywords)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="evro.ge">
<meta property="og:locale" content="ka_GE">
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}/og.svg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(ogTitle)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}/og.svg">
${FONT_LINKS}
<script type="application/ld+json">${graphLd}</script>
<script type="application/ld+json">${faqLd}</script>
<style>
${BASE_CSS}
.hero-rate{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:26px 24px;box-shadow:0 1px 2px rgba(11,21,48,.04)}
.hero-rate .eyebrow{font-family:"Noto Serif Georgian",serif;font-size:16px;color:var(--muted);font-weight:600;margin-bottom:8px}
.hero-rate .big{font-size:clamp(46px,13vw,86px);font-weight:600;line-height:.95;display:inline-block;min-width:4ch}
.hero-rate .cur{font-size:clamp(20px,5vw,30px);color:var(--euro);font-weight:500;margin-left:6px}
.hero-rate .meta{margin-top:14px;font-size:13.5px;color:var(--muted);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.strip{margin-top:18px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:16px 0;display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.strip-item{text-align:center;text-decoration:none}
.strip-item .pair{font-size:12px;color:var(--muted);font-weight:600;margin-bottom:3px}
.strip-item .val{font-size:18px;font-weight:600}
a.strip-item:hover .pair{color:var(--euro)}
@media(max-width:480px){.strip{grid-template-columns:repeat(2,1fr);gap:16px 8px}}
.conv{margin-top:18px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:8px;display:flex;align-items:stretch;gap:8px}
.conv-cell{flex:1;padding:14px 16px;border-radius:12px}
.conv-cell:focus-within{background:var(--paper)}
.conv-cell label{display:block;font-size:12px;color:var(--muted);font-weight:600;margin-bottom:3px}
.conv-input{width:100%;border:none;background:none;font-family:"Space Grotesk",monospace;font-variant-numeric:tabular-nums;font-size:26px;font-weight:600;color:var(--ink)}
.conv-input:focus{outline:none}
.conv-eq{display:grid;place-items:center;width:42px;color:var(--euro);font-size:20px;font-weight:600;flex:0 0 auto}
@media(max-width:480px){.conv{flex-direction:column}.conv-eq{width:100%;height:30px;transform:rotate(90deg)}}
.faq{display:grid;gap:12px;margin-top:14px}
.faq details{background:var(--panel);border:1px solid var(--line);border-radius:14px}
.faq summary{cursor:pointer;list-style:none;padding:15px 18px;font-weight:600;font-size:16px;display:flex;justify-content:space-between;align-items:center;gap:12px}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";color:var(--euro);font-size:22px;font-weight:600;line-height:1}
.faq details[open] summary::after{content:"−"}
.faq .ans{padding:0 18px 16px;color:#33405A;font-size:15px}
.faq .ans a{color:var(--euro);font-weight:600;text-decoration:none}
.faq .ans a:hover{text-decoration:underline}
.block{margin-top:34px}
.block h2{font-family:"Noto Serif Georgian",serif;font-size:22px;margin-bottom:12px;font-weight:700}
.prose h2{font-family:"Noto Serif Georgian",serif;font-size:22px;margin:30px 0 10px;font-weight:700}
.prose a{color:var(--euro);font-weight:600;text-decoration:none}
</style>
</head>
<body>
<header class="top">
  <div class="wrap top-in">
    <a class="brand" href="/"><span class="mark">€</span>evro<span class="dot">.ge</span></a>
    <a class="back" href="/">← ევროს კურსი</a>
  </div>
</header>

<main>
  <div class="wrap">
    <h1>${h1}</h1>
    <p class="sub">ამერიკული დოლარის (USD) ოფიციალური კურსი ლარში დღეს, საქართველოს ეროვნული ბანკის მონაცემებით.</p>

    <div class="hero-rate">
      <div class="eyebrow">1 დოლარი დღეს უდრის</div>
      <div><span class="big num" id="heroRate" data-ssr="USD" data-dp="4">—.————</span><span class="cur">₾ ლარს</span></div>
      <div class="meta">
        <span class="pill"><span class="live"></span> <span id="date" data-ssr="date">იტვირთება…</span></span>
        <span>წყარო: <span id="source">ეროვნული ბანკი</span></span>
      </div>
    </div>

    <div class="strip">
      <div class="strip-item"><div class="pair">EUR / GEL</div><div class="val num" data-ssr="EUR" data-dp="4">—</div></div>
      <div class="strip-item"><div class="pair">GBP / GEL</div><div class="val num" data-ssr="GBP" data-dp="4">—</div></div>
      <div class="strip-item"><div class="pair">TRY / GEL</div><div class="val num" data-ssr="TRY" data-dp="4">—</div></div>
      <div class="strip-item"><div class="pair">RUB / GEL</div><div class="val num" data-ssr="RUB" data-dp="4">—</div></div>
    </div>

    <div class="conv">
      <div class="conv-cell">
        <label for="usdIn">დოლარი (USD)</label>
        <input class="conv-input num" id="usdIn" inputmode="decimal" value="100">
      </div>
      <div class="conv-eq">=</div>
      <div class="conv-cell">
        <label for="gelIn">ლარი (GEL)</label>
        <input class="conv-input num" id="gelIn" data-ssr="100*USD" data-dp="2" inputmode="decimal" value="">
      </div>
    </div>

    <div class="block">
      <h2>პოპულარული თანხები</h2>
      <div class="chips">${popular}<a class="chip" href="/">ევროს კურსი →</a><a class="chip" href="/valutis-kursi/">ვალუტის კურსი →</a></div>
    </div>

    <div class="prose">
      <h2>დოლარის კურსი ლარში დღეს</h2>
      <p>ამ გვერდზე ნახავ ამერიკული დოლარის (USD) დღევანდელ ოფიციალურ კურსს ლარში (GEL) — ანუ რა ღირს 1 დოლარი დღეს. მონაცემები საქართველოს ეროვნული ბანკიდან მოდის და ავტომატურად ახლდება, ამიტომ დოლარის კურსი (dolaris kursi) ყოველთვის უახლესია. ზემოთ მოცემული კონვერტერით ნებისმიერ თანხას გადათვლი — ჩაწერ დოლარს და მაშინვე დაინახავ, რამდენი ლარია, ან პირიქით.</p>
      <h2>როგორ დგინდება დოლარის ოფიციალური კურსი</h2>
      <p>ეროვნული ბანკი დოლარის ოფიციალურ (ინდიკატიურ) კურსს ყოველ სამუშაო დღეს ადგენს ბანკთაშორის ვაჭრობაზე დაყრდნობით, და ის მეორე დღეს ამოქმედდება. ეს არ არის ფასი, რომლითაც პირდაპირ ყიდულობ ან ყიდი დოლარს — კომერციული ბანკები და გადამცვლელი პუნქტები საკუთარ ყიდვა-გაყიდვის კურსს აწესებენ, რომელიც ოფიციალურს ოდნავ სცდება.</p>
      <h2>1 დოლარი რამდენი ლარია და სად გადავცვალო</h2>
      <p>თუ გაინტერესებს, 1 დოლარი რამდენი ლარია ან 100 დოლარი რამდენ ლარად დაჯდება, ჯერ ნახე ზემოთ ნაჩვენები ოფიციალური კურსი, შემდეგ კი — სანამ რეალურად გადაცვლი — შეადარე რამდენიმე ბანკისა და გადამცვლელის კურსი. სხვაობა მცირე ჩანს, მაგრამ დიდ თანხაზე შესამჩნევია. ხშირად ძებნად კონკრეტულ თანხებს ცალკე გვერდები აქვს, მაგალითად <a href="/100-dolari-lari/">100 დოლარი ლარში</a> ან <a href="/500-dolari-lari/">500 დოლარი ლარში</a>.</p>
      <h2>რა მოქმედებს დოლარის კურსზე</h2>
      <p>დოლარი/ლარის კურსი იცვლება როგორც გლობალური ფაქტორებით (აშშ დოლარის სიძლიერე მსოფლიო ბაზარზე, ნავთობის ფასი), ისე ადგილობრივი მიზეზებით — ტურიზმის სეზონი, ფულადი გზავნილები, ექსპორტ-იმპორტის ბალანსი და ეროვნული ბანკის ინტერვენციები. სწორედ ამიტომ ღირს კურსზე თვალყურის დევნება, თუ რეგულარულად გადარიცხავ ან იღებ დოლარს.</p>
      <p>თუ ევროს კურსიც გაინტერესებს, ნახე <a href="/">ევრო ლარის კურსი მთავარ გვერდზე</a>.</p>
    </div>

    <div class="block">
      <h2>ხშირად დასმული კითხვები</h2>
      <div class="faq">
${faqHtml}
      </div>
    </div>
  </div>
</main>

<footer class="foot">
  <div class="wrap">
    <div>© <span id="yr">${TODAY.slice(0, 4)}</span> evro.ge — ვალუტის კურსი</div>
    <p class="disc">კურსები ინფორმაციული დანიშნულებისაა და ეყრდნობა საქართველოს ეროვნული ბანკის ოფიციალურ მონაცემებს. ბანკის ან გადამცვლელის რეალური კურსი შესაძლოა განსხვავდებოდეს.</p>
  </div>
</footer>

<script>
(function(){
  "use strict";
  var CODES=["USD","EUR","GBP","TRY","RUB"];
  var SOURCES=${SOURCES_JS};
  var rate=null;
  var dateEl=document.getElementById("date"), sourceEl=document.getElementById("source"),
      usdIn=document.getElementById("usdIn"), gelIn=document.getElementById("gelIn");
  var y=document.getElementById("yr"); if(y) y.textContent=new Date().getFullYear();
${SSR_HELPERS_JS}
  function parseNum(s){return parseFloat(String(s).replace(/[^\\d.,-]/g,"").replace(",","."));}
  function recalc(from){
    if(!rate) return;
    if(from==="usd"){var u=parseNum(usdIn.value);gelIn.value=isFinite(u)?fmt(u*rate,2):"";}
    else{var g=parseNum(gelIn.value);usdIn.value=isFinite(g)?fmt(g/rate,2):"";}
  }
  function paint(o){ rate=o.map.USD; fillSSR(o.map); if(dateEl) dateEl.textContent=o.date?("კურსი "+o.date):"განახლდა"; if(sourceEl) sourceEl.textContent=o.src; }
  function fail(){ var h=document.getElementById("heroRate"); if(h){h.textContent="ვერ ჩაიტვირთა";h.style.fontSize="clamp(28px,7vw,44px)";} if(dateEl) dateEl.textContent=""; }
  usdIn.addEventListener("input",function(){recalc("usd");});
  gelIn.addEventListener("input",function(){recalc("gel");});
  (function go(i){
    if(i>=SOURCES.length){fail();return;}
    var s=SOURCES[i];
    fetch(s.url,{cache:"no-store"})
      .then(function(r){if(!r.ok)throw 0;return r.json();})
      .then(function(d){var o=s.p==="nbg"?nbgMap(d,CODES):erMap(d,CODES);if(o&&o.map.USD!=null)paint(o);else throw 0;})
      .catch(function(){go(i+1);});
  })(0);
})();
</script>
</body>
</html>
`;
}

// ── ვალუტის კურსის hub /valutis-kursi/ ────────────────────────────────────────
function buildHubPage() {
  const canonical = `${SITE}/valutis-kursi/`;
  const title = `ვალუტის კურსი დღეს — დოლარი, ევრო, ფუნტი | evro.ge`;
  const ogTitle = `ვალუტის კურსი დღეს — დოლარი, ევრო, ფუნტი`;
  const desc = `ვალუტის კურსი ლარში დღეს — დოლარის, ევროს, ფუნტის, ლირის და რუბლის ოფიციალური კურსი ეროვნული ბანკის მონაცემებით (valutis kursi).`;
  const keywords = `ვალუტის კურსი, ვალუტის კურსი დღეს, valutis kursi, ეროვნული ბანკის კურსი, დოლარის კურსი, ევროს კურსი`;
  const h1 = `ვალუტის კურსი დღეს`;

  const rows = [
    { code: "USD", name: "ამერიკული დოლარი", href: "/dolari-lari/" },
    { code: "EUR", name: "ევრო", href: "/" },
    { code: "GBP", name: "ბრიტანული ფუნტი", href: null },
    { code: "TRY", name: "თურქული ლირა", href: null },
    { code: "RUB", name: "რუსული რუბლი", href: null },
  ]
    .map(
      (r) =>
        `        <tr>\n          <td>${r.name} <span class="code">${r.code}</span></td>\n          <td class="r"><span class="num" data-ssr="${r.code}" data-dp="4">—</span> ₾</td>\n          <td class="r">${r.href ? `<a href="${r.href}">დეტალურად →</a>` : ""}</td>\n        </tr>`
    )
    .join("\n");

  const faq = [
    { q: `რა არის დღევანდელი ვალუტის კურსი?`, a: `დღევანდელი ოფიციალური ვალუტის კურსი ნაჩვენებია ზემოთ მოცემულ ცხრილში — დოლარი, ევრო, ფუნტი, ლირა და რუბლი ლარის მიმართ, საქართველოს ეროვნული ბანკის მონაცემებით.` },
    { q: `სად ვნახო ოფიციალური ვალუტის კურსი?`, a: `ოფიციალურ ვალუტის კურსს ადგენს საქართველოს ეროვნული ბანკი (nbg.gov.ge) ყოველ სამუშაო დღეს. evro.ge სწორედ ამ მონაცემებს გიჩვენებს ცოცხლად.` },
    { q: `რამდენ ხანში ნახლდება კურსი?`, a: `კურსი დღეში ერთხელ ნახლდება — ეროვნული ბანკი ახალ ოფიციალურ კურსს ყოველ სამუშაო დღეს აქვეყნებს, ეს გვერდი კი ავტომატურად იღებს უახლეს მაჩვენებელს.` },
  ];
  const faqLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: "ka",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  });
  const graphLd = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "მთავარი", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: "ვალუტის კურსი", item: canonical },
        ],
      },
      { "@type": "Organization", name: "evro.ge", url: SITE, logo: `${SITE}/og.svg` },
    ],
  });

  const faqHtml = faq
    .map((f) => `        <details>\n          <summary>${f.q}</summary>\n          <div class="ans">${f.a}</div>\n        </details>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="ka">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="keywords" content="${esc(keywords)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="evro.ge">
<meta property="og:locale" content="ka_GE">
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:image" content="${SITE}/og.svg">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(ogTitle)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${SITE}/og.svg">
${FONT_LINKS}
<script type="application/ld+json">${graphLd}</script>
<script type="application/ld+json">${faqLd}</script>
<style>
${BASE_CSS}
.rates{width:100%;border-collapse:collapse;margin-top:6px;background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);overflow:hidden}
.rates th,.rates td{text-align:left;padding:14px 18px;border-bottom:1px solid var(--line);font-size:15px}
.rates th{font-size:12px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.03em}
.rates tr:last-child td{border-bottom:none}
.rates td.r{text-align:right;font-weight:600;white-space:nowrap}
.rates .code{color:var(--muted);font-size:13px;font-weight:600}
.rates a{color:var(--euro);font-weight:600;text-decoration:none}
.rates a:hover{text-decoration:underline}
.faq{display:grid;gap:12px;margin-top:14px}
.faq details{background:var(--panel);border:1px solid var(--line);border-radius:14px}
.faq summary{cursor:pointer;list-style:none;padding:15px 18px;font-weight:600;font-size:16px;display:flex;justify-content:space-between;align-items:center;gap:12px}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";color:var(--euro);font-size:22px;font-weight:600;line-height:1}
.faq details[open] summary::after{content:"−"}
.faq .ans{padding:0 18px 16px;color:#33405A;font-size:15px}
.block{margin-top:34px}
.block h2{font-family:"Noto Serif Georgian",serif;font-size:22px;margin-bottom:12px;font-weight:700}
.prose h2{font-family:"Noto Serif Georgian",serif;font-size:22px;margin:30px 0 10px;font-weight:700}
.prose a{color:var(--euro);font-weight:600;text-decoration:none}
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
    <p class="sub">დოლარის, ევროს, ფუნტის, ლირის და რუბლის ოფიციალური კურსი ლარში დღეს, საქართველოს ეროვნული ბანკის მონაცემებით.</p>

    <table class="rates">
      <thead>
        <tr><th>ვალუტა</th><th class="r">1 ერთეული ₾</th><th class="r"></th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
    <p class="sub" style="margin-top:12px"><span class="pill"><span class="live"></span> <span id="date" data-ssr="date">იტვირთება…</span></span></p>

    <div class="prose">
      <h2>ვალუტის კურსი ლარში დღეს</h2>
      <p>ცხრილში ნაჩვენებია ძირითადი ვალუტების — დოლარის (USD), ევროს (EUR), ფუნტის (GBP), თურქული ლირისა (TRY) და რუბლის (RUB) — დღევანდელი ოფიციალური კურსი ლარში. მონაცემები საქართველოს ეროვნული ბანკიდან მოდის და ავტომატურად ახლდება, ამიტომ ვალუტის კურსი (valutis kursi) ყოველთვის უახლესია.</p>
      <h2>ოფიციალური და კომერციული კურსი</h2>
      <p>ეროვნული ბანკი ადგენს ოფიციალურ (ინდიკატიურ) კურსს, რომელიც საბაზისოა. ბანკებსა და გადამცვლელ პუნქტებში ყიდვა-გაყიდვის კურსი ამ მაჩვენებელს ოდნავ სცდება, ამიტომ სანამ ვალუტას გადაცვლი, ღირს პირობების შედარება. დეტალური კონვერტერისთვის ნახე <a href="/">ევროს კურსი</a> ან <a href="/dolari-lari/">დოლარის კურსი</a>.</p>
    </div>

    <div class="block">
      <h2>ხშირად დასმული კითხვები</h2>
      <div class="faq">
${faqHtml}
      </div>
    </div>
  </div>
</main>

<footer class="foot">
  <div class="wrap">
    <div>© <span id="yr">${TODAY.slice(0, 4)}</span> evro.ge — ვალუტის კურსი</div>
    <p class="disc">კურსები ინფორმაციული დანიშნულებისაა და ეყრდნობა საქართველოს ეროვნული ბანკის ოფიციალურ მონაცემებს. ბანკის ან გადამცვლელის რეალური კურსი შესაძლოა განსხვავდებოდეს.</p>
  </div>
</footer>

<script>
(function(){
  "use strict";
  var CODES=["USD","EUR","GBP","TRY","RUB"];
  var SOURCES=${SOURCES_JS};
  var dateEl=document.getElementById("date");
${SSR_HELPERS_JS}
  function paint(o){ fillSSR(o.map); if(dateEl) dateEl.textContent=o.date?("კურსი "+o.date+" · "+o.src):o.src; }
  function fail(){ if(dateEl) dateEl.textContent="კურსი ვერ ჩაიტვირთა"; }
  (function go(i){
    if(i>=SOURCES.length){fail();return;}
    var s=SOURCES[i];
    fetch(s.url,{cache:"no-store"})
      .then(function(r){if(!r.ok)throw 0;return r.json();})
      .then(function(d){var o=s.p==="nbg"?nbgMap(d,CODES):erMap(d,CODES);if(o&&o.map.USD!=null)paint(o);else throw 0;})
      .catch(function(){go(i+1);});
  })(0);
})();
</script>
</body>
</html>
`;
}

// ── crawl/index ფაილები ───────────────────────────────────────────────────────
function buildRobots() {
  return `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`;
}
function buildSitemap(urls) {
  const body = urls
    .map((u) => `  <url>\n    <loc>${u.loc}</loc>\n    <lastmod>${TODAY}</lastmod>\n    <changefreq>daily</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

// ── გაშვება ──────────────────────────────────────────────────────────────────
function writePage(slug, html) {
  const dir = path.join(PUBLIC, slug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), html, "utf8");
}

function main() {
  const urls = [
    { loc: `${SITE}/`, priority: "1.0" },
    { loc: `${SITE}/valutis-kursi/`, priority: "0.9" },
    { loc: `${SITE}/dolari-lari/`, priority: "0.9" },
  ];
  let count = 0;

  ["EUR", "USD"].forEach((cur) => {
    AMOUNTS.forEach((a) => {
      [true, false].forEach((toGel) => {
        const c = CUR[cur];
        const slug = toGel ? `${a}-${c.slug}-lari` : `${a}-lari-${c.slug}`;
        writePage(slug, buildAmountPage(a, cur, toGel));
        urls.push({ loc: `${SITE}/${slug}/`, priority: "0.8" });
        count++;
      });
    });
  });

  writePage("dolari-lari", buildDollarLanding());
  writePage("valutis-kursi", buildHubPage());

  fs.writeFileSync(path.join(PUBLIC, "robots.txt"), buildRobots(), "utf8");
  fs.writeFileSync(path.join(PUBLIC, "sitemap.xml"), buildSitemap(urls), "utf8");
  fs.writeFileSync(path.join(PUBLIC, `${INDEXNOW_KEY}.txt`), INDEXNOW_KEY, "utf8");

  console.log(`✓ ${count} amount pages (EUR + USD)`);
  console.log(`✓ landings: /dolari-lari/ + /valutis-kursi/`);
  console.log(`✓ robots.txt + sitemap.xml (${urls.length} URLs) + IndexNow key file`);
}

main();
