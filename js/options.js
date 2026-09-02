/* Type & Chill — o menu de opções (a engrenagem).
 *
 * O painel de "Ajustes da partida" responde uma pergunta só: o que eu vou
 * jogar agora (modo, temas, níveis, clima). Este menu responde a outra, a que
 * todo jogo tem atrás de uma engrenagem: como o jogo se comporta na minha
 * máquina — som, gráficos, exibição, meus dados.
 *
 * Cinco abas, na ordem em que as pessoas procuram:
 *   Áudio · Gráficos · Exibição · Jogo · Dados
 *
 * Cada linha grava sozinha, aplica o efeito na hora e avisa o game.js pelo
 * onChange — sem botão de "salvar", que é o tipo de coisa que faz a pessoa
 * mexer no volume, fechar e perder o ajuste.
 *
 * As linhas carregam data-opt="<chave>" porque é assim que os testes de
 * interface encontram cada controle sem depender do texto da etiqueta.
 */
window.TCOptions = (function () {
  "use strict";

  var screen, tabsBox, bodyBox, mounted = false;
  var activeTab = "audio";
  var api = {
    onChange: null,        // (chave, valor) → game.js reaplica o que precisa
    onOpenSetup: null,     // "Ajustes da partida"
    onOpenNotebook: null,
    onClose: null
  };

  function el(id) { return document.getElementById(id); }
  function prefs() { return TCStore.prefs; }

  /* Grava, aplica e avisa. Todo controle passa por aqui. */
  function set(key, value) {
    prefs()[key] = value;
    TCStore.savePrefs();
    applyOne(key, value);
    if (api.onChange) api.onChange(key, value);
    return value;
  }

  /* O efeito imediato de cada opção. Fica aqui, e não no game.js, para que
   * mexer no menu não dependa de a partida estar rodando. */
  function applyOne(key, value) {
    switch (key) {
      case "music":
        TCAudio.init(); TCAudio.resume(); TCAudio.setMusic(value); break;
      case "sfx":
        TCAudio.setSfx(value);
        if (value) { TCAudio.init(); TCAudio.resume(); TCAudio.key(); }
        break;
      case "musicVol":
        TCAudio.setMusicVolume(value); break;
      case "sfxVol":
        TCAudio.setSfxVolume(value);
        previaSfx();                 // ouvir o que se ajusta, sem virar metralhadora
        break;
      case "speak":
        TCSpeech.setEnabled(value);
        if (value) TCSpeech.say("chill");
        break;
      case "quality":
        TCBackdrop.setQualityMode(value); break;
      case "motion":
        document.body.classList.toggle("no-motion", TCBackdrop.setMotion(value)); break;
      case "wordScale":
        document.documentElement.style.setProperty("--word-scale", value); break;
      case "showCollected":
        document.body.classList.toggle("hide-collected", !value); break;
      case "uiSfx":
      case "cursor":
        // as duas vivem no mesmo módulo, que relê as preferências inteiras
        if (window.TCUiFx) TCUiFx.apply(prefs());
        if (key === "uiSfx" && value) { TCAudio.init(); TCAudio.resume(); TCAudio.click(); }
        break;
      default: break;      // showPT, showExample, dailyGoal, name: só gravar
    }
  }

  /* Um cursor de faixa dispara um evento por pixel arrastado. Tocar a prévia
   * em cada um viraria uma metralhadora de cliques no fone: a prévia sai uma
   * vez, quando o cursor para. */
  var previaTimer = null;
  function previaSfx() {
    if (!prefs().sfx) return;
    if (previaTimer) clearTimeout(previaTimer);
    previaTimer = setTimeout(function () {
      previaTimer = null;
      TCAudio.init(); TCAudio.resume(); TCAudio.key();
    }, 220);
  }

  /* Aplica tudo de uma vez — no boot e no "restaurar padrões". */
  function applyAll() {
    var p = prefs();
    TCAudio.setMusicVolume(p.musicVol);
    TCAudio.setSfxVolume(p.sfxVol);
    applyOne("quality", p.quality);
    applyOne("motion", p.motion);
    applyOne("wordScale", p.wordScale);
    applyOne("showCollected", p.showCollected);
    if (window.TCUiFx) TCUiFx.apply(p);
  }

  // ---------- Peças de interface ----------
  function row(key, label, hint) {
    var r = document.createElement("div");
    r.className = "optrow";
    r.setAttribute("data-opt", key);
    var text = document.createElement("div");
    text.className = "opttext";
    var l = document.createElement("span");
    l.className = "optlabel"; l.textContent = label;
    text.appendChild(l);
    if (hint) {
      var h = document.createElement("span");
      h.className = "opthint"; h.textContent = hint;
      text.appendChild(h);
    }
    r.appendChild(text);
    return r;
  }

  /* Interruptor. role="switch" porque é isso que ele é — leitor de tela lê
   * "ligado/desligado" em vez de "botão pressionado". */
  function toggle(key, label, hint, get, onSet) {
    var r = row(key, label, hint);
    var b = document.createElement("button");
    b.type = "button";
    b.className = "switch";
    b.setAttribute("role", "switch");
    b.setAttribute("aria-label", label);
    function paint(v) {
      b.setAttribute("aria-checked", v ? "true" : "false");
      b.textContent = v ? "Ligado" : "Desligado";
    }
    paint(get());
    b.addEventListener("click", function () {
      var next = !get();
      onSet(next);
      paint(get());
    });
    r.appendChild(b);
    return r;
  }

  function slider(key, label, hint, opts, get, onSet, format) {
    var r = row(key, label, hint);
    var wrap = document.createElement("div");
    wrap.className = "optslider";
    var input = document.createElement("input");
    input.type = "range";
    input.min = opts.min; input.max = opts.max; input.step = opts.step;
    input.value = get();
    input.setAttribute("aria-label", label);
    var out = document.createElement("span");
    out.className = "optvalue";
    out.textContent = format(get());
    input.addEventListener("input", function () {
      var v = parseFloat(input.value);
      onSet(v);
      out.textContent = format(v);
    });
    wrap.appendChild(input); wrap.appendChild(out);
    r.appendChild(wrap);
    return r;
  }

  /* Escolha entre poucas opções, no formato segmentado — mais rápido de ler
   * que um <select>, e num menu de jogo é o que as pessoas esperam. */
  function choice(key, label, hint, options, get, onSet) {
    var r = row(key, label, hint);
    var group = document.createElement("div");
    group.className = "optseg";
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", label);
    options.forEach(function (o) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "seg";
      b.setAttribute("role", "radio");
      b.setAttribute("data-value", o.value);
      b.textContent = o.label;
      b.setAttribute("aria-checked", get() === o.value ? "true" : "false");
      b.addEventListener("click", function () {
        onSet(o.value);
        Array.prototype.forEach.call(group.children, function (c) {
          c.setAttribute("aria-checked", c.getAttribute("data-value") === o.value ? "true" : "false");
        });
      });
      group.appendChild(b);
    });
    r.appendChild(group);
    return r;
  }

  function action(key, label, hint, botao, onClick, danger) {
    var r = row(key, label, hint);
    var b = document.createElement("button");
    b.type = "button";
    b.className = "btn ghostbtn small" + (danger ? " danger" : "");
    b.textContent = botao;
    b.addEventListener("click", function () { onClick(b); });
    r.appendChild(b);
    return r;
  }

  function textField(key, label, hint, get, onSet, maxlen) {
    var r = row(key, label, hint);
    var input = document.createElement("input");
    input.type = "text";
    input.className = "optinput";
    input.maxLength = maxlen || 12;
    input.value = get() || "";
    input.setAttribute("aria-label", label);
    input.addEventListener("input", function () { onSet(input.value.trim()); });
    r.appendChild(input);
    return r;
  }

  function pct(v) { return Math.round(v * 100) + "%"; }

  // ---------- As abas ----------
  var TABS = [
    { key: "audio",   label: "Áudio",    build: buildAudio },
    { key: "video",   label: "Gráficos", build: buildVideo },
    { key: "display", label: "Exibição", build: buildDisplay },
    { key: "game",    label: "Jogo",     build: buildGame },
    { key: "data",    label: "Dados",    build: buildData }
  ];

  function buildAudio(box) {
    var p = prefs();
    box.appendChild(toggle("music", "Música", "A trilha ambiente, gerada em tempo real",
      function () { return p.music; }, function (v) { set("music", v); }));
    box.appendChild(slider("musicVol", "Volume da música", null,
      { min: 0, max: 1, step: 0.05 },
      function () { return p.musicVol; }, function (v) { set("musicVol", v); }, pct));
    box.appendChild(toggle("sfx", "Efeitos sonoros", "Tecla, captura, erro e subida de nível",
      function () { return p.sfx; }, function (v) { set("sfx", v); }));
    box.appendChild(toggle("uiSfx", "Sons da interface", "O clique e a passagem do mouse pelos botões",
      function () { return p.uiSfx; }, function (v) { set("uiSfx", v); }));
    box.appendChild(slider("sfxVol", "Volume dos efeitos", null,
      { min: 0, max: 1, step: 0.05 },
      function () { return p.sfxVol; }, function (v) { set("sfxVol", v); }, pct));
    if (TCSpeech.isAvailable()) {
      box.appendChild(toggle("speak", "Pronúncia", "Fala a palavra em inglês quando você captura",
        function () { return p.speak; }, function (v) { set("speak", v); }));
    }
  }

  function buildVideo(box) {
    var p = prefs();
    box.appendChild(choice("quality", "Qualidade dos gráficos",
      "Automático mede o FPS e alivia sozinho em máquina fraca",
      [{ value: "auto", label: "Auto" }, { value: "high", label: "Alta" },
       { value: "medium", label: "Média" }, { value: "low", label: "Baixa" },
       { value: "off", label: "Desligada" }],
      function () { return p.quality; }, function (v) { set("quality", v); }));

    box.appendChild(choice("motion", "Animações",
      "Reduzidas desliga tremores e explosões de captura",
      [{ value: "auto", label: "Auto" }, { value: "full", label: "Completas" },
       { value: "reduced", label: "Reduzidas" }],
      function () { return p.motion; }, function (v) { set("motion", v); }));

    box.appendChild(action("fullscreen", "Tela cheia",
      "Também dá para usar a tecla F11 do navegador",
      fullscreenLabel(), function (b) {
        toggleFullscreen();
        setTimeout(function () { b.textContent = fullscreenLabel(); }, 120);
      }));
  }

  function buildDisplay(box) {
    var p = prefs();
    box.appendChild(slider("wordScale", "Tamanho das palavras",
      "Aumente se estiver longe da tela",
      { min: 0.8, max: 1.4, step: 0.05 },
      function () { return p.wordScale; }, function (v) { set("wordScale", v); }, pct));
    box.appendChild(toggle("showPT", "Tradução em português",
      "Aparece no cartão da captura (Alt+P na partida)",
      function () { return p.showPT; }, function (v) { set("showPT", v); }));
    box.appendChild(toggle("showExample", "Frase de exemplo",
      "O contexto que faz a palavra grudar",
      function () { return p.showExample; }, function (v) { set("showExample", v); }));
    box.appendChild(toggle("showCollected", "Lista de capturadas",
      "A coluna com as palavras desta partida",
      function () { return p.showCollected; }, function (v) { set("showCollected", v); }));
    box.appendChild(choice("cursor", "Cursor",
      "A seta com a luz do jogo, ou a do sistema sem efeito",
      [{ value: "game", label: "Com luz" }, { value: "system", label: "Sistema" }],
      function () { return p.cursor; }, function (v) { set("cursor", v); }));
  }

  function buildGame(box) {
    var p = prefs();
    box.appendChild(slider("dailyGoal", "Meta diária",
      "Quantas palavras por dia a barra da tela inicial persegue",
      { min: 5, max: 100, step: 5 },
      function () { return p.dailyGoal; }, function (v) { set("dailyGoal", v); },
      function (v) { return v + " palavras"; }));
    box.appendChild(textField("name", "Apelido", "Como você aparece no placar dos desafios",
      function () { return p.name; }, function (v) { set("name", v); }));
    box.appendChild(action("setup", "Ajustes da partida",
      "Modo, temas do vocabulário, níveis e clima visual",
      "Abrir", function () {
        close();
        if (api.onOpenSetup) api.onOpenSetup();
      }));
  }

  function buildData(box) {
    var c = TCStore.counts();
    box.appendChild(action("notebook", "Caderno",
      c.total + (c.total === 1 ? " palavra guardada" : " palavras guardadas"),
      "Abrir", function () {
        close();
        if (api.onOpenNotebook) api.onOpenNotebook();
      }));
    box.appendChild(action("export", "Baixar CSV",
      "Abre em planilha e importa no Anki ou Quizlet",
      "Baixar", function () { TCNotebook.mount(); TCNotebook.exportCsv(); }));
    box.appendChild(action("storage", "Onde ficam seus dados",
      TCStore.isPersisting()
        ? "Neste navegador, só nesta máquina — nada é enviado para servidor nenhum"
        : "Este navegador está bloqueando o armazenamento: o caderno vale até fechar a aba",
      "Ver caderno", function () {
        close();
        if (api.onOpenNotebook) api.onOpenNotebook();
      }));
    box.appendChild(action("clear", "Apagar o caderno",
      "Apaga as palavras guardadas e o agendamento. Não dá para desfazer",
      "Apagar", function () {
        if (!window.confirm("Apagar todas as palavras do caderno? Isso não pode ser desfeito.")) return;
        TCStore.clearNotebook();
        render();
        if (api.onChange) api.onChange("notebook", null);
      }, true));
  }

  // ---------- Tela cheia ----------
  function isFullscreen() { return !!document.fullscreenElement; }
  function fullscreenLabel() { return isFullscreen() ? "Sair" : "Entrar"; }
  function toggleFullscreen() {
    try {
      if (isFullscreen()) {
        if (document.exitFullscreen) document.exitFullscreen();
      } else if (document.documentElement.requestFullscreen) {
        var p = document.documentElement.requestFullscreen();
        if (p && p.catch) p.catch(function () { /* o navegador pode recusar */ });
      }
    } catch (e) { /* sem tela cheia, o jogo roda igual */ }
  }

  // ---------- Montagem ----------
  function renderTabs() {
    tabsBox.innerHTML = "";
    TABS.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "opttab";
      b.textContent = t.label;
      b.setAttribute("role", "tab");
      b.setAttribute("data-tab", t.key);
      b.setAttribute("aria-selected", activeTab === t.key ? "true" : "false");
      b.addEventListener("click", function () {
        activeTab = t.key;
        render();
      });
      tabsBox.appendChild(b);
    });
  }

  function render() {
    renderTabs();
    bodyBox.innerHTML = "";
    var tab = null;
    for (var i = 0; i < TABS.length; i++) if (TABS[i].key === activeTab) tab = TABS[i];
    (tab || TABS[0]).build(bodyBox);
  }

  /* Restaura só o que este menu controla. Temas, níveis e caderno não são
   * "opções" — quem apaga isso é outro botão, com confirmação. */
  var RESET_KEYS = ["music", "sfx", "musicVol", "sfxVol", "speak", "showPT",
                    "quality", "motion", "wordScale", "showExample", "showCollected",
                    "uiSfx", "cursor",
                    "dailyGoal"];
  function reset() {
    var padrao = window.TCStoreFactory.defaults().prefs;
    RESET_KEYS.forEach(function (k) { set(k, padrao[k]); });
    render();
  }

  function mount() {
    if (mounted) return;
    screen = el("optionsScreen");
    tabsBox = el("optTabs");
    bodyBox = el("optBody");
    el("optClose").addEventListener("click", close);
    el("optDone").addEventListener("click", close);
    el("optReset").addEventListener("click", reset);
    mounted = true;
  }

  function open(tab) {
    mount();
    if (tab) activeTab = tab;
    render();
    screen.removeAttribute("hidden");
    var first = tabsBox.querySelector('[aria-selected="true"]');
    if (first) first.focus();
  }
  function close() {
    if (!screen) return;
    screen.setAttribute("hidden", "");
    if (api.onClose) api.onClose();
  }
  function isOpen() { return !!screen && !screen.hasAttribute("hidden"); }

  api.mount = mount;
  api.open = open;
  api.close = close;
  api.isOpen = isOpen;
  api.render = render;
  api.applyAll = applyAll;
  api.reset = reset;
  api.RESET_KEYS = RESET_KEYS;
  return api;
})();
