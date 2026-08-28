/* Códigos de desafio e de resultado.
 * O código é o contrato entre dois jogadores: se ele decodificar diferente do
 * que foi codificado, os amigos jogam partidas diferentes achando que é a
 * mesma. Por isso a ida e volta é testada exaustivamente. */
const test = require("node:test");
const assert = require("node:assert");

const ch = require("../../js/core/challenge.js");
const rng = require("../../js/core/rng.js");
const { WORD_THEMES, WORD_LEVELS } = require("../../js/words.js");

const ORDER = { themes: Object.keys(WORD_THEMES), levels: WORD_LEVELS };

test("ida e volta preserva semente, modo, temas e níveis", () => {
  const original = {
    seed: 123456789,
    mode: "classic",
    themes: ["nature", "travel", "tech"],
    levels: ["B1", "B2"]
  };
  const code = ch.encode(original, ORDER);
  const back = ch.decode(code, ORDER);

  assert.strictEqual(back.seed, original.seed);
  assert.strictEqual(back.mode, original.mode);
  assert.deepStrictEqual(back.themes.sort(), original.themes.slice().sort());
  assert.deepStrictEqual(back.levels.sort(), original.levels.slice().sort());
});

test("ida e volta funciona para qualquer combinação sorteada", () => {
  const r = rng.create(2026);
  for (let i = 0; i < 300; i++) {
    const themes = ORDER.themes.filter(() => r() < 0.5);
    const levels = ORDER.levels.filter(() => r() < 0.5);
    if (!themes.length || !levels.length) continue;

    const original = {
      seed: r.int(0xFFFFFFFF),
      mode: r() < 0.5 ? "classic" : "zen",
      themes, levels
    };
    const back = ch.decode(ch.encode(original, ORDER), ORDER);
    assert.ok(back, "código gerado não pôde ser lido de volta");
    assert.strictEqual(back.seed, original.seed);
    assert.strictEqual(back.mode, original.mode);
    assert.deepStrictEqual(back.themes.sort(), themes.slice().sort());
    assert.deepStrictEqual(back.levels.sort(), levels.slice().sort());
  }
});

test("o código é curto o bastante para colar numa mensagem", () => {
  const code = ch.encode({ seed: 0xFFFFFFFF, mode: "zen", themes: ORDER.themes, levels: ORDER.levels }, ORDER);
  assert.ok(code.length <= 24, `código longo demais: ${code} (${code.length})`);
  assert.match(code, /^TC1-[0-9A-Z]+-[0-9A-Z]+$/);
});

test("o código não diferencia maiúscula de minúscula nem espaço em volta", () => {
  const code = ch.encode({ seed: 42, mode: "classic", themes: ["work"], levels: ["A2"] }, ORDER);
  assert.deepStrictEqual(ch.decode("  " + code.toLowerCase() + "  ", ORDER), ch.decode(code, ORDER));
});

test("código inválido devolve null em vez de explodir", () => {
  const ruins = ["", "   ", "abc", "TC1-", "TC1-XX", "TC2-ABC-DEF", "TC1-!!!-@@@",
                 "TC1-ABC-DEF-GHI", null, undefined, "TC1-0-0"];
  for (const ruim of ruins) {
    assert.strictEqual(ch.decode(ruim, ORDER), null, `deveria rejeitar: ${ruim}`);
    assert.strictEqual(ch.isValid(ruim, ORDER), false);
  }
});

test("resultado leva placar, palavras, ppm e apelido", () => {
  const challenge = { seed: 777, mode: "classic", themes: ["food"], levels: ["B1"] };
  const code = ch.encodeResult({ challenge, name: "Ana", score: 1234, learned: 21, wpm: 47 }, ORDER);
  const back = ch.decodeResult(code, ORDER);

  assert.strictEqual(back.score, 1234);
  assert.strictEqual(back.learned, 21);
  assert.strictEqual(back.wpm, 47);
  assert.strictEqual(back.name, "ANA");
  assert.strictEqual(back.code, ch.encode(challenge, ORDER));
  assert.strictEqual(back.challenge.seed, 777);
});

test("apelido é higienizado: sem hífen, que é o separador do código", () => {
  assert.strictEqual(ch.sanitizeName("João-Pedro"), "JO_O_PEDRO");
  assert.strictEqual(ch.sanitizeName("  ana  "), "ANA");
  assert.strictEqual(ch.sanitizeName(""), "AMIGO");
  assert.strictEqual(ch.sanitizeName("um nome muito muito longo").length, 12);

  const challenge = { seed: 1, mode: "classic", themes: ["food"], levels: ["B1"] };
  const code = ch.encodeResult({ challenge, name: "Zé-Ninguém", score: 10, learned: 1, wpm: 1 }, ORDER);
  assert.strictEqual(code.split("-").length, 7, "o apelido não pode criar campos extras");
  assert.ok(ch.decodeResult(code, ORDER));
});

test("código de resultado inválido devolve null", () => {
  const ruins = ["TC1R-ABC", "TC1-ABC-DEF", "TC1R-ABC-DEF-GHI-JKL-MNO-!!!", "", null];
  for (const ruim of ruins) assert.strictEqual(ch.decodeResult(ruim, ORDER), null, `deveria rejeitar: ${ruim}`);
});

test("desafio do dia é o mesmo para todos e muda a cada dia", () => {
  const hoje = ch.daily(new Date(2026, 7, 27), ORDER, rng.hashString);
  const mesmoDia = ch.daily(new Date(2026, 7, 27, 23, 59), ORDER, rng.hashString);
  const outroDia = ch.daily(new Date(2026, 7, 28), ORDER, rng.hashString);

  assert.strictEqual(hoje.seed, mesmoDia.seed);
  assert.notStrictEqual(hoje.seed, outroDia.seed);
  assert.strictEqual(hoje.day, "2026-08-27");
  assert.strictEqual(hoje.mode, "classic");
  assert.deepStrictEqual(hoje.themes, ORDER.themes);
  assert.deepStrictEqual(hoje.levels, ORDER.levels);
});

test("dayKey usa o fuso local e enche com zero", () => {
  assert.strictEqual(ch.dayKey(new Date(2026, 0, 5)), "2026-01-05");
  assert.strictEqual(ch.dayKey(new Date(2026, 11, 31)), "2026-12-31");
});

test("o texto de compartilhar traz os dois códigos", () => {
  const challenge = ch.daily(new Date(2026, 7, 27), ORDER, rng.hashString);
  const texto = ch.shareText({
    challenge, name: "ANA", score: 900, learned: 18, wpm: 40, accuracy: 96.5
  }, ORDER);

  assert.match(texto, /Type & Chill/);
  assert.match(texto, /900 pontos/);
  assert.match(texto, /96\.5% de precisão/);
  assert.ok(texto.includes(ch.encode(challenge, ORDER)), "faltou o código do desafio");
  assert.match(texto, /TC1R-/, "faltou o código do resultado");
});
