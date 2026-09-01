/* Type & Chill — lógica do jogo.
 *
 * Depende de (nesta ordem):
 *   words.js · core/rng · core/srs · core/scoring · core/challenge · core/wordbank
 *   storage.js · themes.js · audio.js · speech.js · notebook.js · challengeui.js
 *
 * Modos:
 *   classic   3 vidas, o ritmo acelera a cada nível
 *   zen       sem vidas e sem fim, ritmo constante
 *   practice  a fila de revisão do caderno, ordenada pelo agendamento
 *
 * Desafios: quando a partida tem uma semente (challenge), as palavras, as
 * posições e as velocidades saem todas do gerador determinístico — dois
 * jogadores com o mesmo código recebem exatamente a mesma partida.
 */
(function () {
  "use strict";

  var prefs, stats;

  // ---------- DOM ----------
  function el(id) { return document.getElementById(id); }
  function q(sel) { return document.querySelector(sel); }

  var stage, elScore, elCombo, elLearned, elWpm, elLvl, elLvlPrefix,
      elLives, elLivesLabel, lifeBox, clist, defcard, startBtn, poolNote,
      startScreen, pauseScreen, overScreen, setupScreen, ghostEl,
      musicBtn, sfxBtn, ptBtn, touchInput;

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches;

  // ---------- Estado ----------
  var POOL = [];
  var words = [], target = null;
  var score = 0, combo = 1, learnedCount = 0, lives = 3, level = 1;
  var running = false, paused = false, over = false, autoPaused = false;
  var mode = "classic";
  var practiceQueue = [], practiceTotal = 0, practiceDone = 0;
  var lastSpawn = 0, spawnInterval = 2100, lastFrame = 0;
  var recent = [], learnedRun = [];
  var W = window.innerWidth, H = window.innerHeight;

  /* Área útil de queda. O palco ocupa a tela toda, mas as palavras só podem
   * nascer e cair onde nada as cobre: fora do HUD, fora da lista lateral de
   * capturadas e acima da faixa reservada ao cartão de definição. Antes as
   * palavras caíam por trás desses painéis e ficavam ilegíveis. */
  var field = { left: 24, right: 800, top: 0, bottom: 600 };

  // partida corrente (desafio determinístico)
  var run = { challenge: null, rng: null, deck: [], deckIdx: 0, ghost: null, ghostBeaten: false };

  // métricas da sessão
  var session = { startedAt: 0, pausedAt: 0, pausedMs: 0, keystrokes: 0, correctKeys: 0, chars: 0, bestCombo: 1 };

  var MODES = {
    classic:  { label: "Clássico", lives: 3, endless: true },
    zen:      { label: "Zen",      lives: 0, endless: true },
    practice: { label: "Prática",  lives: 0, endless: false }
  };

  function orderOf() {
    return { themes: Object.keys(window.WORD_THEMES), levels: window.WORD_LEVELS };
  }

  // ---------- Banco ativo ----------
  function themeEnabled(k) { return !prefs.themes || prefs.themes.indexOf(k) >= 0; }
  function levelEnabled(l) { return !prefs.levels || prefs.levels.indexOf(l) >= 0; }

  function buildPool(filters) {
    POOL = TCWordbank.buildPool(window.WORD_THEMES, filters || {
      themes: prefs.themes, levels: prefs.levels
    });
    return POOL;
  }
  function activePoolSize() {
    if (mode === "practice") return TCStore.practiceQueue().length;
    return buildPool().length;
  }
  function updateStartBtn() { updateCta(); }

  /* ~12 segundos por palavra é o ritmo médio de uma revisão. */
  function minutesFor(count) { return Math.max(1, Math.round(count * 12 / 60)); }

  /* A ação primária muda conforme o caderno: quem tem revisão vencida revisa,
   * quem não tem joga. O outro caminho fica logo abaixo, como texto — ao
   * alcance, mas sem disputar atenção com o botão. */
  var ctaPractice = false;
  function updateCta(counts) {
    var c = counts || TCStore.counts();
    var n = activePoolSize();
    var alt = el("altStartBtn");
    ctaPractice = mode !== "practice" && c.due > 0;

    if (mode === "practice") {
      el("startLabel").textContent = n ? "Revisar " + n + " palavras" : "Nada para revisar";
      el("ctaHint").textContent = n ? "Modo prática · ~" + minutesFor(n) + " min" : "";
      startBtn.disabled = n === 0;
      alt.hidden = false;
      alt.textContent = "Partida nova · Clássico";
      poolNote.textContent = n === 0
        ? "Jogue uma partida ou volte quando o agendamento vencer"
        : n + (n === 1 ? " palavra na fila" : " palavras na fila");
    } else if (ctaPractice) {
      el("startLabel").textContent = "Revisar " + c.due + " palavras";
      el("ctaHint").textContent = "Modo prática · ~" + minutesFor(c.due) + " min";
      startBtn.disabled = false;
      alt.hidden = false;
      alt.textContent = "Partida nova · " + MODES[mode].label;
      poolNote.textContent = n + " palavras neste sorteio";
    } else {
      el("startLabel").textContent = "Começar";
      el("ctaHint").textContent = MODES[mode].label + (mode === "classic" ? " · 3 vidas" : " · sem fim");
      startBtn.disabled = n === 0;
      alt.hidden = true;
      poolNote.textContent = n === 0
        ? "Escolha ao menos um tema e um nível"
        : n + " palavras neste sorteio";
    }
  }

  /* Uma linha resume tudo que o painel de ajustes contém. */
  function themeSummary() {
    var all = Object.keys(window.WORD_THEMES);
    var sel = prefs.themes && prefs.themes.length ? prefs.themes : all;
    if (sel.length >= all.length) return "todos os temas";
    if (sel.length === 1) return window.WORD_THEMES[sel[0]].label;
    return sel.length + " temas";
  }
  function levelSummary() {
    var sel = prefs.levels && prefs.levels.length ? prefs.levels : window.WORD_LEVELS;
    return sel.length >= window.WORD_LEVELS.length ? "A2–C1" : sel.join(" · ");
  }
  function updateSetupSummary() {
    var v = window.TC_VISUALS[prefs.visual];
    var partes = [MODES[mode].label];
    if (mode === "practice") partes.push("fila do caderno");
    else { partes.push(themeSummary()); partes.push(levelSummary()); }
    if (v) partes.push(v.label);
    el("setupSummary").textContent = partes.join(" · ");
  }

  // ---------- Chips ----------
  function chip(label, pressed, onToggle, extraClass) {
    var b = document.createElement("button");
    b.className = "chip" + (extraClass ? " " + extraClass : "");
    b.type = "button";
    b.textContent = label;
    b.setAttribute("aria-pressed", pressed ? "true" : "false");
    b.addEventListener("click", function () {
      var next = onToggle(b.getAttribute("aria-pressed") === "true");
      b.setAttribute("aria-pressed", next ? "true" : "false");
    });
    return b;
  }
  function toggleIn(listName, key, allKeys) {
    var cur = prefs[listName] ? prefs[listName].slice() : allKeys.slice();
    var i = cur.indexOf(key);
    if (i >= 0) cur.splice(i, 1); else cur.push(key);
    if (!cur.length) return true;                 // nunca deixa tudo desligado
    prefs[listName] = cur;
    TCStore.savePrefs();
    updateStartBtn();
    return cur.indexOf(key) >= 0;
  }

  function setThemes(keys) {
    if (!keys || !keys.length) return;            // nunca deixa tudo desligado
    prefs.themes = keys.slice();
    TCStore.savePrefs();
    renderThemeChips();
    updateStartBtn();
  }

  /* Botãozinho de texto ao lado do nome da família. */
  function miniBtn(label, onClick) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "minibtn"; b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  /* Vinte temas numa lista só viram um paredão de fichinhas: aqui eles saem
   * separados pelas famílias declaradas em WORD_GROUPS, e cada família tem um
   * atalho para jogar só com ela. */
  function renderThemeChips() {
    var themeKeys = Object.keys(window.WORD_THEMES);
    var box = el("themeChips"); box.innerHTML = "";

    TCWordbank.groupsOf(window.WORD_THEMES, window.WORD_GROUPS).forEach(function (g) {
      var wrap = document.createElement("div");
      wrap.className = "chipgroup";

      var head = document.createElement("p");
      head.className = "chiphead";
      var name = document.createElement("span");
      name.textContent = g.label;
      head.appendChild(name);
      head.appendChild(miniBtn("só este", function () { setThemes(g.themes); }));
      wrap.appendChild(head);

      var row = document.createElement("div");
      row.className = "chips";
      g.themes.forEach(function (k) {
        row.appendChild(chip(window.WORD_THEMES[k].label, themeEnabled(k), function () {
          return toggleIn("themes", k, themeKeys);
        }));
      });
      wrap.appendChild(row);
      box.appendChild(wrap);
    });
  }

  function renderConfig() {
    var modeBox = el("modeChips"); modeBox.innerHTML = "";
    Object.keys(MODES).forEach(function (k) {
      modeBox.appendChild(chip(MODES[k].label, mode === k, function () {
        mode = k; prefs.mode = k; TCStore.savePrefs();
        renderConfig(); updateStartBtn(); updateModeBlurb();
        return true;
      }, "chip-mode"));
    });

    renderThemeChips();

    var levelBox = el("levelChips"); levelBox.innerHTML = "";
    window.WORD_LEVELS.forEach(function (l) {
      levelBox.appendChild(chip(l, levelEnabled(l), function () {
        return toggleIn("levels", l, window.WORD_LEVELS);
      }, "chip-level"));
    });

    var visBox = el("visualChips"); visBox.innerHTML = "";
    Object.keys(window.TC_VISUALS).forEach(function (k) {
      var v = window.TC_VISUALS[k];
      var b = chip(v.label, prefs.visual === k, function () {
        applyVisual(k); renderConfig(); return true;
      }, "chip-visual");
      var dot = document.createElement("i");
      dot.className = "swatch";
      dot.style.background = "linear-gradient(135deg," + v.swatch[0] + "," + v.swatch[1] + ")";
      b.insertBefore(dot, b.firstChild);
      visBox.appendChild(b);
    });

    renderPrefChips();
    el("vocabConfig").hidden = (mode === "practice");
    updateSetupSummary();
  }

  // ---------- Painel de ajustes ----------
  function setupOpen() { return !setupScreen.hasAttribute("hidden"); }
  function openSetup() {
    renderConfig(); updateModeBlurb(); updateStartBtn();
    setupScreen.removeAttribute("hidden");
  }
  function closeSetup() {
    setupScreen.setAttribute("hidden", "");
    refreshHeader();
  }

  /* As mesmas preferências dos botões do HUD, também na tela inicial —
   * lá o HUD fica atrás do overlay e não recebe clique. */
  function renderPrefChips() {
    var box = el("prefChips");
    if (!box) return;
    box.innerHTML = "";
    box.appendChild(chip("Tradução PT", prefs.showPT, function () {
      setPref("showPT", !prefs.showPT); return prefs.showPT;
    }));
    box.appendChild(chip("Música", prefs.music, function () {
      setPref("music", !prefs.music); return prefs.music;
    }));
    box.appendChild(chip("Efeitos", prefs.sfx, function () {
      setPref("sfx", !prefs.sfx); return prefs.sfx;
    }));
    if (TCSpeech.isAvailable()) {
      box.appendChild(chip("Pronúncia", prefs.speak, function () {
        setPref("speak", !prefs.speak); return prefs.speak;
      }));
    }
  }
  function setPref(key, value) {
    prefs[key] = value;
    TCStore.savePrefs();
    if (key === "music") { TCAudio.init(); TCAudio.resume(); TCAudio.setMusic(value); }
    if (key === "sfx") { TCAudio.setSfx(value); if (value) { TCAudio.init(); TCAudio.resume(); TCAudio.key(); } }
    if (key === "speak") { TCSpeech.setEnabled(value); if (value) TCSpeech.say("chill"); }
    syncPrefUI();
  }
  function syncPrefUI() {
    ptBtn.classList.toggle("off", !prefs.showPT);
    ptBtn.setAttribute("aria-pressed", prefs.showPT ? "true" : "false");
    musicBtn.classList.toggle("off", !prefs.music);
    sfxBtn.classList.toggle("off", !prefs.sfx);
    renderPrefChips();
  }

  function updateModeBlurb() {
    var t = {
      classic: "Três vidas. O ritmo acelera a cada nível — o modo de sempre.",
      zen: "Sem vidas, sem fim. Deixe rolando enquanto faz outra coisa.",
      practice: "A fila de revisão do seu caderno, na ordem em que você está prestes a esquecer."
    };
    el("modeBlurb").textContent = t[mode];
  }

  function applyVisual(key) {
    prefs.visual = key; TCStore.savePrefs();
    TCBackdrop.setVisual(key);
    TCAudio.setMood(window.TC_VISUALS[key].audio);
    var meta = q('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", window.TC_VISUALS[key].swatch[1]);
  }

  // ---------- Área de jogo ----------
  /* Mede os painéis de verdade em vez de chutar valores: assim continua certo
   * quando a lista some no responsivo ou o cartão muda de altura. */
  function computeField() {
    // no celular o teclado virtual encolhe a viewport visível; sem isto as
    // palavras cairiam atrás dele
    var vh = (window.visualViewport && window.visualViewport.height) || H;
    var pad = Math.max(18, Math.min(40, W * 0.02));
    var right = W - pad;

    var collected = el("collected");
    if (collected && getComputedStyle(collected).display !== "none") {
      right = Math.min(right, collected.getBoundingClientRect().left - 18);
    }

    var hud = el("hud");
    var top = hud ? hud.getBoundingClientRect().bottom + 18 : 88;

    // faixa de baixo reservada ao cartão de definição. Generosa de propósito:
    // o cartão cresce quando a definição quebra em duas linhas ou quando a
    // tradução está ligada, e a linha do horizonte não pode cair sobre ele.
    var reserva = Math.max(140, Math.min(250, Math.round(vh * 0.27)));
    var bottom = Math.max(top + 100, vh - reserva);

    field = { left: pad, right: Math.max(pad + 160, right), top: top, bottom: bottom };

    // a dissolvência termina abaixo do topo da área: a palavra chega quase
    // apagada na altura do HUD e só ganha corpo depois de passar por ele
    document.documentElement.style.setProperty("--stage-fade", Math.round(top + 38) + "px");
    var horizon = el("horizon");
    if (horizon) {
      horizon.style.top = bottom + "px";
      horizon.style.left = field.left + "px";
      horizon.style.width = (field.right - field.left) + "px";
    }
  }

  // ---------- Reaproveitamento de elementos ----------
  var nodePool = [], widthCache = {};

  function acquireNode(text) {
    var node = nodePool.pop();
    if (!node) {
      node = document.createElement("div");
      node.className = "word";
      node.appendChild(document.createElement("span")).className = "inner";
    }
    node.className = "word";
    var inner = node.firstChild;
    inner.textContent = "";
    var frag = document.createDocumentFragment();
    for (var i = 0; i < text.length; i++) {
      var s = document.createElement("span");
      s.className = "l";
      s.textContent = text[i];
      frag.appendChild(s);
    }
    inner.appendChild(frag);
    return node;
  }
  function releaseNode(node) {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.style.transform = "";
    if (nodePool.length < 16) nodePool.push(node);
  }

  // ---------- Palavras ----------
  function randomPick() {
    var activeFirst = {};
    for (var i = 0; i < words.length; i++) activeFirst[words[i].text[0]] = 1;
    var candidates = [];
    for (var k = 0; k < POOL.length; k++) {
      if (recent.indexOf(POOL[k].text) >= 0) continue;
      if (activeFirst[POOL[k].text[0]]) continue;
      candidates.push(POOL[k]);
    }
    if (!candidates.length) {
      for (var m = 0; m < POOL.length; m++) {
        if (!activeFirst[POOL[m].text[0]]) candidates.push(POOL[m]);
      }
    }
    if (!candidates.length) return null;
    return candidates[(Math.random() * candidates.length) | 0];
  }

  function nextFromQueue(queue) {
    var activeFirst = {};
    for (var i = 0; i < words.length; i++) activeFirst[words[i].text[0]] = 1;
    for (var j = 0; j < queue.length; j++) {
      if (!activeFirst[queue[j].text[0]]) return queue.splice(j, 1)[0];
    }
    return null;
  }

  function nextWord() {
    if (run.challenge) {
      // baralho determinístico: mesma ordem para todo mundo
      if (!run.deck.length) return null;
      var w = run.deck[run.deckIdx % run.deck.length];
      run.deckIdx++;
      return w;
    }
    if (mode === "practice") return nextFromQueue(practiceQueue);
    return randomPick();
  }

  function measure(node, text) {
    if (widthCache[text] !== undefined) return widthCache[text];
    var w = node.offsetWidth;              // única leitura de layout por palavra nova
    widthCache[text] = w;
    return w;
  }

  function spawn() {
    var data = nextWord();
    if (!data) return false;

    if (!run.challenge && mode !== "practice") {
      recent.push(data.text);
      var cap = Math.min(24, (POOL.length / 2) | 0);
      while (recent.length > cap) recent.shift();
    }

    var node = acquireNode(data.text);
    stage.appendChild(node);

    var rnd = run.rng || Math.random;
    var wpx = measure(node, data.text);
    var faixa = Math.max(1, (field.right - field.left) - wpx);
    var x = field.left + rnd() * faixa;
    var base = TCScoring.fallSpeed(level, mode);

    var w = {
      text: data.text, pos: data.pos, def: data.def, pt: data.pt,
      lvl: data.lvl, theme: data.theme,
      el: node, letters: node.firstChild.childNodes,
      x: x, y: -40, typed: 0, typos: 0,
      speed: base * (0.85 + rnd() * 0.4)
    };
    node.style.transform = "translate(" + x + "px," + w.y + "px)";
    words.push(w);
    return true;
  }

  function paintWord(w) {
    for (var i = 0; i < w.letters.length; i++) {
      var c = w.letters[i];
      var cls = "l";
      if (w === target) {
        if (i < w.typed) cls = "l done";
        else if (i === w.typed) cls = "l next";
      }
      if (c.className !== cls) c.className = cls;
    }
  }
  function setTarget(w) {
    if (target && target !== w) { target.el.classList.remove("targeted"); paintWord(target); }
    target = w;
    if (w) { w.el.classList.add("targeted"); paintWord(w); }
  }

  function fadeOut(w, cls) {
    w.el.classList.add(cls);
    var node = w.el;
    setTimeout(function () { releaseNode(node); }, 380);
  }

  function capture(w) {
    var i = words.indexOf(w); if (i < 0) return;
    words.splice(i, 1);
    if (w === target) target = null;

    var r = w.el.getBoundingClientRect();
    TCBackdrop.burst(r.left + r.width / 2, r.top + r.height / 2);
    fadeOut(w, "captured");
    TCAudio.capture();
    TCSpeech.say(w.text);

    score += TCScoring.capturePoints(combo, w.text.length, w.typos);
    combo += 1;
    if (combo > session.bestCombo) session.bestCombo = combo;
    learnedCount += 1;
    session.chars += w.text.length;
    learnedRun.push(w);
    TCStore.recordCapture(w, { typos: w.typos });
    addCollected(w);
    showDef(w);
    checkGhost();

    if (mode === "practice") practiceDone += 1;
    else if (mode === "classic" && TCScoring.isLevelUp(learnedCount)) {
      var next = TCScoring.levelFor(learnedCount);
      if (next > level) { level = next; TCAudio.levelUp(); }
      spawnInterval = TCScoring.spawnInterval(level, mode);
    }
    updateHUD();
    if (mode === "practice") checkPracticeEnd();
  }

  function miss(w) {
    var i = words.indexOf(w); if (i < 0) return;
    words.splice(i, 1);
    if (w === target) target = null;
    fadeOut(w, "missed");
    combo = 1;
    TCStore.recordMiss(w);
    TCAudio.miss();

    if (mode === "classic") {
      lives -= 1;
      updateHUD();
      if (lives <= 0) { finish(); return; }
    } else if (mode === "practice") {
      practiceDone += 1;
      updateHUD();
      checkPracticeEnd();
      return;
    }
    updateHUD();
  }

  function checkPracticeEnd() {
    if (mode === "practice" && !practiceQueue.length && !words.length) finish();
  }

  // ---------- Fantasma do desafio ----------
  function loadGhost() {
    run.ghost = null; run.ghostBeaten = false;
    if (!run.challenge) { ghostEl.hidden = true; return; }
    var code = TCChallenge.encode(run.challenge, orderOf());
    var rows = TCStore.leaderboard(code, prefs.name || "VOCÊ").filter(function (r) { return !r.me; });
    if (!rows.length) { ghostEl.hidden = true; return; }
    run.ghost = rows[0];
    ghostEl.hidden = false;
    renderGhost();
  }
  function renderGhost() {
    if (!run.ghost) return;
    ghostEl.classList.toggle("beaten", run.ghostBeaten);
    ghostEl.textContent = run.ghostBeaten
      ? "✓ passou " + run.ghost.name + " (" + run.ghost.score + ")"
      : "alvo · " + run.ghost.name + " " + run.ghost.score;
  }
  function checkGhost() {
    if (!run.ghost || run.ghostBeaten) return;
    if (score > run.ghost.score) {
      run.ghostBeaten = true;
      TCAudio.levelUp();
      renderGhost();
    }
  }

  // ---------- HUD ----------
  function elapsedMs() {
    if (!session.startedAt) return 0;
    var now = Date.now();
    var pausedNow = paused && session.pausedAt ? (now - session.pausedAt) : 0;
    return Math.max(0, now - session.startedAt - session.pausedMs - pausedNow);
  }
  function currentWpm() { return TCScoring.wpm(session.chars, elapsedMs()); }

  function updateHUD() {
    elScore.textContent = score;
    elCombo.textContent = "×" + combo;
    elLearned.textContent = learnedCount;
    elWpm.textContent = currentWpm();
    elLvlPrefix.textContent = mode === "classic" ? "Nível" : "Modo";
    elLvl.textContent = mode === "classic" ? level : MODES[mode].label;

    if (mode === "classic") {
      // três pontinhos dizem o mesmo que "VIDAS 3" e ocupam um quinto do espaço
      lifeBox.className = "lifebox dots";
      elLivesLabel.textContent = "Vidas";
      elLives.className = "lives";
      var html = "";
      for (var i = 0; i < 3; i++) html += '<i class="pip' + (i < lives ? "" : " lost") + '"></i>';
      elLives.innerHTML = html;
    } else if (mode === "practice") {
      lifeBox.className = "lifebox";
      elLivesLabel.textContent = "Restantes";
      elLives.className = "lives count";
      elLives.textContent = Math.max(0, practiceTotal - practiceDone);
    } else {
      lifeBox.className = "lifebox";
      elLivesLabel.textContent = "Melhor sequência";
      elLives.className = "lives count";
      elLives.textContent = "×" + session.bestCombo;
    }
  }

  function wordRow(w) {
    var li = document.createElement("li");
    var head = document.createElement("div");
    var cw = document.createElement("span"); cw.className = "cw"; cw.textContent = w.text;
    var cp = document.createElement("span"); cp.className = "cp"; cp.textContent = w.pos;
    head.appendChild(cw); head.appendChild(cp);
    var cd = document.createElement("div"); cd.className = "cd"; cd.textContent = w.def;
    li.appendChild(head); li.appendChild(cd);
    if (prefs.showPT && w.pt) {
      var pt = document.createElement("div"); pt.className = "cpt"; pt.textContent = w.pt;
      li.appendChild(pt);
    }
    return li;
  }
  /* Durante a partida a lista é só um rastro que se apaga: a palavra e nada
   * mais. O cartão completo — classe, definição, tradução — fica para o resumo
   * do fim, onde existe espaço e tempo de ler. */
  function addCollected(w) {
    var li = document.createElement("li");
    li.textContent = w.text;
    clist.insertBefore(li, clist.firstChild);
    while (clist.children.length > 8) clist.removeChild(clist.lastChild);
    el("collected").classList.add("has-words");
  }

  var defTimer = null;
  function showDef(w) {
    q("#defcard .dw").textContent = w.text;
    q("#defcard .dp").textContent = w.pos + (w.lvl ? " · " + w.lvl : "");
    q("#defcard .dd").textContent = w.def;
    var ptEl = q("#defcard .dt");
    ptEl.textContent = w.pt || "";
    ptEl.hidden = !(prefs.showPT && w.pt);
    defcard.classList.add("show");
    if (defTimer) clearTimeout(defTimer);
    defTimer = setTimeout(function () { defcard.classList.remove("show"); }, 2600);
  }

  // ---------- Entrada ----------
  function overlayOpen() {
    return TCNotebook.isOpen() || TCChallengeUI.isOpen() || setupOpen();
  }
  function isTyping(e) {
    var t = e.target;
    return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT");
  }
  function homeOpen() {
    return !running && !over && !startScreen.hasAttribute("hidden");
  }
  function openNotebook() {
    if (running && !over && !paused) pause();
    blurTouch();
    TCNotebook.open();
  }

  function onKey(e) {
    if (overlayOpen()) {
      if (e.key === "Escape") {
        if (setupOpen()) closeSetup();
        else { TCNotebook.close(); TCChallengeUI.close(); }
      }
      return;
    }

    // Atalhos sempre com Alt. Letra sozinha nunca é atalho durante a partida:
    // "p" precisa continuar digitável, senão 84 palavras do banco viram
    // impossíveis de capturar.
    if (e.altKey && !e.ctrlKey && !e.metaKey && e.key && e.key.length === 1) {
      var a = e.key.toLowerCase();
      if (a === "p") { e.preventDefault(); setPref("showPT", !prefs.showPT); return; }
      if (a === "m") { e.preventDefault(); setPref("music", !prefs.music); return; }
      if (a === "s") { e.preventDefault(); setPref("sfx", !prefs.sfx); return; }
      if (a === "c") { e.preventDefault(); openNotebook(); return; }
    }

    // Na tela inicial não se digita palavra nenhuma, então ali as letras
    // podem ser atalhos sem risco.
    if (homeOpen()) {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Enter") { e.preventDefault(); if (!startBtn.disabled) startBtn.click(); return; }
      var hk = (e.key || "").toLowerCase();
      if (hk === "a") { e.preventDefault(); openSetup(); return; }
      if (hk === "c") { e.preventDefault(); openNotebook(); return; }
      return;
    }

    if (e.key === "Escape") {
      if (running && !over) { e.preventDefault(); paused ? resume() : pause(); }
      return;
    }
    if (!running || paused || over) return;
    var k = e.key;
    if (k.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
    k = k.toLowerCase();
    if (k < "a" || k > "z") return;
    e.preventDefault();
    handleLetter(k);
  }

  function handleLetter(k) {
    session.keystrokes += 1;

    if (target) {
      if (target.text[target.typed] === k) {
        session.correctKeys += 1;
        target.typed++;
        TCAudio.key();
        paintWord(target);
        if (target.typed >= target.text.length) capture(target);
      } else {
        target.typos += 1;
        if (!reduce) {
          target.el.classList.remove("shake");
          void target.el.offsetWidth;
          target.el.classList.add("shake");
        }
      }
      return;
    }
    var cand = null;
    for (var i = 0; i < words.length; i++) {
      if (words[i].text[0] === k && (!cand || words[i].y > cand.y)) cand = words[i];
    }
    if (cand) {
      session.correctKeys += 1;
      setTarget(cand); cand.typed = 1; TCAudio.key(); paintWord(cand);
      if (cand.text.length <= 1) capture(cand);
    }
  }

  /* Celular: um campo invisível recebe o foco e o teclado do sistema sobe.
   * Ler o evento "input" é o único caminho confiável — os teclados virtuais do
   * Android disparam keydown sem a tecla (o famoso keyCode 229). */
  var isTouch = false;
  function focusTouch() {
    if (!isTouch || !touchInput) return;
    try { touchInput.focus({ preventScroll: true }); } catch (err) { touchInput.focus(); }
  }
  function blurTouch() {
    if (isTouch && touchInput) touchInput.blur();
  }
  function setupTouch() {
    isTouch = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
    if (!isTouch || !touchInput) return;
    document.body.classList.add("is-touch");
    var hint = q(".toolhint");
    if (hint) hint.textContent = "Toque na tela para digitar";

    touchInput.addEventListener("input", function () {
      var v = touchInput.value;
      touchInput.value = "";
      if (!running || paused || over) return;
      for (var i = 0; i < v.length; i++) {
        var c = v[i].toLowerCase();
        if (c >= "a" && c <= "z") handleLetter(c);
      }
    });
    touchInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === "Backspace") e.preventDefault();
    });

    // tocar no palco devolve o foco (e o teclado) sem roubar cliques de botão
    document.addEventListener("pointerdown", function (e) {
      if (!running || paused || over) return;
      var t = e.target;
      if (t && t.closest && t.closest("button, input, select, a, .overlay")) return;
      focusTouch();
    });

    // o teclado subindo encolhe a viewport: a área de queda acompanha
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", function () { computeField(); });
    }
  }

  // ---------- Laço único ----------
  /* Um só requestAnimationFrame para tudo: menu, jogo e pausa. Antes havia
   * dois laços vivos ao mesmo tempo, um deles sem fazer nada. */
  var quality = 1, fpsSamples = 0, fpsAccum = 0, hudAccum = 0;

  function tick(now) {
    requestAnimationFrame(tick);

    var dt = (now - lastFrame) / 1000;
    lastFrame = now;
    if (!(dt > 0)) return;
    if (dt > 0.25) dt = 0.016;            // voltou de aba oculta: não teleporta
    dt = Math.min(dt, 0.05);

    if (document.hidden) return;

    // qualidade adaptativa: se o quadro está caro, alivia o fundo
    fpsAccum += dt; fpsSamples++;
    if (fpsSamples >= 120) {
      var fps = fpsSamples / fpsAccum;
      if (fps < 50 && quality > 0.4) {
        quality = Math.max(0.4, quality - 0.2);
        TCBackdrop.setQuality(quality);
      }
      fpsSamples = 0; fpsAccum = 0;
    }

    if (!running || paused) { TCBackdrop.draw(running ? 0 : dt, now); return; }

    TCBackdrop.draw(dt, now);

    var canSpawn = mode !== "practice" || practiceQueue.length > 0;
    if (canSpawn && now - lastSpawn > spawnInterval && words.length < TCScoring.maxOnScreen(mode)) {
      spawn();
      lastSpawn = now;
    }

    var limit = field.bottom;
    for (var i = words.length - 1; i >= 0; i--) {
      var w = words[i];
      w.y += w.speed * dt;
      w.el.style.transform = "translate(" + w.x + "px," + w.y + "px)";
      if (w.y > limit) miss(w);
    }

    hudAccum += dt;
    if (hudAccum > 0.5) { hudAccum = 0; elWpm.textContent = currentWpm(); }
  }

  // ---------- Fluxo ----------
  function clearBoard() {
    words.forEach(function (w) { releaseNode(w.el); });
    words = []; target = null;
    TCBackdrop.clearPuffs();
  }

  function reset() {
    clearBoard();
    score = 0; combo = 1; learnedCount = 0; level = 1;
    lives = MODES[mode].lives || 3;
    spawnInterval = TCScoring.spawnInterval(level, mode);
    recent = []; learnedRun = [];
    practiceDone = 0;
    clist.innerHTML = "";
    el("collected").classList.remove("has-words");
    defcard.classList.remove("show");
    session = { startedAt: Date.now(), pausedAt: 0, pausedMs: 0, keystrokes: 0, correctKeys: 0, chars: 0, bestCombo: 1 };
    updateHUD();
  }

  function prepareRun(challenge) {
    run.challenge = challenge || null;
    run.deck = []; run.deckIdx = 0; run.rng = null;

    if (challenge) {
      mode = challenge.mode;
      run.rng = TCRng.create(challenge.seed);
      var pool = TCWordbank.buildPool(window.WORD_THEMES, {
        themes: challenge.themes, levels: challenge.levels
      });
      run.deck = TCRng.buildDeck(pool, run.rng, TCScoring.maxOnScreen(mode));
      return run.deck.length > 0;
    }
    if (mode === "practice") {
      practiceQueue = TCStore.practiceQueue();
      practiceTotal = practiceQueue.length;
      return practiceTotal > 0;
    }
    return buildPool().length > 0;
  }

  function start(challenge) {
    if (!prepareRun(challenge)) return;

    TCAudio.init(); TCAudio.resume();
    TCAudio.setMood(window.TC_VISUALS[prefs.visual].audio);
    TCAudio.setMusic(prefs.music); TCAudio.setSfx(prefs.sfx);
    TCSpeech.setEnabled(prefs.speak);
    TCStore.touchDay();

    reset();
    computeField();          // o HUD muda de altura conforme o modo
    loadGhost();
    startScreen.setAttribute("hidden", "");
    overScreen.setAttribute("hidden", "");
    setupScreen.setAttribute("hidden", "");
    over = false; running = true; paused = false; autoPaused = false;
    document.body.classList.add("is-playing");
    lastSpawn = performance.now() - 1500;
    focusTouch();
  }

  function restart() { start(run.challenge); }

  /* Revisar pela ação primária vale só para esta sessão: o modo preferido do
   * jogador continua o que ele escolheu no painel. */
  function startPractice() {
    var anterior = mode;
    mode = "practice";
    if (!activePoolSize()) { mode = anterior; updateStartBtn(); return; }
    renderConfig(); updateModeBlurb();
    start(null);
  }

  function pause(automatic) {
    if (!running || over || paused) return;
    paused = true;
    autoPaused = !!automatic;
    session.pausedAt = Date.now();
    TCSpeech.cancel();
    el("pauseTitle").textContent = mode === "zen" ? "Respire fundo" : "Pausado";
    el("pauseNote").textContent = automatic
      ? "Pausei sozinho quando você saiu da aba."
      : "As palavras esperam por você. Volte quando quiser.";
    pauseScreen.removeAttribute("hidden");
    blurTouch();
  }
  function resume() {
    if (!paused) return;
    paused = false; autoPaused = false;
    if (session.pausedAt) { session.pausedMs += Date.now() - session.pausedAt; session.pausedAt = 0; }
    pauseScreen.setAttribute("hidden", "");
    lastSpawn = performance.now();
    TCAudio.resume();
    focusTouch();
  }

  function finish() {
    if (!running && over) return;
    running = false; over = true;
    document.body.classList.remove("is-playing");
    if (paused && session.pausedAt) { session.pausedMs += Date.now() - session.pausedAt; session.pausedAt = 0; }
    paused = false;
    pauseScreen.setAttribute("hidden", "");
    TCSpeech.cancel();
    blurTouch();

    var ms = elapsedMs();
    var result = {
      mode: mode, score: score, learned: learnedCount,
      wpm: TCScoring.wpm(session.chars, ms),
      accuracy: TCScoring.accuracy(session.correctKeys, session.keystrokes),
      bestCombo: session.bestCombo, ms: ms,
      keystrokes: session.keystrokes, correctKeys: session.correctKeys, chars: session.chars
    };
    TCStore.recordSession(result);
    TCStore.flush();

    el("finalScore").textContent = result.score;
    el("finalLearned").textContent = result.learned;
    el("finalWpm").textContent = result.wpm;
    el("finalAcc").textContent = result.accuracy + "%";
    el("bestScore").textContent = mode === "zen" ? stats.bestZen : stats.best;
    el("overTitle").textContent = TCScoring.runTitle(mode, learnedCount);
    el("overKicker").textContent = run.challenge
      ? (run.challenge.daily ? "Desafio do dia" : "Desafio")
      : (mode === "practice" ? "Caderno em dia" : (mode === "zen" ? "Modo zen" : "O fogo baixou"));

    renderOverChallenge(result);
    renderRecap();
    overScreen.removeAttribute("hidden");
    refreshHeader();
  }

  function renderRecap() {
    var recap = el("recap");
    recap.innerHTML = "";
    if (!learnedRun.length) {
      var d = document.createElement("div");
      d.className = "empty";
      d.textContent = "Nenhuma palavra capturada desta vez — a próxima é sua.";
      recap.appendChild(d);
      return;
    }
    var seen = {}, frag = document.createDocumentFragment();
    for (var i = learnedRun.length - 1; i >= 0; i--) {
      var w = learnedRun[i];
      if (seen[w.text]) continue;
      seen[w.text] = 1;
      frag.appendChild(wordRow(w));
    }
    recap.appendChild(frag);
  }

  var lastResult = null;
  function renderOverChallenge(result) {
    lastResult = result;
    var box = el("overChallenge");
    if (!run.challenge) { box.hidden = true; return; }
    box.hidden = false;

    var ord = orderOf();
    var code = TCChallenge.encode(run.challenge, ord);
    TCStore.saveMyResult(code, {
      score: result.score, learned: result.learned, wpm: result.wpm,
      daily: !!run.challenge.daily, day: run.challenge.day
    });

    el("overCode").textContent = code;
    var rows = TCStore.leaderboard(code, prefs.name || "VOCÊ");
    var board = el("overBoard");
    board.innerHTML = "";
    rows.forEach(function (r, i) {
      var li = document.createElement("li");
      li.className = "chrow" + (r.me ? " is-me" : "");
      var pos = document.createElement("span"); pos.className = "chpos"; pos.textContent = "#" + (i + 1);
      var nm = document.createElement("span"); nm.className = "chname"; nm.textContent = r.name;
      var meta = document.createElement("span"); meta.className = "chmeta";
      meta.textContent = r.learned + " palavras · " + r.wpm + " ppm";
      var sc = document.createElement("span"); sc.className = "chscore"; sc.textContent = r.score;
      li.appendChild(pos); li.appendChild(nm); li.appendChild(meta); li.appendChild(sc);
      board.appendChild(li);
    });
  }

  function shareResult() {
    if (!lastResult || !run.challenge) return;
    var ord = orderOf();
    var payload = {
      challenge: run.challenge,
      name: prefs.name || "VOCE",
      score: lastResult.score, learned: lastResult.learned,
      wpm: lastResult.wpm, accuracy: lastResult.accuracy
    };
    TCChallengeUI.copy(TCChallenge.shareText(payload, ord), el("overShare"), "Resultado copiado");
  }

  function toStart() {
    running = false; over = false; paused = false;
    document.body.classList.remove("is-playing");
    run.challenge = null; run.ghost = null;
    ghostEl.hidden = true;
    clearBoard();
    pauseScreen.setAttribute("hidden", "");
    overScreen.setAttribute("hidden", "");
    setupScreen.setAttribute("hidden", "");
    startScreen.removeAttribute("hidden");
    blurTouch();
    renderConfig(); updateStartBtn(); refreshHeader();
  }

  // ---------- Cabeçalho da tela inicial ----------
  /* Dois jogadores, duas telas. Quem chega agora quer saber o que é o jogo;
   * quem já tem caderno quer saber o que fazer hoje. Antes os dois viam
   * exatamente a mesma coisa. */
  var howOpen = false;
  function refreshHeader() {
    var c = TCStore.counts();
    var g = TCStore.goalProgress();

    el("homeBest").textContent = stats.best;
    el("homeMastered").textContent = c.mastered;

    var streak = stats.streak || 0;
    el("homeStreak").textContent = streak;
    el("homeStreakBox").hidden = streak < 1;

    var veterano = c.total > 0;
    el("homeNew").hidden = veterano;
    el("homeVet").hidden = !veterano;
    q(".homebar").hidden = !veterano;
    if (!veterano) howOpen = true;      // quem nunca jogou lê as regras de graça
    el("howBox").hidden = !howOpen;
    el("howBtn").setAttribute("aria-expanded", howOpen ? "true" : "false");

    var num, txt;
    if (c.due > 0) {
      num = c.due;
      txt = c.due === 1 ? "palavra pra revisar hoje" : "palavras pra revisar hoje";
    } else if (c.mastered > 0) {
      num = c.mastered;
      txt = "palavras dominadas · nada vencendo hoje";
    } else {
      num = c.total;
      txt = "palavras no caderno · nada vencendo hoje";
    }
    el("homeDue").textContent = num;
    el("vetHead").textContent = txt;

    el("goalFill").style.width = (g.ratio * 100) + "%";
    el("goalText").textContent = g.done >= g.goal
      ? "Meta do dia batida ✦ · " + g.done + " palavras hoje"
      : g.done + " de " + g.goal + " palavras hoje";

    el("storageWarn").hidden = TCStore.isPersisting();

    updateCta(c);
    updateSetupSummary();
  }

  // ---------- Ligações ----------
  function bind() {
    startBtn.addEventListener("click", function () {
      if (ctaPractice) startPractice(); else start(null);
    });
    // O caminho secundário é sempre a partida normal: quando a ação
    // primária virou "revisar", é por aqui que se joga.
    el("altStartBtn").addEventListener("click", function () {
      if (mode === "practice") {
        mode = (MODES[prefs.mode] && prefs.mode !== "practice") ? prefs.mode : "classic";
        renderConfig(); updateModeBlurb(); updateStartBtn();
      }
      start(null);
    });
    el("setupBtn").addEventListener("click", openSetup);
    el("setupClose").addEventListener("click", closeSetup);
    el("setupDone").addEventListener("click", closeSetup);
    el("howBtn").addEventListener("click", function () {
      howOpen = !howOpen;
      el("howBox").hidden = !howOpen;
      this.setAttribute("aria-expanded", howOpen ? "true" : "false");
    });
    el("againBtn").addEventListener("click", restart);
    el("homeBtn").addEventListener("click", toStart);
    el("resumeBtn").addEventListener("click", resume);
    el("endBtn").addEventListener("click", finish);
    el("pauseBtn").addEventListener("click", function () {
      if (running && !over) { paused ? resume() : pause(); }
    });
    el("overShare").addEventListener("click", shareResult);

    musicBtn.addEventListener("click", function () { setPref("music", !prefs.music); });
    sfxBtn.addEventListener("click", function () { setPref("sfx", !prefs.sfx); });
    ptBtn.addEventListener("click", function () { setPref("showPT", !prefs.showPT); });

    el("notebookBtn").addEventListener("click", openNotebook);
    el("allThemesBtn").addEventListener("click", function () {
      setThemes(Object.keys(window.WORD_THEMES));
    });

    el("notebookBtn2").addEventListener("click", function () { TCNotebook.open(); });
    el("notebookBtn3").addEventListener("click", function () { TCNotebook.open(); });
    el("challengeBtn").addEventListener("click", function () { TCChallengeUI.open(); });
    el("challengeBtn2").addEventListener("click", function () {
      TCChallengeUI.open(run.challenge || null);
    });

    TCNotebook.onPractice = function () {
      mode = "practice"; prefs.mode = "practice"; TCStore.savePrefs();
      renderConfig(); updateModeBlurb(); updateStartBtn();
      if (activePoolSize()) start(null); else toStart();
    };
    TCNotebook.onClose = function () { refreshHeader(); };

    TCChallengeUI.mount({
      order: orderOf,
      getSettings: function () {
        return {
          mode: mode,
          themes: prefs.themes || Object.keys(window.WORD_THEMES),
          levels: prefs.levels || window.WORD_LEVELS.slice()
        };
      },
      onPlay: function (challenge) { start(challenge); },
      onClose: function () { refreshHeader(); }
    });

    window.addEventListener("keydown", onKey);

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      W = window.innerWidth; H = window.innerHeight;
      computeField();
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        widthCache = {};                  // a fonte é fluida: medidas mudam
        computeField();
        TCBackdrop.resize();
      }, 120);
    });

    // sair da aba pausa sozinho — voltar e levar três palavras na cara é ruim
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        if (running && !over && !paused) pause(true);
        TCStore.flush();      // sinal mais confiável que beforeunload no mobile
      } else { lastFrame = performance.now(); }
    });
    window.addEventListener("blur", function () {
      if (running && !over && !paused) pause(true);
    });
    window.addEventListener("pagehide", function () { TCStore.flush(); });
    window.addEventListener("beforeunload", function () { TCStore.flush(); });
  }

  // ---------- Início ----------
  function boot() {
    prefs = TCStore.prefs; stats = TCStore.stats;
    mode = MODES[prefs.mode] ? prefs.mode : "classic";

    stage = el("stage");
    elScore = q("#score b"); elCombo = el("comboVal");
    elLearned = el("learned"); elWpm = el("wpm");
    elLvl = el("lvl"); elLvlPrefix = el("lvlPrefix");
    elLives = el("lives"); elLivesLabel = el("livesLabel"); lifeBox = q(".lifebox");
    clist = el("clist"); defcard = el("defcard");
    startBtn = el("startBtn"); poolNote = el("poolNote");
    startScreen = el("startScreen"); pauseScreen = el("pauseScreen"); overScreen = el("overScreen");
    setupScreen = el("setupScreen"); touchInput = el("touchInput");
    ghostEl = el("ghost");
    musicBtn = el("musicBtn"); sfxBtn = el("sfxBtn"); ptBtn = el("ptBtn");

    TCBackdrop.attach(el("bg"));
    computeField();
    TCNotebook.mount();
    applyVisual(window.TC_VISUALS[prefs.visual] ? prefs.visual : "ember");
    TCSpeech.setEnabled(prefs.speak);

    bind();
    setupTouch();
    renderConfig();
    updateModeBlurb();
    updateStartBtn();
    refreshHeader();
    updateHUD();
    syncPrefUI();
    el("bestScore").textContent = stats.best;

    lastFrame = performance.now();
    requestAnimationFrame(tick);
  }

  try {
    boot();
  } catch (err) {
    var fatal = document.getElementById("fatalScreen");
    if (fatal) {
      document.getElementById("fatalMsg").textContent = String(err && err.message ? err.message : err);
      fatal.removeAttribute("hidden");
    }
    throw err;
  }
})();
