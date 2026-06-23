// evro.ge — Cloudflare Worker
// /api/rates → ეროვნული ბანკის კურსის proxy (CORS-ით).
// HTML გვერდები → ცოცხალი კურსი ედჯზე ისმება [data-ssr] ელემენტებში (crawler-ებისთვის),
//                 ხოლო client JS იმავეს ავსებს refresh-ისთვის. რიცხვი არსად არ არის hardcode —
//                 ყოველ მოთხოვნაზე NBG-დან მოდის (edge-ქეშით).
// დანარჩენი → სტატიკური ფაილები public/-დან.

const NBG = "https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/ka/json";
const SSR_CODES = ["EUR", "USD", "GBP", "TRY", "RUB"];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/rates") {
      return handleRates();
    }

    const res = await env.ASSETS.fetch(request);

    // SSR მხოლოდ HTML-ზე; ყველაფერი დანარჩენი უცვლელად.
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html") || request.method !== "GET") return res;

    let computed = null;
    try {
      computed = computeRates(await fetchNBG());
    } catch (e) {
      // კურსი ვერ მოვიდა — გვერდს უცვლელად ვაბრუნებთ (client JS მაინც შეავსებს).
      return res;
    }
    if (!computed || !computed.rates) return res;

    const out = new HTMLRewriter()
      .on("[data-ssr]", new SsrHandler(computed.rates, computed.date))
      .transform(res);

    // HTML დღეში იცვლება — ვაჩერებთ ~30 წთ (რამდენადაც NBG ქეშია).
    const headers = new Headers(out.headers);
    headers.set("cache-control", "public, max-age=1800, must-revalidate");
    return new Response(out.body, { status: out.status, statusText: out.statusText, headers });
  },
};

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
function evalSSR(spec, rates) {
  const x = /^(?:(\d+(?:\.\d+)?)([*/]))?([A-Z]{3})$/.exec(spec);
  if (!x) return null;
  const r = rates[x[3]];
  if (r == null || !isFinite(r)) return null;
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
  constructor(rates, date) {
    this.rates = rates;
    this.date = date;
  }
  element(el) {
    const spec = el.getAttribute("data-ssr");
    if (!spec) return;
    let out = null;
    if (spec === "date") {
      out = this.date ? "კურსი " + this.date : null;
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

// ტესტირებისთვის ხელმისაწვდომი (Worker-ისთვის default export-ს იყენებს).
export { evalSSR, fmtNum, computeRates };
