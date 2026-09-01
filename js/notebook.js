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
    TCWordbank.groupsOf(window.WORD_THEMES, window.WORD_GROUPS).forEach(function (g) {
      var grp = document.createElement("optgroup");
      grp.label = g.label;
      g.themes.forEach(function (k) {
        var o = document.createElement("option");
        o.value = k; o.textContent = window.WORD_THEMES[k].label;
        grp.appendChild(o);
      });
      themeEl.appendChild(grp);
    });

    [searchEl, themeEl, levelEl, statusEl].forEach(function (n) {
      n.addEventListener("input", render);
      n.addEventListener("change", render);
    });

    el("nbClose").addEventListener("click", close);
    el("nbPractice").addEventListener("click", function () {
      var which = this.dataset.mode === "deck" ? "deck" : "practice";
      close();
      if (api.onPractice) api.onPractice(which);
    });
    el("nbExport").addEventListener("click", exportCsv);
    el("nbAnki").addEventListener("click", sendToAnki);
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
      if (st === "hard" && (e.mastered || e.fragility < 1)) return false;
      if (q) {
        var hay = (e.text + " " + (e.def || "") + " " + (e.pt || "")).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    }).sort(function (a, b) {
      // na lista das que te pegam a ordem é o tropeço, não a data
      if (st === "hard") return b.fragility - a.fragility;
      // primeiro o que precisa de revisão, depois o mais recente
      if (a.mastered !== b.mastered) return a.mastered ? 1 : -1;
      if (a.due !== b.due) return a.due ? -1 : 1;
      return b.last - a.last;
    });
  }

  /* O caderno pode ser mais velho que as frases de exemplo: quando a entrada
   * gravada não tem uma, ela vem do banco atual. */
  function exampleOf(e) {
    return e.ex || (window.WORD_EXAMPLES && window.WORD_EXAMPLES[e.text]) || "";
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
    // o documento pede quatro números por palavra: apareceu, acertou, escapou
    // e quanto tempo você leva pra digitar
    var partes = ["✓ " + e.hits];
    if (e.misses) partes.push("✕ " + e.misses);
    if (e.seen) partes.push("👁 " + e.seen);
    if (e.avgMs) partes.push((Math.round(e.avgMs / 100) / 10) + "s");
    tally.textContent = partes.join("  ") + " · " + dueLabel(e);

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
    var frase = exampleOf(e);
    if (frase) {
      var ex = document.createElement("div");
      ex.className = "cx"; ex.textContent = frase;
      li.appendChild(ex);
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

  /* ---------- Evolução ----------
   * Uma linha de PPM e uma de precisão nas últimas sessões. SVG na mão, sem
   * biblioteca: são duas polilinhas, e trazer um pacote de gráficos para isso
   * custaria mais bytes que o jogo inteiro. */
  function renderEvolution() {
    var box = el("nbEvolution");
    var rows = TCProgress.series(TCStore.history(), 30);
    if (rows.length < 3) { box.hidden = true; return; }   // duas partidas não são curva
    box.hidden = false;

    var t = TCProgress.trend(TCStore.history(), 5);
    var sinal = t.delta > 0 ? "+" : "";
    el("nbTrend").textContent =
      "últimas 5 sessões · " + t.wpm + " ppm (" + sinal + t.delta + ") · " + t.accuracy + "% de precisão";

    var W = 560, H = 120, pad = 8;
    var maxWpm = 10;
    rows.forEach(function (r) { if (r.wpm > maxWpm) maxWpm = r.wpm; });
    maxWpm = Math.ceil(maxWpm / 10) * 10;

    function pts(pick, max) {
      return rows.map(function (r, i) {
        var x = pad + (rows.length === 1 ? 0 : (i * (W - pad * 2)) / (rows.length - 1));
        var y = H - pad - (Math.min(max, pick(r)) / max) * (H - pad * 2);
        return Math.round(x) + "," + Math.round(y);
      }).join(" ");
    }

    var svg = ""
      + '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" '
      + 'aria-label="Palavras por minuto e precisão nas últimas ' + rows.length + ' sessões">'
      + '<polyline class="lineacc" points="' + pts(function (r) { return r.accuracy; }, 100) + '" />'
      + '<polyline class="linewpm" points="' + pts(function (r) { return r.wpm; }, maxWpm) + '" />'
      + "</svg>"
      + '<p class="chartlegend"><span class="k kwpm"></span>PPM (pico ' + maxWpm
      + ') <span class="k kacc"></span>precisão (0–100%)</p>';
    el("nbChart").innerHTML = svg;
  }

  function render() {
    var c = TCStore.counts();
    statsEl.innerHTML = "";
    statsEl.appendChild(statTile("Palavras", c.total));
    statsEl.appendChild(statTile("Dominadas", c.mastered));
    statsEl.appendChild(statTile("Revisar hoje", c.due));

    renderProgress();
    renderEvolution();

    var rows = filtered();
    listEl.innerHTML = "";
    var frag = document.createDocumentFragment();
    for (var i = 0; i < rows.length; i++) frag.appendChild(row(rows[i]));
    listEl.appendChild(frag);

    emptyEl.hidden = rows.length > 0;
    emptyEl.textContent = c.total === 0
      ? "Seu caderno está vazio. Capture algumas palavras e elas aparecem aqui."
      : "Nenhuma palavra corresponde a esses filtros.";

    /* O botão acompanha o filtro: quem está olhando "as que te pegam" quer
     * enfrentar aquela lista, não a fila do agendamento. */
    var deckView = statusEl.value === "hard";
    var queue = deckView ? TCStore.deckQueue() : practicePool();
    var btn = el("nbPractice");
    btn.disabled = queue.length === 0;
    btn.textContent = queue.length
      ? (deckView ? "Enfrentar " + queue.length + " palavras" : "Revisar " + queue.length + " palavras")
      : (deckView ? "Nada te pegando" : "Nada para revisar");
    btn.dataset.mode = deckView ? "deck" : "practice";
    el("nbExport").disabled = c.total === 0;
    el("nbAnki").disabled = c.total === 0;
  }

  /* Fila de revisão, já ordenada pelo agendamento (atrasadas primeiro). */
  function practicePool() { return TCStore.practiceQueue(); }

  function csvCell(v) { return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }

  /* CSV pronto para importar em Anki, Quizlet ou planilha. */
  function exportCsv() {
    var rows = [["palavra", "classe", "definicao_en", "traducao_pt", "exemplo", "nivel", "tema",
                 "vezes_vista", "acertos", "erros", "ms_por_palavra", "proxima_revisao"]];
    TCStore.list().forEach(function (e) {
      rows.push([
        e.text, e.pos, e.def, e.pt, exampleOf(e), e.lvl,
        (window.WORD_THEMES[e.theme] && window.WORD_THEMES[e.theme].label) || e.theme,
        e.seen, e.hits, e.misses, e.avgMs,
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

  /* ---------- Anki ----------
   * O CSV serve para qualquer lugar; isto serve para quem já vive no Anki e
   * não quer importar arquivo nenhum. O AnkiConnect é um add-on que abre uma
   * porta local (8765) no Anki aberto — nada sai da máquina.
   *
   * Duas coisas costumam dar errado, e as duas viram mensagem em português
   * aqui: o Anki fechado, e a origem desta página fora da webCorsOriginList
   * do add-on. Sem essa explicação, o botão só falharia em silêncio.
   */
  var ANKI_URL = "http://127.0.0.1:8765";
  var ANKI_DECK = "Type & Chill";

  function anki(action, params) {
    return fetch(ANKI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: action, version: 6, params: params || {} })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (j && j.error) throw new Error(j.error);
      return j ? j.result : null;
    });
  }

  function ankiNote(e) {
    var frase = exampleOf(e);
    return {
      deckName: ANKI_DECK,
      modelName: "Basic",
      fields: {
        Front: e.text,
        Back: (e.pt || "") + (e.def ? "<br><i>" + e.def + "</i>" : "") +
              (frase ? "<br><br>" + frase : "")
      },
      options: { allowDuplicate: false },
      tags: ["type-and-chill", e.lvl || "", e.theme || ""].filter(Boolean)
    };
  }

  function sendToAnki() {
    var btn = el("nbAnki");
    var antes = btn.textContent;
    var rows = filtered();                       // manda o que está na tela
    if (!rows.length) return;
    btn.disabled = true;
    btn.textContent = "Enviando…";

    anki("createDeck", { deck: ANKI_DECK })
      .then(function () { return anki("addNotes", { notes: rows.map(ankiNote) }); })
      .then(function (ids) {
        var novos = (ids || []).filter(function (id) { return !!id; }).length;
        var repetidas = (ids || []).length - novos;
        btn.textContent = novos + " no Anki" + (repetidas ? " · " + repetidas + " já lá" : "");
        setTimeout(function () { btn.textContent = antes; btn.disabled = false; }, 3200);
      })
      .catch(function (err) {
        btn.textContent = antes;
        btn.disabled = false;
        window.alert(
          "Não consegui falar com o Anki.\n\n" +
          "1. O Anki precisa estar aberto, com o add-on AnkiConnect instalado.\n" +
          "2. Nas opções do AnkiConnect, inclua o endereço desta página em " +
          "webCorsOriginList (" + window.location.origin + ").\n\n" +
          "Se preferir não mexer nisso, use o botão Baixar CSV.\n\nDetalhe: " +
          (err && err.message ? err.message : err)
        );
      });
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
  api.sendToAnki = sendToAnki;
  return api;
})();
