/* Marcos, desbloqueios e a curva de evolução — js/core/progress.js.
 *
 * O metajogo é a parte mais fácil de quebrar sem ninguém perceber: um marco
 * errado só aparece semanas depois, quando o jogador chega nele.
 */
const test = require("node:test");
const assert = require("node:assert");

const p = require("../../js/core/progress.js");
const VISUAIS = { ember: 1, lofi: 1, rain: 1, dawn: 1, aurora: 1 };

test("os dois primeiros climas nascem abertos", () => {
  assert.ok(p.isUnlocked("ember", 0, "ember"));
  assert.ok(p.isUnlocked("lofi", 0, "ember"), "quem começa precisa ter o que escolher");
  assert.ok(!p.isUnlocked("rain", 0, "ember"));
});

test("o clima em uso nunca fecha", () => {
  // quem já jogava antes dos marcos existirem não pode perder o próprio tema
  assert.ok(p.isUnlocked("dawn", 0, "dawn"));
});

test("marcos abrem exatamente na palavra do número", () => {
  assert.ok(!p.isUnlocked("rain", 149, "ember"));
  assert.ok(p.isUnlocked("rain", 150, "ember"));
});

test("nextUnlock aponta o próximo marco e o que falta", () => {
  assert.deepStrictEqual(p.nextUnlock(100, VISUAIS), { key: "rain", at: 150, remaining: 50 });
  assert.strictEqual(p.nextUnlock(5000, VISUAIS), null, "tudo aberto não tem próximo");
});

test("nextUnlock ignora clima que não existe mais no jogo", () => {
  const semChuva = { ember: 1, lofi: 1, dawn: 1, aurora: 1 };
  assert.strictEqual(p.nextUnlock(100, semChuva).key, "dawn");
});

test("unlockedBetween diz o que abriu durante a partida", () => {
  assert.deepStrictEqual(p.unlockedBetween(140, 160), ["rain"]);
  assert.deepStrictEqual(p.unlockedBetween(160, 170), []);
  assert.deepStrictEqual(p.unlockedBetween(100, 500), ["rain", "dawn"]);
});

test("a ofensiva congela em vez de zerar", () => {
  // é a regra do documento: faltar não pode apagar semanas de hábito
  const pulou = p.touchStreak({ streak: 12, bestStreak: 12, lastDay: "2026-08-20" }, "2026-09-01", "2026-08-31");
  assert.strictEqual(pulou.streak, 12);
  assert.strictEqual(pulou.frozen, true);
  assert.strictEqual(pulou.freezes, 1);

  const seguido = p.touchStreak({ streak: 12, bestStreak: 12, lastDay: "2026-08-31" }, "2026-09-01", "2026-08-31");
  assert.strictEqual(seguido.streak, 13);
  assert.strictEqual(seguido.frozen, false);

  const mesmoDia = p.touchStreak({ streak: 3, lastDay: "2026-09-01" }, "2026-09-01", "2026-08-31");
  assert.strictEqual(mesmoDia.changed, false, "jogar de novo no mesmo dia não conta duas");
});

test("primeira partida da vida começa a ofensiva em 1", () => {
  const novo = p.touchStreak({}, "2026-09-01", "2026-08-31");
  assert.strictEqual(novo.streak, 1);
  assert.strictEqual(novo.bestStreak, 1);
});

test("a série do gráfico descarta sessão sem digitação", () => {
  const hist = [
    { at: 1, wpm: 30, accuracy: 90, chars: 40 },
    { at: 2, wpm: 0, accuracy: 100, chars: 0 },     // abriu e fechou
    { at: 3, wpm: 34, accuracy: 93, chars: 60 }
  ];
  const s = p.series(hist);
  assert.strictEqual(s.length, 2);
  assert.deepStrictEqual(s.map((r) => r.wpm), [30, 34]);
});

test("series corta pelas mais recentes", () => {
  const hist = [];
  for (let i = 0; i < 50; i++) hist.push({ at: i, wpm: i + 1, accuracy: 90, chars: 10 });
  const s = p.series(hist, 30);
  assert.strictEqual(s.length, 30);
  assert.strictEqual(s[s.length - 1].wpm, 50, "a última sessão precisa estar na ponta");
});

test("trend compara as últimas com as anteriores", () => {
  const hist = [];
  for (let i = 0; i < 10; i++) hist.push({ at: i, wpm: i < 5 ? 20 : 30, accuracy: 95, chars: 10 });
  const t = p.trend(hist, 5);
  assert.strictEqual(t.wpm, 30);
  assert.strictEqual(t.delta, 10, "melhorou dez palavras por minuto");
  assert.strictEqual(t.sessions, 10);
});

test("trend não inventa tendência com uma sessão só", () => {
  const t = p.trend([{ at: 1, wpm: 40, accuracy: 99, chars: 20 }], 5);
  assert.strictEqual(t.delta, 0);
});
