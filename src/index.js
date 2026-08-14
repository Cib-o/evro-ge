// evro.ge — Cloudflare Worker
// /api/rates → ეროვნული ბანკის კურსის proxy (CORS-ით).
// HTML გვერდები → ცოცხალი კურსი ედჯზე ისმება [data-ssr] ელემენტებში (crawler-ებისთვის),
//                 ხოლო client JS იმავეს ავსებს refresh-ისთვის. რიცხვი არსად არ არის hardcode —
//                 ყოველ მოთხოვნაზე NBG-დან მოდის (edge-ქეშით).
// დანარჩენი → სტატიკური ფაილები public/-დან.

const NBG = "https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/ka/json";
const SSR_CODES = ["EUR", "USD", "GBP", "TRY", "RUB"];

// Multilingual: Georgian at root, other languages under /{lang}/ (static, pre-rendered).
const LANGS = ["en", "ru", "uk", "az", "tr", "hy"];
// "date" SSR prefix per language (matches @rate_on in the translation dictionary).
const RATE_ON = { ka: "კურსი", en: "Rate on", ru: "Курс на", uk: "Курс на", az: "Məzənnə", tr: "Kur", hy: "Փոխարժեք" };
// Don't language-redirect crawlers — they must reach each URL as requested (hreflang guides them).
const BOT_RE = /bot|crawl|spider|slurp|bing|yandex|baidu|duckduckbot|facebookexternalhit|embedly|quora|pinterest|slackbot|telegrambot|whatsapp|googlebot|google-inspectiontool|petalbot|semrush|ahrefs|mj12/i;

function langFromPath(pathname) {
  const m = /^\/(en|ru|uk|az|tr|hy)(?:\/|$)/.exec(pathname);
  return m ? m[1] : "ka";
}

function pickAcceptLang(header) {
  if (!header) return null;
  const prefs = header.split(",").map((part) => {
    const [tag, q] = part.trim().split(";q=");
    return { code: tag.slice(0, 2).toLowerCase(), q: q ? parseFloat(q) : 1 };
  }).sort((a, b) => b.q - a.q);
  for (const { code } of prefs) {
    if (code === "ka") return "ka";
    if (LANGS.includes(code)) return code;
  }
  return null;
}

// First-visit language redirect: humans only, no lang cookie, HTML navigation on a ka path.
function maybeRedirect(request, url) {
  if (request.method !== "GET") return null;
  const p = url.pathname;
  if (langFromPath(p) !== "ka") return null;                 // already a language page
  if (p.startsWith("/api") || /\.[a-z0-9]+$/i.test(p)) return null; // assets/files
  const accept = request.headers.get("accept") || "";
  if (!accept.includes("text/html")) return null;
  if (BOT_RE.test(request.headers.get("user-agent") || "")) return null;

  const cookie = request.headers.get("cookie") || "";
  const cm = /(?:^|;\s*)lang=([a-z]{2})/.exec(cookie);
  let lang;
  if (cm) {
    lang = cm[1];                                             // explicit choice (either direction) wins
  } else {
    // no cookie: visitors in Georgia default to Georgian — don't auto-send them away
    if ((request.cf && request.cf.country) === "GE") return null;
    lang = pickAcceptLang(request.headers.get("accept-language"));
  }
  if (!lang || lang === "ka" || !LANGS.includes(lang)) return null;

  const headers = new Headers({ location: "/" + lang + p, "cache-control": "no-store", vary: "Cookie, Accept-Language" });
  if (!cm) headers.append("set-cookie", `lang=${lang}; Path=/; Max-Age=31536000; SameSite=Lax`);
  return new Response(null, { status: 302, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/rates") {
      return handleRates();
    }

    const redirect = maybeRedirect(request, url);
    if (redirect) return redirect;

    // Yandex Webmaster verification — Worker-იდან პირდაპირ ვაბრუნებთ, რადგან Cloudflare
    // assets-ი ".html" მისამართს clean-URL-ზე 307-ით ამისამართებს (verification იშლება).
    if (url.pathname === "/yandex_a04709ce19b8497c.html") {
      return new Response(
        '<html>\n    <head>\n        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">\n    </head>\n    <body>Verification: a04709ce19b8497c</body>\n</html>\n',
        { headers: { "content-type": "text/html; charset=utf-8" } }
      );
    }

    const res = await env.ASSETS.fetch(request);

    // sitemap-ის lastmod ედჯზე ისმება — იხ. freshSitemap().
    if (url.pathname === "/sitemap.xml") return freshSitemap(res);

    // SSR მხოლოდ ჩვენს HTML გვერდებზე (trailing-slash directory). ".html" პირდაპირი
    // მისამართები (მაგ. Yandex/Google verification ფაილები) უცვლელად გადის.
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html") || request.method !== "GET" || url.pathname.endsWith(".html")) return res;

    // ანალიტიკის სკრიპტი ყოველთვის ეკვრის; კურსის SSR — მხოლოდ თუ NBG მოგვცა.
    let rewriter = new HTMLRewriter().on("body", new TailScriptHandler());
    try {
      const computed = computeRates(await fetchNBG());
      if (computed && computed.rates) {
        const lang = langFromPath(url.pathname);
        rewriter = rewriter.on("[data-ssr]", new SsrHandler(computed.rates, computed.date, RATE_ON[lang] || RATE_ON.ka));
      }
    } catch (e) {
      // კურსი ვერ მოვიდა — გვერდი მაინც გადის (client JS შეავსებს რიცხვს).
    }

    const out = rewriter.transform(res);

    // HTML მცირე ხნით იქეშება ედჯზე (სისწრაფისთვის), მაგრამ სწრაფად ნახლდება:
    // 5 წთ "ახალი", შემდეგ stale-while-revalidate — ანუ კურსის/დიფლოის ცვლილება
    // სწრაფად ვრცელდება, client JS კი მომხმარებელს ისედაც აცოცხლებს რიცხვს.
    const headers = new Headers(out.headers);
    headers.set("cache-control", "public, max-age=300, stale-while-revalidate=3600");
    return new Response(out.body, { status: out.status, statusText: out.statusText, headers });
  },

  // ყოველდღიური cron (wrangler.jsonc → triggers.crons): IndexNow-ს ვატყობინებთ,
  // რომ დღევანდელი კურსი განახლდა.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(submitIndexNow(env));
  },
};

// ── sitemap: ცოცხალი lastmod ─────────────────────────────────────────────────
// public/sitemap.xml სტატიკურია და მისი lastmod ბილდის დღეს იყინება — ყოველდღიური
// კურსის საიტისთვის ეს მცდარი "აქ ახალი არაფერია" სიგნალია. lastmod-ს ედჯზე
// ვცვლით NBG-ის რეალური validFromDate-ით (ანუ იმ დღით, როცა რიცხვი მართლა შეიცვალა).
async function freshSitemap(res) {
  if (!res.ok) return res;
  let date = null;
  try {
    const computed = computeRates(await fetchNBG());
    date = computed && computed.date;
  } catch (e) {
    /* fallback ქვემოთ */
  }
  if (!date) date = new Date().toISOString().slice(0, 10);

  const xml = (await res.text()).replace(/<lastmod>[^<]*<\/lastmod>/g, `<lastmod>${date}</lastmod>`);
  const headers = new Headers(res.headers);
  headers.set("cache-control", "public, max-age=3600");
  return new Response(xml, { status: res.status, headers });
}

// ── IndexNow (cron) ──────────────────────────────────────────────────────────
// ping აღწევს Bing-ს, Yandex-ს, Yahoo-სა და DuckDuckGo-ს (Google IndexNow-ს არ იყენებს).
// კურსი ყოველ სამუშაო დღეს იცვლება, ანუ გვერდების შიგთავსი მართლა ახლდება — მაგრამ
// სრულ სიას მაინც არ ვაგზავნით ყოველდღე (429): landing-ები ყოველდღე, amount-გვერდები
// 1/7-იანი როტაციით, ანუ თითოეული კვირაში ერთხელ.
const INDEXNOW_KEY = "d940979fa17f0e6139b34758501289e7"; // = public/<key>.txt
const INDEXNOW_HOST = "evro.ge";
const AMOUNT_PATH = /\/\d+-[a-z]+-[a-z]+\/$/;
const ROTATION = 7;

async function submitIndexNow(env) {
  const res = await env.ASSETS.fetch(new Request(`https://${INDEXNOW_HOST}/sitemap.xml`));
  if (!res.ok) throw new Error("sitemap " + res.status);
  const xml = await res.text();
  const all = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

  const slot = Math.floor(Date.now() / 86400000) % ROTATION;
  const urlList = [];
  let seen = 0;
  for (const u of all) {
    if (AMOUNT_PATH.test(new URL(u).pathname) && seen++ % ROTATION !== slot) continue;
    urlList.push(u);
  }
  if (!urlList.length) throw new Error("sitemap-ში URL ვერ მოიძებნა");

  const ping = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: INDEXNOW_HOST,
      key: INDEXNOW_KEY,
      keyLocation: `https://${INDEXNOW_HOST}/${INDEXNOW_KEY}.txt`,
      urlList,
    }),
  });
  // 200 = OK, 202 = მიღებულია (key-ს ვალიდაცია მიმდინარეობს) — ორივე წესრიგშია.
  console.log(`IndexNow → HTTP ${ping.status} (${urlList.length}/${all.length} URL, slot ${slot})`);
  return ping.status;
}

// ── /api/rates ───────────────────────────────────────────────────────────────
async function handleRates() {
  try {
    const upstream = await fetch(NBG, { cf: { cacheTtl: 1800, cacheEverything: true } });
    if (!upstream.ok) throw new Error("upstream " + upstream.status);
    const body = await upstream.text();
    return new Response(body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=1800",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" },
    });
  }
}

// ── კურსი → მაპი ──────────────────────────────────────────────────────────────
async function fetchNBG() {
  const upstream = await fetch(NBG, { cf: { cacheTtl: 1800, cacheEverything: true } });
  if (!upstream.ok) throw new Error("upstream " + upstream.status);
  return upstream.json();
}

function computeRates(data) {
  const day = Array.isArray(data) ? data[0] : data;
  if (!day || !day.currencies) return null;
  const m = {};
  day.currencies.forEach((c) => { m[c.code] = c; });
  const rates = {};
  for (const code of SSR_CODES) {
    if (m[code] && m[code].rate) rates[code] = m[code].rate / m[code].quantity;
  }
  if (!Object.keys(rates).length) return null;
  const anchor = m.EUR || m.USD;
  const date = ((anchor && anchor.validFromDate) || day.date || "").slice(0, 10);
  return { rates, date };
}

// ── data-ssr → რიცხვი ──────────────────────────────────────────────────────────
//  spec: "EUR" | "100*EUR" | "100/EUR" | "date"
//  spec: "EUR" | "100*EUR" | "100/EUR" | "EUR/USD" | "100*EUR/USD" | "date"
function evalSSR(spec, rates) {
  const x = /^(?:(\d+(?:\.\d+)?)([*/]))?([A-Z]{3})(?:\/([A-Z]{3}))?$/.exec(spec);
  if (!x) return null;
  let r = rates[x[3]];
  if (r == null || !isFinite(r)) return null;
  if (x[4]) { const d = rates[x[4]]; if (d == null || !isFinite(d) || d === 0) return null; r = r / d; }
  if (!x[1]) return r;
  const a = parseFloat(x[1]);
  return x[2] === "*" ? a * r : a / r;
}

function fmtNum(n, dp) {
  const s = n.toFixed(dp);
  const parts = s.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.join(".");
}

class SsrHandler {
  constructor(rates, date, rateOn) {
    this.rates = rates;
    this.date = date;
    this.rateOn = rateOn || "კურსი";
  }
  element(el) {
    const spec = el.getAttribute("data-ssr");
    if (!spec) return;
    let out = null;
    if (spec === "date") {
      out = this.date ? this.rateOn + " " + this.date : null;
    } else {
      const dp = parseInt(el.getAttribute("data-dp") || "4", 10);
      const v = evalSSR(spec, this.rates);
      if (v != null) out = fmtNum(v, dp);
    }
    if (out == null) return;
    if (el.tagName === "input") el.setAttribute("value", out);
    else el.setInnerContent(out);
  }
}

// ── ანალიტიკის სკრიპტის ჩართვა ────────────────────────────────────────────────
// public/ev.js არ წერია გენერირებულ HTML-ში: ედჯზე ეკვრის, რომ 378 გვერდის
// ხელახლა აგება (და i18n-ის whitespace churn) არ დაგვჭირდეს ერთი <script>-ისთვის.
const TAIL_SCRIPT = '<script src="/ev.js" defer></script>';

class TailScriptHandler {
  element(el) {
    el.append(TAIL_SCRIPT, { html: true });
  }
}

// ტესტირებისთვის ხელმისაწვდომი (Worker-ისთვის default export-ს იყენებს).
export { evalSSR, fmtNum, computeRates, langFromPath, pickAcceptLang, maybeRedirect, submitIndexNow };
