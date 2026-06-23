// Cloudflare Pages Function — ეროვნული ბანკის კურსის proxy.
// როცა ეს ფაილი არსებობს პროექტში (functions/api/rates.js), მისამართი /api/rates
// დააბრუნებს NBG-ის კურსს ბრაუზერისთვის ხელმისაწვდომი სახით (CORS პრობლემის გარეშე).
// index.html ავტომატურად ცდის ამ მისამართს პირველ რიგში — სხვა არაფრის შეცვლა არ სჭირდება.

export async function onRequest(context) {
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
