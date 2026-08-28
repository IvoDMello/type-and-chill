/* Type & Chill — desafios entre amigos, sem servidor.
 *
 * Um desafio é só uma semente somada às regras da partida. Quem digita o mesmo
 * código recebe as mesmas palavras, na mesma ordem, com as mesmas velocidades —
 * então dá pra comparar placar de forma justa sem back-end nenhum.
 *
 *   Código do desafio   TC1-9XK2Q-1F3A
 *   Código do resultado TC1R-9XK2Q-1F3A-8T-K-1H-ANA
 *
 * O código carrega modo, temas e níveis empacotados em bits, para caber numa
 * mensagem de WhatsApp sem virar um parágrafo.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TCChallenge = api;
})(typeof window !== "undefined" ? window : null, function () {
  "use strict";

  var PREFIX = "TC1";
  var RESULT_PREFIX = "TC1R";
  var MODES = ["classic", "zen"];          // prática é pessoal, não vira desafio
  var MAX_NAME = 12;

  function b36(n) { return (n >>> 0).toString(36).toUpperCase(); }
  function unb36(s) {
    if (!/^[0-9A-Z]+$/i.test(s)) return NaN;
    var n = parseInt(s, 36);
    return isFinite(n) ? n : NaN;
  }
  function maskOf(selected, order) {
    var mask = 0;
    for (var i = 0; i < order.length; i++) {
      if (!selected || selected.indexOf(order[i]) >= 0) mask |= (1 << i);
    }
    return mask;
  }
  function fromMask(mask, order) {
    var out = [];
    for (var i = 0; i < order.length; i++) if (mask & (1 << i)) out.push(order[i]);
    return out;
  }

  function sanitizeName(name) {
    var s = String(name || "").trim().replace(/[^A-Za-z0-9_]/g, "_").slice(0, MAX_NAME);
    return s.toUpperCase() || "AMIGO";
  }

  /* ---------- Código do desafio ---------- */

  function encode(challenge, order) {
    var modeIdx = Math.max(0, MODES.indexOf(challenge.mode || "classic"));
    var levels = maskOf(challenge.levels, order.levels);
    var themes = maskOf(challenge.themes, order.themes);
    // modo (2 bits) | níveis (4 bits) | temas (o resto)
    var pack = modeIdx + levels * 4 + themes * 64;
    return PREFIX + "-" + b36(challenge.seed) + "-" + b36(pack);
  }

  function decode(code, order) {
    var parts = String(code || "").trim().toUpperCase().split("-");
    if (parts.length !== 3 || parts[0] !== PREFIX) return null;
    var seed = unb36(parts[1]), pack = unb36(parts[2]);
    if (!isFinite(seed) || !isFinite(pack) || pack < 0) return null;

    var modeIdx = pack % 4;
    var levelsMask = Math.floor(pack / 4) % 16;
    var themesMask = Math.floor(pack / 64);
    if (modeIdx >= MODES.length) return null;

    var levels = fromMask(levelsMask, order.levels);
    var themes = fromMask(themesMask, order.themes);
    if (!levels.length || !themes.length) return null;

    return { seed: seed >>> 0, mode: MODES[modeIdx], levels: levels, themes: themes };
  }

  function isValid(code, order) { return decode(code, order) !== null; }

  /* ---------- Código do resultado ---------- */

  function encodeResult(result, order) {
    var base = encode(result.challenge, order).slice(PREFIX.length + 1);
    return [
      RESULT_PREFIX, base,
      b36(Math.max(0, result.score | 0)),
      b36(Math.max(0, result.learned | 0)),
      b36(Math.max(0, result.wpm | 0)),
      sanitizeName(result.name)
    ].join("-");
  }

  function decodeResult(code, order) {
    var parts = String(code || "").trim().toUpperCase().split("-");
    if (parts.length !== 7 || parts[0] !== RESULT_PREFIX) return null;
    var challenge = decode(PREFIX + "-" + parts[1] + "-" + parts[2], order);
    if (!challenge) return null;
    var score = unb36(parts[3]), learned = unb36(parts[4]), wpm = unb36(parts[5]);
    if (!isFinite(score) || !isFinite(learned) || !isFinite(wpm)) return null;
    if (!/^[A-Z0-9_]{1,12}$/.test(parts[6])) return null;
    return {
      challenge: challenge, code: encode(challenge, order),
      score: score, learned: learned, wpm: wpm, name: parts[6]
    };
  }

  /* ---------- Desafio do dia ---------- */

  function dayKey(date) {
    var d = date ? new Date(date) : new Date();
    var m = String(d.getMonth() + 1), day = String(d.getDate());
    return d.getFullYear() + "-" + (m.length < 2 ? "0" + m : m) + "-" + (day.length < 2 ? "0" + day : day);
  }

  /* Todo mundo joga a mesma partida no mesmo dia. A semente vem da data, então
   * não precisa combinar nada com ninguém. */
  function daily(date, order, hashString) {
    return {
      seed: hashString("type-and-chill-" + dayKey(date)),
      mode: "classic",
      themes: order.themes.slice(),
      levels: order.levels.slice(),
      daily: true,
      day: dayKey(date)
    };
  }

  /* ---------- Texto para colar no grupo ---------- */

  function shareText(result, order) {
    var c = result.challenge;
    var lines = [];
    lines.push("Type & Chill " + (c.daily ? "— Desafio do dia " + c.day : "— Desafio"));
    lines.push("");
    lines.push("🏆 " + result.score + " pontos");
    lines.push("📚 " + result.learned + " palavras");
    lines.push("⌨️ " + result.wpm + " ppm · " + result.accuracy + "% de precisão");
    lines.push("");
    lines.push("Joga a mesma partida: " + encode(c, order));
    lines.push("Meu resultado: " + encodeResult(result, order));
    return lines.join("\n");
  }

  return {
    PREFIX: PREFIX, RESULT_PREFIX: RESULT_PREFIX, MODES: MODES,
    sanitizeName: sanitizeName,
    encode: encode, decode: decode, isValid: isValid,
    encodeResult: encodeResult, decodeResult: decodeResult,
    dayKey: dayKey, daily: daily, shareText: shareText
  };
});
