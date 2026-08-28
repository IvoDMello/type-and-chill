/* Type & Chill — o caderninho.
 *
 * Toda palavra capturada (ou perdida) vira uma entrada permanente, com
 * quantas vezes você acertou e errou. A tela do caderno deixa buscar,
 * filtrar por tema/nível/situação e mandar as palavras fracas direto
 * para o modo Prática.
 *
 * game.js define TCNotebook.onPractice para saber quando começar a revisão.
 */
window.TCNotebook = (function () {
  "use strict";

  var screen, listEl, searchEl, themeEl, levelEl, statusEl, statsEl, emptyEl;
  var api = { onPractice: null, onClose: null };

  function el(id) { return document.getElementById(id); }

  function mount() {
    screen = el("notebookScreen");
    listEl = el("nbList");
    searchEl = el("nbSearch");
    themeEl = el("nbTheme");
    levelEl = el("nbLevel");
    statusEl = el("nbStatus");
    statsEl = el("nbStats");
    emptyEl = el("nbEmpty");

    // opções de tema
    var opt = document.createElement("option");
    opt.value = ""; opt.textContent = "Todos os temas";
    themeEl.appendChild(opt);
    Object.keys(window.WORD_THEMES).forEach(function (k) {
      var o = document.createElement("option");
      o.value = k; o.textContent = window.WORD_THEMES[k].label;
      themeEl.appendChild(o);
    });

    [searchEl, themeEl, levelEl, statusEl].forEach(function (n) {
      n.addEventListener("input", render);
      n.addEventListener("change", render);
    });

    el("nbClose").addEventListener("click", close);
    el("nbPractice").addEventListener("click", function () {
      close();
      if (api.onPractice) api.onPractice();
    });
    el("nbClear").addEventListener("click", function () {
      if (!window.confirm("Apagar todas as palavras do caderno? Isso não pode ser desfeito.")) return;
      TCStore.clearNotebook();
      render();
    });
  }

  function filtered() {
    var q = (searchEl.value || "").trim().toLowerCase();
    var th = themeEl.value, lv = levelEl.value, st = statusEl.value;
    return TCStore.list().filter(function (e) {
      if (th && e.theme !== th) return false;
      if (lv && e.lvl !== lv) return false;
      if (st === "mastered" && !e.mastered) return false;
      if (st === "learning" && e.mastered) return false;
      if (st === "weak" && !(e.misses > 0)) return false;
      if (q) {
        var hay = (e.text + " " + (e.def || "") + " " + (e.pt || "")).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    }).sort(function (a, b) { return b.last - a.last; });
  }

  function row(e) {
    var li = document.createElement("li");
    li.className = "nbrow" + (e.mastered ? " is-mastered" : "");

    var head = document.createElement("div");
    head.className = "nbhead";

    var w = document.createElement("span");
    w.className = "cw"; w.textContent = e.text;
    var p = document.createElement("span");
    p.className = "cp"; p.textContent = e.pos;
    var lv = document.createElement("span");
    lv.className = "nblvl"; lv.textContent = e.lvl || "";
    var tally = document.createElement("span");
    tally.className = "nbtally";
    tally.textContent = "✓ " + e.hits + (e.misses ? "  ✕ " + e.misses : "");

    head.appendChild(w); head.appendChild(p); head.appendChild(lv); head.appendChild(tally);

    var d = document.createElement("div");
    d.className = "cd"; d.textContent = e.def || "";

    li.appendChild(head);
    li.appendChild(d);
    if (e.pt) {
      var pt = document.createElement("div");
      pt.className = "cpt"; pt.textContent = e.pt;
      li.appendChild(pt);
    }
    return li;
  }

  function render() {
    var c = TCStore.counts();
    statsEl.innerHTML = "";
    [["Palavras", c.total], ["Dominadas", c.mastered], ["Revisando", c.learning]]
      .forEach(function (pair) {
        var d = document.createElement("div");
        d.className = "stat";
        var b = document.createElement("b"); b.textContent = pair[1];
        var s = document.createElement("span"); s.textContent = pair[0];
        d.appendChild(b); d.appendChild(s);
        statsEl.appendChild(d);
      });

    var rows = filtered();
    listEl.innerHTML = "";
    for (var i = 0; i < rows.length; i++) listEl.appendChild(row(rows[i]));

    emptyEl.hidden = rows.length > 0;
    emptyEl.textContent = c.total === 0
      ? "Seu caderno está vazio. Capture algumas palavras e elas aparecem aqui."
      : "Nenhuma palavra corresponde a esses filtros.";

    el("nbPractice").disabled = practicePool().length === 0;
  }

  /* Palavras que merecem revisão: as que ainda não estão dominadas,
   * as mais erradas primeiro. Devolve no formato usado pelo jogo. */
  function practicePool() {
    return TCStore.list()
      .filter(function (e) { return !e.mastered; })
      .sort(function (a, b) {
        if (b.misses !== a.misses) return b.misses - a.misses;
        return a.hits - b.hits;
      })
      .map(function (e) {
        return { text: e.text, pos: e.pos, def: e.def, pt: e.pt, lvl: e.lvl, theme: e.theme };
      });
  }

  function open() {
    render();
    screen.removeAttribute("hidden");
    searchEl.focus();
  }
  function close() {
    screen.setAttribute("hidden", "");
    if (api.onClose) api.onClose();
  }
  function isOpen() { return screen && !screen.hasAttribute("hidden"); }

  api.mount = mount;
  api.open = open;
  api.close = close;
  api.isOpen = isOpen;
  api.render = render;
  api.practicePool = practicePool;
  return api;
})();
