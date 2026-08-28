/* Integridade do banco de palavras.
 * Estes testes existem porque duas regras aqui não são estéticas:
 * palavra com espaço ou acento é impossível de digitar, e palavra repetida
 * entre temas faz o caderno sobrescrever a definição da primeira. */
const test = require("node:test");
const assert = require("node:assert");

const { WORD_THEMES, WORD_LEVELS } = require("../../js/words.js");
const wordbank = require("../../js/core/wordbank.js");

test("banco de palavras passa na validação sem nenhum erro", () => {
  const report = wordbank.validate(WORD_THEMES, WORD_LEVELS);
  assert.deepStrictEqual(
    report.errors, [],
    "problemas encontrados:\n" + report.errors.map(e => `  ${e.theme} | ${e.word} | ${e.problem}`).join("\n")
  );
});

test("nenhuma palavra se repete entre temas", () => {
  const report = wordbank.validate(WORD_THEMES, WORD_LEVELS);
  assert.deepStrictEqual(
    report.duplicates, [],
    "repetidas:\n" + report.duplicates.map(d => `  ${d.word} (${d.themes.join(" + ")})`).join("\n")
  );
  assert.strictEqual(report.unique, report.total);
});

test("toda palavra é digitável: só a-z minúsculo", () => {
  for (const key of Object.keys(WORD_THEMES)) {
    for (const entry of WORD_THEMES[key].words) {
      assert.match(entry[0], /^[a-z]+$/, `${key}: "${entry[0]}" não é digitável`);
    }
  }
});

test("o banco tem tamanho e distribuição de níveis utilizáveis", () => {
  const report = wordbank.validate(WORD_THEMES, WORD_LEVELS);
  assert.ok(report.total >= 400, `esperava 400+ palavras, tem ${report.total}`);
  for (const lvl of WORD_LEVELS) {
    assert.ok(report.byLevel[lvl] >= 40, `nível ${lvl} tem só ${report.byLevel[lvl] || 0} palavras`);
  }
});

test("todo tema tem label e palavras suficientes para uma partida", () => {
  for (const key of Object.keys(WORD_THEMES)) {
    const theme = WORD_THEMES[key];
    assert.ok(theme.label && theme.label.trim(), `tema ${key} sem label`);
    assert.ok(theme.words.length >= 20, `tema ${key} tem só ${theme.words.length} palavras`);
  }
});

test("buildPool respeita os filtros de tema e de nível", () => {
  const onlyA2 = wordbank.buildPool(WORD_THEMES, { levels: ["A2"] });
  assert.ok(onlyA2.length > 0);
  assert.ok(onlyA2.every(w => w.lvl === "A2"));

  const onlyNature = wordbank.buildPool(WORD_THEMES, { themes: ["nature"] });
  assert.ok(onlyNature.every(w => w.theme === "nature"));
  assert.strictEqual(onlyNature.length, WORD_THEMES.nature.words.length);

  const both = wordbank.buildPool(WORD_THEMES, { themes: ["nature"], levels: ["C1"] });
  assert.ok(both.every(w => w.theme === "nature" && w.lvl === "C1"));

  const all = wordbank.buildPool(WORD_THEMES, null);
  assert.strictEqual(all.length, wordbank.validate(WORD_THEMES, WORD_LEVELS).total);
});

test("validate aponta os problemas quando eles existem", () => {
  const quebrado = {
    ruim: {
      label: "Ruim",
      words: [
        ["off the beaten path", "adj", "far from the usual tourist places", "fora do circuito", "C1"],
        ["ok", "xx", "curta", "", "Z9"],
        ["ok", "n", "a duplicate entry used only in this test", "duplicada", "A2"]
      ]
    }
  };
  const report = wordbank.validate(quebrado, ["A2", "B1", "B2", "C1"]);
  const problemas = report.errors.map(e => e.problem).join(" | ");
  assert.match(problemas, /só a-z minúsculo/);
  assert.match(problemas, /classe inválida/);
  assert.match(problemas, /nível inválido/);
  assert.match(problemas, /tradução em português ausente/);
  assert.strictEqual(report.duplicates.length, 1);
});
