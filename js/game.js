/* Type & Chill — lógica do jogo.
 *
 * Depende de:  words.js (WORD_THEMES) · storage.js (TCStore)
 *              themes.js (TC_VISUALS, TCBackdrop) · audio.js (TCAudio)
 *              notebook.js (TCNotebook)
 *
 * Três modos:
 *   classic  → 3 vidas, o ritmo acelera conforme você sobe de nível
 *   zen      → sem vidas e sem fim; pra deixar rodando no segundo monitor
 *   practice → só as palavras do seu caderno que ainda não estão dominadas
 */
(function () {
  "use strict";

  var prefs = TCStore.prefs, stats = TCStore.stats;

  // ---------- DOM ----------
  function el(id) { return document.getElementById(id); }
  var stage = el("stage");
  var elScore = document.querySelector("#score b"),
      elCombo = document.querySelector("#combo b"),
      elLearned = el("learned"),
      elLvl = el("lvl"),
      elLvlPrefix = el("lvlPrefix"),
      elLives = el("lives"),
      elLivesLabel = el("livesLabel"),
      clist = el("clist"),
      defcard = el("defcard"),
      startBtn = el("startBtn"),
      poolNote = el("poolNote");
  var startScreen = el("startScreen"),
      pauseScreen = el("pauseScreen"),
      overScreen = el("overScreen");

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches;

  // ---------- Estado ----------
  var POOL = [];                  // banco ativo (objetos de palavra)
  var words = [], target = null;
  var score = 0, combo = 1, bestCombo = 1, learnedCount = 0, lives = 3, level = 1;
  var running = false, paused = false, over = false;
  var mode = prefs.mode || "classic";
  var practiceQueue = [], practiceTotal = 0, practiceDone = 0;
  var lastSpawn = 0, spawnInterval = 2100, lastFrame = 0, startedAt = 0;
  var recent = [], learnedRun = [];
  var W = window.innerWidth, H = window.innerHeight;

  var MODES = {
    classic: { label: "Clássico", lives: 3, ramp: true, endless: true },
    zen:     { label: "Zen",      lives: 0, ramp: false, endless: true },
    practice:{ label: "Prática",  lives: 0, ramp: false, endless: false }
  };

  // ---------- Banco ativo ----------
  function themeEnabled(k) {
    return !prefs.themes || prefs.themes.indexOf(k) >= 0;
  }
  function levelEnabled(l) {
    return !prefs.levels || prefs.levels.indexOf(l) >= 0;
  }
  function buildPool() {
    POOL = [];
    Object.keys(WORD_THEMES).forEach(function (k) {
      if (!themeEnabled(k)) return;
      WORD_THEMES[k].words.forEach(function (w) {
        if (!levelEnabled(w[4])) return;
        POOL.push({ text: w[0], pos: w[1], def: w[2], pt: w[3], lvl: w[4], theme: k });
      });
    });
  }
  function activePoolSize() {
    return mode === "practice" ? TCNotebook.practicePool().length : POOL.length;
  }
  function updateStartBtn() {
    var n = activePoolSize();
    startBtn.disabled = n === 0;
    if (mode === "practice") {
      poolNote.textContent = n === 0
        ? "Seu caderno ainda não tem palavras para revisar — jogue uma partida primeiro."
        : n + (n === 1 ? " palavra na fila de revisão" : " palavras na fila de revisão");
    } else {
      poolNote.textContent = n === 0
        ? "Escolha ao menos um tema e um nível."
        : n + " palavras neste sorteio";
    }
  }

  // ---------- Chips de configuração ----------
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
  function selected(listName) {
    return prefs[listName] ? prefs[listName].slice() : null;
  }
  function toggleIn(listName, key, allKeys) {
    var cur = selected(listName) || allKeys.slice();
    var i = cur.indexOf(key);
    if (i >= 0) cur.splice(i, 1); else cur.push(key);
    if (!cur.length) return true;          // nunca deixa tudo desligado
    prefs[listName] = cur;
    TCStore.savePrefs();
    buildPool(); updateStartBtn();
    return cur.indexOf(key) >= 0;
  }

  function renderConfig() {
    // modos
    var modeBox = el("modeChips"); modeBox.innerHTML = "";
    Object.keys(MODES).forEach(function (k) {
      var b = chip(MODES[k].label, mode === k, function () {
        mode = k; prefs.mode = k; TCStore.savePrefs();
        renderConfig(); updateStartBtn(); updateModeBlurb();
        return true;
      }, "chip-mode");
      modeBox.appendChild(b);
    });

    // temas de vocabulário
    var themeKeys = Object.keys(WORD_THEMES);
    var themeBox = el("themeChips"); themeBox.innerHTML = "";
    themeKeys.forEach(function (k) {
      themeBox.appendChild(chip(WORD_THEMES[k].label, themeEnabled(k), function () {
        return toggleIn("themes", k, themeKeys);
      }));
    });

    // níveis
    var levelBox = el("levelChips"); levelBox.innerHTML = "";
    WORD_LEVELS.forEach(function (l) {
      levelBox.appendChild(chip(l, levelEnabled(l), function () {
        return toggleIn("levels", l, WORD_LEVELS);
      }, "chip-level"));
    });

    // paletas
    var visBox = el("visualChips"); visBox.innerHTML = "";
    Object.keys(TC_VISUALS).forEach(function (k) {
      var v = TC_VISUALS[k];
      var b = chip(v.label, prefs.visual === k, function () {
        applyVisual(k);
        renderConfig();
        return true;
      }, "chip-visual");
      var dot = document.createElement("i");
      dot.className = "swatch";
      dot.style.background = "linear-gradient(135deg," + v.swatch[0] + "," + v.swatch[1] + ")";
      b.insertBefore(dot, b.firstChild);
      visBox.appendChild(b);
    });

    renderPrefChips();

    // filtros de vocabulário não fazem sentido no modo Prática
    el("vocabConfig").hidden = (mode === "practice");
  }

  /* As mesmas preferências dos botões do HUD, acessíveis na tela inicial
   * (o HUD fica atrás dos overlays, então lá os botões não recebem clique). */
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
  }
  function setPref(key, value) {
    prefs[key] = value;
    TCStore.savePrefs();
    if (key === "music") { TCAudio.init(); TCAudio.resume(); TCAudio.setMusic(value); }
    if (key === "sfx") { TCAudio.setSfx(value); if (value) { TCAudio.init(); TCAudio.resume(); TCAudio.key(); } }
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
      practice: "Só as palavras do seu caderno que ainda escapam de você."
    };
    el("modeBlurb").textContent = t[mode];
  }

  function applyVisual(key) {
    prefs.visual = key; TCStore.savePrefs();
    TCBackdrop.setVisual(key);
    TCAudio.setMood(TC_VISUALS[key].audio);
  }

  // ---------- Palavras ----------
  function pickWord() {
    var activeFirst = {};
    for (var i = 0; i < words.length; i++) activeFirst[words[i].text[0]] = 1;
    var pool = [];
    for (var k = 0; k < POOL.length; k++) {
      if (recent.indexOf(POOL[k].text) >= 0) continue;
      if (activeFirst[POOL[k].text[0]]) continue;
      pool.push(POOL[k]);
    }
    if (!pool.length) {
      for (var m = 0; m < POOL.length; m++) {
        if (!activeFirst[POOL[m].text[0]]) pool.push(POOL[m]);
      }
    }
    if (!pool.length) return null;
    return pool[(Math.random() * pool.length) | 0];
  }
  function nextPracticeWord() {
    var activeFirst = {};
    for (var i = 0; i < words.length; i++) activeFirst[words[i].text[0]] = 1;
    for (var j = 0; j < practiceQueue.length; j++) {
      if (!activeFirst[practiceQueue[j].text[0]]) return practiceQueue.splice(j, 1)[0];
    }
    return null;   // todas as que sobraram colidem de inicial; espera a próxima
  }

  function spawn() {
    var data = mode === "practice" ? nextPracticeWord() : pickWord();
    if (!data) return;
    if (mode !== "practice") {
      recent.push(data.text);
      if (recent.length > Math.min(24, (POOL.length / 2) | 0)) recent.shift();
    }

    var node = document.createElement("div");
    node.className = "word";
    var frag = "";
    for (var i = 0; i < data.text.length; i++) {
      frag += '<span class="l">' + data.text[i] + "</span>";
    }
    node.innerHTML = '<span class="inner">' + frag + "</span>";
    stage.appendChild(node);

    var wpx = node.offsetWidth;
    var x = 20 + Math.random() * Math.max(1, (W - wpx - 40));
    var base = mode === "zen" ? 20 : 22 + (level - 1) * 4.5;
    var w = {
      text: data.text, pos: data.pos, def: data.def, pt: data.pt,
      lvl: data.lvl, theme: data.theme,
      el: node, letters: node.querySelectorAll(".l"),
      x: x, y: -40, typed: 0,
      speed: base * (0.85 + Math.random() * 0.4)
    };
    node.style.transform = "translate(" + x + "px," + w.y + "px)";
    words.push(w);
  }

  function paintWord(w) {
    for (var i = 0; i < w.letters.length; i++) {
      var c = w.letters[i];
      c.className = "l";
      if (w === target) {
        if (i < w.typed) c.className = "l done";
        else if (i === w.typed) c.className = "l next";
      }
    }
  }
  function setTarget(w) {
    if (target && target !== w) target.el.classList.remove("targeted");
    target = w;
    if (w) { w.el.classList.add("targeted"); paintWord(w); }
  }
  function removeNode(node, cls) {
    node.classList.add(cls);
    setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 380);
  }

  function capture(w) {
    var i = words.indexOf(w); if (i < 0) return;
    words.splice(i, 1);
    if (w === target) target = null;

    var r = w.el.getBoundingClientRect();
    TCBackdrop.burst(r.left + r.width / 2, r.top + r.height / 2);
    removeNode(w.el, "captured");
    TCAudio.capture();

    score += 10 * combo + w.text.length;
    combo += 1;
    if (combo > bestCombo) bestCombo = combo;
    learnedCount += 1;
    learnedRun.push(w);
    TCStore.recordCapture(w);
    addCollected(w);
    showDef(w);

    if (mode === "practice") { practiceDone += 1; }
    else if (MODES[mode].ramp && learnedCount % 8 === 0) {
      level += 1;
      spawnInterval = Math.max(950, 2100 - level * 150);
      TCAudio.levelUp();
    }
    updateHUD();
    if (mode === "practice") checkPracticeEnd();
  }

  function miss(w) {
    var i = words.indexOf(w); if (i < 0) return;
    words.splice(i, 1);
    if (w === target) target = null;
    removeNode(w.el, "missed");
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
    if (mode !== "practice") return;
    if (!practiceQueue.length && !words.length) finish();
  }

  // ---------- HUD ----------
  function updateHUD() {
    elScore.textContent = score;
    elCombo.textContent = "×" + combo;
    elLearned.textContent = learnedCount;
    elLvlPrefix.textContent = mode === "classic" ? "Nível" : "Modo";
    elLvl.textContent = mode === "classic" ? level : MODES[mode].label;

    if (mode === "classic") {
      elLivesLabel.textContent = "Vidas";
      var html = "";
      for (var i = 0; i < 3; i++) html += '<span class="heart' + (i < lives ? "" : " lost") + '">♥</span>';
      elLives.innerHTML = html;
      elLives.className = "lives";
    } else if (mode === "practice") {
      elLivesLabel.textContent = "Restantes";
      elLives.className = "lives count";
      elLives.textContent = (practiceTotal - practiceDone);
    } else {
      elLivesLabel.textContent = "Recorde de sequência";
      elLives.className = "lives count";
      elLives.textContent = "×" + bestCombo;
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
    defcard.querySelector(".dw").textContent = w.text;
    defcard.querySelector(".dp").textContent = w.pos + (w.lvl ? " · " + w.lvl : "");
    defcard.querySelector(".dd").textContent = w.def;
    var ptEl = defcard.querySelector(".dt");
    ptEl.textContent = w.pt || "";
    ptEl.hidden = !(prefs.showPT && w.pt);
    defcard.classList.add("show");
    if (defTimer) clearTimeout(defTimer);
    defTimer = setTimeout(function () { defcard.classList.remove("show"); }, 2600);
  }

  // ---------- Entrada ----------
  function onKey(e) {
    if (TCNotebook.isOpen()) {
      if (e.key === "Escape") TCNotebook.close();
      return;
    }
    // Só Esc pausa: qualquer letra é digitação. (Usar "P" como atalho tornava
    // impossível capturar as 84 palavras que têm "p" — o atalho vinha antes.)
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

    if (target) {
      if (target.text[target.typed] === k) {
        target.typed++; TCAudio.key(); paintWord(target);
        if (target.typed >= target.text.length) capture(target);
      } else if (!reduce) {
        target.el.classList.remove("shake");
        void target.el.offsetWidth;
        target.el.classList.add("shake");
      }
      return;
    }
    var cand = null;
    for (var i = 0; i < words.length; i++) {
      if (words[i].text[0] === k && (!cand || words[i].y > cand.y)) cand = words[i];
    }
    if (cand) {
      setTarget(cand); cand.typed = 1; TCAudio.key(); paintWord(cand);
      if (cand.text.length <= 1) capture(cand);
    }
  }

  // ---------- Loop ----------
  function frame(now) {
    if (!running) return;
    var dt = Math.min(0.05, (now - lastFrame) / 1000 || 0);
    lastFrame = now;

    if (!paused) {
      TCBackdrop.draw(dt, now);
      var cap = mode === "zen" ? 5 : 6;
      var canSpawn = mode !== "practice" || practiceQueue.length > 0;
      if (canSpawn && now - lastSpawn > spawnInterval && words.length < cap) {
        spawn(); lastSpawn = now;
      }
      var limit = H - 64;
      for (var i = words.length - 1; i >= 0; i--) {
        var w = words[i];
        w.y += w.speed * dt;
        w.el.style.transform = "translate(" + w.x + "px," + w.y + "px)";
        if (w.y > limit) miss(w);
      }
    } else {
      TCBackdrop.draw(0, now);
    }
    requestAnimationFrame(frame);
  }

  // ---------- Fluxo ----------
  function reset() {
    words.forEach(function (w) { if (w.el.parentNode) w.el.parentNode.removeChild(w.el); });
    words = []; target = null;
    TCBackdrop.clearPuffs();
    score = 0; combo = 1; bestCombo = 1; learnedCount = 0; level = 1;
    lives = MODES[mode].lives || 3;
    spawnInterval = mode === "zen" ? 2400 : 2100;
    recent = []; learnedRun = [];
    practiceDone = 0;
    clist.innerHTML = "";
    defcard.classList.remove("show");
    updateHUD();
  }

  function start() {
    if (mode === "practice") {
      practiceQueue = TCNotebook.practicePool();
      practiceTotal = practiceQueue.length;
      if (!practiceTotal) return;
    } else {
      buildPool();
      if (!POOL.length) return;
      practiceQueue = []; practiceTotal = 0;
    }
    TCAudio.init(); TCAudio.resume();
    TCAudio.setMood(TC_VISUALS[prefs.visual].audio);
    TCAudio.setMusic(prefs.music); TCAudio.setSfx(prefs.sfx);

    reset();
    startScreen.setAttribute("hidden", "");
    overScreen.setAttribute("hidden", "");
    over = false; running = true; paused = false;
    startedAt = Date.now();
    lastFrame = performance.now();
    lastSpawn = lastFrame - 1500;
    requestAnimationFrame(frame);
  }

  function pause() {
    paused = true;
    el("pauseTitle").textContent = mode === "zen" ? "Respire fundo" : "Pausado";
    pauseScreen.removeAttribute("hidden");
  }
  function resume() {
    paused = false;
    pauseScreen.setAttribute("hidden", "");
    lastFrame = performance.now();
    TCAudio.resume();
  }

  function finish() {
    running = false; over = true; paused = false;
    pauseScreen.setAttribute("hidden", "");

    stats.sessions += 1;
    stats.playedMs += Date.now() - startedAt;
    if (bestCombo > stats.bestCombo) stats.bestCombo = bestCombo;
    if (mode === "classic" && score > stats.best) stats.best = score;
    TCStore.flush();

    el("finalScore").textContent = score;
    el("finalLearned").textContent = learnedCount;
    el("bestScore").textContent = stats.best;

    var titles = {
      classic: learnedCount >= 24 ? "Vocabulário radiante"
             : learnedCount >= 12 ? "Bela coleta"
             : learnedCount >= 4 ? "Boa deriva" : "A brasa recomeça",
      zen: "Sessão encerrada",
      practice: "Revisão concluída"
    };
    el("overTitle").textContent = titles[mode];
    el("overKicker").textContent = mode === "practice"
      ? "Caderno em dia" : (mode === "zen" ? "Modo zen" : "O fogo baixou");

    var recap = el("recap");
    recap.innerHTML = "";
    if (!learnedRun.length) {
      var d = document.createElement("div");
      d.className = "empty";
      d.textContent = "Nenhuma palavra capturada desta vez — a próxima é sua.";
      recap.appendChild(d);
    } else {
      var seen = {};
      for (var i = learnedRun.length - 1; i >= 0; i--) {
        var w = learnedRun[i];
        if (seen[w.text]) continue;
        seen[w.text] = 1;
        recap.appendChild(wordRow(w));
      }
    }
    overScreen.removeAttribute("hidden");
  }

  function toStart() {
    running = false; over = false; paused = false;
    words.forEach(function (w) { if (w.el.parentNode) w.el.parentNode.removeChild(w.el); });
    words = []; target = null;
    pauseScreen.setAttribute("hidden", "");
    overScreen.setAttribute("hidden", "");
    startScreen.removeAttribute("hidden");
    renderConfig(); updateStartBtn(); refreshHeader();
  }

  // ---------- Botões ----------
  startBtn.addEventListener("click", start);
  el("againBtn").addEventListener("click", start);
  el("homeBtn").addEventListener("click", toStart);
  el("resumeBtn").addEventListener("click", resume);
  el("endBtn").addEventListener("click", finish);
  el("pauseBtn").addEventListener("click", function () {
    if (running && !over) { paused ? resume() : pause(); }
  });

  var musicBtn = el("musicBtn"), sfxBtn = el("sfxBtn"), ptBtn = el("ptBtn");
  musicBtn.addEventListener("click", function () { setPref("music", !prefs.music); });
  sfxBtn.addEventListener("click", function () { setPref("sfx", !prefs.sfx); });
  ptBtn.addEventListener("click", function () { setPref("showPT", !prefs.showPT); });

  el("notebookBtn").addEventListener("click", function () {
    if (running && !over && !paused) pause();
    TCNotebook.open();
  });
  el("notebookBtn2").addEventListener("click", function () { TCNotebook.open(); });
  el("notebookBtn3").addEventListener("click", function () { TCNotebook.open(); });

  TCNotebook.onPractice = function () {
    mode = "practice"; prefs.mode = "practice"; TCStore.savePrefs();
    renderConfig(); updateModeBlurb(); updateStartBtn();
    if (activePoolSize()) start(); else toStart();
  };
  TCNotebook.onClose = function () { refreshHeader(); };

  window.addEventListener("keydown", onKey);
  window.addEventListener("resize", function () {
    W = window.innerWidth; H = window.innerHeight;
    TCBackdrop.resize();
  });
  window.addEventListener("beforeunload", function () { TCStore.flush(); });

  // ---------- Cabeçalho da tela inicial ----------
  function refreshHeader() {
    var c = TCStore.counts();
    el("homeBest").textContent = stats.best;
    el("homeWords").textContent = c.total;
    el("homeMastered").textContent = c.mastered;
  }

  // ---------- Início ----------
  TCBackdrop.attach(el("bg"));
  TCNotebook.mount();
  applyVisual(prefs.visual);
  buildPool();
  renderConfig();
  updateModeBlurb();
  updateStartBtn();
  refreshHeader();
  updateHUD();
  syncPrefUI();
  el("bestScore").textContent = stats.best;

  (function idle(now) {
    if (!running) TCBackdrop.draw(0.016, now || 0);
    requestAnimationFrame(idle);
  })(0);
})();
