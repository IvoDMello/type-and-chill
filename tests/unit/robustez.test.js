/* Os caminhos defensivos — o que acontece quando falta alguma coisa.
 *
 * Cada módulo do jogo aceita entrada incompleta de propósito: caderno gravado
 * por uma versão antiga, localStorage bloqueado, o módulo de progresso que não
 * carregou, a palavra sem agendamento. Esses ramos nunca aparecem numa partida
 * normal, e é justamente por isso que quebram sem ninguém ver.
 */
const test = require("node:test");
const assert = require("node:assert");
const Module = require("node:module");

const srs = require("../../js/core/srs.js");
const scoring = require("../../js/core/scoring.js");
const wordbank = require("../../js/core/wordbank.js");
const progress = require("../../js/core/progress.js");
const rng = require("../../js/core/rng.js");
const factory = require("../../js/storage.js");

const DAY = srs.DAY;
const T0 = new Date(2026, 0, 15, 12, 0, 0).getTime();

/* ---------------- SM-2 e fragilidade ---------------- */

test("srs aceita estado ausente sem quebrar", () => {
  const s = srs.review(null, 5, T0);
  assert.strictEqual(s.reps, 1);
  assert.strictEqual(s.interval, 1);
  assert.strictEqual(s.ease, srs.EASE_START + 0.1);

  assert.strictEqual(srs.isDue(null, T0), true, "sem agendamento, a palavra vence agora");
  assert.strictEqual(srs.daysUntilDue(null, T0), 0);
  assert.strictEqual(srs.isMature(null), false);
  assert.strictEqual(srs.fragility(null, T0), 0);
});

test("srs: a facilidade não passa dos limites", () => {
  let s = srs.fresh(T0);
  for (let i = 0; i < 30; i++) s = srs.review(s, 5, T0);
  assert.ok(s.ease <= srs.EASE_MAX, "acertar sempre não deixa a facilidade explodir");

  let f = srs.fresh(T0);
  for (let i = 0; i < 30; i++) f = srs.review(f, 0, T0);
  assert.ok(f.ease >= srs.EASE_MIN, "errar sempre não deixa a facilidade zerar");
  assert.strictEqual(f.interval, 1);
});

test("srs: o terceiro acerto passa a multiplicar o intervalo", () => {
  let s = srs.review(srs.fresh(T0), 5, T0);          // 1 dia
  s = srs.review(s, 5, T0);                          // 3 dias
  assert.strictEqual(s.interval, 3);
  s = srs.review(s, 5, T0);                          // 3 × facilidade
  assert.ok(s.interval > 3);
});

test("srs: nota por desempenho cobre os quatro casos", () => {
  assert.strictEqual(srs.quality(true, 0), 5);
  assert.strictEqual(srs.quality(true, 1), 4);
  assert.strictEqual(srs.quality(true, 5), 3);
  assert.strictEqual(srs.quality(false, 0), 0);
});

test("fragilidade lida com entrada pela metade", () => {
  // sem srs, sem hits, sem nada: não pode virar NaN nem número negativo
  const f = srs.fragility({ text: "x" }, T0);
  assert.ok(f >= 0 && Number.isFinite(f));

  const semHits = srs.fragility({ misses: 1, typos: 4, hits: 0, srs: srs.fresh(T0) }, T0);
  assert.ok(Number.isFinite(semHits), "typos sem acerto nenhum não pode dividir por zero");
});

test("a fila de revisão ordena mesmo com entradas sem agendamento", () => {
  const semSrs = { text: "sem", misses: 2 };
  const futura = { text: "futura", srs: { due: T0 + 5 * DAY, ease: 2.5 }, misses: 0 };
  const ordem = srs.sortForReview([futura, semSrs], T0).map(e => e.text);
  assert.deepStrictEqual(ordem, ["sem", "futura"]);
});

/* ---------------- Pontuação ---------------- */

test("pontuação nunca pune mais que deixar cair", () => {
  assert.strictEqual(scoring.capturePoints(1, 3, 50), 1, "o piso é um ponto");
  assert.ok(scoring.capturePoints(5, 8, 0) > scoring.capturePoints(1, 8, 0));
});

test("ritmo e nível respeitam os limites do modo", () => {
  assert.strictEqual(scoring.levelFor(0), 1);
  assert.strictEqual(scoring.levelFor(1000), scoring.MAX_LEVEL, "o nível tem teto");
  assert.strictEqual(scoring.isLevelUp(0), false, "começar não é subir de nível");
  assert.ok(scoring.spawnInterval(99, "classic") >= 950, "o ritmo tem piso");
  assert.strictEqual(scoring.spawnInterval(3, "zen"), 2400);
  assert.strictEqual(scoring.maxOnScreen("zen"), 5);
  assert.strictEqual(scoring.maxOnScreen("classic"), 6);
  assert.strictEqual(scoring.isQueueMode("zen"), false);
});

test("PPM e precisão devolvem zero em vez de dividir por zero", () => {
  assert.strictEqual(scoring.wpm(100, 0), 0);
  assert.strictEqual(scoring.wpm(100, -5), 0);
  assert.strictEqual(scoring.accuracy(0, 0), 100, "quem não digitou nada não errou nada");
  assert.strictEqual(scoring.accuracy(9, 10), 90);
});

test("o título do fim muda com o desempenho", () => {
  assert.strictEqual(scoring.runTitle("practice", 0), "Revisão concluída");
  assert.strictEqual(scoring.runTitle("deck", 0), "Deck limpo");
  assert.strictEqual(scoring.runTitle("zen", 0), "Sessão encerrada");
  assert.notStrictEqual(scoring.runTitle("classic", 30), scoring.runTitle("classic", 0));
  assert.notStrictEqual(scoring.runTitle("classic", 15), scoring.runTitle("classic", 5));
});

/* ---------------- Banco de palavras ---------------- */

test("validate acusa cada tipo de defeito do banco", () => {
  const ruim = {
    semLabel: { label: "", group: "nada", words: [] },
    ok: {
      label: "Tema", group: "daily", words: [
        ["boa", "n", "uma definição comprida o suficiente", "boa", "A2", "This is a boa sentence."],
        ["Ruim", "x", "curta", "", "Z9"],
        ["boa", "n", "outra definição comprida o suficiente", "repetida", "A2"],
        ["curta", "n", "uma definição comprida o suficiente", "curta", "A2", "too short"],
        ["fora", "n", "uma definição comprida o suficiente", "fora", "A2", "esta frase não cita a palavra"],
        ["tamanho", "n", "uma definição comprida"]
      ]
    }
  };
  const r = wordbank.validate(ruim, ["A2", "B1"], { daily: { label: "Dia" } });
  const problemas = r.errors.map(e => e.problem).join(" | ");

  assert.match(problemas, /tema sem label/);
  assert.match(problemas, /grupo inválido/);
  assert.match(problemas, /tema sem palavras/);
  assert.match(problemas, /só a-z minúsculo/);
  assert.match(problemas, /classe inválida/);
  assert.match(problemas, /definição em inglês ausente ou curta/);
  assert.match(problemas, /tradução em português ausente/);
  assert.match(problemas, /nível inválido/);
  assert.match(problemas, /esperava 5 ou 6 campos/);
  assert.match(problemas, /frase de exemplo curta demais/);
  assert.match(problemas, /não usa a palavra/);
  assert.strictEqual(r.duplicates.length, 1, "a palavra repetida tem que ser apontada");
});

test("a frase pode vir no sexto campo, e ela ganha do mapa", () => {
  const entrada = ["harbor", "n", "a place for ships", "porto", "B1", "The harbor was quiet."];
  assert.match(wordbank.exampleFor(entrada, { harbor: "outra frase com harbor" }), /was quiet/);
  assert.strictEqual(wordbank.exampleFor(["x", "n", "d", "t", "A2"], null), "");

  const bank = { t: { label: "T", group: "daily", words: [entrada] } };
  const pool = wordbank.buildPool(bank, null, {});
  assert.match(pool[0].ex, /The harbor/);
});

test("formsOf cobre as flexões regulares que as frases usam", () => {
  assert.ok(wordbank.formsOf("study").includes("studies"));
  assert.ok(wordbank.formsOf("bake").includes("baking"));
  assert.ok(wordbank.formsOf("plan").includes("planning"));
  assert.ok(wordbank.mentions("She is baking bread.", "bake"));
  assert.ok(wordbank.mentions("The tidiest desk wins.", "tidy"));
  assert.strictEqual(wordbank.mentions("", "harbor"), false);
  assert.strictEqual(wordbank.mentions("uma frase", ""), false);
});

test("um tema sem família conhecida vira o grupo Outros em vez de sumir", () => {
  const bank = {
    a: { label: "A", group: "daily", words: [["um", "n", "definição comprida", "um", "A2"]] },
    b: { label: "B", group: "inventado", words: [["dois", "n", "definição comprida", "dois", "A2"]] },
    c: { label: "C", words: [["tres", "n", "definição comprida", "três", "A2"]] }
  };
  const grupos = wordbank.groupsOf(bank, { daily: { label: "Dia a dia" } });
  const todos = grupos.reduce((s, g) => s.concat(g.themes), []).sort();
  assert.deepStrictEqual(todos, ["a", "b", "c"], "nenhum tema pode sumir da tela por um typo");
  assert.ok(grupos.find(g => g.key === "outros"), "tema sem grupo cai em Outros");
  assert.ok(grupos.find(g => g.key === "inventado"), "grupo desconhecido vira uma família própria");
  assert.strictEqual(grupos[0].key, "daily", "as famílias declaradas vêm primeiro");
});

/* ---------------- Metajogo ---------------- */

test("progress não inventa marco para clima desconhecido", () => {
  assert.strictEqual(progress.milestoneFor("inexistente"), null);
  assert.strictEqual(progress.need("inexistente"), 0);
  assert.strictEqual(progress.isUnlocked("inexistente", 0, "ember"), true,
    "clima sem marco nasce aberto");
  assert.strictEqual(progress.nextUnlock(0, null).key, "rain",
    "sem a lista de climas, ainda dá para dizer qual é o próximo");
  assert.deepStrictEqual(progress.series(null), []);
  assert.deepStrictEqual(progress.trend([]), { wpm: 0, accuracy: 0, sessions: 0, delta: 0 });
});

/* ---------------- Sorteio determinístico ---------------- */

test("o gerador determinístico é estável e o baralho não repete letra inicial", () => {
  const a = rng.create("SEMENTE");
  const b = rng.create("SEMENTE");
  assert.strictEqual(a(), b(), "a mesma semente tem que dar o mesmo número");
  assert.notStrictEqual(rng.create("OUTRA")(), a());

  const pool = [];
  "abcdefgh".split("").forEach(l => {
    for (let i = 0; i < 3; i++) pool.push({ text: l + "palavra" + i });
  });
  const deck = rng.buildDeck(pool, rng.create("X"), 4);
  assert.deepStrictEqual(
    deck.map(w => w.text).sort(), pool.map(w => w.text).sort(),
    "o baralho é o mesmo conjunto, só reordenado");

  // a janela é garantida enquanto sobra palavra para trocar; no fim do baralho
  // o próprio buildDeck afrouxa em vez de travar, e isso é intencional
  for (let i = 0; i + 4 < deck.length - 6; i++) {
    const janela = deck.slice(i, i + 4).map(w => w.text[0]);
    assert.strictEqual(new Set(janela).size, janela.length,
      "duas palavras vivas com a mesma inicial seriam impossíveis de mirar");
  }
});

/* ---------------- Armazenamento ---------------- */

test("safeStorage devolve null quando o navegador bloqueia", () => {
  const bloqueado = { get localStorage() { throw new Error("negado"); } };
  assert.strictEqual(factory.safeStorage(bloqueado), null);

  const funcionando = { localStorage: factory.memoryStorage() };
  assert.ok(factory.safeStorage(funcionando), "com localStorage aberto, ele é usado");
});

test("o store funciona sem o módulo de repetição espaçada", () => {
  // é o que acontece se um <script> não carregar: o jogo não pode ir junto
  const s = factory.create(factory.memoryStorage(), null);
  const palavra = { text: "meadow", pos: "n", def: "uma definição", pt: "prado", lvl: "B1", theme: "nature" };
  s.recordCapture(palavra, { now: T0 });
  s.recordCapture(palavra, { now: T0 });
  s.recordCapture(palavra, { now: T0 });
  const item = s.list(T0)[0];
  assert.strictEqual(item.due, true, "sem agendamento, tudo vence agora");
  assert.strictEqual(item.daysUntilDue, 0);
  assert.strictEqual(item.fragility, 0);
  assert.strictEqual(s.isMastered(s.entryFor("meadow")), true, "o critério vira 3 acertos");
  assert.strictEqual(s.practiceQueue(T0).length, 0, "dominada não entra na fila");
});

test("o store funciona sem o módulo de progresso", () => {
  // simula o core/progress.js ausente: o require de dentro do storage falha
  const resolver = Module._resolveFilename;
  Module._resolveFilename = function (pedido, ...resto) {
    if (String(pedido).indexOf("core/progress.js") >= 0) throw new Error("módulo ausente");
    return resolver.call(this, pedido, ...resto);
  };
  const caminho = require.resolve("../../js/storage.js");
  delete require.cache[caminho];
  const semProgresso = require("../../js/storage.js");
  // o require de dentro do storage só acontece no create — o disfarce precisa
  // continuar de pé até aqui
  const s = semProgresso.create(semProgresso.memoryStorage(), srs);
  Module._resolveFilename = resolver;
  delete require.cache[caminho];
  s.touchDay(T0);
  assert.strictEqual(s.stats.streak, 1);
  s.touchDay(T0 + DAY);
  assert.strictEqual(s.stats.streak, 2, "dias seguidos continuam somando");
  s.touchDay(T0 + 5 * DAY);
  assert.strictEqual(s.stats.streak, 2, "e o buraco continua congelando em vez de zerar");
  assert.strictEqual(s.stats.freezes, 1);
  assert.strictEqual(s.visualUnlocked("aurora"), true,
    "sem os marcos, nenhum clima fica trancado");
  assert.strictEqual(s.nextVisualUnlock({}), null);
});

test("placar do desafio: entrar, melhorar e não piorar", () => {
  const s = factory.create(factory.memoryStorage(), srs);
  const code = "TC1-ABC-DEF";

  const primeiro = s.addFriendResult(code, { name: "ANA", score: 100, learned: 5, wpm: 30 });
  assert.strictEqual(primeiro.added, true);

  const melhor = s.addFriendResult(code, { name: "ANA", score: 300, learned: 9, wpm: 40 });
  assert.strictEqual(melhor.improved, true);
  assert.strictEqual(melhor.added, false);

  const pior = s.addFriendResult(code, { name: "ANA", score: 50, learned: 2, wpm: 20 });
  assert.strictEqual(pior.improved, false);
  assert.strictEqual(pior.added, false);
  assert.strictEqual(s.leaderboard(code, "EU")[0].score, 300, "o placar guarda o melhor");

  s.saveMyResult(code, { score: 400, learned: 10, wpm: 50, daily: true, day: "2026-09-01" });
  s.saveMyResult(code, { score: 10, learned: 1, wpm: 5 });
  const linhas = s.leaderboard(code, "EU");
  assert.strictEqual(linhas[0].name, "EU");
  assert.strictEqual(linhas[0].score, 400, "seu placar menor não substitui o seu recorde");
  assert.strictEqual(linhas[0].me, true);

  const lista = s.challengeList();
  assert.strictEqual(lista.length, 1);
  assert.strictEqual(lista[0].daily, true);
  assert.strictEqual(lista[0].friends, 1);
  assert.deepStrictEqual(s.leaderboard("TC1-NAO-EXISTE", "EU"), []);
});

test("caderno apagado volta a zero e a fila fica vazia", () => {
  const s = factory.create(factory.memoryStorage(), srs);
  s.recordCapture({ text: "alpha", pos: "n", def: "definição", pt: "um", lvl: "A2", theme: "nature" }, { now: T0 });
  assert.strictEqual(s.counts(T0).total, 1);
  s.clearNotebook();
  assert.strictEqual(s.counts(T0).total, 0);
  assert.deepStrictEqual(s.practiceQueue(T0), []);
  assert.deepStrictEqual(s.deckQueue(T0), []);
});

test("JSON corrompido no armazenamento não impede o jogo de abrir", () => {
  const backing = factory.memoryStorage();
  backing.setItem("tc.prefs", "{isto não é json");
  backing.setItem("tc.notebook", "[[[");
  backing.setItem("tc.history", '"nem isto é uma lista"');
  const s = factory.create(backing, srs);
  assert.strictEqual(s.prefs.visual, "ember", "cai nos padrões em vez de quebrar");
  assert.deepStrictEqual(s.history(), []);
  assert.strictEqual(s.counts().total, 0);
});

/* ---------------- Chamadas sem argumento opcional ----------------
 * Quase toda função aqui aceita "agora" como parâmetro para os testes poderem
 * controlar o relógio. Em produção ela é chamada sem ele, e esse é justamente
 * o caminho que nenhum teste percorria. */

test("as funções assumem o relógio do sistema quando ninguém passa a hora", () => {
  const s = factory.create(factory.memoryStorage(), srs);
  const palavra = { text: "alpha", pos: "n", def: "uma definição", pt: "um", lvl: "A2", theme: "nature" };

  s.recordCapture(palavra);
  s.recordSeen(palavra);
  s.recordMiss(palavra);
  s.touchDay();

  assert.strictEqual(s.list()[0].seen, 2);
  assert.strictEqual(s.counts().total, 1);
  assert.strictEqual(s.stats.streak, 1);
  assert.ok(s.practiceQueue().length <= 1);
  assert.ok(Array.isArray(s.hardest()));
  assert.ok(Array.isArray(s.deckQueue()));
  assert.ok(s.progress({ nature: { label: "N", words: [["alpha", "n", "d", "um", "A2"]] } }).at > 0);
  assert.strictEqual(s.streakFrozenToday(), false);

  assert.ok(srs.fresh().due > 0);
  assert.ok(srs.review(srs.fresh(), 4).due > 0);
  assert.strictEqual(srs.isDue(null), true);
  assert.strictEqual(srs.daysUntilDue(null), 0);
  assert.ok(srs.fragility({ hits: 1, misses: 1 }) >= 0);
  assert.ok(Array.isArray(srs.sortByFragility([{ text: "a" }])));
});

test("meta diária cai no padrão quando a preferência some", () => {
  const s = factory.create(factory.memoryStorage(), srs);
  s.prefs.dailyGoal = 0;
  assert.strictEqual(s.goalProgress().goal, 20, "meta zero seria uma barra sempre cheia");
});

test("digitar rápido não conta como hesitação", () => {
  const rapida = { hits: 4, misses: 0, typos: 0, avgMs: 1200, srs: srs.fresh(T0) };
  const lenta = { hits: 4, misses: 0, typos: 0, avgMs: 9000, srs: srs.fresh(T0) };
  assert.ok(srs.fragility(rapida, T0) < srs.fragility(lenta, T0));
});

test("acertar com um tropeço ainda avança o agendamento", () => {
  const comErro = srs.review(srs.fresh(T0), 4, T0);
  const semErro = srs.review(srs.fresh(T0), 5, T0);
  assert.strictEqual(comErro.reps, 1);
  assert.ok(comErro.ease < semErro.ease, "errar tecla cobra um pouco da facilidade");

  const tresErros = srs.review(srs.fresh(T0), 3, T0);
  assert.strictEqual(tresErros.reps, 1, "nota 3 ainda é acerto");
  assert.ok(tresErros.ease < comErro.ease);
});

test("gravar de novo o mesmo resultado não piora o que já estava lá", () => {
  const s = factory.create(factory.memoryStorage(), srs);
  s.saveMyResult("TC1-X", { score: 100, learned: 3, wpm: 20 });
  s.saveMyResult("TC1-X", { score: 40, learned: 1, wpm: 10 });
  assert.strictEqual(s.leaderboard("TC1-X")[0].score, 100);
  assert.strictEqual(s.leaderboard("TC1-X")[0].name, "VOCÊ", "sem apelido, o placar te chama assim");
});

test("flush grava tudo de uma vez, inclusive o histórico", () => {
  const backing = factory.memoryStorage();
  const s = factory.create(backing, srs);
  s.recordCapture({ text: "alpha", pos: "n", def: "d", pt: "um", lvl: "A2", theme: "nature" }, { now: T0 });
  s.recordSession({ mode: "zen", score: 5, learned: 1, wpm: 10, accuracy: 100, chars: 5, ms: 1000 });
  s.flush();

  const outro = factory.create(backing, srs);
  assert.strictEqual(outro.counts().total, 1, "o caderno sobreviveu ao recarregar");
  assert.strictEqual(outro.history().length, 1);
  assert.strictEqual(outro.stats.bestZen, 5);
});

test("armazenamento que recusa escrita não derruba o jogo", () => {
  const cheio = {
    getItem: () => null,
    setItem: () => { throw new Error("cota estourada"); },
    removeItem: () => {}
  };
  const s = factory.create(cheio, srs);
  s.recordCapture({ text: "alpha", pos: "n", def: "d", pt: "um", lvl: "A2", theme: "nature" }, { now: T0 });
  s.flush();
  assert.strictEqual(s.isPersisting(), false, "a tela inicial precisa poder avisar");
  assert.strictEqual(s.counts(T0).total, 1, "em memória, a partida continua valendo");
});

test("rng: semente de texto, semente aleatória e lista vazia", () => {
  assert.strictEqual(typeof rng.hashString("Type & Chill"), "number");
  assert.strictEqual(rng.fromString("abc")(), rng.fromString("abc")());
  const semente = rng.randomSeed();
  const sorteado = rng.create(semente)();
  assert.ok(sorteado >= 0 && sorteado < 1, "a semente aleatória precisa gerar um gerador válido");
  assert.notStrictEqual(rng.randomSeed(), semente, "duas sementes seguidas não podem ser iguais");
  assert.deepStrictEqual(rng.shuffle([], rng.create("x")), []);
  assert.deepStrictEqual(rng.buildDeck([], rng.create("x")), []);
});

test("progress: séries e marcos com argumentos faltando", () => {
  assert.deepStrictEqual(progress.unlockedBetween(), []);
  assert.deepStrictEqual(progress.series([{ at: 1, wpm: 10, accuracy: 90, chars: 5 }]).length, 1);
  const t = progress.trend([
    { at: 1, wpm: 20, accuracy: 90, chars: 5 },
    { at: 2, wpm: 40, accuracy: 95, chars: 5 }
  ]);
  assert.strictEqual(t.sessions, 2);
  assert.strictEqual(progress.touchStreak({ streak: 0, lastDay: "" }, "2026-09-01", "2026-08-31").streak, 1);
});

test("caderno da v1 ganha agendamento derivado do histórico", () => {
  // v1 guardava só acertos e erros; o agendamento nasce daí, sem perder nada
  const backing = factory.memoryStorage();
  backing.setItem("tc.version", "1");
  backing.setItem("tc.notebook", JSON.stringify({
    meadow: { pos: "n", en: "definição antiga", pt: "prado", lvl: "B1", theme: "nature",
              hits: 5, misses: 2, first: T0, last: T0 }
  }));
  const s = factory.create(backing, srs);
  const e = s.entryFor("meadow");
  assert.strictEqual(e.srs.reps, 3, "acertos viram repetições, com teto");
  assert.strictEqual(e.srs.lapses, 2);
  assert.strictEqual(e.typos, 0);
  assert.strictEqual(e.seen, 7, "aparições deduzidas de acertos mais erros");
});

test("o recorde do Driftwords, o nome antigo do jogo, é preservado", () => {
  const backing = factory.memoryStorage();
  backing.setItem("driftwords_best", "1234");
  const s = factory.create(backing, srs);
  assert.strictEqual(s.stats.best, 1234, "quem jogava antes não pode perder o recorde");

  // e não sobrescreve um recorde melhor já migrado
  const outro = factory.memoryStorage();
  outro.setItem("driftwords_best", "10");
  outro.setItem("tc.stats", JSON.stringify({ best: 999 }));
  assert.strictEqual(factory.create(outro, srs).stats.best, 999);
});

test("a migração roda uma vez só", () => {
  const backing = factory.memoryStorage();
  factory.create(backing, srs);                       // migra e marca a versão
  backing.setItem("driftwords_best", "5000");         // chegou depois
  const s = factory.create(backing, srs);
  assert.notStrictEqual(s.stats.best, 5000, "com a versão em dia, não migra de novo");
});

test("a chave do dia zera à esquerda mês e dia", () => {
  // 5 de novembro pega os dois lados do preenchimento: mês com dois dígitos,
  // dia com um só
  assert.strictEqual(factory.dayKey(new Date(2026, 10, 5, 10, 0, 0).getTime()), "2026-11-05");
  assert.strictEqual(factory.dayKey(new Date(2026, 0, 15, 10, 0, 0).getTime()), "2026-01-15");
  assert.strictEqual(typeof factory.dayKey(), "string", "sem hora, usa o relógio do sistema");
});

test("armazenamento que recusa leitura também não derruba o jogo", () => {
  const arisco = {
    getItem: () => { throw new Error("negado"); },
    setItem: () => {},
    removeItem: () => {}
  };
  const s = factory.create(arisco, srs);
  assert.strictEqual(s.prefs.visual, "ember");
  assert.strictEqual(s.counts().total, 0);
});

test("isMastered não engasga com entrada inexistente", () => {
  const s = factory.create(factory.memoryStorage(), srs);
  assert.strictEqual(s.isMastered(null), false);
  assert.strictEqual(s.isMastered(s.entryFor("palavra-que-nunca-vi")), false);
});

test("o localStorage de mentira dos testes se comporta como o de verdade", () => {
  const m = factory.memoryStorage();
  assert.strictEqual(m.getItem("x"), null);
  m.setItem("x", 42);
  assert.strictEqual(m.getItem("x"), "42", "o de verdade também guarda texto");
  m.removeItem("x");
  assert.strictEqual(m.getItem("x"), null);
  m.setItem("y", "1");
  m.clear();
  assert.strictEqual(m.getItem("y"), null);
});
