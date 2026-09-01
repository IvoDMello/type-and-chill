/* Type & Chill — metajogo: marcos, desbloqueios e a curva de evolução.
 *
 * O documento de design é explícito sobre o formato da progressão: "sem
 * economia, sem loja, sem energia — a progressão é estatística e cosmética".
 * Então aqui não há moeda nem inventário. Há três coisas:
 *
 *   · MILESTONES  — climas visuais que abrem por palavras digitadas;
 *   · series()    — PPM e precisão ao longo das últimas sessões, pro gráfico;
 *   · streak      — a ofensiva que congela em vez de zerar.
 *
 * Tudo puro: entra número, sai número. Quem grava é o storage.js.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TCProgress = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  /* Marcos de desbloqueio dos climas, em palavras capturadas na vida toda.
   * Os dois primeiros nascem abertos: um jogo que começa com uma opção só
   * parece quebrado, e um que começa com cinco não dá o que comemorar. */
  var MILESTONES = [
    { key: "ember", at: 0 },
    { key: "lofi",  at: 0 },
    { key: "rain",  at: 150 },
    { key: "dawn",  at: 450 },
    { key: "aurora", at: 900 }
  ];

  function milestoneFor(key) {
    for (var i = 0; i < MILESTONES.length; i++) {
      if (MILESTONES[i].key === key) return MILESTONES[i];
    }
    return null;                                  // clima novo, sem marco: livre
  }

  /* Um clima está aberto se o marco caiu — ou se já era o clima em uso.
   * Quem jogava antes dos marcos existirem não pode perder o próprio tema. */
  function isUnlocked(key, captured, current) {
    if (key === current) return true;
    var m = milestoneFor(key);
    if (!m) return true;
    return (captured || 0) >= m.at;
  }

  function need(key) {
    var m = milestoneFor(key);
    return m ? m.at : 0;
  }

  /* Quanto falta para o próximo clima — o que a tela inicial mostra como
   * "faltam 43 palavras para Chuva". Devolve null quando tudo já abriu. */
  function nextUnlock(captured, visuals) {
    var c = captured || 0, best = null;
    for (var i = 0; i < MILESTONES.length; i++) {
      var m = MILESTONES[i];
      if (m.at <= c) continue;
      if (visuals && !visuals[m.key]) continue;   // clima que não existe mais
      if (!best || m.at < best.at) best = m;
    }
    if (!best) return null;
    return { key: best.key, at: best.at, remaining: best.at - c };
  }

  /* Climas recém-abertos entre dois totais de captura — para avisar no fim
   * da partida em vez de deixar o jogador descobrir por acaso. */
  function unlockedBetween(before, after) {
    var a = before || 0, b = after || 0, out = [];
    for (var i = 0; i < MILESTONES.length; i++) {
      var m = MILESTONES[i];
      if (m.at > a && m.at <= b) out.push(m.key);
    }
    return out;
  }

  /* ---------- Evolução ----------
   * O gráfico da tela do caderno lê daqui. Sessões sem digitação nenhuma são
   * ruído (abriu e fechou), então saem da série. */
  function series(history, limit) {
    var rows = (history || []).filter(function (h) {
      return h && (h.chars || 0) > 0 && (h.wpm || 0) > 0;
    });
    var max = limit || 30;
    if (rows.length > max) rows = rows.slice(rows.length - max);
    return rows.map(function (h) {
      return {
        at: h.at || 0, mode: h.mode || "classic",
        wpm: h.wpm || 0, accuracy: h.accuracy || 0, learned: h.learned || 0
      };
    });
  }

  /* Média das N últimas contra as N anteriores: é isso que diz se você está
   * melhorando, e não o número de hoje sozinho. */
  function trend(history, window_) {
    var rows = series(history, 1e9);
    var n = window_ || 5;
    if (rows.length < 2) return { wpm: 0, accuracy: 0, sessions: rows.length, delta: 0 };
    var recent = rows.slice(Math.max(0, rows.length - n));
    var prev = rows.slice(Math.max(0, rows.length - n * 2), Math.max(0, rows.length - n));
    function avg(list, key) {
      if (!list.length) return 0;
      var s = 0;
      for (var i = 0; i < list.length; i++) s += list[i][key] || 0;
      return Math.round((s / list.length) * 10) / 10;
    }
    var now = avg(recent, "wpm");
    return {
      wpm: now,
      accuracy: avg(recent, "accuracy"),
      sessions: rows.length,
      delta: prev.length ? Math.round((now - avg(prev, "wpm")) * 10) / 10 : 0
    };
  }

  /* ---------- Ofensiva ----------
   * "Ofensiva diária opcional, e que não quebra com raiva — congela em vez de
   * zerar." Faltou um dia? A contagem para de pé, congelada, e o próximo dia
   * jogado retoma de onde estava. Zerar semanas de hábito por causa de uma
   * viagem é o tipo de punição que faz a pessoa não voltar.
   *
   * Recebe o estado atual e devolve o próximo — não muta nada.
   */
  function touchStreak(state, todayKey, yesterdayKey) {
    var s = {
      streak: (state && state.streak) || 0,
      bestStreak: (state && state.bestStreak) || 0,
      lastDay: (state && state.lastDay) || "",
      freezes: (state && state.freezes) || 0,
      frozen: false,
      changed: false
    };
    if (s.lastDay === todayKey) return s;         // já contou hoje

    if (!s.lastDay || !s.streak) s.streak = 1;    // primeira vez
    else if (s.lastDay === yesterdayKey) s.streak += 1;
    else { s.frozen = true; s.freezes += 1; }     // faltou: congela, não zera

    if (s.streak > s.bestStreak) s.bestStreak = s.streak;
    s.lastDay = todayKey;
    s.changed = true;
    return s;
  }

  return {
    MILESTONES: MILESTONES,
    milestoneFor: milestoneFor,
    isUnlocked: isUnlocked,
    need: need,
    nextUnlock: nextUnlock,
    unlockedBetween: unlockedBetween,
    series: series,
    trend: trend,
    touchStreak: touchStreak
  };
});
