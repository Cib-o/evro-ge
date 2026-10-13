/*
 * evro.ge — ინტერაქციული გრაფიკი. Worker ედჯზე 12 თვის ხაზს ხატავს (crawler-იც ხედავს), ეს
 * სკრიპტი კი მას ცოცხლად აქცევს: შეხება/კურსორი → თარიღი და კურსი, პერიოდები 1 თვე … ყველა.
 * მონაცემი: /data/rates/<CUR>-<YYYY>.json (მხოლოდ გამოქვეყნებული დღეები) + დღევანდელი /api/rates.
 * ტექსტი HTML-შია (ღილაკები ითარგმნება), აქ მხოლოდ რიცხვები და თარიღები იწერება.
 */
(function () {
  "use strict";
  var svg = document.querySelector("svg.chart[data-cur]");
  if (!svg || !window.fetch) return;
  var CUR = svg.getAttribute("data-cur"), HOME = CUR, W = 680, H = 180, P = 8, DAY = 864e5, NS = "http://www.w3.org/2000/svg";
  var box = svg.closest(".chartbox"), tip = box.querySelector(".chart-tip");
  var line = svg.querySelector(".chart-line"), area = svg.querySelector(".chart-area");
  var cap = { min: box.querySelector('[data-chart="min"]'), max: box.querySelector('[data-chart="max"]'), chg: box.querySelector('[data-chart="chg"]') };
  var vl = document.createElementNS(NS, "line"), dot = document.createElementNS(NS, "circle");
  vl.setAttribute("class", "chart-vl"); vl.setAttribute("y1", 0); vl.setAttribute("y2", H);
  dot.setAttribute("class", "chart-dot"); dot.setAttribute("r", 4.5);
  svg.appendChild(vl); svg.appendChild(dot);
  var years = {}, liveAll = {}, live = null, pts = [], range = 365, nowY = new Date().getFullYear();
  var HIST = { EUR: "eu", USD: "us", GBP: "gb", TRY: "tr", RUB: "ru" }; // ვალუტები, რომლებსაც 2015-დან ისტორია აქვთ
  var h2 = box.querySelector("h2"), h2Text = h2 ? h2.textContent : "";

  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function human(t) { var d = new Date(t); return pad(d.getUTCDate()) + "." + pad(d.getUTCMonth() + 1) + "." + d.getUTCFullYear(); }
  function ms(s) { return Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)); }
  function fmt(n) { return n.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 4 }); }
  function year(y) {
    var k = CUR + "-" + y;
    if (!years[k]) years[k] = fetch("/data/rates/" + k + ".json")
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    return years[k];
  }
  function series(fromY) {
    var ps = [];
    for (var y = Math.max(2015, fromY); y <= nowY; y++) ps.push(year(y));
    return Promise.all(ps).then(function (docs) {
      var out = [];
      docs.forEach(function (doc) {
        if (!doc) return;
        var t0 = ms(doc.start);
        for (var i = 0; i < doc.v.length; i++) if (doc.v[i] != null) out.push({ t: t0 + i * DAY, v: doc.v[i] });
      });
      if (live && (!out.length || live.t > out[out.length - 1].t)) out.push(live);
      return out;
    });
  }
  function draw(all) {
    var end = all.length ? all[all.length - 1].t : 0;
    var from = range === "all" ? 0 : end - range * DAY;
    pts = all.filter(function (p) { return p.t >= from; });
    if (pts.length < 2) return;
    var lo = Infinity, hi = -Infinity;
    pts.forEach(function (p) { if (p.v < lo) lo = p.v; if (p.v > hi) hi = p.v; });
    var span = hi - lo || 1, n = pts.length, d = "";
    pts.forEach(function (p, i) {
      p.x = P + (i * (W - 2 * P)) / (n - 1);
      p.y = P + ((hi - p.v) * (H - 2 * P)) / span;
      d += (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1);
    });
    line.setAttribute("d", d);
    area.setAttribute("d", d + "L" + (W - P) + " " + H + "L" + P + " " + H + "Z");
    var chg = ((pts[n - 1].v - pts[0].v) / pts[0].v) * 100;
    if (cap.min) cap.min.textContent = fmt(lo);
    if (cap.max) cap.max.textContent = fmt(hi);
    if (cap.chg) {
      cap.chg.textContent = (chg >= 0 ? "+" : "−") + Math.abs(chg).toFixed(1) + "%";
      cap.chg.className = "num " + (chg >= 0 ? "up" : "down");
    }
    hide();
  }
  function show(clientX) {
    if (pts.length < 2) return;
    var r = svg.getBoundingClientRect(), x = ((clientX - r.left) / r.width) * W;
    var i = Math.round(((x - P) / (W - 2 * P)) * (pts.length - 1));
    var p = pts[Math.max(0, Math.min(pts.length - 1, i))];
    vl.setAttribute("x1", p.x); vl.setAttribute("x2", p.x);
    dot.setAttribute("cx", p.x); dot.setAttribute("cy", p.y);
    box.classList.add("hover");
    tip.hidden = false;
    tip.textContent = human(p.t) + "  ·  " + fmt(p.v) + " ₾";
    var px = (p.x / W) * r.width, half = tip.offsetWidth / 2;
    tip.style.left = Math.max(half, Math.min(r.width - half, px)) + "px";
  }
  function hide() { box.classList.remove("hover"); if (tip) tip.hidden = true; }

  svg.addEventListener("pointermove", function (e) { show(e.clientX); });
  svg.addEventListener("pointerdown", function (e) { show(e.clientX); });
  // შეხებაზე თითის აწევაც pointerleave-ია — tooltip მხოლოდ მაუსით გასვლისას ქრება
  svg.addEventListener("pointerleave", function (e) { if (e.pointerType === "mouse") hide(); });

  function curSwitch() {
    var head = box.querySelector(".chart-head");
    if (!head || box.querySelector(".chart-cur")) return;
    var g = document.createElement("div");
    g.className = "chart-cur"; g.setAttribute("role", "group");
    g.innerHTML = Object.keys(HIST).map(function (c) {
      return '<button type="button" data-c="' + c + '" aria-pressed="' + (c === CUR) + '"><img class="flag" src="/flags/' + HIST[c] + '.svg" alt="" width="20" height="15">' + c + "</button>";
    }).join("");
    head.insertBefore(g, head.querySelector(".chart-rng"));
    g.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-c]");
      if (!b || b.getAttribute("data-c") === CUR) return;
      CUR = b.getAttribute("data-c"); live = liveAll[CUR] || null;
      Array.prototype.forEach.call(g.children, function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
      if (h2) h2.textContent = CUR === HOME ? h2Text : CUR + " / GEL";
      var on = box.querySelector('.chart-rng button[aria-pressed="true"]');
      if (on) select(on);
    });
  }

  var btns = box.querySelectorAll(".chart-rng button");
  function select(b) {
    for (var i = 0; i < btns.length; i++) btns[i].setAttribute("aria-pressed", btns[i] === b ? "true" : "false");
    var r = b.getAttribute("data-r");
    range = r === "all" ? "all" : +r;
    box.classList.add("loading");
    var fromY = range === "all" ? 2015 : new Date(Date.now() - range * DAY).getUTCFullYear();
    series(fromY).then(function (all) { draw(all); box.classList.remove("loading"); });
  }
  for (var i = 0; i < btns.length; i++) btns[i].addEventListener("click", function () { select(this); });

  fetch("/api/rates").then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; })
    .then(function (data) {
      var day = data && (Array.isArray(data) ? data[0] : data);
      (day && day.currencies || []).forEach(function (c) {
        if (c.rate && HIST[c.code]) liveAll[c.code] = { t: ms(String(c.validFromDate || day.date).slice(0, 10)), v: c.rate / (c.quantity || 1) };
      });
      live = liveAll[CUR] || null;
      curSwitch();
      var on = box.querySelector('.chart-rng button[aria-pressed="true"]') || btns[0];
      if (on) select(on);
    });
})();
