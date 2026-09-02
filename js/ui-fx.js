/* Type & Chill — a camada que faz o menu parecer um jogo.
 *
 * Três coisas, todas puramente decorativas: um cursor próprio (a seta de
 * sempre, desenhada por nós, deixando um rastro leve da cor do tema), som ao
 * passar e ao clicar nos controles, e um respingo de luz no ponto do clique.
 *
 * Regras que valem para o arquivo inteiro:
 *   - nada aqui pode impedir um clique de chegar ao seu handler. Todos os
 *     ouvintes são passivos e nenhum elemento desenhado recebe ponteiro.
 *   - tudo desliga sozinho em tela de toque, em "animações reduzidas" e nas
 *     opções (Áudio > sons da interface, Exibição > cursor do jogo).
 *   - se este arquivo quebrar, o jogo continua jogável: o cursor do sistema só
 *     é escondido depois que a seta entra em cena.
 */
window.TCUiFx = (function () {
  "use strict";

  /* Tudo que responde ao ponteiro e portanto merece som e realce. */
  var CTRL = 'button, .chip, .seg, .switch, .opttab, .capbtn, .minibtn,' +
             ' .linkbtn, .gearbtn, .iconbtn, .setupline, [role="button"], a[href]';
  var FIELD = 'input, textarea, select, [contenteditable="true"]';
  /* O respingo precisa de uma caixa para acontecer dentro. Num botão de texto
   * puro ele viraria uma mancha solta no meio do parágrafo. */
  var CAIXA = '.btn, .chip, .seg, .switch, .iconbtn, .capbtn, .setupline, .opttab, .gearbtn';

  /* Botões que fecham ou voltam ganham o som descendente. O resto sobe. */
  var VOLTAR = /^(setupClose|optClose|tutClose|capBack|nbClose|chClose|capClose|capToList|homeBtn|resumeBtn)$/;

  var cursorOn = false, sndOn = true, touch = false;
  var seta = null, rastro = null, pontos = [], raf = 0;
  var mx = -100, my = -100, px = -100, py = -100, vel = 0, seen = false;

  /* O rastro é a trilha que o ponteiro acabou de percorrer, guardada quadro a
   * quadro. Cada GOMO é um risquinho ligando duas posições seguidas — bolinhas
   * soltas viravam um pontilhado quando a mão corria, porque entre um quadro e
   * outro o ponteiro anda dezenas de pixels. Ligando as posições, o rastro sai
   * contínuo em qualquer velocidade.
   *
   * 16 gomos = 16 quadros ≈ um quarto de segundo de cauda: rastro leve, não
   * cometa. Precisamos de um quadro a mais que gomos para fechar o último. */
  var GOMOS = 16;
  var TRILHA = GOMOS + 2;
  var hx = new Float32Array(TRILHA), hy = new Float32Array(TRILHA), hn = 0;

  /* Comprimento de referência do gomo. Ele nunca muda de largura: o que muda é
   * o scaleX do transform, e assim o rastro inteiro é redesenhado sem custar
   * um único cálculo de layout por quadro. */
  var GOMO = 60;

  function prefs() {
    try { return (window.TCStore && TCStore.prefs) || {}; } catch (e) { return {}; }
  }
  function reduced() {
    return document.body.classList.contains("no-motion");
  }

  // ---------- Som ----------
  /* O contexto de áudio só pode nascer dentro de um gesto do usuário. Este é
   * o primeiro gesto da página, seja ele um clique num botão ou uma tecla —
   * a partir dele o menu tem som, e não só a partida. */
  var armed = false;
  function armAudio() {
    if (armed || !window.TCAudio) return;
    armed = true;
    var p = prefs();
    TCAudio.init();
    TCAudio.resume();
    if (typeof p.music === "boolean") TCAudio.setMusic(p.music);
    if (typeof p.sfx === "boolean") TCAudio.setSfx(p.sfx);
  }

  function play(nome, arg) {
    if (!sndOn || !window.TCAudio || !TCAudio[nome]) return;
    TCAudio[nome](arg);
  }

  /* Que som este controle faz. O atributo data-snd manda; sem ele, o papel do
   * elemento decide — quem tem estado ligado/desligado soa como chave. */
  function somDe(node) {
    var d = node.getAttribute("data-snd");
    if (d) return d;
    if (node.hasAttribute("aria-pressed") || node.hasAttribute("aria-checked")) return "toggle";
    if (VOLTAR.test(node.id)) return "back";
    return "click";
  }

  function tocarControle(node) {
    if (node.disabled || node.getAttribute("aria-disabled") === "true") { play("denied"); return; }
    var som = somDe(node);
    if (som === "toggle") {
      // o clique ainda não rodou: o estado novo é o inverso do atual
      var atual = node.getAttribute("aria-pressed") === "true" ||
                  node.getAttribute("aria-checked") === "true";
      play("toggle", !atual);
    } else {
      play(som);
    }
  }

  // ---------- Respingo dentro do botão ----------
  function ripple(node, x, y) {
    if (reduced()) return;
    var r = node.getBoundingClientRect();
    var d = Math.max(r.width, r.height) * 2.2;
    var s = document.createElement("span");
    s.className = "rip";
    s.style.width = s.style.height = d + "px";
    s.style.left = (x - r.left - d / 2) + "px";
    s.style.top = (y - r.top - d / 2) + "px";
    node.appendChild(s);
    setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 620);
  }

  /* Anel que nasce no ponto do clique e some. Vive no <body>, então funciona
   * mesmo quando o clique cai fora de qualquer botão. */
  function burst(x, y, forte) {
    if (reduced() || touch) return;
    var b = document.createElement("i");
    b.className = "clickburst" + (forte ? " forte" : "");
    b.style.left = x + "px";
    b.style.top = y + "px";
    document.body.appendChild(b);
    setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 520);
  }

  // ---------- Cursor ----------
  /* A mesma seta de sempre, só que desenhada por nós — a forma continua a que
   * todo mundo já sabe apontar. O que muda é o rastro: umas contas da cor do
   * tema que ficam para trás enquanto a mão anda. */
  function montarCursor() {
    if (seta) return;

    rastro = document.createElement("div");
    rastro.id = "curTrail";
    for (var i = 0; i < GOMOS; i++) {
      var c = document.createElement("i");
      // os de trás são mais finos e mais apagados: é o que faz a cauda afinar
      var t = 1 - i / GOMOS;
      var esp = 1 + t * 4;
      c.style.width = GOMO + "px";
      c.style.height = esp.toFixed(2) + "px";
      c.style.marginTop = (-esp / 2).toFixed(2) + "px";   // o eixo no meio
      c.style.opacity = (0.03 + t * 0.24).toFixed(3);
      rastro.appendChild(c);
      pontos.push(c);
    }

    seta = document.createElement("div");
    seta.id = "curArrow";
    seta.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M4 2.4 L4 19.6 L8.35 15.5 L11.1 21.7 L14.2 20.3 L11.5 14.3 L17.3 13.9 Z"/>' +
      '</svg>';

    document.body.appendChild(rastro);
    document.body.appendChild(seta);
  }

  /* A seta gruda no ponteiro, sem atraso nenhum: um cursor que chega depois
   * da mão é um cursor quebrado. O rastro é a única coisa que fica para trás.
   *
   * Cada conta ocupa uma posição por onde o ponteiro passou de verdade, alguns
   * quadros atrás — por isso o rastro desenha a curva da mão em vez de cortar
   * caminho, que é o que uma perseguição por mola faria.
   *
   * E ele some quando a mão para: parado, todas as posições guardadas são a
   * mesma, e sem o desaparecer o rastro viraria uma bolinha sob a seta. */
  function loop() {
    var dx = mx - px, dy = my - py;
    px = mx; py = my;

    // média corrida da velocidade: sobe rápido, desce devagar
    var agora = Math.sqrt(dx * dx + dy * dy);
    vel += (agora - vel) * (agora > vel ? 0.5 : 0.08);

    // hotspot da seta é a ponta, em 4,2.4 de um ícone de 24 desenhado a 22
    seta.style.transform = "translate3d(" + (mx - 3.7) + "px," + (my - 2.2) + "px,0)";

    hn = (hn + 1) % TRILHA;
    hx[hn] = mx; hy[hn] = my;

    if (reduced()) {
      rastro.style.opacity = "0";
    } else {
      rastro.style.opacity = Math.min(1, vel / 7).toFixed(3);
      for (var i = 0; i < pontos.length; i++) {
        // o gomo nasce na posição mais velha e se estica até a mais nova
        var nova = (hn - i + TRILHA) % TRILHA;
        var velha = (hn - i - 1 + TRILHA) % TRILHA;
        var gx = hx[nova] - hx[velha], gy = hy[nova] - hy[velha];
        var comp = Math.sqrt(gx * gx + gy * gy);
        pontos[i].style.transform =
          "translate3d(" + hx[velha] + "px," + hy[velha] + "px,0)" +
          " rotate(" + Math.atan2(gy, gx).toFixed(4) + "rad)" +
          " scaleX(" + (comp / GOMO).toFixed(4) + ")";
      }
    }
    raf = requestAnimationFrame(loop);
  }

  function ligarCursor(on) {
    cursorOn = !!on && !touch && matchMedia("(pointer: fine)").matches;
    if (cursorOn) {
      montarCursor();
      if (!raf) raf = requestAnimationFrame(loop);
      // só esconde o cursor do sistema depois que a seta já está desenhada
      if (seen) document.body.classList.add("tc-cursor");
    } else {
      document.body.classList.remove("tc-cursor");
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }
    return cursorOn;
  }

  /* Sobre um campo de texto a seta sai de cena e o cursor do sistema volta:
   * o I do texto diz onde a letra vai cair, e isso nenhum desenho nosso
   * faria melhor. */
  function estado(node) {
    if (!cursorOn || !node || !node.closest) return;
    seta.classList.toggle("over", !!node.closest(CTRL));
    var campo = !!node.closest(FIELD);
    seta.classList.toggle("text", campo);
    rastro.classList.toggle("text", campo);
  }

  // ---------- Ligação com a página ----------
  function bind() {
    touch = matchMedia("(pointer: coarse)").matches && !matchMedia("(pointer: fine)").matches;

    document.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      mx = e.clientX; my = e.clientY;
      if (!seen) {
        /* Primeiro movimento: a seta entra em cena. A trilha inteira nasce
         * neste ponto, senão as contas vêm voando do canto da tela. */
        seen = true; px = mx; py = my;
        hx.fill(mx); hy.fill(my);
        if (cursorOn) document.body.classList.add("tc-cursor");
      }
      estado(e.target);
    }, { passive: true });

    // ponteiro fora da janela: a seta some junto, senão fica boiando na borda
    document.addEventListener("pointerleave", function () {
      if (cursorOn) document.body.classList.add("cur-out");
    }, { passive: true });
    document.addEventListener("pointerenter", function () {
      document.body.classList.remove("cur-out");
    }, { passive: true });

    /* Som e realce no passar do mouse. Vale só para ponteiro fino: no celular
     * o "hover" acontece junto com o toque e soaria dobrado. */
    var ultimo = null;
    document.addEventListener("pointerover", function (e) {
      if (e.pointerType === "touch") return;
      var node = e.target.closest && e.target.closest(CTRL);
      if (node === ultimo) return;
      ultimo = node;
      if (node && !node.disabled) play("hover");
    }, { passive: true });

    /* O clique. Soa e respinga no apertar, não no soltar: meio quadro antes,
     * e a diferença é sentida mesmo sem ser percebida. */
    document.addEventListener("pointerdown", function (e) {
      armAudio();
      var node = e.target.closest && e.target.closest(CTRL);
      if (cursorOn) seta.classList.add("down");
      burst(e.clientX, e.clientY, !!node);
      if (!node) return;
      node.classList.add("is-press");
      tocarControle(node);
      if (node.matches(CAIXA)) ripple(node, e.clientX, e.clientY);
    }, { passive: true });

    function soltar() {
      if (cursorOn) seta.classList.remove("down");
      var presos = document.querySelectorAll(".is-press");
      for (var i = 0; i < presos.length; i++) presos[i].classList.remove("is-press");
    }
    document.addEventListener("pointerup", soltar, { passive: true });
    document.addEventListener("pointercancel", soltar, { passive: true });

    // teclado também é gesto: quem joga só no teclado merece o menu com som
    window.addEventListener("keydown", armAudio, { passive: true });

    /* Botão acionado pelo teclado (Enter/Espaço) não passa por pointerdown.
     * Sem isto, navegar de Tab em Tab seria mudo. */
    document.addEventListener("click", function (e) {
      if (e.detail !== 0) return;        // detail 0 = veio do teclado
      var node = e.target.closest && e.target.closest(CTRL);
      if (node) tocarControle(node);
    }, { passive: true });
  }

  // ---------- API ----------
  var api = {
    /* Chamado uma vez no boot, e de novo sempre que as opções mudam. */
    apply: function (p) {
      p = p || prefs();
      sndOn = p.uiSfx !== false;
      if (window.TCAudio && TCAudio.setUiSfx) TCAudio.setUiSfx(sndOn);
      ligarCursor(p.cursor !== "system");
    },
    start: function () {
      if (!document.body) return;
      bind();
      api.apply();
    },
    burst: burst,
    /* Um jeito de outras telas pedirem o som de "painel abrindo". */
    open: function () { play("open"); }
  };

  return api;
})();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () { TCUiFx.start(); });
} else {
  TCUiFx.start();
}
