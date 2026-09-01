/* Type & Chill — leitura e validação do banco de palavras.
 *
 * As regras aqui não são estéticas, são de funcionamento:
 *   · só letras a-z minúsculas — o jogo lê teclas, não dá pra digitar espaço
 *     nem acento, então qualquer outra coisa seria uma palavra impossível;
 *   · nenhuma palavra repetida entre temas — o caderno guarda uma entrada por
 *     palavra, e a segunda sobrescreveria a definição da primeira.
 *
 * Os testes rodam validate() sobre o banco inteiro a cada mudança.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TCWordbank = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  var POS = ["n", "v", "adj", "adv"];
  var WORD_RE = /^[a-z]+$/;

  function toWord(entry, themeKey) {
    return {
      text: entry[0], pos: entry[1], def: entry[2], pt: entry[3],
      lvl: entry[4], theme: themeKey
    };
  }

  /* Monta a lista de palavras jogáveis com os filtros aplicados.
   * themes/levels nulos significam "todos". */
  function buildPool(bank, filters) {
    var f = filters || {};
    var pool = [];
    Object.keys(bank).forEach(function (key) {
      if (f.themes && f.themes.indexOf(key) < 0) return;
      bank[key].words.forEach(function (entry) {
        if (f.levels && f.levels.indexOf(entry[4]) < 0) return;
        pool.push(toWord(entry, key));
      });
    });
    return pool;
  }

  function allWords(bank) { return buildPool(bank, null); }

  /* Temas na ordem do banco, separados nas famílias declaradas em WORD_GROUPS.
   * Tema sem grupo (ou com grupo desconhecido) vira uma família própria no fim,
   * para nunca sumir da tela por causa de um typo. */
  function groupsOf(bank, groups) {
    var g = groups || {}, out = [], index = {};
    function bucket(key, label) {
      if (!index[key]) {
        index[key] = { key: key, label: label, themes: [] };
        out.push(index[key]);
      }
      return index[key];
    }
    Object.keys(g).forEach(function (k) { bucket(k, g[k].label || k); });
    Object.keys(bank).forEach(function (k) {
      var key = bank[k].group;
      var target = (key && index[key]) ? index[key] : bucket(key || "outros", "Outros");
      target.themes.push(k);
    });
    return out.filter(function (b) { return b.themes.length; });
  }

  /* Devolve { errors, duplicates, total, byLevel, byTheme }.
   * `groups` é opcional: quando vem, confere se cada tema aponta para uma
   * família existente. */
  function validate(bank, levels, groups) {
    var errors = [], duplicates = [], seen = {};
    var byLevel = {}, byTheme = {}, total = 0;
    var validLevels = levels || ["A2", "B1", "B2", "C1"];

    Object.keys(bank).forEach(function (key) {
      var theme = bank[key];
      if (!theme || typeof theme.label !== "string" || !theme.label) {
        errors.push({ theme: key, word: null, problem: "tema sem label" });
      }
      if (groups && (!theme || !theme.group || !groups[theme.group])) {
        errors.push({ theme: key, word: null, problem: "grupo inválido: " + (theme && theme.group) });
      }
      if (!theme || !Array.isArray(theme.words) || !theme.words.length) {
        errors.push({ theme: key, word: null, problem: "tema sem palavras" });
        return;
      }
      byTheme[key] = theme.words.length;

      theme.words.forEach(function (e) {
        total++;
        var w = e && e[0];
        if (!Array.isArray(e) || e.length !== 5) {
          errors.push({ theme: key, word: w, problem: "esperava 5 campos, veio " + (e ? e.length : 0) });
          return;
        }
        if (typeof w !== "string" || !WORD_RE.test(w)) {
          errors.push({ theme: key, word: w, problem: "palavra precisa ser só a-z minúsculo" });
        }
        if (POS.indexOf(e[1]) < 0) {
          errors.push({ theme: key, word: w, problem: "classe inválida: " + e[1] });
        }
        if (typeof e[2] !== "string" || e[2].trim().length < 10) {
          errors.push({ theme: key, word: w, problem: "definição em inglês ausente ou curta demais" });
        }
        if (typeof e[3] !== "string" || !e[3].trim()) {
          errors.push({ theme: key, word: w, problem: "tradução em português ausente" });
        }
        if (validLevels.indexOf(e[4]) < 0) {
          errors.push({ theme: key, word: w, problem: "nível inválido: " + e[4] });
        } else {
          byLevel[e[4]] = (byLevel[e[4]] || 0) + 1;
        }
        if (seen[w]) duplicates.push({ word: w, themes: [seen[w], key] });
        else seen[w] = key;
      });
    });

    return {
      errors: errors, duplicates: duplicates, total: total,
      unique: Object.keys(seen).length, byLevel: byLevel, byTheme: byTheme
    };
  }

  return {
    POS: POS, WORD_RE: WORD_RE, toWord: toWord, buildPool: buildPool,
    allWords: allWords, groupsOf: groupsOf, validate: validate
  };
});
