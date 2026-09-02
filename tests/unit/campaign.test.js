/* A campanha: leitura dos capítulos, marcação dos alvos e validação.
 *
 * Os capítulos vão ser escritos à mão, um a um, ao longo de meses. Estes
 * testes existem para que um capítulo torto — alvo que não aparece no texto,
 * caractere impossível de digitar, id repetido — apareça no `npm test` em vez
 * de aparecer no meio de uma partida.
 */
const test = require("node:test");
const assert = require("node:assert");

const camp = require("../../js/core/campaign.js");
const { CAMPAIGN_CHAPTERS } = require("../../js/campaign-texts.js");
const { WORD_THEMES } = require("../../js/words.js");
const { WORD_EXAMPLES } = require("../../js/examples.js");

/* ---------------- Os capítulos de verdade ---------------- */

test("todos os capítulos passam na validação", () => {
  const r = camp.validate(CAMPAIGN_CHAPTERS, WORD_THEMES, WORD_EXAMPLES);
  assert.deepStrictEqual(
    r.errors, [],
    "problemas: " + r.errors.map(e => `${e.chapter} (${e.problem})`).join(" · ")
  );
  assert.ok(r.total >= 1, "a campanha precisa ter ao menos um capítulo");
});

test("todo alvo de todo capítulo tem ficha e aparece no texto", () => {
  CAMPAIGN_CHAPTERS.forEach(c => {
    const p = camp.prepare(c, WORD_THEMES, WORD_EXAMPLES);
    assert.strictEqual(p.targets.length, (c.targets || []).length,
      c.id + ": nem todo alvo foi encontrado no texto");
    p.targets.forEach(t => {
      assert.ok(t.info, c.id + ": alvo sem ficha — " + t.word);
      assert.ok(t.info.def && t.info.pt, c.id + ": ficha incompleta — " + t.word);
      assert.strictEqual(p.text.slice(t.start, t.end).toLowerCase(), t.shown.toLowerCase());
    });
  });
});

test("existe pelo menos um capítulo por nível declarado", () => {
  const porNivel = camp.levelSummary(CAMPAIGN_CHAPTERS, {});
  camp.LEVELS.forEach(l => {
    assert.ok(porNivel[l].total >= 1, "nível sem capítulo nenhum: " + l);
  });
});

/* ---------------- Normalização e digitação ---------------- */

test("texto colado de editor vira texto digitável", () => {
  const bruto = "“Hello,” she said — and then…\n\n  the  door   closed.";
  const t = camp.normalize(bruto);
  assert.strictEqual(t, '"Hello," she said - and then... the door closed.');
  for (const ch of t) {
    assert.ok(camp.TYPEABLE.test(ch), "caractere impossível de digitar: " + ch);
  }
});

test("a contagem de palavras não conta espaço à toa", () => {
  assert.strictEqual(camp.words("  one   two\nthree  "), 3);
  assert.strictEqual(camp.words(""), 0);
});

test("maiúscula é opcional, pontuação não é", () => {
  assert.strictEqual(camp.matches("I", "i"), true);
  assert.strictEqual(camp.matches("i", "I"), true);
  assert.strictEqual(camp.matches(",", ","), true);
  assert.strictEqual(camp.matches(",", "."), false, "vírgula não vale por ponto");
  assert.strictEqual(camp.matches(" ", " "), true);
  assert.strictEqual(camp.matches("a", "Enter"), false, "tecla com nome não é caractere");
  assert.strictEqual(camp.matches("a", ""), false);
});

/* ---------------- Palavras-alvo ---------------- */

test("o alvo casa com a flexão que aparece no texto", () => {
  const faixas = camp.targetRanges("She wakes up and the kettles boil.", ["wake", "kettle"]);
  assert.deepStrictEqual(faixas.map(f => f.text), ["wakes", "kettles"]);
  assert.deepStrictEqual(faixas.map(f => f.word), ["wake", "kettle"]);
});

test("a marcação pega a palavra inteira, não o pedaço", () => {
  // "wake" dentro de "awake" não pode marcar meia palavra
  const faixas = camp.targetRanges("I am awake and I wake early.", ["wake"]);
  assert.strictEqual(faixas.length, 1);
  assert.strictEqual(faixas[0].start, 17, "devia marcar o 'wake' solto, não o de 'awake'");
});

test("alvos que se sobrepõem não brigam pela mesma letra", () => {
  const faixas = camp.targetRanges("The lighthouse is old.", ["lighthouse", "light"]);
  assert.strictEqual(faixas.length, 1);
  assert.strictEqual(faixas[0].text, "lighthouse");
});

test("alvo ausente do texto simplesmente não vira faixa", () => {
  assert.deepStrictEqual(camp.targetRanges("Nothing here.", ["harbor"]), []);
  assert.deepStrictEqual(camp.targetRanges("Nothing here.", null), []);
});

test("a ficha do capítulo ganha da ficha do banco", () => {
  const capitulo = {
    id: "x-01",
    words: [["kettle", "n", "definição do capítulo, bem mais longa", "chaleira do capítulo", "A1", "The kettle sings."]]
  };
  const doCapitulo = camp.wordInfo("kettle", capitulo, WORD_THEMES, WORD_EXAMPLES);
  assert.match(doCapitulo.pt, /do capítulo/);

  const doBanco = camp.wordInfo("kettle", { id: "x-01" }, WORD_THEMES, WORD_EXAMPLES);
  assert.strictEqual(doBanco.pt, "chaleira");
  assert.ok(doBanco.ex, "a ficha do banco traz a frase de exemplo junto");

  assert.strictEqual(camp.wordInfo("naoexiste", null, WORD_THEMES, WORD_EXAMPLES), null);
});

test("prepare devolve o capítulo pronto para a tela", () => {
  const c = {
    id: "t-01", level: "A2", title: "Teste",
    text: "The kettle is hot.", targets: ["kettle"]
  };
  const p = camp.prepare(c, WORD_THEMES, WORD_EXAMPLES);
  assert.strictEqual(p.chars, 18);
  assert.strictEqual(p.words, 4);
  assert.strictEqual(p.targets.length, 1);
  assert.strictEqual(camp.targetAt(p, 4).word, "kettle", "a posição 4 cai dentro do alvo");
  assert.strictEqual(camp.targetAt(p, 0), null);
  assert.strictEqual(camp.targetAt(p, 10), null, "logo depois do alvo já é fora");
});

/* ---------------- Ordem e progresso ---------------- */

test("os capítulos vêm na ordem de estudo, do A1 ao C1", () => {
  const bagunca = [
    { id: "c1-01", level: "C1" }, { id: "a2-02", level: "A2" },
    { id: "a1-01", level: "A1" }, { id: "a2-01", level: "A2" },
    { id: "x-01", level: "Z9" }
  ];
  assert.deepStrictEqual(
    camp.ordered(bagunca).map(c => c.id),
    ["a1-01", "a2-01", "a2-02", "c1-01", "x-01"],
    "nível desconhecido vai para o fim em vez de sumir"
  );
});

test("o próximo capítulo é o primeiro não concluído", () => {
  const lista = [{ id: "a1-01", level: "A1" }, { id: "a2-01", level: "A2" }];
  assert.strictEqual(camp.nextChapter(lista, {}).id, "a1-01");
  assert.strictEqual(camp.nextChapter(lista, { "a1-01": true }).id, "a2-01");
  assert.strictEqual(camp.nextChapter(lista, { "a1-01": true, "a2-01": true }).id, "a1-01",
    "com tudo concluído, sugere reler o primeiro em vez de não sugerir nada");
  assert.strictEqual(camp.nextChapter([], {}), null);
});

test("o resumo por nível conta concluídos e total", () => {
  const lista = [
    { id: "a1-01", level: "A1" }, { id: "a1-02", level: "A1" }, { id: "b1-01", level: "B1" }
  ];
  const r = camp.levelSummary(lista, { "a1-01": true });
  assert.deepStrictEqual(r.A1, { total: 2, done: 1 });
  assert.deepStrictEqual(r.B1, { total: 1, done: 0 });
  assert.deepStrictEqual(r.C1, { total: 0, done: 0 });
});

/* ---------------- Validação: cada defeito com seu recado ---------------- */

test("validate acusa cada tipo de capítulo torto", () => {
  const texto = "The kettle is hot and the room is cozy. " +
                "I wait for the water and read a book by the window every single morning of the week.";
  const tortos = [
    { id: "OK-1", level: "Z9", title: "x", text: texto, targets: ["kettle", "cozy", "book"] },
    { id: "a1-01", level: "A1", title: "Sem alvo no texto", text: texto, targets: ["kettle", "cozy", "harbor"] },
    { id: "a1-01", level: "A1", title: "Id repetido", text: texto, targets: ["kettle", "cozy", "book"] },
    { id: "a1-02", level: "A1", title: "Curto", text: "Too short.", targets: ["kettle", "cozy", "book"] },
    { id: "a1-03", level: "A1", title: "Acento", text: texto + " Café e pão.", targets: ["kettle", "cozy", "book"] },
    { id: "a1-04", level: "A1", title: "Poucos alvos", text: texto, targets: ["kettle"] },
    { id: "a1-05", level: "A1", title: "Sem ficha", text: texto + " The window is open.", targets: ["kettle", "cozy", "window"] },
    { id: "a1-06", level: "A1", title: "Sem texto" }
  ];
  const problemas = camp.validate(tortos, WORD_THEMES, WORD_EXAMPLES)
    .errors.map(e => e.problem).join(" | ");

  assert.match(problemas, /id ausente ou fora do formato/);
  assert.match(problemas, /nível inválido/);
  assert.match(problemas, /título ausente/);
  assert.match(problemas, /id repetido/);
  assert.match(problemas, /não aparece no texto: harbor/);
  assert.match(problemas, /palavras \(esperado entre/);
  assert.match(problemas, /caracteres impossíveis de digitar/);
  assert.match(problemas, /palavras-alvo \(esperado entre/);
  assert.match(problemas, /alvo sem ficha: window/);
  assert.match(problemas, /texto ausente/);
});

test("validate aceita lista vazia e entrada estranha sem quebrar", () => {
  assert.deepStrictEqual(camp.validate([], WORD_THEMES, WORD_EXAMPLES).errors, []);
  assert.deepStrictEqual(camp.validate(null, WORD_THEMES, WORD_EXAMPLES).total, 0);
  const r = camp.validate([null, "texto solto"], WORD_THEMES, WORD_EXAMPLES);
  assert.ok(r.errors.length >= 2);
});

test("a tradução, quando vem, precisa ser texto", () => {
  const c = {
    id: "a1-09", level: "A1", title: "Tradução torta",
    text: "The kettle is hot and the room is cozy. I wait for the water and read a book by the window every morning.",
    targets: ["kettle", "cozy", "book"], pt: 42
  };
  const problemas = camp.validate([c], WORD_THEMES, WORD_EXAMPLES).errors.map(e => e.problem).join(" ");
  assert.match(problemas, /tradução precisa ser texto/);
});

/* ---------------- Caminhos defensivos ---------------- */

test("o núcleo aguenta capítulo pela metade sem quebrar", () => {
  assert.strictEqual(camp.normalize(null), "");
  assert.strictEqual(camp.normalize(undefined), "");
  assert.deepStrictEqual(camp.formsOf(""), []);
  assert.deepStrictEqual(camp.ordered(null), []);
  assert.strictEqual(camp.nextChapter(null, null), null);

  const p = camp.prepare({ id: "x", level: "A1", title: "T", text: "The kettle is hot." }, null, null);
  assert.deepStrictEqual(p.targets, [], "capítulo sem alvos ainda é capítulo");
  assert.strictEqual(p.pt, "", "sem tradução, campo vazio em vez de undefined");
  assert.strictEqual(camp.targetAt(p, 0), null);
  assert.strictEqual(camp.wordInfo("kettle", null, null, null), null, "sem banco, sem ficha");
});

test("nível fora da lista não some do resumo", () => {
  const r = camp.levelSummary([{ id: "z-01", level: "Z9" }], {});
  assert.deepStrictEqual(r.Z9, { total: 1, done: 0 });
  assert.deepStrictEqual(r.A1, { total: 0, done: 0 });
});

test("um capítulo sem lista de alvos é acusado, não ignorado", () => {
  const texto = "The kettle is hot and the room is cozy. " +
                "I wait for the water and read a book by the window every single morning of the week.";
  const problemas = camp.validate(
    [{ id: "a1-08", level: "A1", title: "Sem alvos", text: texto }],
    WORD_THEMES, WORD_EXAMPLES
  ).errors.map(e => e.problem).join(" ");
  assert.match(problemas, /palavras-alvo \(esperado entre/);
});
