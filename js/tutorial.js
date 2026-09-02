/* Type & Chill — "Como estudar": a tela que ensina repetição espaçada.
 *
 * O caderno do jogo é um sistema de repetição espaçada inteiro, e quem não
 * sabe o que isso é vê só "uma lista de palavras". Esta tela existe para
 * transformar o recurso em método: por que revisar pouco antes de esquecer
 * funciona, o que o jogo faz sozinho, e o que a pessoa precisa fazer.
 *
 * Cinco abas curtas, na ordem de quem nunca ouviu falar do assunto:
 *   O problema · A ideia · Aqui dentro · Na prática · O que esperar
 *
 * A curva do esquecimento é desenhada em SVG na mão — trazer biblioteca de
 * gráfico para duas linhas custaria mais bytes que o jogo todo.
 */
window.TCTutorial = (function () {
  "use strict";

  var api = { onPractice: null, onNotebook: null, onClose: null };
  var screen, tabsBox, bodyBox, mounted = false;
  var activeTab = "problema";

  function el(id) { return document.getElementById(id); }

  // ---------- Peças ----------
  function p(texto, classe) {
    var n = document.createElement("p");
    n.className = classe || "tutp";
    n.textContent = texto;
    return n;
  }
  function h(texto) {
    var n = document.createElement("h3");
    n.className = "tuth";
    n.textContent = texto;
    return n;
  }
  function lista(itens) {
    var ul = document.createElement("ul");
    ul.className = "tutlist";
    itens.forEach(function (t) {
      var li = document.createElement("li");
      li.textContent = t;
      ul.appendChild(li);
    });
    return ul;
  }
  function destaque(texto) {
    var d = document.createElement("div");
    d.className = "tutdestaque";
    d.textContent = texto;
    return d;
  }
  function botao(texto, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "btn ghostbtn small";
    b.textContent = texto;
    b.addEventListener("click", onClick);
    return b;
  }

  /* A curva do esquecimento, e o que uma revisão faz com ela.
   *
   * Duas linhas: sem revisar, a memória despenca; com revisão, cada subida
   * volta ao topo e a queda seguinte é mais lenta. É a imagem que explica o
   * método inteiro antes de qualquer parágrafo. */
  function grafico() {
    var W = 560, H = 200, pad = 28;
    var x = function (dia) { return pad + (dia / 30) * (W - pad * 2); };
    var y = function (mem) { return H - pad - (mem / 100) * (H - pad * 2); };

    function queda(diaInicio, diaFim, forca) {
      // decaimento exponencial: quanto maior a "força", mais devagar cai
      var pts = [];
      for (var d = diaInicio; d <= diaFim; d += 0.5) {
        var mem = 100 * Math.exp(-(d - diaInicio) / forca);
        pts.push(Math.round(x(d)) + "," + Math.round(y(mem)));
      }
      return pts.join(" ");
    }

    var semRevisar = queda(0, 30, 2.2);
    var comRevisao = [queda(0, 1, 2.2), queda(1, 4, 4), queda(4, 11, 9), queda(11, 30, 22)];
    var marcos = [1, 4, 11].map(function (d) {
      return '<line class="tutmarca" x1="' + x(d) + '" y1="' + y(0) + '" x2="' + x(d) + '" y2="' + y(100) + '" />';
    }).join("");

    return ""
      + '<svg viewBox="0 0 ' + W + " " + H + '" role="img" '
      + 'aria-label="Gráfico: sem revisar, a memória cai em poucos dias; com revisões nos dias 1, 4 e 11, ela volta ao topo e passa a cair cada vez mais devagar.">'
      + marcos
      + '<polyline class="tutsem" points="' + semRevisar + '" />'
      + comRevisao.map(function (pts) { return '<polyline class="tutcom" points="' + pts + '" />'; }).join("")
      + '<text class="tuteixo" x="' + pad + '" y="' + (H - 6) + '">hoje</text>'
      + '<text class="tuteixo" x="' + (W - pad) + '" y="' + (H - 6) + '" text-anchor="end">30 dias</text>'
      + "</svg>"
      + '<p class="tutlegenda"><span class="k ksem"></span>sem revisar '
      + '<span class="k kcom"></span>revisando nos dias 1, 4 e 11</p>';
  }

  // ---------- As abas ----------
  var TABS = [
    { key: "problema", label: "O problema", build: buildProblema },
    { key: "ideia", label: "A ideia", build: buildIdeia },
    { key: "aqui", label: "Aqui dentro", build: buildAqui },
    { key: "pratica", label: "Na prática", build: buildPratica },
    { key: "esperar", label: "O que esperar", build: buildEsperar }
  ];

  function buildProblema(box) {
    box.appendChild(h("Você não esquece por falta de esforço"));
    box.appendChild(p(
      "Uma palavra nova aprendida hoje some em poucos dias. Não é preguiça nem falta de " +
      "talento: é como a memória funciona. Sem nada que a traga de volta, o que você " +
      "estudou na segunda já está pela metade na quarta e quase todo perdido no fim do mês."));
    var caixa = document.createElement("div");
    caixa.className = "tutchart";
    caixa.innerHTML = grafico();
    box.appendChild(caixa);
    box.appendChild(p(
      "É por isso que maratonar vocabulário no domingo rende tão pouco. Você não precisa " +
      "estudar mais — precisa estudar na hora certa."));
  }

  function buildIdeia(box) {
    box.appendChild(h("Revisar pouco antes de esquecer"));
    box.appendChild(p(
      "A repetição espaçada é isto: em vez de rever tudo toda hora, você revê cada palavra " +
      "no momento em que ela está prestes a escapar. Cada acerto empurra a próxima revisão " +
      "para mais longe; cada erro traz a palavra de volta para amanhã."));
    box.appendChild(destaque("1 dia → 3 dias → 8 dias → 20 dias → dois meses"));
    box.appendChild(p(
      "Os intervalos crescem porque a memória fica mais forte a cada volta. Vinte palavras " +
      "revisadas no dia certo valem mais que duzentas relidas de qualquer jeito — e custam " +
      "dez minutos, não uma tarde."));
    box.appendChild(p(
      "É o mesmo motor do Anki, do Duolingo e de qualquer curso sério de vocabulário. A " +
      "diferença aqui é que ele funciona enquanto você joga, sem tela de estudo nenhuma."));
  }

  function buildAqui(box) {
    box.appendChild(h("O que o jogo faz sozinho"));
    box.appendChild(lista([
      "Toda palavra capturada — ou perdida — entra no caderno. A perdida entra de propósito: é a que mais precisa voltar.",
      "Cada captura vira uma nota: sem errar tecla vale 5, com um erro 4, com dois ou mais 3, deixar cair vale 0.",
      "A nota decide o próximo encontro: quanto melhor, mais longe. Errar devolve a palavra para amanhã.",
      "Uma palavra vira dominada ✦ depois de três revisões certas e um intervalo de 21 dias."
    ]));
    box.appendChild(h("O que você escolhe"));
    box.appendChild(lista([
      "Prática — a fila do dia, na ordem do agendamento. É o que a tela inicial oferece quando há palavra vencendo.",
      "Deck — as que te pegam: mais falhadas e mais antigas primeiro, sem olhar a data.",
      "Campanha — textos inteiros; as palavras-alvo entram no caderno com o mesmo agendamento.",
      "Caderno — a lista completa, com quantas vezes cada palavra apareceu, quantas escaparam e quanto tempo você leva para digitá-la."
    ]));
    var acoes = document.createElement("div");
    acoes.className = "tutacoes";
    acoes.appendChild(botao("Ver meu caderno", function () {
      close();
      if (api.onNotebook) api.onNotebook();
    }));
    box.appendChild(acoes);
  }

  function buildPratica(box) {
    box.appendChild(h("Como usar sem transformar em obrigação"));
    box.appendChild(lista([
      "Dez minutos por dia batem duas horas no domingo. A regra é a frequência, não a duração.",
      "Comece pela revisão vencida e só depois jogue solto: assim o que está por escapar vem primeiro, com a cabeça descansada.",
      "Não fuja de errar. Errar é o sinal que o sistema usa para saber o que trazer de volta — uma sessão sem nenhum erro só prova que estava fácil demais.",
      "Faltou um dia? A ofensiva congela em vez de zerar. Volte no dia seguinte e continue de onde parou.",
      "Leia a frase de exemplo em voz alta. Definição ensina a reconhecer; frase ensina a usar.",
      "Se você já vive no Anki, exporte: o caderno vira baralho em um clique, com exemplo e agendamento."
    ]));
    var acoes = document.createElement("div");
    acoes.className = "tutacoes";
    acoes.appendChild(botao("Revisar agora", function () {
      close();
      if (api.onPractice) api.onPractice();
    }));
    box.appendChild(acoes);
  }

  function buildEsperar(box) {
    var c = TCStore.counts();
    var g = TCStore.goalProgress();

    box.appendChild(h("Os números, sem promessa mágica"));
    box.appendChild(p(
      "Com a meta padrão de " + g.goal + " palavras por dia, são cerca de " + (g.goal * 30) +
      " encontros por mês — o que costuma virar algumas centenas de palavras realmente " +
      "fixadas, não decoradas para amanhã. Ninguém aprende " + g.goal + " palavras novas por " +
      "dia: boa parte de cada sessão é revisão, e é essa parte que faz o vocabulário grudar."));
    box.appendChild(lista([
      "Semana 1 — quase tudo é palavra nova, e parece que você não está fixando nada. É o normal.",
      "Semana 2 e 3 — a fila de revisão fica maior que a de palavras novas. É aí que a sensação muda.",
      "A partir do mês 2 — as primeiras palavras começam a virar dominadas e saem da fila, abrindo espaço."
    ]));

    var estado = document.createElement("div");
    estado.className = "tutestado";
    estado.textContent = c.total
      ? "Hoje: " + c.total + " palavras no caderno · " + c.mastered + " dominadas · " + c.due + " para revisar."
      : "Seu caderno ainda está vazio — capture as primeiras palavras e volte aqui.";
    box.appendChild(estado);
    box.appendChild(p(
      "E o mais importante: isto não é um curso com data para acabar. É um hábito de dez " +
      "minutos que, em seis meses, tem um efeito que nenhuma maratona de fim de semana tem."));
  }

  // ---------- Montagem ----------
  function renderTabs() {
    tabsBox.innerHTML = "";
    TABS.forEach(function (t) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "opttab";
      b.textContent = t.label;
      b.setAttribute("role", "tab");
      b.setAttribute("data-tab", t.key);
      b.setAttribute("aria-selected", activeTab === t.key ? "true" : "false");
      b.addEventListener("click", function () { activeTab = t.key; render(); });
      tabsBox.appendChild(b);
    });
  }

  function render() {
    renderTabs();
    bodyBox.innerHTML = "";
    var tab = null;
    for (var i = 0; i < TABS.length; i++) if (TABS[i].key === activeTab) tab = TABS[i];
    (tab || TABS[0]).build(bodyBox);
    bodyBox.scrollTop = 0;
  }

  function mount() {
    if (mounted) return;
    screen = el("tutorialScreen");
    tabsBox = el("tutTabs");
    bodyBox = el("tutBody");
    el("tutClose").addEventListener("click", close);
    el("tutDone").addEventListener("click", close);
    mounted = true;
  }

  function open(tab) {
    mount();
    if (tab) activeTab = tab;
    render();
    screen.removeAttribute("hidden");
    var atual = tabsBox.querySelector('[aria-selected="true"]');
    if (atual) atual.focus();
  }
  function close() {
    if (!screen) return;
    screen.setAttribute("hidden", "");
    if (api.onClose) api.onClose();
  }
  function isOpen() { return !!screen && !screen.hasAttribute("hidden"); }

  api.mount = mount;
  api.open = open;
  api.close = close;
  api.isOpen = isOpen;
  api.render = render;
  return api;
})();
