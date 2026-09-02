/* Type & Chill — a campanha: leitura, validação e digitação de texto corrido.
 *
 * Nos outros modos a unidade é a palavra solta. Aqui é o texto: um capítulo
 * curto que você digita inteiro, com um punhado de palavras-alvo marcadas. É
 * o que o documento de design chama de "onde o jogo deixa de ser passatempo e
 * vira produto de aprendizado" — e o que justifica um plano pago um dia.
 *
 * Este arquivo não toca no DOM de propósito: assim a regra de digitação, a
 * marcação dos alvos e a validação dos textos rodam no Node, e os testes
 * conseguem cobrar cada capítulo novo que chegar.
 *
 * Regras de digitação, decididas com o dono do jogo:
 *   · tecla errada é ignorada — o jogo espera a certa, como no resto do jogo;
 *   · pontuação é exigida; maiúscula não ("i" vale por "I").
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TCCampaignCore = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  var LEVELS = ["A1", "A2", "B1", "B2", "C1"];

  /* Faixa de tamanho de um capítulo, em palavras. Curto demais não ensina;
   * longo demais vira dever de casa e ninguém termina numa sessão de ônibus. */
  var MIN_WORDS = 40, MAX_WORDS = 160;
  var MIN_TARGETS = 3, MAX_TARGETS = 12;

  /* O que dá para digitar num teclado, sem malabarismo. Acento não entra:
   * o texto é em inglês, e no ABNT2 o acento é tecla morta. */
  var TYPEABLE = /^[A-Za-z0-9 .,;:!?'"()\-]$/;

  /* Texto colado de editor vem cheio de tipografia bonita e indigitável.
   * Em vez de cobrar isso do autor, normalizamos na entrada. */
  function normalize(text) {
    return String(text == null ? "" : text)
      .replace(/[‘’‛]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, "-")
      .replace(/…/g, "...")
      .replace(/ /g, " ")
      .replace(/\s*\n\s*/g, " ")     // parágrafo vira espaço: um bloco só
      .replace(/[ \t]+/g, " ")
      .trim();
  }

  function words(text) {
    var t = normalize(text);
    return t ? t.split(" ").length : 0;
  }

  /* Comparação de uma tecla com o caractere esperado. */
  function matches(esperado, tecla) {
    if (typeof tecla !== "string" || tecla.length !== 1) return false;
    if (/[A-Za-z]/.test(esperado)) return esperado.toLowerCase() === tecla.toLowerCase();
    return esperado === tecla;
  }

  /* As flexões regulares que uma palavra-alvo pode assumir dentro do texto.
   * O autor escreve "wake" na lista; o texto pode dizer "wakes" ou "waking". */
  function formsOf(word) {
    var w = String(word || "").toLowerCase();
    if (!w) return [];
    var out = [w, w + "s", w + "es", w + "ed", w + "d", w + "ing", w + "er", w + "est", w + "n"];
    var last = w.charAt(w.length - 1);
    if (last === "y") {
      var semY = w.slice(0, -1);
      out.push(semY + "ies", semY + "ied", semY + "ier", semY + "iest");
    }
    if (last === "e") {
      var semE = w.slice(0, -1);
      out.push(semE + "ing", semE + "ed", semE + "es", semE + "er", semE + "est");
    }
    if (/[^aeiou][aeiou][^aeiouwxy]$/.test(w)) {
      out.push(w + last + "ed", w + last + "ing", w + last + "er");
    }
    // as mais longas primeiro: "waking" antes de "wake", senão marcaria só o começo
    return out.sort(function (a, b) { return b.length - a.length; });
  }

  /* Onde cada palavra-alvo aparece no texto. Devolve as faixas [ini, fim) da
   * primeira ocorrência de cada alvo, em ordem de posição.
   *
   * Faixas que se sobrepõem são descartadas: uma letra pertence a um alvo só,
   * senão a marcação na tela ficaria ambígua. */
  function targetRanges(text, targets) {
    var t = normalize(text);
    var baixo = t.toLowerCase();
    var achadas = [];

    (targets || []).forEach(function (alvo) {
      var formas = formsOf(alvo);
      for (var i = 0; i < formas.length; i++) {
        var re = new RegExp("(^|[^a-z])(" + formas[i] + ")([^a-z]|$)");
        var m = re.exec(baixo);
        if (!m) continue;
        var ini = m.index + m[1].length;
        achadas.push({ word: alvo, start: ini, end: ini + formas[i].length, text: t.slice(ini, ini + formas[i].length) });
        return;
      }
    });

    achadas.sort(function (a, b) { return a.start - b.start; });
    var saida = [];
    for (var j = 0; j < achadas.length; j++) {
      var anterior = saida[saida.length - 1];
      if (anterior && achadas[j].start < anterior.end) continue;
      saida.push(achadas[j]);
    }
    return saida;
  }

  /* Procura a ficha de uma palavra-alvo: primeiro no próprio capítulo (para
   * palavras que ainda não estão no banco), depois no banco de 708. */
  function wordInfo(word, chapter, bank, examples) {
    var alvo = String(word || "").toLowerCase();

    var proprias = (chapter && chapter.words) || [];
    for (var i = 0; i < proprias.length; i++) {
      if (String(proprias[i][0]).toLowerCase() === alvo) {
        var e = proprias[i];
        return {
          text: e[0], pos: e[1], def: e[2], pt: e[3], lvl: e[4],
          ex: e[5] || (examples && examples[e[0]]) || "",
          theme: (chapter && chapter.id) || "campaign"
        };
      }
    }

    var temas = bank ? Object.keys(bank) : [];
    for (var t = 0; t < temas.length; t++) {
      var lista = bank[temas[t]].words;
      for (var w = 0; w < lista.length; w++) {
        if (String(lista[w][0]).toLowerCase() !== alvo) continue;
        var b = lista[w];
        return {
          text: b[0], pos: b[1], def: b[2], pt: b[3], lvl: b[4],
          ex: b[5] || (examples && examples[b[0]]) || "",
          theme: temas[t]
        };
      }
    }
    return null;
  }

  /* Monta o capítulo pronto para a tela: texto normalizado, faixas dos alvos
   * e a ficha de cada um. */
  function prepare(chapter, bank, examples) {
    var text = normalize(chapter.text);
    var ranges = targetRanges(text, chapter.targets);
    return {
      id: chapter.id,
      level: chapter.level,
      title: chapter.title,
      intro: chapter.intro || "",
      text: text,
      pt: chapter.pt ? normalize(chapter.pt) : "",
      chars: text.length,
      words: words(text),
      targets: ranges.map(function (r) {
        var info = wordInfo(r.word, chapter, bank, examples);
        return {
          word: r.word, start: r.start, end: r.end, shown: r.text,
          info: info
        };
      })
    };
  }

  /* Em que alvo cai uma posição do texto (ou null). */
  function targetAt(prepared, pos) {
    for (var i = 0; i < prepared.targets.length; i++) {
      var t = prepared.targets[i];
      if (pos >= t.start && pos < t.end) return t;
    }
    return null;
  }

  function levelIndex(level) {
    var i = LEVELS.indexOf(level);
    return i < 0 ? LEVELS.length : i;
  }

  /* Capítulos na ordem de estudo: por nível, e dentro do nível pela ordem em
   * que foram escritos. */
  function ordered(chapters) {
    return (chapters || []).slice().sort(function (a, b) {
      var d = levelIndex(a.level) - levelIndex(b.level);
      if (d) return d;
      return String(a.id).localeCompare(String(b.id));
    });
  }

  /* O próximo capítulo a sugerir: o primeiro não concluído na ordem de estudo.
   * Concluiu tudo? Volta o primeiro, para reler sem ficar sem caminho. */
  function nextChapter(chapters, done) {
    var lista = ordered(chapters);
    var feito = done || {};
    for (var i = 0; i < lista.length; i++) {
      if (!feito[lista[i].id]) return lista[i];
    }
    return lista[0] || null;
  }

  function levelSummary(chapters, done) {
    var feito = done || {};
    var por = {};
    LEVELS.forEach(function (l) { por[l] = { total: 0, done: 0 }; });
    ordered(chapters).forEach(function (c) {
      if (!por[c.level]) por[c.level] = { total: 0, done: 0 };
      por[c.level].total += 1;
      if (feito[c.id]) por[c.level].done += 1;
    });
    return por;
  }

  /* ---------- Validação ----------
   * Roda nos testes a cada capítulo novo: o texto precisa ser digitável, os
   * alvos precisam aparecer nele e ter ficha, e o id não pode repetir. */
  function validate(chapters, bank, examples) {
    var errors = [], ids = {};

    (chapters || []).forEach(function (c, indice) {
      var onde = (c && c.id) || "capítulo #" + (indice + 1);
      function erro(problema) { errors.push({ chapter: onde, problem: problema }); }

      if (!c || typeof c !== "object") { erro("capítulo não é um objeto"); return; }
      if (!c.id || !/^[a-z0-9-]+$/.test(c.id)) erro("id ausente ou fora do formato a1-01");
      if (ids[c.id]) erro("id repetido"); else ids[c.id] = true;
      if (LEVELS.indexOf(c.level) < 0) erro("nível inválido: " + c.level);
      if (typeof c.title !== "string" || c.title.trim().length < 3) erro("título ausente");
      if (typeof c.text !== "string" || !c.text.trim()) { erro("texto ausente"); return; }

      var text = normalize(c.text);
      var n = words(text);
      if (n < MIN_WORDS || n > MAX_WORDS) {
        erro("texto com " + n + " palavras (esperado entre " + MIN_WORDS + " e " + MAX_WORDS + ")");
      }

      var proibidos = {};
      for (var i = 0; i < text.length; i++) {
        if (!TYPEABLE.test(text[i])) proibidos[text[i]] = true;
      }
      var listaProibidos = Object.keys(proibidos);
      if (listaProibidos.length) {
        erro("caracteres impossíveis de digitar: " + listaProibidos.join(" "));
      }

      var alvos = c.targets || [];
      if (alvos.length < MIN_TARGETS || alvos.length > MAX_TARGETS) {
        erro(alvos.length + " palavras-alvo (esperado entre " + MIN_TARGETS + " e " + MAX_TARGETS + ")");
      }

      var faixas = targetRanges(text, alvos);
      var achadas = {};
      faixas.forEach(function (f) { achadas[f.word] = true; });
      alvos.forEach(function (alvo) {
        if (!/^[a-z]+$/.test(String(alvo))) erro("alvo fora do formato (só a-z minúsculo): " + alvo);
        else if (!achadas[alvo]) erro("a palavra-alvo não aparece no texto: " + alvo);
        if (!wordInfo(alvo, c, bank, examples)) {
          erro("alvo sem ficha: " + alvo + " não está no banco nem foi declarado no capítulo");
        }
      });

      if (c.pt !== undefined && typeof c.pt !== "string") erro("tradução precisa ser texto");
    });

    return { errors: errors, total: (chapters || []).length };
  }

  return {
    LEVELS: LEVELS,
    MIN_WORDS: MIN_WORDS, MAX_WORDS: MAX_WORDS,
    MIN_TARGETS: MIN_TARGETS, MAX_TARGETS: MAX_TARGETS,
    TYPEABLE: TYPEABLE,
    normalize: normalize, words: words, matches: matches, formsOf: formsOf,
    targetRanges: targetRanges, wordInfo: wordInfo, prepare: prepare,
    targetAt: targetAt, ordered: ordered, nextChapter: nextChapter,
    levelSummary: levelSummary, validate: validate
  };
});
