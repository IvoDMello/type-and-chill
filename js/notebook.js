/* Type & Chill — o caderno.
 *
 * Cada palavra capturada entra aqui com histórico e data da próxima revisão
 * (calculada pelo core/srs.js). A tela mostra o progresso por nível, deixa
 * buscar e filtrar, exporta em CSV e manda as palavras vencidas direto para
 * o modo Prática.
 *
 * game.js define TCNotebook.onPractice para saber quando começar a revisão.
 */
window.TCNotebook = (function () {
  "use strict";

  var screen, listEl, searchEl, themeEl, levelEl, statusEl, statsEl, emptyEl, progressEl;
  var api = { onPractice: null, onClose: null };
  var mounted = false;

  function el(id) { return document.getElementById(id); }

  function mount() {
    if (mounted) return;
    screen = el("notebookScreen");
    listEl = el("nbList");
    searchEl = el("nbSearch");
    themeEl = el("nbTheme");
    levelEl = el("nbLevel");
    statusEl = el("nbStatus");
    statsEl = el("nbStats");
    emptyEl = el("nbEmpty");
    progressEl = el("nbProgress");

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
    el("nbExport").addEventListener("click", exportCsv);
    el("nbClear").addEventListener("click", function () {
      if (!window.confirm("Apagar todas as palavras do caderno? Isso não pode ser desfeito.")) return;
      TCStore.clearNotebook();
      render();
    });
    mounted = true;
  }

  function filtered() {
    var q = (searchEl.value || "").trim().toLowerCase();
    var th = themeEl.value, lv = levelEl.value, st = statusEl.value;
    return TCStore.list().filter(function (e) {
      if (th && e.theme !== th) return false;
      if (lv && e.lvl !== lv) return false;
      if (st === "mastered" && !e.mastered) return false;
      if (st === "learning" && e.mastered) return false;
      if (st === "due" && (e.mastered || !e.due)) return false;
      if (st === "weak" && !(e.misses > 0)) return false;
      if (q) {
        var hay = (e.text + " " + (e.def || "") + " " + (e.pt || "")).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    }).sort(function (a, b) {
      // primeiro o que precisa de revisão, depois o mais recente
      if (a.mastered !== b.mastered) return a.mastered ? 1 : -1;
      if (a.due !== b.due) return a.due ? -1 : 1;
      return b.last - a.last;
    });
  }

  function dueLabel(e) {
    if (e.mastered) return "dominada";
    if (e.due) return "revisar agora";
    var d = e.daysUntilDue;
    return d <= 1 ? "revisar amanhã" : "em " + d + " dias";
  }

  function row(e) {
    var li = document.createElement("li");
    li.className = "nbrow" + (e.mastered ? " is-mastered" : "") + (!e.mastered && e.due ? " is-due" : "");

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
    tally.textContent = "✓ " + e.hits + (e.misses ? "  ✕ " + e.misses : "") + " · " + dueLabel(e);

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

  function statTile(label, value) {
    var d = document.createElement("div");
    d.className = "stat";
    var b = document.createElement("b"); b.textContent = value;
    var s = document.createElement("span"); s.textContent = label;
    d.appendChild(b); d.appendChild(s);
    return d;
  }

  function renderProgress() {
    var prog = TCStore.progress(window.WORD_THEMES);
    progressEl.innerHTML = "";
    window.WORD_LEVELS.forEach(function (lvl) {
      var p = prog.byLevel[lvl];
      if (!p) return;
      var wrap = document.createElement("div");
      wrap.className = "bar";

      var top = document.createElement("div");
      top.className = "barhead";
      var name = document.createElement("span"); name.textContent = lvl;
      var num = document.createElement("span");
      num.textContent = p.mastered + "/" + p.total;
      top.appendChild(name); top.appendChild(num);

      var track = document.createElement("div");
      track.className = "bartrack";
      var seen = document.createElement("i");
      seen.className = "barseen";
      seen.style.width = (p.total ? (p.seen / p.total) * 100 : 0) + "%";
      var done = document.createElement("i");
      done.className = "bardone";
      done.style.width = (p.total ? (p.mastered / p.total) * 100 : 0) + "%";
      track.appendChild(seen); track.appendChild(done);

      wrap.appendChild(top); wrap.appendChild(track);
      wrap.title = lvl + ": " + p.mastered + " dominadas, " + p.seen + " vistas, " + p.total + " no total";
      progressEl.appendChild(wrap);
    });
  }

  function render() {
    var c = TCStore.counts();
    statsEl.innerHTML = "";
    statsEl.appendChild(statTile("Palavras", c.total));
    statsEl.appendChild(statTile("Dominadas", c.mastered));
    statsEl.appendChild(statTile("Revisar hoje", c.due));

    renderProgress();

    var rows = filtered();
    listEl.innerHTML = "";
    var frag = document.createDocumentFragment();
    for (var i = 0; i < rows.length; i++) frag.appendChild(row(rows[i]));
    listEl.appendChild(frag);

    emptyEl.hidden = rows.length > 0;
    emptyEl.textContent = c.total === 0
      ? "Seu caderno está vazio. Capture algumas palavras e elas aparecem aqui."
      : "Nenhuma palavra corresponde a esses filtros.";

    var queue = practicePool();
    var btn = el("nbPractice");
    btn.disabled = queue.length === 0;
    btn.textContent = queue.length ? "Revisar " + queue.length + " palavras" : "Nada para revisar";
    el("nbExport").disabled = c.total === 0;
  }

  /* Fila de revisão, já ordenada pelo agendamento (atrasadas primeiro). */
  function practicePool() { return TCStore.practiceQueue(); }

  function csvCell(v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }

  /* CSV pronto para importar em Anki, Quizlet ou planilha. */
  function exportCsv() {
    var rows = [["palavra", "classe", "definicao_en", "traducao_pt", "nivel", "tema", "acertos", "erros", "proxima_revisao"]];
    TCStore.list().forEach(function (e) {
      rows.push([
        e.text, e.pos, e.def, e.pt, e.lvl,
        (window.WORD_THEMES[e.theme] && window.WORD_THEMES[e.theme].label) || e.theme,
        e.hits, e.misses,
        e.srs && e.srs.due ? new Date(e.srs.due).toISOString().slice(0, 10) : ""
      ]);
    });
    var csv = "﻿" + rows.map(function (r) { return r.map(csvCell).join(","); }).join("\r\n");
    try {
      var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = "type-and-chill-caderno.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    } catch (e) {
      window.alert("Não consegui gerar o arquivo neste navegador.");
    }
  }

  function open() {
    mount();
    render();
    screen.removeAttribute("hidden");
    searchEl.focus();
  }
  function close() {
    screen.setAttribute("hidden", "");
    if (api.onClose) api.onClose();
  }
  function isOpen() { return !!screen && !screen.hasAttribute("hidden"); }

  api.mount = mount;
  api.open = open;
  api.close = close;
  api.isOpen = isOpen;
  api.render = render;
  api.practicePool = practicePool;
  api.exportCsv = exportCsv;
  return api;
})();
