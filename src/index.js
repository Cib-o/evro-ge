// evro.ge — Cloudflare Worker
// /api/rates → ეროვნული ბანკის კურსის proxy (CORS-ით).
// ყველა სხვა მისამართი → სტატიკური ფაილები public/ საქაღალდიდან.

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/rates") {
      return handleRates();
    }

    // სტატიკა (index.html და სხვ.)
    return env.ASSETS.fetch(request);
  }
};

async function handleRates() {
  const NBG = "https://nbg.gov.ge/gw/api/ct/monetarypolicy/currencies/ka/json";
  try {
    const upstream = await fetch(NBG, {
      cf: { cacheTtl: 1800, cacheEverything: true } // 30 წთ ქეში edge-ზე
    });
    if (!upstream.ok) throw new Error("upstream " + upstream.status);
    const body = await upstream.text();
    return new Response(body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "cache-control": "public, max-age=1800"
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*"
      }
    });
  }
}
