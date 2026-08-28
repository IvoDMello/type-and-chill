/* Type & Chill — aleatoriedade determinística.
 *
 * Math.random() não serve para desafios: dois jogadores com o mesmo código
 * precisam receber exatamente as mesmas palavras, na mesma ordem, com as
 * mesmas velocidades. Aqui a semente manda em tudo.
 *
 * Roda no navegador (window.TCRng) e no Node (require), sem build.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TCRng = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  /* xmur3: transforma um texto numa semente de 32 bits bem espalhada. */
  function hashString(str) {
    var h = 1779033703 ^ String(str).length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }

  /* mulberry32: gerador rápido, período longo o bastante para uma partida. */
  function create(seed) {
    var a = seed >>> 0;
    function next() {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    next.int = function (maxExclusive) { return Math.floor(next() * maxExclusive); };
    next.range = function (min, max) { return min + next() * (max - min); };
    next.pick = function (arr) { return arr[next.int(arr.length)]; };
    return next;
  }

  function fromString(str) { return create(hashString(str)); }

  /* Semente aleatória para um desafio novo (aí sim Math.random serve). */
  function randomSeed() { return (Math.random() * 0xFFFFFFFF) >>> 0; }

  /* Fisher-Yates com o gerador fornecido — não altera o array original. */
  function shuffle(items, rng) {
    var out = items.slice();
    for (var i = out.length - 1; i > 0; i--) {
      var j = rng.int(i + 1);
      var tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    return out;
  }

  /* Monta a ordem das palavras de uma partida.
   *
   * Restrição do jogo: duas palavras visíveis não podem começar com a mesma
   * letra, senão a digitação fica ambígua. Como cabem no máximo 6 na tela,
   * garantimos que nenhuma inicial se repita dentro de uma janela de 6.
   *
   * Devolve o baralho embaralhado e reparado. Se não houver como respeitar a
   * janela (banco pequeno demais), afrouxa em vez de travar.
   */
  function buildDeck(items, rng, windowSize) {
    var win = windowSize || 6;
    var deck = shuffle(items, rng);
    var firstOf = function (w) { return String(w.text || w).charAt(0); };

    for (var i = 1; i < deck.length; i++) {
      var recent = {};
      for (var b = Math.max(0, i - (win - 1)); b < i; b++) recent[firstOf(deck[b])] = true;
      if (!recent[firstOf(deck[i])]) continue;

      var swapped = false;
      for (var j = i + 1; j < deck.length; j++) {
        if (recent[firstOf(deck[j])]) continue;
        var tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
        swapped = true;
        break;
      }
      if (!swapped) break;   // banco pequeno: segue com o que dá
    }
    return deck;
  }

  return {
    hashString: hashString,
    create: create,
    fromString: fromString,
    randomSeed: randomSeed,
    shuffle: shuffle,
    buildDeck: buildDeck
  };
});
