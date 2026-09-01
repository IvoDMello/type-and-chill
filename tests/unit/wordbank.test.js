/* Integridade do banco de palavras.
 * Estes testes existem porque duas regras aqui não são estéticas:
 * palavra com espaço ou acento é impossível de digitar, e palavra repetida
 * entre temas faz o caderno sobrescrever a definição da primeira. */
const test = require("node:test");
const assert = require("node:assert");

const { WORD_THEMES, WORD_LEVELS, WORD_GROUPS } = require("../../js/words.js");
const { WORD_EXAMPLES } = require("../../js/examples.js");
const wordbank = require("../../js/core/wordbank.js");

test("banco de palavras passa na validação sem nenhum erro", () => {
  const report = wordbank.validate(WORD_THEMES, WORD_LEVELS, WORD_GROUPS);
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

test("todo tema tem label, grupo e palavras suficientes para uma partida", () => {
  for (const key of Object.keys(WORD_THEMES)) {
    const theme = WORD_THEMES[key];
    assert.ok(theme.label && theme.label.trim(), `tema ${key} sem label`);
    assert.ok(WORD_GROUPS[theme.group], `tema ${key} aponta para grupo inexistente: ${theme.group}`);
    assert.ok(theme.words.length >= 20, `tema ${key} tem só ${theme.words.length} palavras`);
  }
});

test("groupsOf separa os temas em famílias sem perder nenhum", () => {
  const groups = wordbank.groupsOf(WORD_THEMES, WORD_GROUPS);
  const listed = groups.flatMap(g => g.themes);
  assert.deepStrictEqual(listed.slice().sort(), Object.keys(WORD_THEMES).sort());
  assert.strictEqual(listed.length, new Set(listed).size, "tema repetido em mais de uma família");
  assert.ok(groups.every(g => g.label && g.themes.length), "família vazia ou sem nome");

  // tema com grupo desconhecido não some da tela: cai numa família "Outros"
  const solto = wordbank.groupsOf(
    { nature: WORD_THEMES.nature, perdido: { label: "X", group: "nao-existe", words: [] } },
    WORD_GROUPS
  );
  const outros = solto.find(g => g.themes.indexOf("perdido") >= 0);
  assert.ok(outros, "tema com grupo inválido sumiu do agrupamento");
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

/* ---------- Frases de exemplo ----------
 * "Frase de exemplo é obrigatória — é o contexto que faz a palavra grudar."
 * Uma frase que não usa a própria palavra ensina outra coisa, e uma palavra
 * sem frase entra muda no caderno e no cartão do Anki. */

test("toda palavra do banco tem frase de exemplo", () => {
  const r = wordbank.validate(WORD_THEMES, WORD_LEVELS, WORD_GROUPS, WORD_EXAMPLES);
  assert.deepStrictEqual(
    r.examples.missing, [],
    "sem frase de exemplo: " + r.examples.missing.join(", ")
  );
  assert.strictEqual(r.examples.coverage, 100);
});

test("as frases citam a própria palavra e passam na validação", () => {
  const r = wordbank.validate(WORD_THEMES, WORD_LEVELS, WORD_GROUPS, WORD_EXAMPLES);
  assert.deepStrictEqual(
    r.errors, [],
    "problemas: " + r.errors.map(e => `${e.word} (${e.problem})`).join(" · ")
  );
});

test("não sobra frase para palavra que saiu do banco", () => {
  const nobanco = {};
  wordbank.allWords(WORD_THEMES).forEach(w => { nobanco[w.text] = true; });
  const orfas = Object.keys(WORD_EXAMPLES).filter(w => !nobanco[w]);
  assert.deepStrictEqual(orfas, [], "frases órfãs: " + orfas.join(", "));
});

test("mentions aceita flexão regular e recusa palavra parecida", () => {
  assert.ok(wordbank.mentions("She walked home alone.", "walk"));
  assert.ok(wordbank.mentions("He studies at night.", "study"));
  assert.ok(wordbank.mentions("They are planning a trip.", "plan"));
  assert.ok(!wordbank.mentions("The plants grew fast.", "plan"), "planta não é plano");
  assert.ok(!wordbank.mentions("Nothing to see here.", "harbor"));
});

test("buildPool entrega a frase junto com a palavra", () => {
  const pool = wordbank.buildPool(WORD_THEMES, { themes: ["everyday"] }, WORD_EXAMPLES);
  assert.ok(pool.length > 0);
  pool.forEach(w => assert.ok(w.ex && w.ex.length > 10, w.text + " veio sem frase"));
});
