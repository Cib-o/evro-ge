/*
 * evro.ge — უნივერსალური კონვერტერი. ნებისმიერი ორი ვალუტა (NBG-ის ოფიციალური კურსით, ლარის
 * გავლით), ⇄ ღილაკი, ორივე მიმართულებით აკრეფა — გვერდის გადატვირთვის გარეშე.
 *
 * markup (build-pages.js → convBlock / public/index.html):
 *   <div class="conv" data-conv> <div class="conv-cell"><input class="conv-input"><select class="conv-cur">…
 *   <button class="conv-swap"> … <div class="conv-rate"></div> </div>
 * ტექსტი არ წერია (მხოლოდ ვალუტის კოდები) — ამიტომ i18n-ს არ საჭიროებს.
 * output input-ს data-ssr-ს ვაშორებთ, რომ გვერდის სკრიპტის fillSSR-მა არჩეული წყვილი არ გადაწეროს.
 */
(function () {
  "use strict";
  var boxes = document.querySelectorAll("[data-conv]");
  if (!boxes.length) return;
  var rates = null;

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

  function setup(box) {
    var inp = box.querySelectorAll("input.conv-input"), sel = box.querySelectorAll("select.conv-cur");
    var swap = box.querySelector(".conv-swap"), info = box.querySelector(".conv-rate");
    if (inp.length < 2 || sel.length < 2) return;
    inp[1].removeAttribute("data-ssr");
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
    inp[0].addEventListener("input", function () { calc(0); });
    inp[1].addEventListener("input", function () { calc(1); });
    sel[0].addEventListener("change", function () { calc(last); });
    sel[1].addEventListener("change", function () { calc(last); });
    if (swap) swap.addEventListener("click", function () {
      var v = sel[0].value; sel[0].value = sel[1].value; sel[1].value = v;
      swap.classList.toggle("turned");
      calc(0);
    });
    box._calc = function () {
      // კურსი რომელსაც NBG არ აქვეყნებს — სიიდან ვაქრობთ
      for (var i = 0; i < sel.length; i++) for (var j = 0; j < sel[i].options.length; j++) {
        var o = sel[i].options[j];
        o.disabled = !rates[o.value];
      }
      calc(last);
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
