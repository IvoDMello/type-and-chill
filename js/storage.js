/* Type & Chill — estado persistente.
 *
 * É uma fábrica: create(storage, srs) devolve um store. No navegador quem
 * entra é o localStorage; nos testes, um objeto de mentira. Assim toda a
 * lógica de caderno, ofensiva e placar roda no Node sem navegador.
 *
 * O que guarda:
 *   tc.version     → versão do formato, para migrar sem perder nada
 *   tc.prefs       → preferências (temas, níveis, clima, som, tradução, nome)
 *   tc.stats       → recordes, totais, ofensiva de dias
 *   tc.notebook    → o caderno, com agendamento de revisão por palavra
 *   tc.challenges  → placar local de cada desafio (seu e dos amigos)
 *   tc.history     → uma linha por sessão, para o gráfico de evolução
 *   tc.campaign    → capítulos concluídos, com melhor PPM e precisão
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.TCStoreFactory = api;
    root.TCStore = api.create(api.safeStorage(root), root.TCSrs, root.TCProgress);
  }
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  var PREFIX = "tc.";
  var VERSION = 3;
  var DAY = 86400000;
  var HISTORY_MAX = 120;

  /* Em janela anônima o acesso ao localStorage pode lançar só de ser lido.
   * Nesse caso o jogo roda igual, mas sem persistir. */
  function safeStorage(win) {
    try {
      var s = win.localStorage;
      var probe = PREFIX + "__probe";
      s.setItem(probe, "1");
      s.removeItem(probe);
      return s;
    } catch (e) { return null; }
  }

  function memoryStorage() {
    var map = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(map, k) ? map[k] : null; },
      setItem: function (k, v) { map[k] = String(v); },
      removeItem: function (k) { delete map[k]; },
      clear: function () { map = {}; }
    };
  }

  function defaults() {
    return {
      prefs: {
        themes: null,                       // null = todos
        levels: ["A2", "B1", "B2", "C1"],
        visual: "ember",
        mode: "classic",
        music: true,
        sfx: true,
        musicVol: 0.7,                      // 0–1, o que o menu de opções controla
        sfxVol: 0.8,
        showPT: false,
        speak: false,                       // pronúncia das palavras
        name: "",                           // apelido nos desafios
        dailyGoal: 20,
        // ---- opções de vídeo e exibição ----
        quality: "auto",                    // auto · high · medium · low · off
        motion: "auto",                     // auto (segue o sistema) · full · reduced
        wordScale: 1,                       // 0.8–1.4, tamanho das palavras caindo
        showExample: true,                  // frase de exemplo no cartão da captura
        showCollected: true,                // lista lateral de capturadas
        uiSfx: true,                        // clique e passagem do mouse no menu
        cursor: "game"                      // game (seta com rastro) · system (o do sistema)
      },
      stats: {
        best: 0, bestZen: 0, bestCombo: 0,
        captured: 0, missed: 0, sessions: 0, playedMs: 0,
        keystrokes: 0, correctKeys: 0, chars: 0,
        streak: 0, bestStreak: 0, lastDay: "", todayCount: 0,
        freezes: 0, frozenDay: ""      // dias pulados que a ofensiva perdoou
      }
    };
  }

  function fill(target, source) {
    Object.keys(source).forEach(function (k) {
      if (target[k] === undefined) target[k] = source[k];
    });
    return target;
  }

  function dayKey(now) {
    var d = new Date(now || Date.now());
    var m = String(d.getMonth() + 1), day = String(d.getDate());
    return d.getFullYear() + "-" + (m.length < 2 ? "0" + m : m) + "-" + (day.length < 2 ? "0" + day : day);
  }

  /* O terceiro argumento é o core/progress.js. Não se chama "progress" aqui
   * porque este arquivo já tem uma função com esse nome (o progresso por tema
   * do caderno), e a declaração dela venceria o parâmetro. */
  function create(storage, srs, progressApi) {
    var store = storage || memoryStorage();
    var failed = false;                      // escrita bloqueada: avisa a UI uma vez
    var prog = progressApi || null;
    if (!prog && typeof require === "function") {
      try { prog = require("./core/progress.js"); } catch (e) { prog = null; }
    }

    function read(key, fallback) {
      var raw;
      try { raw = store.getItem(PREFIX + key); } catch (e) { return fallback; }
      if (raw == null) return fallback;
      try { return JSON.parse(raw); } catch (e) { return fallback; }
    }
    function write(key, value) {
      try { store.setItem(PREFIX + key, JSON.stringify(value)); }
      catch (e) { failed = true; }
      return value;
    }

    var d = defaults();
    var prefs = fill(read("prefs", {}) || {}, d.prefs);
    var stats = fill(read("stats", {}) || {}, d.stats);
    var notebook = read("notebook", {}) || {};
    var challenges = read("challenges", {}) || {};
    var history = read("history", []) || [];
    if (!Array.isArray(history)) history = [];
    var campaign = read("campaign", {}) || {};
    if (!campaign.chapters || typeof campaign.chapters !== "object") campaign.chapters = {};

    /* ---------- Migração ---------- */
    var version = read("version", 0);
    (function migrate() {
      if (version >= VERSION) return;

      // Driftwords (o nome antigo) guardava só o recorde.
      try {
        var old = store.getItem("driftwords_best");
        if (old && !stats.best) stats.best = parseInt(old, 10) || 0;
      } catch (e) {}

      // v1 não tinha agendamento: deriva um a partir do histórico de acertos.
      Object.keys(notebook).forEach(function (w) {
        var e = notebook[w];
        if (e && !e.srs) {
          e.srs = srs ? srs.fresh(Date.now()) : { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: Date.now() };
          e.srs.reps = Math.min(3, e.hits || 0);
          e.srs.lapses = e.misses || 0;
        }
        if (e && e.typos === undefined) e.typos = 0;
      });

      // v3 passou a medir o que o documento pede por palavra: quantas vezes
      // ela apareceu e quanto tempo você leva pra digitá-la. Quem já tinha
      // caderno começa com "apareceu ao menos uma vez por acerto ou erro".
      Object.keys(notebook).forEach(function (w) {
        var e = notebook[w];
        if (!e) return;
        if (e.seen === undefined) e.seen = (e.hits || 0) + (e.misses || 0);
        if (e.msSum === undefined) { e.msSum = 0; e.msN = 0; }
        if (e.ex === undefined) e.ex = "";
      });

      write("version", VERSION);
      version = VERSION;
      write("prefs", prefs); write("stats", stats); write("notebook", notebook);
    })();

    /* ---------- Gravação ---------- */
    function savePrefs() { return write("prefs", prefs); }
    function saveStats() { return write("stats", stats); }
    function saveNotebook() { return write("notebook", notebook); }
    function saveChallenges() { return write("challenges", challenges); }
    function saveHistory() { return write("history", history); }
    function saveCampaign() { return write("campaign", campaign); }
    function flush() {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      savePrefs(); saveStats(); saveNotebook(); saveChallenges(); saveHistory(); saveCampaign();
    }
    function isPersisting() { return !failed; }

    /* Gravação automática após cada captura, agrupada por 800ms.
     * Sem isto o caderno só existia em memória até o fim da partida: fechar a
     * aba no meio (ou o Android matar o app em segundo plano) apagava tudo o
     * que tinha sido aprendido na sessão. */
    var saveTimer = null;
    function scheduleSave() {
      if (saveTimer) return;
      saveTimer = setTimeout(function () {
        saveTimer = null;
        saveNotebook(); saveStats();
      }, 800);
      if (saveTimer && typeof saveTimer.unref === "function") saveTimer.unref();
    }

    /* ---------- Ofensiva diária ---------- */
    /* Chamado no início de cada partida: mantém a contagem de dias seguidos.
     *
     * Pular um dia não zera nada — a ofensiva congela e retoma de onde estava.
     * Perder três semanas de hábito por causa de uma viagem é exatamente o tipo
     * de punição que faz a pessoa não voltar, e este jogo não quer isso. */
    function touchDay(now) {
      var t = now || Date.now();
      var today = dayKey(t);
      if (stats.lastDay === today) return stats;

      var yesterday = dayKey(t - DAY);
      var next = prog
        ? prog.touchStreak(stats, today, yesterday)
        : (function () {
            var s = { streak: (stats.streak || 0), bestStreak: stats.bestStreak || 0,
                      lastDay: today, freezes: stats.freezes || 0, frozen: false };
            if (!stats.lastDay || !s.streak) s.streak = 1;
            else if (stats.lastDay === yesterday) s.streak += 1;
            else { s.frozen = true; s.freezes += 1; }
            if (s.streak > s.bestStreak) s.bestStreak = s.streak;
            return s;
          })();

      stats.streak = next.streak;
      stats.bestStreak = next.bestStreak;
      stats.freezes = next.freezes;
      stats.lastDay = today;
      stats.todayCount = 0;
      if (next.frozen) stats.frozenDay = today;
      saveStats();
      return stats;
    }
    /* A ofensiva foi congelada hoje? A tela inicial diz isso em vez de fingir
     * que os dias pulados nunca existiram. */
    function streakFrozenToday(now) {
      return !!stats.frozenDay && stats.frozenDay === dayKey(now || Date.now());
    }
    function goalProgress() {
      var goal = prefs.dailyGoal || 20;
      return { done: stats.todayCount || 0, goal: goal, ratio: Math.min(1, (stats.todayCount || 0) / goal) };
    }

    /* ---------- Caderno ---------- */
    function ensure(word, now) {
      var e = notebook[word.text];
      if (!e) {
        e = notebook[word.text] = {
          pos: word.pos, en: word.def, pt: word.pt, lvl: word.lvl, theme: word.theme,
          ex: word.ex || "",
          hits: 0, misses: 0, typos: 0, seen: 1, msSum: 0, msN: 0,
          first: now, last: 0,
          srs: srs ? srs.fresh(now) : { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: now }
        };
      } else {
        // o banco pode ter sido editado desde a última partida
        e.pos = word.pos; e.en = word.def; e.pt = word.pt;
        e.lvl = word.lvl; e.theme = word.theme;
        if (word.ex) e.ex = word.ex;
      }
      return e;
    }

    /* Contabiliza que a palavra apareceu na tela. É o denominador de tudo:
     * sem ele, "errei essa duas vezes" não distingue quem viu a palavra duas
     * vezes de quem a viu vinte.
     *
     * Só conta para quem já está no caderno, e de propósito: entrar no caderno
     * é ter sido capturada ou ter escapado. Se a mera aparição criasse entrada,
     * cada partida deixaria para trás as palavras que ainda caíam na tela na
     * hora do game over — todas com zero acerto, todas vencidas, todas na fila
     * de revisão de amanhã. A primeira aparição de cada palavra é contada
     * quando ela entra, pela captura ou pelo erro. */
    function recordSeen(word, opts) {
      var e = notebook[word.text];
      if (!e) return null;
      e.seen = (e.seen || 0) + 1;
      scheduleSave();
      return e;
    }

    function recordCapture(word, opts) {
      var o = opts || {};
      var now = o.now || Date.now();
      var e = ensure(word, now);
      e.hits += 1;
      e.typos += (o.typos || 0);
      e.last = now;
      // tempo de digitação: da primeira tecla à última. Tempo de leitura da
      // palavra caindo não entra — o que interessa é a hesitação ao digitar.
      if (o.ms > 0 && o.ms < 60000) {
        e.msSum = (e.msSum || 0) + o.ms;
        e.msN = (e.msN || 0) + 1;
      }
      if (srs) e.srs = srs.review(e.srs, srs.quality(true, o.typos || 0), now);
      stats.captured += 1;
      stats.todayCount = (stats.todayCount || 0) + 1;
      scheduleSave();
      return e;
    }

    function recordMiss(word, opts) {
      var o = opts || {};
      var now = o.now || Date.now();
      var e = ensure(word, now);
      e.misses += 1;
      e.last = now;
      if (srs) e.srs = srs.review(e.srs, 0, now);
      stats.missed += 1;
      scheduleSave();
      return e;
    }

    function isMastered(entry) {
      if (!entry) return false;
      return srs ? srs.isMature(entry.srs) : entry.hits >= 3;
    }

    function toItem(word, e, now) {
      var item = {
        text: word, pos: e.pos, def: e.en, pt: e.pt, lvl: e.lvl, theme: e.theme,
        ex: e.ex || "",
        hits: e.hits, misses: e.misses, typos: e.typos || 0, seen: e.seen || 0,
        avgMs: e.msN ? Math.round(e.msSum / e.msN) : 0,
        first: e.first, last: e.last, srs: e.srs,
        mastered: isMastered(e),
        due: srs ? srs.isDue(e.srs, now) : true,
        daysUntilDue: srs ? srs.daysUntilDue(e.srs, now) : 0
      };
      item.fragility = srs && srs.fragility ? srs.fragility(item, now) : 0;
      return item;
    }

    function list(now) {
      var t = now || Date.now();
      return Object.keys(notebook).map(function (w) { return toItem(w, notebook[w], t); });
    }

    function counts(now) {
      var all = list(now), mastered = 0, due = 0;
      for (var i = 0; i < all.length; i++) {
        if (all[i].mastered) mastered++;
        else if (all[i].due) due++;
      }
      return { total: all.length, mastered: mastered, learning: all.length - mastered, due: due };
    }

    function playable(e) {
      return { text: e.text, pos: e.pos, def: e.def, pt: e.pt, lvl: e.lvl, theme: e.theme, ex: e.ex };
    }

    /* Fila do modo Prática: as atrasadas primeiro, depois as mais frágeis. */
    function practiceQueue(now, limit) {
      var t = now || Date.now();
      var pending = list(t).filter(function (e) { return !e.mastered; });
      var ordered = srs ? srs.sortForReview(pending, t) : pending;
      return ordered.slice(0, limit || 40).map(playable);
    }

    /* "As que te pegam": ordenadas por fragilidade, sem olhar a data. É a
     * lista do caderno e a fila do modo Deck — o documento pede uma fila que
     * consome as palavras que *você* errou, com prioridade para as mais
     * antigas e as mais falhadas. */
    function hardest(now, limit) {
      var t = now || Date.now();
      var pending = list(t).filter(function (e) {
        return !e.mastered && ((e.misses || 0) > 0 || (e.typos || 0) > 0 || (e.srs && e.srs.lapses));
      });
      var ordered = srs && srs.sortByFragility ? srs.sortByFragility(pending, t) : pending;
      return limit ? ordered.slice(0, limit) : ordered;
    }

    /* Fila do modo Deck. Quando ninguém tropeçou em nada ainda, cai na fila da
     * revisão — melhor jogar as agendadas do que abrir um deck vazio. */
    function deckQueue(now, limit) {
      var t = now || Date.now();
      var max = limit || 40;
      var rows = hardest(t, max).map(playable);
      if (rows.length) return rows;
      return practiceQueue(t, max);
    }

    /* Progresso por tema e por nível, para as barras do caderno. */
    function progress(bank, now) {
      var t = now || Date.now();
      var byTheme = {}, byLevel = {};
      Object.keys(bank).forEach(function (k) { byTheme[k] = { total: 0, mastered: 0, seen: 0, label: bank[k].label }; });
      Object.keys(bank).forEach(function (k) {
        bank[k].words.forEach(function (entry) {
          byTheme[k].total += 1;
          var lvl = entry[4];
          if (!byLevel[lvl]) byLevel[lvl] = { total: 0, mastered: 0, seen: 0 };
          byLevel[lvl].total += 1;
          var e = notebook[entry[0]];
          if (!e) return;
          byTheme[k].seen += 1; byLevel[lvl].seen += 1;
          if (isMastered(e)) { byTheme[k].mastered += 1; byLevel[lvl].mastered += 1; }
        });
      });
      return { byTheme: byTheme, byLevel: byLevel, at: t };
    }

    function clearNotebook() { notebook = {}; saveNotebook(); }

    /* ---------- Desafios ---------- */
    function challengeEntry(code) {
      if (!challenges[code]) challenges[code] = { mine: null, friends: [], at: Date.now() };
      return challenges[code];
    }
    function saveMyResult(code, result) {
      var c = challengeEntry(code);
      if (!c.mine || result.score > c.mine.score) {
        c.mine = { score: result.score, learned: result.learned, wpm: result.wpm, at: Date.now() };
      }
      if (result.daily) { c.daily = true; c.day = result.day; }
      saveChallenges();
      return c;
    }
    /* Cola o código de um amigo. Um nome por desafio: guarda o melhor placar. */
    function addFriendResult(code, friend) {
      var c = challengeEntry(code);
      var found = null;
      for (var i = 0; i < c.friends.length; i++) {
        if (c.friends[i].name === friend.name) { found = c.friends[i]; break; }
      }
      if (!found) {
        c.friends.push({ name: friend.name, score: friend.score, learned: friend.learned, wpm: friend.wpm, at: Date.now() });
      } else if (friend.score > found.score) {
        found.score = friend.score; found.learned = friend.learned; found.wpm = friend.wpm; found.at = Date.now();
      } else {
        saveChallenges();
        return { entry: c, added: false, improved: false };
      }
      saveChallenges();
      return { entry: c, added: !found, improved: !!found };
    }
    /* Placar ordenado do desafio, com você incluído. */
    function leaderboard(code, myName) {
      var c = challenges[code];
      if (!c) return [];
      var rows = (c.friends || []).map(function (f) {
        return { name: f.name, score: f.score, learned: f.learned, wpm: f.wpm, me: false };
      });
      if (c.mine) {
        rows.push({
          name: myName || "VOCÊ", score: c.mine.score, learned: c.mine.learned,
          wpm: c.mine.wpm, me: true
        });
      }
      return rows.sort(function (a, b) { return b.score - a.score; });
    }
    function challengeList() {
      return Object.keys(challenges).map(function (code) {
        var c = challenges[code];
        return { code: code, mine: c.mine, friends: (c.friends || []).length, daily: !!c.daily, day: c.day, at: c.at };
      }).sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
    }

    /* ---------- Métricas da sessão ---------- */
    /* Uma linha por sessão jogada, para o gráfico de evolução do caderno.
     * Só isto: nada de eventos, nada de telemetria — o arquivo precisa caber
     * no localStorage por anos. */
    function pushHistory(session) {
      history.push({
        at: Date.now(), mode: session.mode || "classic",
        score: session.score || 0, learned: session.learned || 0,
        wpm: session.wpm || 0, accuracy: session.accuracy || 0,
        chars: session.chars || 0, ms: session.ms || 0
      });
      if (history.length > HISTORY_MAX) history = history.slice(history.length - HISTORY_MAX);
      saveHistory();
      return history;
    }
    function historyList() { return history.slice(); }

    function recordSession(session) {
      stats.sessions += 1;
      stats.playedMs += session.ms || 0;
      stats.keystrokes += session.keystrokes || 0;
      stats.correctKeys += session.correctKeys || 0;
      stats.chars += session.chars || 0;
      if ((session.bestCombo || 0) > (stats.bestCombo || 0)) stats.bestCombo = session.bestCombo;
      if (session.mode === "classic" && (session.score || 0) > (stats.best || 0)) stats.best = session.score;
      if (session.mode === "zen" && (session.score || 0) > (stats.bestZen || 0)) stats.bestZen = session.score;
      pushHistory(session);
      saveStats();
      return stats;
    }

    /* ---------- Campanha ----------
     * Um capítulo guarda o melhor de cada coisa, não o último: reler um texto
     * já lido nunca pode piorar o que está registrado. */
    function recordChapter(id, result) {
      var o = result || {};
      var c = campaign.chapters[id];
      if (!c) c = campaign.chapters[id] = { done: false, plays: 0, bestWpm: 0, bestAcc: 0, first: 0, at: 0 };
      c.plays += 1;
      c.at = o.now || Date.now();
      if (!c.first) c.first = c.at;
      if (o.finished) c.done = true;
      if ((o.wpm || 0) > c.bestWpm) c.bestWpm = o.wpm || 0;
      if ((o.accuracy || 0) > c.bestAcc) c.bestAcc = o.accuracy || 0;
      campaign.lastId = id;
      saveCampaign();
      return c;
    }
    function chapterState(id) { return campaign.chapters[id] || null; }
    /* Mapa id → true, do jeito que o core/campaign espera para achar o
     * próximo capítulo. */
    function chaptersDone() {
      var out = {};
      Object.keys(campaign.chapters).forEach(function (id) {
        if (campaign.chapters[id].done) out[id] = true;
      });
      return out;
    }
    function campaignCounts(total) {
      var feitos = Object.keys(chaptersDone()).length;
      return { total: total || 0, done: feitos, lastId: campaign.lastId || "" };
    }
    function clearCampaign() { campaign = { chapters: {} }; saveCampaign(); }

    /* ---------- Climas desbloqueados ---------- */
    /* O metajogo do documento é só isto: estatística e cosmético. Nada de
     * moeda, nada de loja — climas que abrem por palavras digitadas. */
    function visualUnlocked(key) {
      if (!prog) return true;
      return prog.isUnlocked(key, stats.captured || 0, prefs.visual);
    }
    function nextVisualUnlock(visuals) {
      if (!prog) return null;
      return prog.nextUnlock(stats.captured || 0, visuals);
    }

    return {
      VERSION: VERSION,
      prefs: prefs, savePrefs: savePrefs,
      stats: stats, saveStats: saveStats,
      notebook: function () { return notebook; },
      entryFor: function (w) { return notebook[w] || null; },
      recordCapture: recordCapture, recordMiss: recordMiss, recordSeen: recordSeen,
      isMastered: isMastered, list: list, counts: counts, progress: progress,
      practiceQueue: practiceQueue, hardest: hardest, deckQueue: deckQueue,
      clearNotebook: clearNotebook, saveNotebook: saveNotebook,
      history: historyList, saveHistory: saveHistory,
      recordChapter: recordChapter, chapterState: chapterState,
      chaptersDone: chaptersDone, campaignCounts: campaignCounts,
      clearCampaign: clearCampaign, saveCampaign: saveCampaign,
      visualUnlocked: visualUnlocked, nextVisualUnlock: nextVisualUnlock,
      touchDay: touchDay, streakFrozenToday: streakFrozenToday,
      goalProgress: goalProgress, dayKey: dayKey,
      saveMyResult: saveMyResult, addFriendResult: addFriendResult,
      leaderboard: leaderboard, challengeList: challengeList,
      recordSession: recordSession,
      isPersisting: isPersisting,
      flush: flush
    };
  }

  return {
    create: create, safeStorage: safeStorage, memoryStorage: memoryStorage,
    VERSION: VERSION, dayKey: dayKey, defaults: defaults
  };
});
