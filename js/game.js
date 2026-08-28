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
      elLives, elLivesLabel, clist, defcard, startBtn, poolNote,
      startScreen, pauseScreen, overScreen, ghostEl,
      musicBtn, sfxBtn, ptBtn;

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
  function updateStartBtn() {
    var n = activePoolSize();
    startBtn.disabled = n === 0;
    if (mode === "practice") {
      poolNote.textContent = n === 0
        ? "Nada para revisar agora — jogue uma partida ou volte quando o agendamento vencer."
        : n + (n === 1 ? " palavra na fila de revisão" : " palavras na fila de revisão");
    } else {
      poolNote.textContent = n === 0
        ? "Escolha ao menos um tema e um nível."
        : n + " palavras neste sorteio";
    }
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

  function renderConfig() {
    var modeBox = el("modeChips"); modeBox.innerHTML = "";
    Object.keys(MODES).forEach(function (k) {
      modeBox.appendChild(chip(MODES[k].label, mode === k, function () {
        mode = k; prefs.mode = k; TCStore.savePrefs();
        renderConfig(); updateStartBtn(); updateModeBlurb();
        return true;
      }, "chip-mode"));
    });

    var themeKeys = Object.keys(window.WORD_THEMES);
    var themeBox = el("themeChips"); themeBox.innerHTML = "";
    themeKeys.forEach(function (k) {
      themeBox.appendChild(chip(window.WORD_THEMES[k].label, themeEnabled(k), function () {
        return toggleIn("themes", k, themeKeys);
      }));
    });

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
    var x = 20 + rnd() * Math.max(1, (W - wpx - 40));
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
      elLivesLabel.textContent = "Vidas";
      elLives.className = "lives";
      var html = "";
      for (var i = 0; i < 3; i++) html += '<span class="heart' + (i < lives ? "" : " lost") + '">♥</span>';
      elLives.innerHTML = html;
    } else if (mode === "practice") {
      elLivesLabel.textContent = "Restantes";
      elLives.className = "lives count";
      elLives.textContent = Math.max(0, practiceTotal - practiceDone);
    } else {
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
  function addCollected(w) {
    clist.insertBefore(wordRow(w), clist.firstChild);
    while (clist.children.length > 12) clist.removeChild(clist.lastChild);
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
    return TCNotebook.isOpen() || TCChallengeUI.isOpen();
  }

  function onKey(e) {
    if (overlayOpen()) {
      if (e.key === "Escape") { TCNotebook.close(); TCChallengeUI.close(); }
      return;
    }
    // Só Esc pausa. Nenhuma letra é atalho: "p" precisa continuar sendo
    // digitável, senão 84 palavras do banco viram impossíveis.
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

    var limit = H - 64;
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
    loadGhost();
    startScreen.setAttribute("hidden", "");
    overScreen.setAttribute("hidden", "");
    over = false; running = true; paused = false; autoPaused = false;
    lastSpawn = performance.now() - 1500;
  }

  function restart() { start(run.challenge); }

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
  }
  function resume() {
    if (!paused) return;
    paused = false; autoPaused = false;
    if (session.pausedAt) { session.pausedMs += Date.now() - session.pausedAt; session.pausedAt = 0; }
    pauseScreen.setAttribute("hidden", "");
    lastSpawn = performance.now();
    TCAudio.resume();
  }

  function finish() {
    if (!running && over) return;
    running = false; over = true;
    if (paused && session.pausedAt) { session.pausedMs += Date.now() - session.pausedAt; session.pausedAt = 0; }
    paused = false;
    pauseScreen.setAttribute("hidden", "");
    TCSpeech.cancel();

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
    run.challenge = null; run.ghost = null;
    ghostEl.hidden = true;
    clearBoard();
    pauseScreen.setAttribute("hidden", "");
    overScreen.setAttribute("hidden", "");
    startScreen.removeAttribute("hidden");
    renderConfig(); updateStartBtn(); refreshHeader();
  }

  // ---------- Cabeçalho da tela inicial ----------
  function refreshHeader() {
    var c = TCStore.counts();
    el("homeBest").textContent = stats.best;
    el("homeStreak").textContent = stats.streak || 0;
    el("homeDue").textContent = c.due;
    el("homeMastered").textContent = c.mastered;

    var g = TCStore.goalProgress();
    el("goalFill").style.width = (g.ratio * 100) + "%";
    el("goalText").textContent = g.done + " de " + g.goal + " palavras hoje" +
      (g.done >= g.goal ? " — meta batida ✦" : "");

    el("storageWarn").hidden = TCStore.isPersisting();
  }

  // ---------- Ligações ----------
  function bind() {
    startBtn.addEventListener("click", function () { start(null); });
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

    el("notebookBtn").addEventListener("click", function () {
      if (running && !over && !paused) pause();
      TCNotebook.open();
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
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        widthCache = {};                  // a fonte é fluida: medidas mudam
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
    elScore = q("#score b"); elCombo = q("#combo b");
    elLearned = el("learned"); elWpm = el("wpm");
    elLvl = el("lvl"); elLvlPrefix = el("lvlPrefix");
    elLives = el("lives"); elLivesLabel = el("livesLabel");
    clist = el("clist"); defcard = el("defcard");
    startBtn = el("startBtn"); poolNote = el("poolNote");
    startScreen = el("startScreen"); pauseScreen = el("pauseScreen"); overScreen = el("overScreen");
    ghostEl = el("ghost");
    musicBtn = el("musicBtn"); sfxBtn = el("sfxBtn"); ptBtn = el("ptBtn");

    TCBackdrop.attach(el("bg"));
    TCNotebook.mount();
    applyVisual(window.TC_VISUALS[prefs.visual] ? prefs.visual : "ember");
    TCSpeech.setEnabled(prefs.speak);

    bind();
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
