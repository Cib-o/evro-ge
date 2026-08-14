/*
 * evro.ge — GA4 ინტერაქციის ივენთები.
 *
 * ეს ფაილი HTML-ში არ წერია: Worker-ი ედჯზე ურთავს ყველა გვერდს </body>-მდე
 * (src/index.js → TailScriptHandler). ასე ერთ ადგილას ვინახავთ და 378 გენერირებული
 * გვერდის ხელახლა აგება (და i18n-ის whitespace churn) საჭირო არ ხდება.
 *
 * GA4-ში key event-ებად მოსანიშნია: converter_used, amount_link_click.
 */
(function () {
  "use strict";

  var send = function (name, params) {
    if (typeof window.gtag === "function") window.gtag("event", name, params || {});
  };

  var fired = {};
  var once = function (name, params) {
    if (fired[name]) return;
    fired[name] = 1;
    send(name, params);
  };

  var path = location.pathname;
  var lang = (/^\/(en|ru|uk|az|tr|hy)(?:\/|$)/.exec(path) || [, "ka"])[1];

  // 1. კონვერტერის გამოყენება — გვერდზე ერთხელ. მთავარი engagement სიგნალი:
  //    განასხვავებს "კურსს დახედა და წავიდა"-ს "ხელსაწყო გამოიყენა"-სგან.
  document.addEventListener(
    "input",
    function (e) {
      var t = e.target;
      if (!t || !t.classList || !t.classList.contains("conv-input")) return;
      once("converter_used", { page_path: path, lang: lang, field: t.id || "conv" });
    },
    true
  );

  // 2–4. ბმულების კლიკები — ერთი delegated listener.
  document.addEventListener(
    "click",
    function (e) {
      var el = e.target;
      if (!el || !el.closest) return;
      var a = el.closest("a[href]");
      if (!a) return;

      if (a.closest(".langsel-menu")) {
        send("lang_switch", { from: lang, to: a.getAttribute("hreflang") || "", page_path: path });
        return;
      }
      // შიდა ნავიგაცია თანხის ჩიპებიდან/კურსის ცხრილიდან — სესიის სიღრმის საზომი.
      if (a.classList.contains("chip") || a.closest(".rtable")) {
        send("amount_link_click", { link_url: a.getAttribute("href"), from_path: path, lang: lang });
        return;
      }
      if (a.hostname && a.hostname !== location.hostname) {
        send("outbound_click", { link_url: a.href, link_domain: a.hostname, page_path: path });
      }
    },
    true
  );

  // 5. 90%-მდე ჩასქროლვა — "წაიკითხა", და არა მხოლოდ "დახედა".
  var onScroll = function () {
    var d = document.documentElement;
    var max = d.scrollHeight - d.clientHeight;
    if (max <= 0) return;
    var y = d.scrollTop || document.body.scrollTop;
    if (y / max < 0.9) return;
    once("engaged_90", { page_path: path, lang: lang });
    window.removeEventListener("scroll", onScroll);
  };
  window.addEventListener("scroll", onScroll, { passive: true });

  // 6. SSR-ის ჯანმრთელობა — თუ ედჯმა კურსი ვერ ჩასვა, მომხმარებელი ტირეებს ხედავს.
  //    ეს ანალიტიკაშიც უნდა ჩანდეს და არა მხოლოდ Worker-ის ლოგებში.
  var rate = null;
  var nodes = document.querySelectorAll("[data-ssr]:not(input)");
  for (var i = 0; i < nodes.length; i++) {
    if (nodes[i].getAttribute("data-ssr") !== "date") { rate = nodes[i]; break; }
  }
  if (rate && /^[—–-]*$/.test((rate.textContent || "").trim())) {
    send("rate_missing", { page_path: path });
  }
})();
