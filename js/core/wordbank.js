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

  /* Frases de exemplo.
   *
   * O documento de design é categórico: "frase de exemplo é obrigatória — é o
   * contexto que faz a palavra grudar". Elas vivem em js/examples.js, num mapa
   * palavra → frase, e não como sexto campo de cada linha do banco: assim o
   * banco continua legível para editar em massa, e a cobertura das frases pode
   * ser medida (e cobrada pelos testes) separadamente.
   *
   * Uma entrada do banco ainda pode trazer a frase no sexto campo; quando as
   * duas existem, a do banco ganha, por ser a mais específica.
   */
  function exampleFor(entry, examples) {
    if (entry && typeof entry[5] === "string" && entry[5]) return entry[5];
    if (examples && typeof examples[entry[0]] === "string") return examples[entry[0]];
    return "";
  }

  /* A frase precisa realmente conter a palavra — senão o exemplo ensina outra
   * coisa. Aceita as flexões regulares (walk → walked, study → studies,
   * plan → planning), porque exigir a forma exata produziria frases torcidas. */
  function formsOf(word) {
    var w = word, out = [w, w + "s", w + "es", w + "ed", w + "d", w + "ing",
                         w + "er", w + "est", w + "ly", w + "n"];
    var last = w.charAt(w.length - 1);
    if (last === "y") {
      var stem = w.slice(0, -1);
      out.push(stem + "ies", stem + "ied", stem + "ier", stem + "iest", stem + "ily");
    }
    if (last === "e") {
      var noE = w.slice(0, -1);
      out.push(noE + "ing", noE + "ed", noE + "es", noE + "er", noE + "est");
    }
    if (/[^aeiou][aeiou][^aeiouwxy]$/.test(w)) {
      out.push(w + last + "ed", w + last + "ing", w + last + "er", w + last + "est");
    }
    return out;
  }
  function mentions(sentence, word) {
    if (!sentence || !word) return false;
    var text = String(sentence).toLowerCase();
    var forms = formsOf(word);
    for (var i = 0; i < forms.length; i++) {
      var re = new RegExp("(^|[^a-z])" + forms[i] + "([^a-z]|$)");
      if (re.test(text)) return true;
    }
    return false;
  }

  function toWord(entry, themeKey, examples) {
    return {
      text: entry[0], pos: entry[1], def: entry[2], pt: entry[3],
      lvl: entry[4], theme: themeKey, ex: exampleFor(entry, examples)
    };
  }

  /* Monta a lista de palavras jogáveis com os filtros aplicados.
   * themes/levels nulos significam "todos". */
  function buildPool(bank, filters, examples) {
    var f = filters || {};
    var pool = [];
    Object.keys(bank).forEach(function (key) {
      if (f.themes && f.themes.indexOf(key) < 0) return;
      bank[key].words.forEach(function (entry) {
        if (f.levels && f.levels.indexOf(entry[4]) < 0) return;
        pool.push(toWord(entry, key, examples));
      });
    });
    return pool;
  }

  function allWords(bank, examples) { return buildPool(bank, null, examples); }

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

  /* Devolve { errors, duplicates, total, byLevel, byTheme, examples }.
   * `groups` é opcional: quando vem, confere se cada tema aponta para uma
   * família existente. `examples` também: quando vem, mede a cobertura das
   * frases e reclama das que não citam a própria palavra. */
  function validate(bank, levels, groups, examples) {
    var errors = [], duplicates = [], seen = {};
    var byLevel = {}, byTheme = {}, total = 0;
    var exHave = 0, exMissing = [];
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
        if (!Array.isArray(e) || (e.length !== 5 && e.length !== 6)) {
          errors.push({ theme: key, word: w, problem: "esperava 5 ou 6 campos, veio " + (e ? e.length : 0) });
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

        var ex = exampleFor(e, examples);
        if (!ex) {
          exMissing.push(w);
        } else {
          exHave++;
          if (ex.trim().length < 14) {
            errors.push({ theme: key, word: w, problem: "frase de exemplo curta demais" });
          } else if (!mentions(ex, w)) {
            errors.push({ theme: key, word: w, problem: "a frase de exemplo não usa a palavra" });
          }
        }
      });
    });

    return {
      errors: errors, duplicates: duplicates, total: total,
      unique: Object.keys(seen).length, byLevel: byLevel, byTheme: byTheme,
      examples: {
        have: exHave, missing: exMissing,
        coverage: total ? Math.round((exHave / total) * 1000) / 10 : 0
      }
    };
  }

  return {
    POS: POS, WORD_RE: WORD_RE, toWord: toWord, buildPool: buildPool,
    allWords: allWords, groupsOf: groupsOf, validate: validate,
    exampleFor: exampleFor, mentions: mentions, formsOf: formsOf
  };
});
