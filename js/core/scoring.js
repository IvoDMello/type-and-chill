/* Type & Chill — pontuação, ritmo e métricas de digitação.
 *
 * Toda a matemática do jogo vive aqui, longe do DOM, para poder ser testada
 * e ajustada sem abrir o navegador.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TCScoring = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  var WORDS_PER_LEVEL = 8;
  var MAX_LEVEL = 12;

  /* Pontos de uma captura: base pela sequência, bônus pelo tamanho da palavra,
   * desconto por tecla errada. Nunca fica abaixo de 1 — errar não pode punir
   * mais do que deixar cair. */
  function capturePoints(combo, wordLength, typos) {
    var raw = 10 * Math.max(1, combo) + (wordLength || 0) - (typos || 0) * 2;
    return Math.max(1, Math.round(raw));
  }

  function levelFor(learnedCount) {
    return Math.min(MAX_LEVEL, 1 + Math.floor((learnedCount || 0) / WORDS_PER_LEVEL));
  }

  /* Sobe de nível exatamente na palavra múltipla de WORDS_PER_LEVEL. */
  function isLevelUp(learnedCount) {
    return learnedCount > 0 && learnedCount % WORDS_PER_LEVEL === 0;
  }

  /* Intervalo entre palavras, em milissegundos. */
  function spawnInterval(level, mode) {
    if (mode === "zen") return 2400;
    if (mode === "practice") return 2000;
    return Math.max(950, 2100 - level * 150);
  }

  /* Velocidade de queda em px/s, antes da variação aleatória. */
  function fallSpeed(level, mode) {
    if (mode === "zen") return 20;
    if (mode === "practice") return 24;
    return 22 + (Math.min(MAX_LEVEL, level) - 1) * 4.5;
  }

  /* Quantas palavras podem estar na tela ao mesmo tempo. */
  function maxOnScreen(mode) {
    return mode === "zen" ? 5 : 6;
  }

  /* Palavras por minuto no padrão da indústria: 5 caracteres = 1 palavra. */
  function wpm(chars, elapsedMs) {
    if (!elapsedMs || elapsedMs <= 0) return 0;
    var minutes = elapsedMs / 60000;
    if (minutes <= 0) return 0;
    return Math.round((chars / 5) / minutes);
  }

  /* Precisão: teclas certas sobre teclas digitadas, em porcentagem. */
  function accuracy(correctKeys, totalKeys) {
    if (!totalKeys) return 100;
    return Math.round((correctKeys / totalKeys) * 1000) / 10;
  }

  /* Título da tela final, por desempenho. */
  function runTitle(mode, learnedCount) {
    if (mode === "practice") return "Revisão concluída";
    if (mode === "zen") return "Sessão encerrada";
    if (learnedCount >= 24) return "Vocabulário radiante";
    if (learnedCount >= 12) return "Bela coleta";
    if (learnedCount >= 4) return "Boa deriva";
    return "A brasa recomeça";
  }

  return {
    WORDS_PER_LEVEL: WORDS_PER_LEVEL,
    MAX_LEVEL: MAX_LEVEL,
    capturePoints: capturePoints,
    levelFor: levelFor,
    isLevelUp: isLevelUp,
    spawnInterval: spawnInterval,
    fallSpeed: fallSpeed,
    maxOnScreen: maxOnScreen,
    wpm: wpm,
    accuracy: accuracy,
    runTitle: runTitle
  };
});
