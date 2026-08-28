/* Type & Chill — persistência local (localStorage).
 *
 * Guarda três coisas:
 *   tc.prefs     → preferências (temas, níveis, visual, som, tradução)
 *   tc.stats     → recordes e totais acumulados
 *   tc.notebook  → o caderninho: toda palavra já capturada, com histórico
 *
 * Tudo é envolvido em try/catch: se o navegador bloquear o armazenamento
 * (janela anônima, permissões), o jogo continua funcionando em memória.
 */
window.TCStore = (function () {
  "use strict";

  var PREFIX = "tc.";
  var memory = {};                 // fallback quando localStorage falha

  function read(key, fallback) {
    var raw = null;
    try { raw = localStorage.getItem(PREFIX + key); } catch (e) { raw = memory[key] || null; }
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }
  function write(key, value) {
    var raw = JSON.stringify(value);
    memory[key] = raw;
    try { localStorage.setItem(PREFIX + key, raw); } catch (e) {}
    return value;
  }

  // ---------- Preferências ----------
  var defaultPrefs = {
    themes: null,        // null = todos ligados; senão array de chaves
    levels: ["A2", "B1", "B2", "C1"],
    visual: "ember",     // paleta visual (ver themes.js)
    mode: "classic",     // classic | zen | practice
    music: true,
    sfx: true,
    showPT: false        // mostrar tradução em português
  };
  var prefs = read("prefs", {});
  Object.keys(defaultPrefs).forEach(function (k) {
    if (prefs[k] === undefined) prefs[k] = defaultPrefs[k];
  });
  function savePrefs() { write("prefs", prefs); }

  // ---------- Estatísticas ----------
  var defaultStats = {
    best: 0,             // maior pontuação no modo clássico
    bestCombo: 0,
    captured: 0,         // total de palavras capturadas na vida toda
    missed: 0,
    sessions: 0,
    playedMs: 0
  };
  var stats = read("stats", {});
  Object.keys(defaultStats).forEach(function (k) {
    if (stats[k] === undefined) stats[k] = defaultStats[k];
  });
  function saveStats() { write("stats", stats); }

  // ---------- Caderninho ----------
  /* Cada entrada:
   *   { pos, en, pt, lvl, theme, hits, misses, first, last }
   * "Dominada" = 3 capturas ou mais sem erro recente (ver isMastered).
   */
  var notebook = read("notebook", {});

  function saveNotebook() { write("notebook", notebook); }

  function entryFor(word) { return notebook[word] || null; }

  function recordCapture(w) {
    var e = notebook[w.text];
    if (!e) {
      e = notebook[w.text] = {
        pos: w.pos, en: w.def, pt: w.pt, lvl: w.lvl, theme: w.theme,
        hits: 0, misses: 0, first: Date.now(), last: 0
      };
    }
    e.hits += 1;
    e.last = Date.now();
    stats.captured += 1;
    return e;
  }
  function recordMiss(w) {
    var e = notebook[w.text];
    if (!e) {
      e = notebook[w.text] = {
        pos: w.pos, en: w.def, pt: w.pt, lvl: w.lvl, theme: w.theme,
        hits: 0, misses: 0, first: Date.now(), last: 0
      };
    }
    e.misses += 1;
    e.last = Date.now();
    stats.missed += 1;
    return e;
  }
  function isMastered(e) {
    return !!e && e.hits >= 3 && e.hits > e.misses * 2;
  }
  function list() {
    return Object.keys(notebook).map(function (k) {
      var e = notebook[k];
      return {
        text: k, pos: e.pos, def: e.en, pt: e.pt, lvl: e.lvl, theme: e.theme,
        hits: e.hits, misses: e.misses, first: e.first, last: e.last,
        mastered: isMastered(e)
      };
    });
  }
  function counts() {
    var all = list(), m = 0;
    for (var i = 0; i < all.length; i++) if (all[i].mastered) m++;
    return { total: all.length, mastered: m, learning: all.length - m };
  }
  function clearNotebook() { notebook = {}; saveNotebook(); }

  function flush() { savePrefs(); saveStats(); saveNotebook(); }

  return {
    prefs: prefs, savePrefs: savePrefs,
    stats: stats, saveStats: saveStats,
    notebook: function () { return notebook; },
    entryFor: entryFor,
    recordCapture: recordCapture, recordMiss: recordMiss,
    isMastered: isMastered, list: list, counts: counts,
    clearNotebook: clearNotebook, saveNotebook: saveNotebook,
    flush: flush
  };
})();
