/* Pontuação, ritmo e métricas de digitação. */
const test = require("node:test");
const assert = require("node:assert");

const s = require("../../js/core/scoring.js");

test("a sequência é o que mais pesa na pontuação", () => {
  assert.strictEqual(s.capturePoints(1, 5, 0), 15);
  assert.strictEqual(s.capturePoints(3, 5, 0), 35);
  assert.ok(s.capturePoints(5, 4, 0) > s.capturePoints(1, 8, 0));
});

test("errar tecla desconta, mas a captura nunca vale menos que 1", () => {
  assert.strictEqual(s.capturePoints(1, 5, 1), 13);
  assert.strictEqual(s.capturePoints(1, 5, 2), 11);
  assert.strictEqual(s.capturePoints(1, 3, 100), 1, "o desconto não pode virar punição infinita");
  assert.ok(s.capturePoints(0, 0, 0) >= 1);
});

test("o nível sobe a cada 8 palavras e para no teto", () => {
  assert.strictEqual(s.levelFor(0), 1);
  assert.strictEqual(s.levelFor(7), 1);
  assert.strictEqual(s.levelFor(8), 2);
  assert.strictEqual(s.levelFor(16), 3);
  assert.strictEqual(s.levelFor(10000), s.MAX_LEVEL);
});

test("isLevelUp dispara só na palavra exata da virada", () => {
  assert.strictEqual(s.isLevelUp(0), false, "começar não conta como subir de nível");
  assert.strictEqual(s.isLevelUp(7), false);
  assert.strictEqual(s.isLevelUp(8), true);
  assert.strictEqual(s.isLevelUp(9), false);
  assert.strictEqual(s.isLevelUp(16), true);
});

test("o clássico acelera com o nível e respeita um piso", () => {
  assert.ok(s.spawnInterval(1, "classic") > s.spawnInterval(5, "classic"));
  assert.strictEqual(s.spawnInterval(99, "classic"), 950);
  assert.ok(s.fallSpeed(5, "classic") > s.fallSpeed(1, "classic"));
});

test("zen e prática ignoram o nível: o ritmo fica constante", () => {
  assert.strictEqual(s.spawnInterval(1, "zen"), s.spawnInterval(9, "zen"));
  assert.strictEqual(s.fallSpeed(1, "zen"), s.fallSpeed(9, "zen"));
  assert.strictEqual(s.fallSpeed(1, "practice"), s.fallSpeed(9, "practice"));
  assert.ok(s.fallSpeed(1, "zen") < s.fallSpeed(3, "classic"));
});

test("cabem menos palavras na tela no modo zen", () => {
  assert.strictEqual(s.maxOnScreen("zen"), 5);
  assert.strictEqual(s.maxOnScreen("classic"), 6);
});

test("PPM segue o padrão de 5 caracteres por palavra", () => {
  assert.strictEqual(s.wpm(100, 60000), 20);
  assert.strictEqual(s.wpm(250, 60000), 50);
  assert.strictEqual(s.wpm(100, 30000), 40);
  assert.strictEqual(s.wpm(0, 60000), 0);
});

test("PPM não explode quando o tempo é zero ou negativo", () => {
  assert.strictEqual(s.wpm(100, 0), 0);
  assert.strictEqual(s.wpm(100, -5), 0);
});

test("precisão vai de 0 a 100 e trata a sessão vazia", () => {
  assert.strictEqual(s.accuracy(0, 0), 100, "sem teclas digitadas, nada foi errado");
  assert.strictEqual(s.accuracy(10, 10), 100);
  assert.strictEqual(s.accuracy(5, 10), 50);
  assert.strictEqual(s.accuracy(2, 3), 66.7);
});

test("o título final acompanha o modo e o desempenho", () => {
  assert.strictEqual(s.runTitle("practice", 0), "Revisão concluída");
  assert.strictEqual(s.runTitle("zen", 0), "Sessão encerrada");
  assert.strictEqual(s.runTitle("classic", 0), "A brasa recomeça");
  assert.strictEqual(s.runTitle("classic", 30), "Vocabulário radiante");
});
