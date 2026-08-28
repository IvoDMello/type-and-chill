/* Type & Chill — tela de desafios.
 *
 * Três formas de competir, todas sem servidor:
 *   · Desafio do dia — a semente vem da data, então todo mundo joga a mesma
 *     partida hoje sem combinar nada;
 *   · Criar desafio — gera um código com as suas regras atuais;
 *   · Entrar com um código — cola o que o amigo mandou.
 *
 * O placar é local: você cola o código de resultado do amigo e ele entra na
 * tabela daquele desafio. Ninguém precisa criar conta em lugar nenhum.
 */
window.TCChallengeUI = (function () {
  "use strict";

  var deps = null, current = null, mounted = false;
  var screen, codeEl, boardEl, boardEmptyEl, dayEl, playBtn, titleEl;

  function el(id) { return document.getElementById(id); }
  function order() { return deps.order(); }

  function mount(dependencies) {
    if (mounted) return;
    deps = dependencies;
    screen = el("challengeScreen");
    codeEl = el("chCode");
    boardEl = el("chBoard");
    boardEmptyEl = el("chBoardEmpty");
    dayEl = el("chDay");
    playBtn = el("chPlay");
    titleEl = el("chTitle");

    var name = el("chName");
    name.value = TCStore.prefs.name || "";
    name.addEventListener("change", function () {
      TCStore.prefs.name = TCChallenge.sanitizeName(name.value);
      name.value = TCStore.prefs.name;
      TCStore.savePrefs();
      renderBoard();
    });

    el("chDaily").addEventListener("click", function () {
      select(TCChallenge.daily(new Date(), order(), TCRng.hashString));
    });
    el("chCreate").addEventListener("click", function () {
      var s = deps.getSettings();
      select({ seed: TCRng.randomSeed(), mode: s.mode === "practice" ? "classic" : s.mode, themes: s.themes, levels: s.levels });
    });
    el("chJoin").addEventListener("click", joinFromInput);
    el("chJoinInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); joinFromInput(); }
    });
    el("chCopy").addEventListener("click", function () {
      if (current) copy(TCChallenge.encode(current, order()), el("chCopy"), "Código copiado");
    });
    el("chAddFriend").addEventListener("click", addFriend);
    el("chFriendInput").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); addFriend(); }
    });
    playBtn.addEventListener("click", function () {
      if (current && deps.onPlay) { close(); deps.onPlay(current); }
    });
    el("chClose").addEventListener("click", close);
    mounted = true;
  }

  function note(msg, isError) {
    var n = el("chNote");
    n.textContent = msg || "";
    n.classList.toggle("is-error", !!isError);
  }

  function joinFromInput() {
    var input = el("chJoinInput");
    var parsed = TCChallenge.decode(input.value, order());
    if (!parsed) {
      // aceita também um código de resultado: entra no desafio e já registra o placar
      var res = TCChallenge.decodeResult(input.value, order());
      if (res) {
        TCStore.addFriendResult(res.code, res);
        select(res.challenge);
        note("Desafio aberto e placar de " + res.name + " registrado.");
        input.value = "";
        return;
      }
      note("Código não reconhecido. Confira se copiou inteiro.", true);
      return;
    }
    select(parsed);
    note("Desafio carregado.");
    input.value = "";
  }

  function addFriend() {
    var input = el("chFriendInput");
    var res = TCChallenge.decodeResult(input.value, order());
    if (!res) { note("Código de resultado não reconhecido.", true); return; }
    if (current && res.code !== TCChallenge.encode(current, order())) {
      select(res.challenge);
      note("Esse resultado é de outro desafio — carreguei ele para você.");
    }
    var out = TCStore.addFriendResult(res.code, res);
    note(out.added ? res.name + " entrou no placar." : (out.improved ? res.name + " melhorou o placar." : res.name + " já tinha um placar melhor."));
    input.value = "";
    renderBoard();
  }

  function copy(text, btn, okMsg) {
    var done = function () {
      note(okMsg || "Copiado.");
      if (btn) {
        var old = btn.textContent;
        btn.textContent = "Copiado!";
        setTimeout(function () { btn.textContent = old; }, 1400);
      }
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, done) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      done();
    } catch (e) {
      note("Não consegui copiar automaticamente — selecione o código e copie à mão.", true);
    }
  }

  function select(challenge) {
    current = challenge;
    render();
  }

  function renderBoard() {
    if (!current) return;
    var code = TCChallenge.encode(current, order());
    var rows = TCStore.leaderboard(code, TCStore.prefs.name || "VOCÊ");
    boardEl.innerHTML = "";
    boardEmptyEl.hidden = rows.length > 0;
    rows.forEach(function (r, i) {
      var li = document.createElement("li");
      li.className = "chrow" + (r.me ? " is-me" : "");
      var pos = document.createElement("span"); pos.className = "chpos"; pos.textContent = "#" + (i + 1);
      var nm = document.createElement("span"); nm.className = "chname"; nm.textContent = r.name;
      var sc = document.createElement("span"); sc.className = "chscore"; sc.textContent = r.score;
      var meta = document.createElement("span"); meta.className = "chmeta";
      meta.textContent = r.learned + " palavras · " + r.wpm + " ppm";
      li.appendChild(pos); li.appendChild(nm); li.appendChild(meta); li.appendChild(sc);
      boardEl.appendChild(li);
    });
  }

  function render() {
    if (!current) {
      titleEl.textContent = "Escolha um desafio";
      codeEl.textContent = "—";
      dayEl.hidden = true;
      playBtn.disabled = true;
      el("chCopy").disabled = true;
      boardEl.innerHTML = "";
      boardEmptyEl.hidden = false;
      boardEmptyEl.textContent = "Crie um desafio, jogue o do dia ou cole o código de um amigo.";
      return;
    }
    var code = TCChallenge.encode(current, order());
    titleEl.textContent = current.daily ? "Desafio do dia" : "Desafio";
    codeEl.textContent = code;
    dayEl.hidden = !current.daily;
    if (current.daily) dayEl.textContent = current.day;
    playBtn.disabled = false;
    el("chCopy").disabled = false;

    var themes = current.themes.map(function (k) {
      return (window.WORD_THEMES[k] && window.WORD_THEMES[k].label) || k;
    });
    el("chRules").textContent =
      (current.mode === "zen" ? "Zen" : "Clássico") + " · " +
      current.levels.join(" ") + " · " +
      (themes.length === Object.keys(window.WORD_THEMES).length ? "todos os temas" : themes.join(", "));

    boardEmptyEl.textContent = "Ninguém jogou este desafio ainda. Jogue e mande o código pro grupo.";
    renderBoard();
  }

  function open(challenge) {
    mount(deps);
    if (challenge) current = challenge;
    note("");
    render();
    screen.removeAttribute("hidden");
    el("chJoinInput").focus();
  }
  function close() {
    screen.setAttribute("hidden", "");
    if (deps && deps.onClose) deps.onClose();
  }
  function isOpen() { return !!screen && !screen.hasAttribute("hidden"); }

  return {
    mount: mount, open: open, close: close, isOpen: isOpen,
    select: select, copy: copy,
    current: function () { return current; }
  };
})();
