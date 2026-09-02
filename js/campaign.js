/* Type & Chill — a campanha: a lista de capítulos e o leitor.
 *
 * Duas telas:
 *   · a lista, agrupada por nível, com o próximo capítulo em destaque;
 *   · o leitor, onde o texto é digitado inteiro.
 *
 * O leitor é o único lugar do jogo onde nada cai. O texto fica parado, você
 * digita do começo ao fim e as palavras-alvo acendem quando você passa por
 * elas — cada uma entra no caderno com agendamento, igual a uma captura.
 * Errar tecla não estraga o texto: a letra errada é ignorada e o cursor
 * continua esperando a certa, como no resto do jogo.
 *
 * A lógica de verdade (normalizar, achar os alvos, comparar tecla) mora em
 * core/campaign.js, sem DOM, e é lá que os testes cobram cada capítulo novo.
 */
window.TCCampaign = (function () {
  "use strict";

  var api = {
    onExit: null,        // voltar para a tela inicial
    onTutorial: null     // "como isso vira revisão?" → tela do tutorial
  };

  var listScreen, readerScreen, textBox, inputEl;
  var mounted = false;

  var chapter = null;      // capítulo preparado (core/campaign.prepare)
  var spans = [];          // um <span> por caractere
  var pos = 0;             // próximo caractere a digitar
  var typos = 0, targetTypos = 0, learned = [];
  var startedAt = 0, finished = false;

  function el(id) { return document.getElementById(id); }
  function bank() { return window.WORD_THEMES; }
  function examples() { return window.WORD_EXAMPLES; }
  function chapters() { return window.CAMPAIGN_CHAPTERS || []; }

  // ---------- Lista de capítulos ----------
  function chapterCard(c) {
    var estado = TCStore.chapterState(c.id);
    var li = document.createElement("li");
    li.className = "capitulo" + (estado && estado.done ? " is-done" : "");
    li.setAttribute("data-chapter", c.id);

    var b = document.createElement("button");
    b.type = "button";
    b.className = "capbtn";

    var topo = document.createElement("span");
    topo.className = "captopo";
    var lvl = document.createElement("span");
    lvl.className = "caplvl"; lvl.textContent = c.level;
    var nome = document.createElement("span");
    nome.className = "capnome"; nome.textContent = c.title;
    topo.appendChild(lvl); topo.appendChild(nome);

    var linha = document.createElement("span");
    linha.className = "capintro";
    linha.textContent = c.intro || "";

    var meta = document.createElement("span");
    meta.className = "capmeta";
    var palavras = TCCampaignCore.words(c.text);
    meta.textContent = estado && estado.done
      ? "✓ concluído · " + estado.bestWpm + " ppm · " + estado.bestAcc + "% · " + palavras + " palavras"
      : palavras + " palavras · " + (c.targets || []).length + " palavras-alvo";

    b.appendChild(topo); b.appendChild(linha); b.appendChild(meta);
    b.addEventListener("click", function () { openChapter(c.id); });
    li.appendChild(b);
    return li;
  }

  function renderList() {
    var todos = TCCampaignCore.ordered(chapters());
    var feitos = TCStore.chaptersDone();
    var resumo = TCCampaignCore.levelSummary(todos, feitos);
    var proximo = TCCampaignCore.nextChapter(todos, feitos);

    var barras = el("capProgress");
    barras.innerHTML = "";
    TCCampaignCore.LEVELS.forEach(function (lvl) {
      var p = resumo[lvl];
      if (!p || !p.total) return;
      var wrap = document.createElement("div");
      wrap.className = "bar";
      var topo = document.createElement("div");
      topo.className = "barhead";
      var nome = document.createElement("span"); nome.textContent = lvl;
      var num = document.createElement("span"); num.textContent = p.done + "/" + p.total;
      topo.appendChild(nome); topo.appendChild(num);
      var trilho = document.createElement("div");
      trilho.className = "bartrack";
      var feito = document.createElement("i");
      feito.className = "bardone";
      feito.style.width = (p.total ? (p.done / p.total) * 100 : 0) + "%";
      trilho.appendChild(feito);
      wrap.appendChild(topo); wrap.appendChild(trilho);
      barras.appendChild(wrap);
    });

    var lista = el("capList");
    lista.innerHTML = "";
    var frag = document.createDocumentFragment();
    todos.forEach(function (c) { frag.appendChild(chapterCard(c)); });
    lista.appendChild(frag);

    var cta = el("capContinue");
    if (proximo) {
      cta.hidden = false;
      cta.textContent = (Object.keys(feitos).length ? "Continuar · " : "Começar · ") + proximo.title;
      cta.onclick = function () { openChapter(proximo.id); };
    } else {
      cta.hidden = true;
    }

    var c = TCStore.campaignCounts(todos.length);
    el("capCount").textContent = todos.length
      ? c.done + " de " + c.total + (c.total === 1 ? " capítulo concluído" : " capítulos concluídos")
      : "Nenhum capítulo escrito ainda.";
  }

  // ---------- Leitor ----------
  function findChapter(id) {
    var todos = chapters();
    for (var i = 0; i < todos.length; i++) if (todos[i].id === id) return todos[i];
    return null;
  }

  function openChapter(id) {
    var bruto = findChapter(id);
    if (!bruto) return;
    chapter = TCCampaignCore.prepare(bruto, bank(), examples());
    pos = 0; typos = 0; targetTypos = 0; learned = [];
    startedAt = 0; finished = false;

    el("capTitle").textContent = chapter.title;
    el("capLevel").textContent = chapter.level;
    el("capIntro").textContent = chapter.intro;
    el("capPt").textContent = chapter.pt || "";
    el("capPt").hidden = !(chapter.pt && TCStore.prefs.showPT);
    el("capDone").hidden = true;
    el("capCard").hidden = true;

    renderText();
    updateHud();

    listScreen.setAttribute("hidden", "");
    readerScreen.removeAttribute("hidden");
    focusInput();
  }

  /* Um <span> por caractere. Parece exagero, mas é o que deixa pintar o
   * progresso letra a letra sem redesenhar o texto inteiro a cada tecla. */
  function renderText() {
    textBox.innerHTML = "";
    spans = [];
    var frag = document.createDocumentFragment();
    for (var i = 0; i < chapter.text.length; i++) {
      var s = document.createElement("span");
      var ch = chapter.text[i];
      s.className = "ch";
      s.textContent = ch;   // espaço normal: quem preserva é o white-space do CSS
      if (TCCampaignCore.targetAt(chapter, i)) s.classList.add("alvo");
      frag.appendChild(s);
      spans.push(s);
    }
    textBox.appendChild(frag);
    paintCursor();
  }

  function paintCursor() {
    for (var i = 0; i < spans.length; i++) {
      var cls = spans[i].classList;
      cls.toggle("feito", i < pos);
      cls.toggle("agora", i === pos);
    }
    var atual = spans[pos];
    if (atual && atual.scrollIntoView) {
      var caixa = textBox.getBoundingClientRect();
      var linha = atual.getBoundingClientRect();
      if (linha.bottom > caixa.bottom - 8 || linha.top < caixa.top + 8) {
        atual.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
  }

  function elapsedMs() { return startedAt ? Date.now() - startedAt : 0; }

  function updateHud() {
    var pct = chapter.chars ? Math.round((pos / chapter.chars) * 100) : 0;
    el("capPct").textContent = pct + "%";
    el("capBar").style.width = pct + "%";
    el("capWpm").textContent = TCScoring.wpm(pos, elapsedMs());
    el("capAcc").textContent = TCScoring.accuracy(pos, pos + typos) + "%";
    el("capLearned").textContent = learned.length;
  }

  /* Palavra-alvo completada: vira cartão na tela e entrada no caderno, com a
   * mesma nota que uma captura teria — tropeçar dentro dela conta. */
  function captureTarget(alvo) {
    var info = alvo.info;
    if (!info) return;
    learned.push(info);
    TCStore.recordSeen(info);
    TCStore.recordCapture(info, { typos: targetTypos });
    TCAudio.capture();
    TCSpeech.say(info.text);

    el("capCardWord").textContent = info.text;
    el("capCardPos").textContent = info.pos + (info.lvl ? " · " + info.lvl : "");
    el("capCardDef").textContent = info.def || "";
    var pt = el("capCardPt");
    pt.textContent = info.pt || "";
    pt.hidden = !(TCStore.prefs.showPT && info.pt);
    var ex = el("capCardEx");
    ex.textContent = info.ex || "";
    ex.hidden = !(info.ex && TCStore.prefs.showExample !== false);
    el("capCard").hidden = false;
  }

  function handleChar(tecla) {
    if (finished || !chapter) return;
    if (!startedAt) startedAt = Date.now();

    var esperado = chapter.text[pos];
    if (TCCampaignCore.matches(esperado, tecla)) {
      var alvo = TCCampaignCore.targetAt(chapter, pos);
      pos += 1;
      TCAudio.key();
      paintCursor();
      // acabou de sair de uma palavra-alvo?
      if (alvo && pos >= alvo.end) { captureTarget(alvo); targetTypos = 0; }
      if (pos >= chapter.text.length) finish();
      updateHud();
      return;
    }

    typos += 1;
    if (TCCampaignCore.targetAt(chapter, pos)) targetTypos += 1;
    var span = spans[pos];
    if (span && !TCBackdrop.isReduced()) {
      span.classList.remove("errou");
      void span.offsetWidth;
      span.classList.add("errou");
    }
    updateHud();
  }

  function finish() {
    if (finished) return;
    finished = true;
    var ms = elapsedMs();
    var resultado = {
      wpm: TCScoring.wpm(chapter.chars, ms),
      accuracy: TCScoring.accuracy(chapter.chars, chapter.chars + typos),
      finished: true
    };
    TCStore.recordChapter(chapter.id, resultado);
    TCStore.flush();
    TCAudio.levelUp();

    el("capFinalWpm").textContent = resultado.wpm;
    el("capFinalAcc").textContent = resultado.accuracy + "%";
    el("capFinalWords").textContent = learned.length;
    el("capFinalTime").textContent = Math.max(1, Math.round(ms / 1000)) + "s";

    var lista = el("capFinalList");
    lista.innerHTML = "";
    var vistas = {};
    learned.forEach(function (w) {
      if (vistas[w.text]) return;
      vistas[w.text] = 1;
      var li = document.createElement("li");
      var cabeca = document.createElement("div");
      var cw = document.createElement("span"); cw.className = "cw"; cw.textContent = w.text;
      var cp = document.createElement("span"); cp.className = "cp"; cp.textContent = w.pos;
      cabeca.appendChild(cw); cabeca.appendChild(cp);
      var cd = document.createElement("div"); cd.className = "cd"; cd.textContent = w.def || "";
      li.appendChild(cabeca); li.appendChild(cd);
      if (w.pt) {
        var pt = document.createElement("div"); pt.className = "cpt"; pt.textContent = w.pt;
        li.appendChild(pt);
      }
      lista.appendChild(li);
    });

    var proximo = TCCampaignCore.nextChapter(chapters(), TCStore.chaptersDone());
    var btn = el("capNext");
    if (proximo && proximo.id !== chapter.id) {
      btn.hidden = false;
      btn.textContent = "Próximo · " + proximo.title;
      btn.onclick = function () { openChapter(proximo.id); };
    } else {
      btn.hidden = true;
    }

    el("capCard").hidden = true;
    el("capDone").hidden = false;
    blurInput();
  }

  // ---------- Entrada ----------
  /* No celular o teclado do sistema só sobe se um campo tiver foco. É o mesmo
   * truque da partida, mas com campo próprio: dividir o campo com o jogo faria
   * um handler limpar o valor antes de o outro ler. */
  var isTouch = false;
  function focusInput() {
    if (!isTouch || !inputEl) return;
    try { inputEl.focus({ preventScroll: true }); } catch (e) { inputEl.focus(); }
  }
  function blurInput() { if (isTouch && inputEl) inputEl.blur(); }

  function onKey(e) {
    if (!isOpen()) return;
    // O Esc da campanha é tratado só aqui, inclusive na lista. Quando o
    // game.js também mexia nele, o leitor voltava para a lista e o jogo, vendo
    // a lista aberta no mesmo evento, fechava tudo e mandava para a inicial.
    if (e.key === "Escape") {
      e.preventDefault();
      if (isReading()) backToList(); else close();
      return;
    }
    if (!isReading() || finished) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (!e.key || e.key.length !== 1) return;
    e.preventDefault();
    handleChar(e.key);
  }

  // ---------- Navegação ----------
  function isOpen() {
    return (!!listScreen && !listScreen.hasAttribute("hidden")) || isReading();
  }
  function isReading() { return !!readerScreen && !readerScreen.hasAttribute("hidden"); }

  function open() {
    mount();
    renderList();
    readerScreen.setAttribute("hidden", "");
    listScreen.removeAttribute("hidden");
  }
  function backToList() {
    readerScreen.setAttribute("hidden", "");
    blurInput();
    renderList();
    listScreen.removeAttribute("hidden");
  }
  function close() {
    if (listScreen) listScreen.setAttribute("hidden", "");
    if (readerScreen) readerScreen.setAttribute("hidden", "");
    blurInput();
    if (api.onExit) api.onExit();
  }

  function mount() {
    if (mounted) return;
    listScreen = el("campaignScreen");
    readerScreen = el("readerScreen");
    textBox = el("capText");
    inputEl = el("readerInput");

    el("capClose").addEventListener("click", close);
    el("capBack").addEventListener("click", backToList);
    el("capRetry").addEventListener("click", function () { openChapter(chapter.id); });
    el("capToList").addEventListener("click", backToList);
    el("capTutorial").addEventListener("click", function () {
      if (api.onTutorial) api.onTutorial();
    });
    el("capPtBtn").addEventListener("click", function () {
      var box = el("capPt");
      box.hidden = !box.hidden || !chapter || !chapter.pt;
    });

    isTouch = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    if (isTouch && inputEl) {
      inputEl.addEventListener("input", function () {
        var v = inputEl.value;
        inputEl.value = "";
        for (var i = 0; i < v.length; i++) handleChar(v[i]);
      });
      readerScreen.addEventListener("pointerdown", function (e) {
        var t = e.target;
        if (t && t.closest && t.closest("button, a")) return;
        focusInput();
      });
    }

    window.addEventListener("keydown", onKey);
    mounted = true;
  }

  api.mount = mount;
  api.open = open;
  api.close = close;
  api.isOpen = isOpen;
  api.isReading = isReading;
  api.openChapter = openChapter;
  api.renderList = renderList;
  return api;
})();
