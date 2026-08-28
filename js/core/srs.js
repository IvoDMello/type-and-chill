/* Type & Chill — repetição espaçada (SM-2 enxuto).
 *
 * A ideia do SM-2: cada palavra tem uma "facilidade" (ease) e um intervalo em
 * dias. Acertou, o intervalo cresce multiplicado pela facilidade; errou, volta
 * pro começo e a facilidade cai. Revisar no dia em que você está prestes a
 * esquecer é o que faz a palavra grudar.
 *
 * Qualidade da resposta, traduzida para o jogo:
 *   5  capturou sem errar tecla
 *   4  capturou com 1 erro
 *   3  capturou com 2 erros ou mais
 *   0  deixou a palavra cair
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TCSrs = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  var DAY = 86400000;
  var EASE_MIN = 1.3, EASE_MAX = 2.8, EASE_START = 2.5;
  var MATURE_DAYS = 21;      // intervalo a partir do qual a palavra é "dominada"
  var MATURE_REPS = 3;

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /* Converte o desempenho na palavra em nota de 0 a 5. */
  function quality(captured, typos) {
    if (!captured) return 0;
    if (!typos) return 5;
    return typos === 1 ? 4 : 3;
  }

  /* Estado inicial de uma palavra que acabou de entrar no caderno. */
  function fresh(now) {
    return {
      ease: EASE_START,
      interval: 0,       // em dias
      reps: 0,
      lapses: 0,
      due: now || Date.now()
    };
  }

  /* Aplica uma revisão e devolve o novo estado (não muta a entrada). */
  function review(state, q, now) {
    var t = now || Date.now();
    var s = {
      ease: state && state.ease ? state.ease : EASE_START,
      interval: state && state.interval ? state.interval : 0,
      reps: state && state.reps ? state.reps : 0,
      lapses: state && state.lapses ? state.lapses : 0,
      due: t
    };

    if (q < 3) {
      s.reps = 0;
      s.lapses += 1;
      s.interval = 1;
      s.ease = clamp(s.ease - 0.2, EASE_MIN, EASE_MAX);
    } else {
      s.reps += 1;
      if (s.reps === 1) s.interval = 1;
      else if (s.reps === 2) s.interval = 3;
      else s.interval = Math.round(s.interval * s.ease) || 1;
      // curva clássica do SM-2 para ajustar a facilidade
      s.ease = clamp(s.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)), EASE_MIN, EASE_MAX);
    }

    s.due = t + s.interval * DAY;
    return s;
  }

  /* "Dominada": sobreviveu a algumas revisões e o intervalo já é longo. */
  function isMature(state) {
    if (!state) return false;
    return (state.reps || 0) >= MATURE_REPS && (state.interval || 0) >= MATURE_DAYS;
  }

  function isDue(state, now) {
    if (!state) return true;
    return (state.due || 0) <= (now || Date.now());
  }

  /* Quantos dias faltam (negativo = atrasada). */
  function daysUntilDue(state, now) {
    if (!state) return 0;
    return Math.ceil(((state.due || 0) - (now || Date.now())) / DAY);
  }

  /* Ordena a fila de revisão: as atrasadas primeiro, depois as mais frágeis.
   * Recebe entradas com { srs, misses, hits }. */
  function sortForReview(entries, now) {
    var t = now || Date.now();
    return entries.slice().sort(function (a, b) {
      var da = isDue(a.srs, t) ? 0 : 1, db = isDue(b.srs, t) ? 0 : 1;
      if (da !== db) return da - db;
      var oa = (a.srs && a.srs.due) || 0, ob = (b.srs && b.srs.due) || 0;
      if (oa !== ob) return oa - ob;                       // mais atrasada antes
      var ea = (a.srs && a.srs.ease) || EASE_START;
      var eb = (b.srs && b.srs.ease) || EASE_START;
      if (ea !== eb) return ea - eb;                       // mais difícil antes
      return (b.misses || 0) - (a.misses || 0);
    });
  }

  return {
    DAY: DAY,
    EASE_MIN: EASE_MIN, EASE_MAX: EASE_MAX, EASE_START: EASE_START,
    MATURE_DAYS: MATURE_DAYS, MATURE_REPS: MATURE_REPS,
    quality: quality,
    fresh: fresh,
    review: review,
    isMature: isMature,
    isDue: isDue,
    daysUntilDue: daysUntilDue,
    sortForReview: sortForReview
  };
});
