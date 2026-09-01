/* Type & Chill — temas visuais (paleta + fundo animado + clima sonoro).
 *
 * Cada tema define:
 *   label   → nome que aparece no seletor
 *   swatch  → duas cores para o preview do chip
 *   bg      → como as partículas do fundo se comportam
 *   audio   → acordes e escala usados pela trilha generativa (audio.js)
 *
 * As cores da interface vivem em css/themes.css, no bloco
 * html[data-visual="<chave>"]. Para criar um tema novo, adicione um bloco lá
 * e uma entrada aqui com a mesma chave.
 */
window.TC_VISUALS = {

  ember: {
    label: "Brasa",
    swatch: ["#ff9d4d", "#2a0e0d"],
    bg: {
      kind: "dot", dir: -1,              // sobe, como brasa
      colors: ["255,170,90", "255,110,70"],
      speed: [4, 13], size: [0.4, 2.0], sway: 6, density: 16000, alpha: [0.12, 0.62]
    },
    audio: {
      chords: [
        [220.00, 261.63, 329.63],        // Am
        [174.61, 220.00, 261.63],        // F
        [130.81, 164.81, 196.00],        // C
        [196.00, 246.94, 293.66]         // G
      ],
      scale: [440.00, 523.25, 587.33, 659.25, 783.99, 880.00],
      pad: "triangle", cutoff: 700, rain: 0
    }
  },

  lofi: {
    label: "Noite lo-fi",
    swatch: ["#a78bfa", "#140e26"],
    bg: {
      kind: "dot", dir: 1,               // poeira descendo devagar
      colors: ["167,139,250", "125,211,252"],
      speed: [3, 9], size: [0.5, 2.2], sway: 12, density: 15000, alpha: [0.10, 0.55]
    },
    audio: {
      chords: [
        [146.83, 174.61, 220.00],        // Dm
        [116.54, 146.83, 174.61],        // Bb
        [174.61, 220.00, 261.63],        // F
        [130.81, 164.81, 196.00]         // C
      ],
      scale: [349.23, 392.00, 440.00, 523.25, 587.33, 698.46],
      pad: "sine", cutoff: 560, rain: 0
    }
  },

  rain: {
    label: "Chuva",
    swatch: ["#67e8f9", "#0a1622"],
    bg: {
      kind: "line", dir: 1,              // gotas caindo
      colors: ["103,232,249", "148,190,220"],
      speed: [220, 420], size: [0.5, 1.2], sway: 2, density: 9000, alpha: [0.08, 0.34]
    },
    audio: {
      chords: [
        [164.81, 196.00, 246.94],        // Em
        [130.81, 164.81, 196.00],        // C
        [196.00, 246.94, 293.66],        // G
        [146.83, 185.00, 220.00]         // D
      ],
      scale: [329.63, 392.00, 440.00, 493.88, 587.33, 659.25],
      pad: "sine", cutoff: 480, rain: 0.055
    }
  },

  dawn: {
    label: "Manhã",
    swatch: ["#f0836a", "#fdf1e3"],
    bg: {
      kind: "dot", dir: 1,               // pólen flutuando na luz
      colors: ["224,122,95", "212,163,90"],
      speed: [2, 7], size: [0.6, 2.4], sway: 14, density: 20000, alpha: [0.10, 0.40]
    },
    audio: {
      chords: [
        [130.81, 164.81, 196.00],        // C
        [196.00, 246.94, 293.66],        // G
        [220.00, 261.63, 329.63],        // Am
        [174.61, 220.00, 261.63]         // F
      ],
      scale: [392.00, 440.00, 523.25, 587.33, 659.25, 783.99],
      pad: "triangle", cutoff: 900, rain: 0
    }
  },

  /* Aurora: o clima do último marco (900 palavras digitadas). Partículas
     lentas subindo e uma harmonia mais aberta que a dos outros três. */
  aurora: {
    label: "Aurora",
    swatch: ["#5eead4", "#07231f"],
    bg: {
      kind: "dot", dir: -1,              // luz subindo devagar
      colors: ["94,234,212", "129,140,248"],
      speed: [3, 10], size: [0.5, 2.3], sway: 18, density: 14000, alpha: [0.10, 0.52]
    },
    audio: {
      chords: [
        [146.83, 185.00, 220.00],        // D
        [164.81, 196.00, 246.94],        // Em
        [110.00, 164.81, 196.00],        // A5
        [196.00, 246.94, 293.66]         // G
      ],
      scale: [369.99, 440.00, 493.88, 554.37, 659.25, 739.99],
      pad: "sine", cutoff: 620, rain: 0
    }
  }

};

/* ---------------------------------------------------------------------
 * Fundo animado: partículas + explosões de captura, num único canvas.
 * ------------------------------------------------------------------- */
window.TCBackdrop = (function () {
  "use strict";

  var canvas = null, ctx = null;
  var W = 0, H = 0;
  var bits = [], puffs = [];
  var quality = 1;
  var spec = window.TC_VISUALS.ember.bg;
  var systemReduce = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches);
  var reduce = systemReduce;

  /* Qualidade dos gráficos.
   *
   * "auto" é o padrão e deixa o jogo medir o FPS e aliviar sozinho em máquina
   * fraca. Escolher um nível no menu de opções desliga essa medição: quem
   * mandou foi a pessoa, e o jogo não pode ficar mexendo por cima. */
  var QUALITY_LEVELS = { auto: 1, high: 1, medium: 0.6, low: 0.3, off: 0 };
  var qualityMode = "auto";

  function rand(range) { return range[0] + Math.random() * (range[1] - range[0]); }

  function attach(el) {
    canvas = el; ctx = canvas.getContext("2d");
    resize();
  }
  function resize() {
    if (!canvas) return;
    W = window.innerWidth; H = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }
  function seed() {
    bits = [];
    if (quality <= 0) return;                  // partículas desligadas de vez
    var n = Math.round((W * H / spec.density) * quality);
    if (reduce) n = Math.round(n / 3);
    for (var i = 0; i < n; i++) bits.push(makeBit(true));
  }

  /* O jogo mede o FPS e chama isto quando o quadro fica caro: menos
   * partículas em máquina fraca, sem mudar nada do resto. */
  function setQuality(q) {
    if (qualityMode !== "auto") return;        // no modo manual, o FPS não manda
    var next = Math.max(0.2, Math.min(1, q));
    if (next === quality) return;
    quality = next;
    seed();
  }

  /* Nível escolhido no menu. Devolve o modo em vigor, para a UI confirmar. */
  function setQualityMode(mode) {
    if (!Object.prototype.hasOwnProperty.call(QUALITY_LEVELS, mode)) mode = "auto";
    qualityMode = mode;
    quality = QUALITY_LEVELS[mode];
    seed();
    return qualityMode;
  }
  function isAdaptive() { return qualityMode === "auto"; }

  /* Movimento: "auto" segue o sistema, "reduced" força calma, "full" ignora a
   * preferência do sistema (para quem quer o efeito mesmo assim). */
  function setMotion(mode) {
    reduce = mode === "reduced" ? true : (mode === "full" ? false : systemReduce);
    seed();
    return reduce;
  }
  function isReduced() { return reduce; }
  function makeBit(anywhere) {
    return {
      x: Math.random() * W,
      y: anywhere ? Math.random() * H : (spec.dir > 0 ? -8 : H + 8),
      r: rand(spec.size),
      s: rand(spec.speed),
      a: rand(spec.alpha),
      tw: Math.random() * Math.PI * 2,
      c: spec.colors[(Math.random() * spec.colors.length) | 0]
    };
  }
  function setVisual(key) {
    var v = window.TC_VISUALS[key] || window.TC_VISUALS.ember;
    spec = v.bg;
    document.documentElement.setAttribute("data-visual", key);
    seed();
  }

  function draw(dt, now) {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    for (var i = 0; i < bits.length; i++) {
      var b = bits[i];
      b.y += spec.dir * b.s * dt;
      b.x += Math.sin(now / 1400 + b.tw) * spec.sway * dt;
      if (spec.dir > 0 ? b.y > H + 8 : b.y < -8) { bits[i] = makeBit(false); continue; }
      var a = b.a * (0.55 + 0.45 * Math.sin(now / 650 + b.tw));
      ctx.beginPath();
      if (spec.kind === "line") {
        ctx.strokeStyle = "rgba(" + b.c + "," + a + ")";
        ctx.lineWidth = b.r;
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(b.x + 1, b.y + Math.max(8, b.s * 0.045));
        ctx.stroke();
      } else {
        ctx.arc(b.x, b.y, b.r, 0, 6.283);
        ctx.fillStyle = "rgba(" + b.c + "," + a + ")";
        ctx.fill();
      }
    }

    for (var j = puffs.length - 1; j >= 0; j--) {
      var p = puffs[j];
      p.life -= dt;
      if (p.life <= 0) { puffs.splice(j, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 30 * dt;
      var k = p.life / p.max;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * k + 0.4, 0, 6.283);
      ctx.fillStyle = "rgba(" + p.c + "," + (k * 0.9) + ")";
      ctx.fill();
    }
  }

  function burst(x, y) {
    if (reduce || quality <= 0) return;
    for (var i = 0; i < 16; i++) {
      var ang = Math.random() * 6.283, sp = 40 + Math.random() * 160;
      puffs.push({
        x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 50,
        r: Math.random() * 2.6 + 1, life: 0.5 + Math.random() * 0.5, max: 1,
        c: spec.colors[(Math.random() * spec.colors.length) | 0]
      });
    }
  }
  function clearPuffs() { puffs = []; }

  return {
    attach: attach, resize: resize, setVisual: setVisual, setQuality: setQuality,
    setQualityMode: setQualityMode, isAdaptive: isAdaptive,
    setMotion: setMotion, isReduced: isReduced,
    draw: draw, burst: burst, clearPuffs: clearPuffs
  };
})();
