/* Caderno, ofensiva diária e placar dos desafios.
 * O store é uma fábrica justamente para poder rodar aqui, com um
 * localStorage de mentira e o relógio sob controle. */
const test = require("node:test");
const assert = require("node:assert");

const factory = require("../../js/storage.js");
const srs = require("../../js/core/srs.js");
const DAY = srs.DAY;

const T0 = new Date(2026, 0, 15, 12, 0, 0).getTime();

function novoStore() { return factory.create(factory.memoryStorage(), srs); }
function palavra(text, extra) {
  return Object.assign({
    text, pos: "n", def: "a definition long enough", pt: "tradução", lvl: "B1", theme: "nature"
  }, extra || {});
}

test("store novo nasce com as preferências e estatísticas padrão", () => {
  const s = novoStore();
  assert.strictEqual(s.prefs.visual, "ember");
  assert.strictEqual(s.prefs.mode, "classic");
  assert.deepStrictEqual(s.prefs.levels, ["A2", "B1", "B2", "C1"]);
  assert.strictEqual(s.stats.best, 0);
  assert.strictEqual(s.stats.streak, 0);
  assert.deepStrictEqual(s.counts(), { total: 0, mastered: 0, learning: 0, due: 0 });
});

test("capturar cria a entrada no caderno e agenda a revisão", () => {
  const s = novoStore();
  const e = s.recordCapture(palavra("meadow"), { typos: 0, now: T0 });

  assert.strictEqual(e.hits, 1);
  assert.strictEqual(e.misses, 0);
  assert.strictEqual(s.stats.captured, 1);
  assert.strictEqual(s.stats.todayCount, 1);
  assert.strictEqual(e.srs.interval, 1);
  assert.strictEqual(e.srs.due, T0 + DAY);

  const item = s.list(T0)[0];
  assert.strictEqual(item.text, "meadow");
  assert.strictEqual(item.due, false, "acabou de ser revista, não vence hoje");
});

test("errar conta como lapso e traz a palavra de volta para amanhã", () => {
  const s = novoStore();
  s.recordCapture(palavra("meadow"), { typos: 0, now: T0 });
  const e = s.recordMiss(palavra("meadow"), { now: T0 + DAY });

  assert.strictEqual(e.hits, 1);
  assert.strictEqual(e.misses, 1);
  assert.strictEqual(e.srs.lapses, 1);
  assert.strictEqual(e.srs.reps, 0);
  assert.strictEqual(s.stats.missed, 1);
});

test("typos são acumulados na entrada", () => {
  const s = novoStore();
  s.recordCapture(palavra("meadow"), { typos: 2, now: T0 });
  s.recordCapture(palavra("meadow"), { typos: 1, now: T0 + DAY });
  assert.strictEqual(s.entryFor("meadow").typos, 3);
});

test("o banco pode mudar: a entrada antiga recebe a definição nova", () => {
  const s = novoStore();
  s.recordCapture(palavra("meadow"), { now: T0 });
  s.recordCapture(palavra("meadow", { def: "definição corrigida e mais longa", lvl: "C1" }), { now: T0 + DAY });

  const e = s.entryFor("meadow");
  assert.strictEqual(e.en, "definição corrigida e mais longa");
  assert.strictEqual(e.lvl, "C1");
  assert.strictEqual(e.hits, 2, "atualizar a definição não pode zerar o histórico");
});

test("counts separa dominadas, em revisão e vencidas", () => {
  const s = novoStore();
  s.recordCapture(palavra("alpha"), { now: T0 });          // vence amanhã
  s.recordCapture(palavra("bravo"), { now: T0 - 10 * DAY }); // já venceu

  const c = s.counts(T0);
  assert.strictEqual(c.total, 2);
  assert.strictEqual(c.mastered, 0);
  assert.strictEqual(c.learning, 2);
  assert.strictEqual(c.due, 1);
});

test("a fila de prática exclui as dominadas e põe as atrasadas na frente", () => {
  const s = novoStore();
  // "madura" é revista certo várias vezes até amadurecer
  let t = T0 - 200 * DAY;
  for (let i = 0; i < 8; i++) {
    s.recordCapture(palavra("madura"), { typos: 0, now: t });
    t += (s.entryFor("madura").srs.interval || 1) * DAY;
  }
  s.recordCapture(palavra("recente"), { now: T0 });
  s.recordCapture(palavra("atrasada"), { now: T0 - 30 * DAY });

  assert.ok(s.isMastered(s.entryFor("madura")), "a palavra revista sempre certo devia estar dominada");

  const fila = s.practiceQueue(T0).map(w => w.text);
  assert.ok(!fila.includes("madura"), "dominada não entra na fila de revisão");
  assert.strictEqual(fila[0], "atrasada", "a mais atrasada vem primeiro");
  assert.ok(fila.includes("recente"));
});

test("a fila de prática respeita o limite pedido", () => {
  const s = novoStore();
  for (let i = 0; i < 60; i++) s.recordCapture(palavra("w" + i), { now: T0 - DAY });
  assert.strictEqual(s.practiceQueue(T0, 10).length, 10);
  assert.strictEqual(s.practiceQueue(T0).length, 40, "o padrão limita a sessão a 40 palavras");
});

test("progress cruza o caderno com o banco por tema e por nível", () => {
  const bank = {
    nature: { label: "Natureza", words: [
      ["alpha", "n", "uma definição comprida", "um", "A2"],
      ["bravo", "n", "outra definição comprida", "dois", "B1"]
    ]},
    work: { label: "Trabalho", words: [
      ["charlie", "n", "mais uma definição comprida", "três", "A2"]
    ]}
  };
  const s = novoStore();
  s.recordCapture(palavra("alpha", { theme: "nature", lvl: "A2" }), { now: T0 });

  const p = s.progress(bank, T0);
  assert.strictEqual(p.byTheme.nature.total, 2);
  assert.strictEqual(p.byTheme.nature.seen, 1);
  assert.strictEqual(p.byTheme.work.seen, 0);
  assert.strictEqual(p.byLevel.A2.total, 2);
  assert.strictEqual(p.byLevel.A2.seen, 1);
});

test("ofensiva: dias seguidos somam, buraco no meio congela em vez de zerar", () => {
  const s = novoStore();
  s.touchDay(T0);
  assert.strictEqual(s.stats.streak, 1);

  s.touchDay(T0 + 60000);
  assert.strictEqual(s.stats.streak, 1, "jogar duas vezes no mesmo dia não conta duas");

  s.touchDay(T0 + DAY);
  assert.strictEqual(s.stats.streak, 2);

  s.touchDay(T0 + 2 * DAY);
  assert.strictEqual(s.stats.streak, 3);
  assert.strictEqual(s.stats.bestStreak, 3);

  // O documento de design pede uma ofensiva "que não quebra com raiva":
  // faltar não pode apagar semanas de hábito, senão a pessoa não volta.
  s.touchDay(T0 + 5 * DAY);
  assert.strictEqual(s.stats.streak, 3, "pulou dias, a ofensiva congela onde estava");
  assert.strictEqual(s.stats.freezes, 1, "o congelamento fica registrado");
  assert.ok(s.streakFrozenToday(T0 + 5 * DAY), "a tela inicial precisa poder avisar");
  assert.strictEqual(s.stats.bestStreak, 3, "o recorde de ofensiva não se perde");

  s.touchDay(T0 + 6 * DAY);
  assert.strictEqual(s.stats.streak, 4, "o dia seguinte retoma de onde parou");
});

test("virar o dia zera a contagem da meta diária", () => {
  const s = novoStore();
  s.touchDay(T0);
  s.recordCapture(palavra("alpha"), { now: T0 });
  s.recordCapture(palavra("bravo"), { now: T0 });
  assert.strictEqual(s.goalProgress().done, 2);

  s.touchDay(T0 + DAY);
  assert.strictEqual(s.goalProgress().done, 0);
});

test("goalProgress satura em 1 quando a meta é ultrapassada", () => {
  const s = novoStore();
  s.prefs.dailyGoal = 2;
  s.touchDay(T0);
  for (let i = 0; i < 5; i++) s.recordCapture(palavra("w" + i), { now: T0 });
  const g = s.goalProgress();
  assert.strictEqual(g.done, 5);
  assert.strictEqual(g.goal, 2);
  assert.strictEqual(g.ratio, 1);
});

test("recordSession guarda recorde por modo e melhor sequência", () => {
  const s = novoStore();
  s.recordSession({ mode: "classic", score: 500, bestCombo: 7, ms: 60000, keystrokes: 100, correctKeys: 95, chars: 80 });
  assert.strictEqual(s.stats.best, 500);
  assert.strictEqual(s.stats.bestCombo, 7);
  assert.strictEqual(s.stats.sessions, 1);

  s.recordSession({ mode: "classic", score: 300, bestCombo: 3, ms: 1000 });
  assert.strictEqual(s.stats.best, 500, "placar menor não substitui o recorde");

  s.recordSession({ mode: "zen", score: 9999, bestCombo: 2, ms: 1000 });
  assert.strictEqual(s.stats.bestZen, 9999);
  assert.strictEqual(s.stats.best, 500, "o recorde do zen não contamina o do clássico");
});

test("placar do desafio ordena todo mundo e guarda o melhor de cada um", () => {
  const s = novoStore();
  const code = "TC1-ABC-1";

  s.saveMyResult(code, { score: 400, learned: 10, wpm: 30 });
  s.addFriendResult(code, { name: "ANA", score: 900, learned: 20, wpm: 50 });
  s.addFriendResult(code, { name: "BIA", score: 200, learned: 5, wpm: 20 });

  let board = s.leaderboard(code, "EU");
  assert.deepStrictEqual(board.map(r => r.name), ["ANA", "EU", "BIA"]);
  assert.strictEqual(board.find(r => r.me).score, 400);

  const out = s.addFriendResult(code, { name: "ANA", score: 100, learned: 2, wpm: 10 });
  assert.strictEqual(out.improved, false);
  assert.strictEqual(s.leaderboard(code, "EU")[0].score, 900, "placar pior não rebaixa o amigo");

  s.addFriendResult(code, { name: "BIA", score: 1500, learned: 30, wpm: 60 });
  assert.strictEqual(s.leaderboard(code, "EU")[0].name, "BIA");

  s.saveMyResult(code, { score: 100, learned: 1, wpm: 5 });
  assert.strictEqual(s.leaderboard(code, "EU").find(r => r.me).score, 400, "meu placar também só melhora");
});

test("challengeList devolve os desafios do mais recente para o mais antigo", () => {
  const s = novoStore();
  s.saveMyResult("TC1-A-1", { score: 10, learned: 1, wpm: 1 });
  s.saveMyResult("TC1-B-1", { score: 20, learned: 2, wpm: 2, daily: true, day: "2026-01-15" });
  const list = s.challengeList();
  assert.strictEqual(list.length, 2);
  assert.ok(list.some(c => c.code === "TC1-B-1" && c.daily));
});

test("dados persistem entre dois stores sobre o mesmo armazenamento", () => {
  const backing = factory.memoryStorage();
  const a = factory.create(backing, srs);
  a.recordCapture(palavra("meadow"), { now: T0 });
  a.prefs.visual = "rain";
  a.flush();

  const b = factory.create(backing, srs);
  assert.strictEqual(b.prefs.visual, "rain");
  assert.ok(b.entryFor("meadow"));
  assert.strictEqual(b.counts().total, 1);
});

test("migração: caderno antigo sem agendamento ganha um", () => {
  const backing = factory.memoryStorage();
  backing.setItem("tc.notebook", JSON.stringify({
    legado: { pos: "n", en: "definição antiga", pt: "antiga", lvl: "B1", theme: "nature", hits: 2, misses: 1, first: T0, last: T0 }
  }));

  const s = factory.create(backing, srs);
  const e = s.entryFor("legado");
  assert.ok(e.srs, "a entrada legada precisa ganhar agendamento");
  assert.strictEqual(e.srs.reps, 2);
  assert.strictEqual(e.srs.lapses, 1);
  assert.strictEqual(e.typos, 0);
});

test("migração: recorde do Driftwords é aproveitado", () => {
  const backing = factory.memoryStorage();
  backing.setItem("driftwords_best", "742");
  const s = factory.create(backing, srs);
  assert.strictEqual(s.stats.best, 742);
});

test("armazenamento bloqueado não derruba o jogo, só avisa", () => {
  const bloqueado = {
    getItem() { return null; },
    setItem() { throw new Error("QuotaExceededError"); },
    removeItem() {}
  };
  const s = factory.create(bloqueado, srs);
  s.recordCapture(palavra("meadow"), { now: T0 });
  s.flush();

  assert.strictEqual(s.isPersisting(), false, "a UI precisa saber que não está salvando");
  assert.strictEqual(s.counts().total, 1, "em memória o jogo continua funcionando");
});

test("JSON corrompido no armazenamento não impede o jogo de abrir", () => {
  const backing = factory.memoryStorage();
  backing.setItem("tc.prefs", "{isso não é json");
  backing.setItem("tc.notebook", "[[[");
  const s = factory.create(backing, srs);
  assert.strictEqual(s.prefs.visual, "ember");
  assert.strictEqual(s.counts().total, 0);
});

test("capturar grava sozinho, sem esperar o fim da partida", async () => {
  // Fechar a aba no meio de uma sessão não pode apagar o que foi aprendido.
  const backing = factory.memoryStorage();
  const s = factory.create(backing, srs);
  s.recordCapture(palavra("meadow"), { now: T0 });

  const antes = JSON.parse(backing.getItem("tc.notebook") || "{}");
  assert.strictEqual(Object.keys(antes).length, 0, "a gravação é agrupada, não imediata");
  await new Promise(r => setTimeout(r, 900));

  const gravado = JSON.parse(backing.getItem("tc.notebook") || "{}");
  assert.ok(gravado.meadow, "a captura devia ter sido gravada pelo autosave");
  assert.strictEqual(gravado.meadow.hits, 1);
});

test("flush grava na hora e cancela o autosave pendente", () => {
  const backing = factory.memoryStorage();
  const s = factory.create(backing, srs);
  s.recordCapture(palavra("meadow"), { now: T0 });
  s.flush();
  assert.ok(JSON.parse(backing.getItem("tc.notebook")).meadow);
});

test("apagar o caderno não apaga preferências nem recordes", () => {
  const s = novoStore();
  s.recordCapture(palavra("meadow"), { now: T0 });
  s.recordSession({ mode: "classic", score: 500, bestCombo: 2, ms: 1000 });
  s.clearNotebook();
  assert.strictEqual(s.counts().total, 0);
  assert.strictEqual(s.stats.best, 500);
});

/* ---------- Estatística por palavra ----------
 * O documento pede quatro números por palavra: quantas vezes apareceu,
 * quantas foram capturadas, quanto tempo leva para digitar e quantas
 * escaparam. Os três primeiros são novos na v3. */

test("aparecer na tela não coloca a palavra no caderno", () => {
  // senão cada game over deixaria para trás as palavras que ainda caíam,
  // todas com zero acerto e todas na fila de revisão do dia seguinte
  const s = novoStore();
  s.recordSeen(palavra("harbor"), { now: T0 });
  assert.strictEqual(s.counts(T0).total, 0);
  assert.strictEqual(s.entryFor("harbor"), null);
});

test("recordSeen conta as aparições de quem já está no caderno", () => {
  const s = novoStore();
  s.recordCapture(palavra("harbor"), { now: T0 });
  assert.strictEqual(s.list(T0)[0].seen, 1, "a captura já conta como uma aparição");

  s.recordSeen(palavra("harbor"), { now: T0 + 1000 });
  s.recordSeen(palavra("harbor"), { now: T0 + 2000 });
  const e = s.list(T0)[0];
  assert.strictEqual(e.seen, 3);
  assert.strictEqual(e.hits, 1, "aparecer não é acertar");
  assert.strictEqual(e.misses, 0);
});

test("o tempo de digitação vira média por palavra", () => {
  const s = novoStore();
  s.recordCapture(palavra("harbor"), { now: T0, ms: 4000 });
  s.recordCapture(palavra("harbor"), { now: T0 + DAY, ms: 2000 });
  assert.strictEqual(s.list(T0)[0].avgMs, 3000);
});

test("tempo absurdo não entra na média", () => {
  const s = novoStore();
  s.recordCapture(palavra("harbor"), { now: T0, ms: 3000 });
  // saiu para o café no meio da palavra: dez minutos não são hesitação
  s.recordCapture(palavra("harbor"), { now: T0 + DAY, ms: 600000 });
  assert.strictEqual(s.list(T0)[0].avgMs, 3000);
});

test("a frase de exemplo entra no caderno junto com a palavra", () => {
  const s = novoStore();
  s.recordCapture(palavra("harbor", { ex: "The boat waited in the harbor." }), { now: T0 });
  assert.match(s.list(T0)[0].ex, /harbor/);
});

/* ---------- Modo Deck ---------- */

test("o deck traz primeiro quem mais escapou", () => {
  const s = novoStore();
  s.recordCapture(palavra("facil"), { now: T0 });
  s.recordMiss(palavra("dificil"), { now: T0 });
  s.recordMiss(palavra("dificil"), { now: T0 + 1000 });
  const fila = s.deckQueue(T0 + 2000).map(w => w.text);
  assert.strictEqual(fila[0], "dificil");
});

test("deck sem tropeço nenhum cai na fila da revisão", () => {
  const s = novoStore();
  s.recordCapture(palavra("limpa"), { now: T0 });
  assert.deepStrictEqual(s.hardest(T0), [], "ninguém tropeçou ainda");
  assert.strictEqual(s.deckQueue(T0).length, 1, "melhor revisar do que abrir vazio");
});

test("hardest ignora as palavras já dominadas", () => {
  const s = novoStore();
  s.recordMiss(palavra("velha"), { now: T0 });
  for (let i = 0; i < 6; i++) s.recordCapture(palavra("velha"), { now: T0 + i * 40 * DAY });
  const dominada = s.list(T0 + 400 * DAY)[0].mastered;
  assert.strictEqual(dominada, true);
  assert.deepStrictEqual(s.hardest(T0 + 400 * DAY), []);
});

/* ---------- Histórico e desbloqueios ---------- */

test("cada sessão vira uma linha no histórico", () => {
  const s = novoStore();
  s.recordSession({ mode: "classic", score: 100, learned: 5, wpm: 40, accuracy: 97, chars: 30, ms: 60000 });
  s.recordSession({ mode: "zen", score: 50, learned: 3, wpm: 44, accuracy: 99, chars: 20, ms: 40000 });
  const h = s.history();
  assert.strictEqual(h.length, 2);
  assert.strictEqual(h[1].wpm, 44);
  assert.strictEqual(h[1].mode, "zen");
});

test("o histórico não cresce para sempre", () => {
  const s = novoStore();
  for (let i = 0; i < 140; i++) {
    s.recordSession({ mode: "classic", score: i, learned: 1, wpm: i, accuracy: 90, chars: 10, ms: 1000 });
  }
  const h = s.history();
  assert.strictEqual(h.length, 120);
  assert.strictEqual(h[h.length - 1].wpm, 139, "as mais recentes é que ficam");
});

test("climas abrem por palavras digitadas", () => {
  const s = novoStore();
  assert.strictEqual(s.visualUnlocked("rain"), false);
  assert.strictEqual(s.nextVisualUnlock({ rain: 1, dawn: 1 }).key, "rain");
  s.stats.captured = 200;
  assert.strictEqual(s.visualUnlocked("rain"), true);
  assert.strictEqual(s.visualUnlocked("ember"), true, "o primeiro clima nunca fecha");
});

test("o clima em uso continua aberto mesmo sem o marco", () => {
  const s = novoStore();
  s.prefs.visual = "dawn";
  assert.strictEqual(s.visualUnlocked("dawn"), true);
});

test("caderno da v2 ganha os campos novos sem perder nada", () => {
  const backing = factory.memoryStorage();
  backing.setItem("tc.version", "2");
  backing.setItem("tc.notebook", JSON.stringify({
    harbor: { pos: "n", en: "a place for ships", pt: "porto", lvl: "B1", theme: "travel",
              hits: 3, misses: 1, typos: 2, first: T0, last: T0,
              srs: { ease: 2.5, interval: 3, reps: 2, lapses: 1, due: T0 } }
  }));
  const s = factory.create(backing, srs);
  const e = s.list(T0)[0];
  assert.strictEqual(e.hits, 3, "o histórico antigo continua lá");
  assert.strictEqual(e.seen, 4, "aparições deduzidas de acertos e erros");
  assert.strictEqual(e.avgMs, 0, "sem tempo medido, sem média inventada");
});
