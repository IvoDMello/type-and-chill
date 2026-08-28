/* Aleatoriedade determinística.
 * É o que sustenta os desafios: mesmo código, mesma partida. Se estes testes
 * quebrarem, dois amigos com o mesmo código jogam partidas diferentes. */
const test = require("node:test");
const assert = require("node:assert");

const rng = require("../../js/core/rng.js");
const wordbank = require("../../js/core/wordbank.js");
const { WORD_THEMES } = require("../../js/words.js");

test("a mesma semente produz exatamente a mesma sequência", () => {
  const a = rng.create(12345), b = rng.create(12345);
  const seqA = [], seqB = [];
  for (let i = 0; i < 200; i++) { seqA.push(a()); seqB.push(b()); }
  assert.deepStrictEqual(seqA, seqB);
});

test("sementes diferentes produzem sequências diferentes", () => {
  const a = rng.create(1), b = rng.create(2);
  const seqA = [], seqB = [];
  for (let i = 0; i < 50; i++) { seqA.push(a()); seqB.push(b()); }
  assert.notDeepStrictEqual(seqA, seqB);
});

test("os valores ficam no intervalo [0, 1)", () => {
  const r = rng.create(99);
  for (let i = 0; i < 5000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `valor fora do intervalo: ${v}`);
  }
});

test("a distribuição não é enviesada de forma grosseira", () => {
  const r = rng.create(2024);
  const baldes = new Array(10).fill(0);
  const n = 100000;
  for (let i = 0; i < n; i++) baldes[Math.floor(r() * 10)]++;
  for (const b of baldes) {
    assert.ok(Math.abs(b - n / 10) < n / 40, `balde muito desbalanceado: ${b}`);
  }
});

test("int, range e pick respeitam os limites", () => {
  const r = rng.create(7);
  for (let i = 0; i < 1000; i++) {
    const n = r.int(5);
    assert.ok(Number.isInteger(n) && n >= 0 && n < 5);
    const f = r.range(10, 20);
    assert.ok(f >= 10 && f < 20);
    assert.ok(["a", "b", "c"].includes(r.pick(["a", "b", "c"])));
  }
});

test("hashString é estável e sensível a mudanças pequenas", () => {
  assert.strictEqual(rng.hashString("type-and-chill"), rng.hashString("type-and-chill"));
  assert.notStrictEqual(rng.hashString("2026-08-27"), rng.hashString("2026-08-28"));
  assert.ok(rng.hashString("qualquer") >= 0);
});

test("shuffle preserva os elementos e não altera o original", () => {
  const original = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const copia = original.slice();
  const out = rng.shuffle(original, rng.create(3));
  assert.deepStrictEqual(original, copia, "shuffle não pode mutar a entrada");
  assert.strictEqual(out.length, original.length);
  assert.deepStrictEqual(out.slice().sort((a, b) => a - b), copia);
});

test("shuffle é determinístico por semente", () => {
  const itens = Array.from({ length: 50 }, (_, i) => i);
  assert.deepStrictEqual(
    rng.shuffle(itens, rng.create(42)),
    rng.shuffle(itens, rng.create(42))
  );
});

test("buildDeck não repete inicial dentro da janela visível", () => {
  const pool = wordbank.buildPool(WORD_THEMES, null);
  const deck = rng.buildDeck(pool, rng.create(1234), 6);
  assert.strictEqual(deck.length, pool.length);

  let colisoes = 0;
  for (let i = 0; i < deck.length; i++) {
    for (let j = Math.max(0, i - 5); j < i; j++) {
      if (deck[i].text[0] === deck[j].text[0]) colisoes++;
    }
  }
  assert.strictEqual(colisoes, 0, `${colisoes} palavras com inicial repetida na mesma janela`);
});

test("buildDeck é determinístico e mantém todas as palavras", () => {
  const pool = wordbank.buildPool(WORD_THEMES, { themes: ["nature", "travel"] });
  const a = rng.buildDeck(pool, rng.create(88), 6);
  const b = rng.buildDeck(pool, rng.create(88), 6);
  assert.deepStrictEqual(a.map(w => w.text), b.map(w => w.text));
  assert.deepStrictEqual(
    a.map(w => w.text).sort(),
    pool.map(w => w.text).sort()
  );
});

test("buildDeck não trava com um banco pequeno demais para a janela", () => {
  const pool = [{ text: "apple" }, { text: "ant" }, { text: "arc" }];
  const deck = rng.buildDeck(pool, rng.create(5), 6);
  assert.strictEqual(deck.length, 3);
});
