/* Repetição espaçada.
 * É o que separa "joguinho de digitação" de "ferramenta de estudo": a palavra
 * volta pouco antes de você esquecer. */
const test = require("node:test");
const assert = require("node:assert");

const srs = require("../../js/core/srs.js");
const DAY = srs.DAY;
const T0 = Date.UTC(2026, 0, 1);

test("quality traduz o desempenho na palavra", () => {
  assert.strictEqual(srs.quality(true, 0), 5);
  assert.strictEqual(srs.quality(true, 1), 4);
  assert.strictEqual(srs.quality(true, 2), 3);
  assert.strictEqual(srs.quality(true, 9), 3);
  assert.strictEqual(srs.quality(false, 0), 0);
});

test("palavra nova nasce vencida, para ser revista logo", () => {
  const s = srs.fresh(T0);
  assert.strictEqual(s.reps, 0);
  assert.strictEqual(s.interval, 0);
  assert.strictEqual(s.ease, srs.EASE_START);
  assert.ok(srs.isDue(s, T0));
});

test("a escada de intervalos do SM-2: 1 dia, 3 dias, depois multiplica", () => {
  let s = srs.fresh(T0);
  s = srs.review(s, 5, T0);
  assert.strictEqual(s.interval, 1);
  assert.strictEqual(s.due, T0 + DAY);

  s = srs.review(s, 5, T0 + DAY);
  assert.strictEqual(s.interval, 3);

  const antes = s.interval, ease = s.ease;
  s = srs.review(s, 5, T0 + 4 * DAY);
  assert.strictEqual(s.interval, Math.round(antes * ease));
  assert.ok(s.interval >= 7, `terceiro intervalo curto demais: ${s.interval}`);
});

test("errar zera as repetições e derruba a facilidade", () => {
  let s = srs.fresh(T0);
  s = srs.review(s, 5, T0);
  s = srs.review(s, 5, T0 + DAY);
  const easeAntes = s.ease;

  s = srs.review(s, 0, T0 + 4 * DAY);
  assert.strictEqual(s.reps, 0);
  assert.strictEqual(s.interval, 1);
  assert.strictEqual(s.lapses, 1);
  assert.ok(s.ease < easeAntes, "a facilidade tinha que cair depois do erro");
});

test("a facilidade nunca sai dos limites, por mais que se erre ou acerte", () => {
  let s = srs.fresh(T0);
  for (let i = 0; i < 50; i++) s = srs.review(s, 0, T0 + i * DAY);
  assert.ok(s.ease >= srs.EASE_MIN, `ease abaixo do mínimo: ${s.ease}`);

  let t = srs.fresh(T0);
  for (let i = 0; i < 50; i++) t = srs.review(t, 5, T0 + i * DAY);
  assert.ok(t.ease <= srs.EASE_MAX, `ease acima do máximo: ${t.ease}`);
});

test("acertar com erro de tecla rende menos que acertar limpo", () => {
  let limpo = srs.fresh(T0), sujo = srs.fresh(T0);
  for (let i = 0; i < 4; i++) {
    limpo = srs.review(limpo, 5, T0 + i * DAY);
    sujo = srs.review(sujo, 3, T0 + i * DAY);
  }
  assert.ok(limpo.ease > sujo.ease);
  assert.ok(limpo.interval >= sujo.interval);
});

test("dominada exige repetições e intervalo longo", () => {
  let s = srs.fresh(T0);
  assert.strictEqual(srs.isMature(s), false);

  s = srs.review(s, 5, T0);
  assert.strictEqual(srs.isMature(s), false, "uma captura não domina a palavra");
  s = srs.review(s, 5, T0 + DAY);
  assert.strictEqual(srs.isMature(s), false);

  let t = T0 + 4 * DAY;
  for (let i = 0; i < 4 && !srs.isMature(s); i++) {
    s = srs.review(s, 5, t);
    t += s.interval * DAY;
  }
  assert.ok(srs.isMature(s), "depois de várias revisões certas tinha que amadurecer");
  assert.ok(s.reps >= srs.MATURE_REPS);
  assert.ok(s.interval >= srs.MATURE_DAYS);
});

test("isDue e daysUntilDue acompanham o relógio", () => {
  let s = srs.review(srs.fresh(T0), 5, T0);       // vence em 1 dia
  assert.strictEqual(srs.isDue(s, T0), false);
  assert.strictEqual(srs.isDue(s, T0 + DAY), true);
  assert.strictEqual(srs.daysUntilDue(s, T0), 1);
  assert.ok(srs.daysUntilDue(s, T0 + 3 * DAY) < 0, "atrasada devolve dias negativos");
});

test("sortForReview põe as atrasadas primeiro e as difíceis na frente", () => {
  const atrasada = { text: "atrasada", srs: { due: T0 - 5 * DAY, ease: 2.5 }, misses: 1 };
  const hoje = { text: "hoje", srs: { due: T0 - DAY, ease: 2.5 }, misses: 0 };
  const futura = { text: "futura", srs: { due: T0 + 10 * DAY, ease: 2.5 }, misses: 0 };
  const dificil = { text: "dificil", srs: { due: T0 - DAY, ease: 1.4 }, misses: 5 };

  const ordem = srs.sortForReview([futura, hoje, dificil, atrasada], T0).map(e => e.text);
  assert.strictEqual(ordem[0], "atrasada");
  assert.strictEqual(ordem[ordem.length - 1], "futura");
  assert.ok(ordem.indexOf("dificil") < ordem.indexOf("futura"));
});

test("review não muta o estado que recebeu", () => {
  const s = srs.fresh(T0);
  const copia = JSON.parse(JSON.stringify(s));
  srs.review(s, 5, T0);
  assert.deepStrictEqual(s, copia);
});
