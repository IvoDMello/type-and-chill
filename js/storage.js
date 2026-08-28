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
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) {
    root.TCStoreFactory = api;
    root.TCStore = api.create(api.safeStorage(root), root.TCSrs);
  }
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  var PREFIX = "tc.";
  var VERSION = 2;
  var DAY = 86400000;

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
        showPT: false,
        speak: false,                       // pronúncia das palavras
        name: "",                           // apelido nos desafios
        dailyGoal: 20
      },
      stats: {
        best: 0, bestZen: 0, bestCombo: 0,
        captured: 0, missed: 0, sessions: 0, playedMs: 0,
        keystrokes: 0, correctKeys: 0, chars: 0,
        streak: 0, bestStreak: 0, lastDay: "", todayCount: 0
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

  function create(storage, srs) {
    var store = storage || memoryStorage();
    var failed = false;                      // escrita bloqueada: avisa a UI uma vez

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

      write("version", VERSION);
      version = VERSION;
      write("prefs", prefs); write("stats", stats); write("notebook", notebook);
    })();

    /* ---------- Gravação ---------- */
    function savePrefs() { return write("prefs", prefs); }
    function saveStats() { return write("stats", stats); }
    function saveNotebook() { return write("notebook", notebook); }
    function saveChallenges() { return write("challenges", challenges); }
    function flush() {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      savePrefs(); saveStats(); saveNotebook(); saveChallenges();
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
    /* Chamado no início de cada partida: mantém a contagem de dias seguidos. */
    function touchDay(now) {
      var t = now || Date.now();
      var today = dayKey(t);
      if (stats.lastDay === today) return stats;

      var yesterday = dayKey(t - DAY);
      stats.streak = stats.lastDay === yesterday ? (stats.streak || 0) + 1 : 1;
      if (stats.streak > (stats.bestStreak || 0)) stats.bestStreak = stats.streak;
      stats.lastDay = today;
      stats.todayCount = 0;
      saveStats();
      return stats;
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
          hits: 0, misses: 0, typos: 0, first: now, last: 0,
          srs: srs ? srs.fresh(now) : { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: now }
        };
      } else {
        // o banco pode ter sido editado desde a última partida
        e.pos = word.pos; e.en = word.def; e.pt = word.pt;
        e.lvl = word.lvl; e.theme = word.theme;
      }
      return e;
    }

    function recordCapture(word, opts) {
      var o = opts || {};
      var now = o.now || Date.now();
      var e = ensure(word, now);
      e.hits += 1;
      e.typos += (o.typos || 0);
      e.last = now;
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
      return {
        text: word, pos: e.pos, def: e.en, pt: e.pt, lvl: e.lvl, theme: e.theme,
        hits: e.hits, misses: e.misses, typos: e.typos || 0,
        first: e.first, last: e.last, srs: e.srs,
        mastered: isMastered(e),
        due: srs ? srs.isDue(e.srs, now) : true,
        daysUntilDue: srs ? srs.daysUntilDue(e.srs, now) : 0
      };
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

    /* Fila do modo Prática: as atrasadas primeiro, depois as mais frágeis. */
    function practiceQueue(now, limit) {
      var t = now || Date.now();
      var pending = list(t).filter(function (e) { return !e.mastered; });
      var ordered = srs ? srs.sortForReview(pending, t) : pending;
      var max = limit || 40;
      return ordered.slice(0, max).map(function (e) {
        return { text: e.text, pos: e.pos, def: e.def, pt: e.pt, lvl: e.lvl, theme: e.theme };
      });
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
    function recordSession(session) {
      stats.sessions += 1;
      stats.playedMs += session.ms || 0;
      stats.keystrokes += session.keystrokes || 0;
      stats.correctKeys += session.correctKeys || 0;
      stats.chars += session.chars || 0;
      if ((session.bestCombo || 0) > (stats.bestCombo || 0)) stats.bestCombo = session.bestCombo;
      if (session.mode === "classic" && (session.score || 0) > (stats.best || 0)) stats.best = session.score;
      if (session.mode === "zen" && (session.score || 0) > (stats.bestZen || 0)) stats.bestZen = session.score;
      saveStats();
      return stats;
    }

    return {
      VERSION: VERSION,
      prefs: prefs, savePrefs: savePrefs,
      stats: stats, saveStats: saveStats,
      notebook: function () { return notebook; },
      entryFor: function (w) { return notebook[w] || null; },
      recordCapture: recordCapture, recordMiss: recordMiss,
      isMastered: isMastered, list: list, counts: counts, progress: progress,
      practiceQueue: practiceQueue, clearNotebook: clearNotebook, saveNotebook: saveNotebook,
      touchDay: touchDay, goalProgress: goalProgress, dayKey: dayKey,
      saveMyResult: saveMyResult, addFriendResult: addFriendResult,
      leaderboard: leaderboard, challengeList: challengeList,
      recordSession: recordSession,
      isPersisting: isPersisting,
      flush: flush
    };
  }

  return { create: create, safeStorage: safeStorage, memoryStorage: memoryStorage, VERSION: VERSION, dayKey: dayKey };
});
