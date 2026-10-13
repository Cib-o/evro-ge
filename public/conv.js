/*
 * evro.ge — უნივერსალური კონვერტერი. ნებისმიერი ორი ვალუტა (NBG-ის ოფიციალური კურსით, ლარის
 * გავლით), ⇄ ღილაკი, ორივე მიმართულებით აკრეფა — გვერდის გადატვირთვის გარეშე.
 * + ვალუტის ამრჩევი ძებნით და დროშებით (/flags/*.svg, flag-icons, MIT)
 * + ბოლო არჩეული წყვილის დამახსოვრება (localStorage, გვერდზე — ენის პრეფიქსის გარეშე).
 *
 * markup (build-pages.js → convBlock / public/index.html):
 *   <div class="conv" data-conv> <div class="conv-cell"><input class="conv-input"><select class="conv-cur">…
 *   <button class="conv-swap"> … <div class="conv-rate"></div> </div>
 * <select> რჩება მნიშვნელობის წყაროდ (და JS-ის გარეშე სამუშაოდ); ვალუტის სახელებს
 * Intl.DisplayNames იძლევა გვერდის ენაზე — ამიტომ თარგმანი არ სჭირდება.
 */
(function () {
  "use strict";
  var boxes = document.querySelectorAll("[data-conv]");
  if (!boxes.length) return;
  var rates = null;
  var FLAG = { GEL: "ge", EUR: "eu", USD: "us", GBP: "gb", TRY: "tr", RUB: "ru", AMD: "am", AZN: "az", UAH: "ua", CHF: "ch",
    ILS: "il", AED: "ae", CNY: "cn", JPY: "jp", KZT: "kz", CAD: "ca", PLN: "pl", SEK: "se", CZK: "cz" };
  var lang = document.documentElement.lang || "ka";
  var KEY = "evro:pair:" + location.pathname.replace(/^\/(en|ru|uk|az|tr|hy)(?=\/)/, "");
  function names(l) { try { return new Intl.DisplayNames([l], { type: "currency" }); } catch (e) { return null; } }
  var dn = names(lang), dnEn = names("en");
  function nameOf(c, d) { try { return (d && d.of(c)) || c; } catch (e) { return c; } }
  function flag(c) { return FLAG[c] ? '<img class="flag" src="/flags/' + FLAG[c] + '.svg" alt="" width="20" height="15" loading="lazy">' : '<span class="flag"></span>'; }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  function fmt(n) {
    var a = Math.abs(n), d = a === 0 || a >= 1 ? 2 : a >= 0.01 ? 4 : 6;
    return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  // "1,000.50", "1000,5", "1 000" — ყველა გავიგოთ
  function num(s) {
    s = String(s || "").replace(/[\s ]/g, "");
    if (s.indexOf(",") >= 0 && s.indexOf(".") >= 0) s = s.replace(/,/g, "");
    else if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, "");
    else s = s.replace(",", ".");
    var x = parseFloat(s);
    return isFinite(x) ? x : NaN;
  }

  // ── ვალუტის ამრჩევი (select-ის ზემოთ) ──────────────────────────────────────────
  var openPop = null;
  function closePop() { if (openPop) { openPop.remove(); openPop = null; } }
  document.addEventListener("click", function (e) { if (openPop && !openPop.contains(e.target) && !e.target.closest(".cur-btn")) closePop(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePop(); });

  function picker(sel) {
    var btn = document.createElement("button");
    btn.type = "button"; btn.className = "cur-btn"; btn.setAttribute("aria-haspopup", "listbox");
    sel.parentNode.insertBefore(btn, sel);
    function paint() { var c = sel.value; btn.innerHTML = flag(c) + '<span class="code">' + c + '</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'; btn.title = nameOf(c, dn); }
    sel.addEventListener("change", paint);
    paint();
    btn.addEventListener("click", function () {
      if (openPop && openPop._sel === sel) return closePop();
      closePop();
      var pop = document.createElement("div");
      pop.className = "cur-pop"; pop._sel = sel;
      pop.innerHTML = '<input class="cur-q" type="search" placeholder="EUR, USD, ₾ …" autocomplete="off" aria-label="Search"><div class="cur-list" role="listbox"></div>';
      var q = pop.querySelector(".cur-q"), list = pop.querySelector(".cur-list");
      var opts = Array.prototype.map.call(sel.options, function (o) { return { c: o.value, off: o.disabled, n: nameOf(o.value, dn), en: nameOf(o.value, dnEn) }; });
      function render() {
        var t = q.value.trim().toLowerCase();
        list.innerHTML = opts.filter(function (o) { return !o.off && (!t || (o.c + " " + o.n + " " + o.en).toLowerCase().indexOf(t) >= 0); })
          .map(function (o) { return '<button type="button" role="option" data-c="' + o.c + '"' + (o.c === sel.value ? ' aria-selected="true"' : "") + ">" + flag(o.c) + '<b>' + o.c + "</b><span>" + o.n + "</span></button>"; }).join("");
      }
      function pick(c) { if (c) { sel.value = c; sel.dispatchEvent(new Event("change", { bubbles: true })); } closePop(); btn.focus(); }
      q.addEventListener("input", render);
      q.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); var f = list.querySelector("button"); pick(f && f.getAttribute("data-c")); } });
      list.addEventListener("click", function (e) { var b = e.target.closest("button[data-c]"); if (b) pick(b.getAttribute("data-c")); });
      render();
      btn.closest(".conv-cell").appendChild(pop);
      openPop = pop;
      if (window.matchMedia("(hover: hover)").matches) q.focus();
    });
  }

  function setup(box) {
    var inp = box.querySelectorAll("input.conv-input"), sel = box.querySelectorAll("select.conv-cur");
    var swap = box.querySelector(".conv-swap"), info = box.querySelector(".conv-rate");
    if (inp.length < 2 || sel.length < 2) return;
    inp[1].removeAttribute("data-ssr");
    // ბოლოს არჩეული წყვილი ამ გვერდზე
    var saved = (store(KEY) || "").split("-");
    if (saved.length === 2 && saved[0] !== saved[1] && sel[0].querySelector('option[value="' + saved[0] + '"]') && sel[1].querySelector('option[value="' + saved[1] + '"]')) {
      sel[0].value = saved[0]; sel[1].value = saved[1];
    }
    box.classList.add("js");
    picker(sel[0]); picker(sel[1]);
    var last = 0; // რომელ ველს აკრეფდა ბოლოს — მისგან ვითვლით

    function calc(dir) {
      if (!rates) return;
      last = dir;
      var f = sel[0].value, t = sel[1].value, rf = rates[f], rt = rates[t];
      if (!rf || !rt) return;
      var src = inp[dir], dst = inp[1 - dir], a = num(src.value);
      var k = dir === 0 ? rf / rt : rt / rf;
      dst.value = isNaN(a) ? "" : fmt(a * k);
      if (info) info.textContent = "1 " + f + " = " + fmt(rf / rt) + " " + t + "  ·  1 " + t + " = " + fmt(rt / rf) + " " + f;
    }
    function remember() { store(KEY, sel[0].value + "-" + sel[1].value); }
    inp[0].addEventListener("input", function () { calc(0); });
    inp[1].addEventListener("input", function () { calc(1); });
    sel[0].addEventListener("change", function () { remember(); calc(last); });
    sel[1].addEventListener("change", function () { remember(); calc(last); });
    if (swap) swap.addEventListener("click", function () {
      var v = sel[0].value; sel[0].value = sel[1].value; sel[1].value = v;
      sel[0].dispatchEvent(new Event("change")); sel[1].dispatchEvent(new Event("change"));
      swap.classList.toggle("turned");
      calc(0);
    });
    box._calc = function () {
      for (var i = 0; i < sel.length; i++) for (var j = 0; j < sel[i].options.length; j++) {
        var o = sel[i].options[j];
        o.disabled = !rates[o.value];
      }
      calc(0);
    };
  }

  for (var i = 0; i < boxes.length; i++) setup(boxes[i]);

  fetch("/api/rates")
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (data) {
      var day = Array.isArray(data) ? data[0] : data, m = { GEL: 1 };
      (day && day.currencies || []).forEach(function (c) { if (c.rate) m[c.code] = c.rate / (c.quantity || 1); });
      if (Object.keys(m).length < 2) return;
      rates = m;
      for (var i = 0; i < boxes.length; i++) if (boxes[i]._calc) boxes[i]._calc();
    })
    .catch(function () {});
})();
