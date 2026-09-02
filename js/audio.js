/* Type & Chill — trilha ambiente generativa + efeitos sonoros.
 *
 * Tudo é gerado em tempo real com a Web Audio API: nenhum arquivo de áudio,
 * nenhuma música com direitos autorais. Ou seja, você pode gravar e postar
 * (Instagram, YouTube, TikTok) sem risco de "copyright strike".
 *
 * A música nunca se repete igual: um pad de acordes lentos e notas soltas
 * numa escala pentatônica, que sempre soam bem juntas. Cada tema visual tem
 * seu próprio clima harmônico — a definição vive em themes.js (audio.*).
 *
 * Quer trocar por uma faixa sua no futuro? Veja a nota no fim do arquivo.
 */
window.TCAudio = (function () {
  "use strict";

  var AC = null, master = null, reverb = null, wet = null;
  var musicBus = null, sfxBus = null, melodyGain = null, padGain = null, padFilter = null, lfo = null;
  var padVoices = [], rainSrc = null, rainGain = null, rainFilter = null;
  var chordIdx = 0, nextNoteTime = 0, schedTimer = null, chordTimer = null;
  var musicOn = true, sfxOn = true, started = false;

  /* Música e efeitos têm barramentos separados porque o menu de opções tem
   * dois cursores. MUSIC_TOP e SFX_TOP são o volume "no talo": o cursor é um
   * multiplicador de 0 a 1 em cima deles, nunca um ganho solto. */
  var MUSIC_TOP = 0.9, SFX_TOP = 1.0;
  var musicVol = 0.7, sfxVol = 0.8;

  function clamp01(v) {
    var n = typeof v === "number" ? v : parseFloat(v);
    if (!(n >= 0)) return 0;
    return n > 1 ? 1 : n;
  }
  function musicTarget() { return musicOn ? MUSIC_TOP * musicVol : 0; }

  // clima atual (sobrescrito por setMood)
  var mood = {
    chords: [
      [220.00, 261.63, 329.63],
      [174.61, 220.00, 261.63],
      [130.81, 164.81, 196.00],
      [196.00, 246.94, 293.66]
    ],
    scale: [440.00, 523.25, 587.33, 659.25, 783.99, 880.00],
    pad: "triangle", cutoff: 700, rain: 0
  };

  function makeReverb() {
    var len = Math.floor(AC.sampleRate * 2.6);
    var buf = AC.createBuffer(2, len, AC.sampleRate);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
    }
    var conv = AC.createConvolver();
    conv.buffer = buf;
    return conv;
  }

  function buildPad() {
    padGain = AC.createGain();
    padGain.gain.value = 0.0001;
    padFilter = AC.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = mood.cutoff;
    padFilter.Q.value = 0.6;

    // LFO lento move o filtro -> o som "respira"
    lfo = AC.createOscillator();
    var lfoGain = AC.createGain();
    lfo.frequency.value = 0.05;
    lfoGain.gain.value = 260;
    lfo.connect(lfoGain); lfoGain.connect(padFilter.frequency);
    lfo.start();

    var chord = mood.chords[0];
    for (var v = 0; v < 3; v++) {
      // cada voz = 2 osciladores levemente desafinados (mais quente)
      var vg = AC.createGain(); vg.gain.value = 0.33;
      var a = AC.createOscillator(), b = AC.createOscillator();
      a.type = mood.pad; b.type = "sine";
      a.frequency.value = chord[v]; b.frequency.value = chord[v];
      b.detune.value = 6;
      a.connect(vg); b.connect(vg); vg.connect(padFilter);
      a.start(); b.start();
      padVoices.push({ a: a, b: b });
    }
    padFilter.connect(padGain);
    padGain.connect(musicBus);
  }

  function buildRain() {
    var len = Math.floor(AC.sampleRate * 2);
    var buf = AC.createBuffer(1, len, AC.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    rainSrc = AC.createBufferSource();
    rainSrc.buffer = buf; rainSrc.loop = true;

    rainFilter = AC.createBiquadFilter();
    rainFilter.type = "bandpass";
    rainFilter.frequency.value = 1500;
    rainFilter.Q.value = 0.4;

    rainGain = AC.createGain();
    rainGain.gain.value = 0.0001;

    rainSrc.connect(rainFilter); rainFilter.connect(rainGain);
    rainGain.connect(musicBus);
    rainSrc.start();
  }

  function changeChord() {
    if (!AC) return;
    chordIdx = (chordIdx + 1) % mood.chords.length;
    applyChord(4.5);
  }
  function applyChord(seconds) {
    var chord = mood.chords[chordIdx % mood.chords.length];
    var t = AC.currentTime;
    for (var v = 0; v < padVoices.length; v++) {
      var f = chord[v];
      padVoices[v].a.frequency.linearRampToValueAtTime(f, t + seconds);
      padVoices[v].b.frequency.linearRampToValueAtTime(f, t + seconds);
    }
  }

  function bell(freq, when, vol, dur, bus) {
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, when + (dur || 1.9));
    o.connect(g);
    g.connect(bus || melodyGain);             // seco
    var send = AC.createGain(); send.gain.value = 0.5;
    g.connect(send); send.connect(wet);       // com reverb
    o.start(when); o.stop(when + (dur || 1.9) + 0.05);
  }

  // Agendador com "lookahead" — mantém a melodia fluindo sem travar
  function scheduler() {
    if (!AC) return;
    while (nextNoteTime < AC.currentTime + 0.3) {
      if (musicOn && Math.random() < 0.55) {
        var f = mood.scale[(Math.random() * mood.scale.length) | 0];
        if (Math.random() < 0.25) f *= 0.5;   // às vezes uma oitava abaixo
        bell(f, nextNoteTime, 0.10 + Math.random() * 0.05);
      }
      nextNoteTime += 1.9 + Math.random() * 1.4;  // ritmo calmo e irregular
    }
  }

  function init() {
    if (started) return;
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) { AC = null; return; }
    started = true;

    master = AC.createGain(); master.gain.value = 0.9;
    master.connect(AC.destination);

    reverb = makeReverb();
    wet = AC.createGain(); wet.gain.value = 0.9;
    reverb.connect(wet); wet.connect(master);

    musicBus = AC.createGain(); musicBus.gain.value = musicTarget();
    musicBus.connect(master);

    // os efeitos não passam pelo barramento da música: assim dá para deixar a
    // trilha baixinha e continuar ouvindo a tecla, ou o contrário
    sfxBus = AC.createGain(); sfxBus.gain.value = sfxVol * SFX_TOP;
    sfxBus.connect(master);
    var sfxSend = AC.createGain(); sfxSend.gain.value = 0.35;
    sfxBus.connect(sfxSend); sfxSend.connect(reverb);
    // um pouco de tudo também vai pro reverb, dando profundidade
    var ambSend = AC.createGain(); ambSend.gain.value = 0.3;
    musicBus.connect(ambSend); ambSend.connect(reverb);

    melodyGain = AC.createGain(); melodyGain.gain.value = 0.9;
    melodyGain.connect(musicBus);

    buildPad();
    buildRain();

    // sobe o pad suavemente
    padGain.gain.setValueAtTime(0.0001, AC.currentTime);
    padGain.gain.exponentialRampToValueAtTime(0.075, AC.currentTime + 6);
    if (mood.rain > 0) {
      rainGain.gain.exponentialRampToValueAtTime(mood.rain, AC.currentTime + 5);
    }

    nextNoteTime = AC.currentTime + 1.0;
    schedTimer = setInterval(scheduler, 120);
    chordTimer = setInterval(changeChord, 16000);
  }

  /* Troca o clima harmônico ao mudar de tema visual.
   * Pode ser chamado antes ou depois do init — nos dois casos funciona. */
  function setMood(next) {
    if (!next) return;
    mood = {
      chords: next.chords || mood.chords,
      scale: next.scale || mood.scale,
      pad: next.pad || mood.pad,
      cutoff: next.cutoff || mood.cutoff,
      rain: next.rain || 0
    };
    if (!AC) return;
    var t = AC.currentTime;
    for (var v = 0; v < padVoices.length; v++) padVoices[v].a.type = mood.pad;
    if (padFilter) padFilter.frequency.setTargetAtTime(mood.cutoff, t, 1.2);
    applyChord(3.0);
    if (rainGain) {
      rainGain.gain.cancelScheduledValues(t);
      rainGain.gain.setValueAtTime(Math.max(0.0001, rainGain.gain.value), t);
      rainGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, mood.rain), t + 2.5);
    }
  }

  function resume() {
    if (AC && AC.state === "suspended") { try { AC.resume(); } catch (e) {} }
  }

  // -------- efeitos --------
  function key() {
    if (!sfxOn || !AC) return;
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = "triangle"; o.frequency.value = 900 + Math.random() * 120;
    var t = AC.currentTime;
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g); g.connect(sfxBus || master);
    o.start(t); o.stop(t + 0.06);
  }
  function capture() {
    if (!sfxOn || !AC) return;
    var i = (Math.random() * (mood.scale.length - 1)) | 0;
    var t = AC.currentTime;
    bell(mood.scale[i], t, 0.16, 1.4, sfxBus);
    bell(mood.scale[i + 1], t + 0.09, 0.14, 1.6, sfxBus);
  }
  function miss() {
    if (!sfxOn || !AC) return;
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = "sine"; o.frequency.value = 150;
    var t = AC.currentTime;
    o.frequency.exponentialRampToValueAtTime(90, t + 0.3);
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.connect(g); g.connect(sfxBus || master);
    o.start(t); o.stop(t + 0.36);
  }
  function levelUp() {
    if (!sfxOn || !AC) return;
    var t = AC.currentTime;
    bell(mood.scale[0], t, 0.13, 1.2, sfxBus);
    bell(mood.scale[2], t + 0.11, 0.13, 1.3, sfxBus);
    bell(mood.scale[4], t + 0.22, 0.13, 1.6, sfxBus);
  }

  /* -------- sons de interface --------
   * Clicar, passar o mouse, voltar. São os sons que dão peso de jogo ao menu:
   * curtos, secos e bem mais baixos que os da partida — o menu é atravessado
   * dezenas de vezes por sessão e nada cansa mais que um clique alto.
   * Todos passam pelo barramento de efeitos, então o cursor de "efeitos" do
   * menu de opções também controla estes. */
  var uiOn = true;
  var noiseBuf = null, lastHoverAt = 0;

  function getNoise() {
    if (noiseBuf) return noiseBuf;
    var len = Math.floor(AC.sampleRate * 0.4);
    noiseBuf = AC.createBuffer(1, len, AC.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  /* Um "tk" de ruído filtrado: é o corpo do clique, o que soa como plástico
   * batendo. Sozinho fica seco demais, então quem chama junta um tom. */
  function tick(t, freq, q, vol, dur) {
    var s = AC.createBufferSource();
    s.buffer = getNoise();
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    var f = AC.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = freq; f.Q.value = q;
    var g = AC.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(sfxBus || master);
    s.start(t); s.stop(t + dur + 0.02);
  }

  /* Um tom curto com envelope de percussão. from/to em Hz. */
  function blip(t, from, to, vol, dur, type) {
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = type || "triangle";
    o.frequency.setValueAtTime(from, t);
    if (to && to !== from) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(sfxBus || master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function uiReady() { return uiOn && sfxOn && !!AC; }

  /* Clique numa ação: corpo de ruído + um tom que sobe. */
  function click() {
    if (!uiReady()) return;
    var t = AC.currentTime;
    tick(t, 2600, 1.1, 0.10, 0.045);
    blip(t, 520, 880, 0.055, 0.075, "triangle");
  }

  /* Passar o mouse por cima. Precisa ser quase subliminar: o ponteiro cruza
   * meia dúzia de botões num movimento só. */
  function hover() {
    if (!uiReady()) return;
    var now = Date.now();
    if (now - lastHoverAt < 45) return;      // varrer o menu não vira chiado
    lastHoverAt = now;
    blip(AC.currentTime, 1650, 1900, 0.018, 0.035, "sine");
  }

  /* Fechar, voltar, cancelar: o mesmo clique, só que descendo. */
  function back() {
    if (!uiReady()) return;
    var t = AC.currentTime;
    tick(t, 1500, 1.0, 0.07, 0.05);
    blip(t, 620, 380, 0.05, 0.11, "triangle");
  }

  /* Botão desabilitado: um baque abafado, sem tom nenhum. */
  function denied() {
    if (!uiReady()) return;
    var t = AC.currentTime;
    tick(t, 320, 0.8, 0.09, 0.09);
    blip(t, 180, 140, 0.045, 0.12, "sine");
  }

  /* Ligar/desligar uma chave: dois degraus, para cima ou para baixo. */
  function toggle(on) {
    if (!uiReady()) return;
    var t = AC.currentTime;
    tick(t, 2200, 1.2, 0.07, 0.04);
    if (on) { blip(t, 620, 620, 0.05, 0.05); blip(t + 0.055, 930, 930, 0.05, 0.09); }
    else { blip(t, 780, 780, 0.045, 0.05); blip(t + 0.055, 500, 500, 0.045, 0.09); }
  }

  /* Abrir um painel: um sopro curto que sobe, tipo HUD acendendo. */
  function open() {
    if (!uiReady()) return;
    var t = AC.currentTime;
    tick(t, 1800, 0.7, 0.05, 0.14);
    blip(t, 440, 990, 0.05, 0.16, "sine");
  }

  function setUiSfx(on) { uiOn = !!on; }

  // -------- controles --------
  function setMusic(on) {
    musicOn = !!on;
    if (musicBus && AC) {
      musicBus.gain.linearRampToValueAtTime(musicTarget(), AC.currentTime + 0.4);
    }
  }
  function setSfx(on) { sfxOn = !!on; }

  /* Cursores do menu de opções, de 0 a 1. Rampa curta em vez de salto: mexer
   * no cursor durante a partida não pode estalar no fone. */
  function setMusicVolume(v) {
    musicVol = clamp01(v);
    if (musicBus && AC) {
      musicBus.gain.linearRampToValueAtTime(musicTarget(), AC.currentTime + 0.15);
    }
    return musicVol;
  }
  function setSfxVolume(v) {
    sfxVol = clamp01(v);
    if (sfxBus && AC) {
      sfxBus.gain.linearRampToValueAtTime(sfxVol * SFX_TOP, AC.currentTime + 0.15);
    }
    return sfxVol;
  }
  function volumes() { return { music: musicVol, sfx: sfxVol, musicOn: musicOn, sfxOn: sfxOn }; }

  return {
    init: init, resume: resume, setMood: setMood,
    key: key, capture: capture, miss: miss, levelUp: levelUp,
    click: click, hover: hover, back: back, denied: denied,
    toggle: toggle, open: open, setUiSfx: setUiSfx,
    setMusic: setMusic, setSfx: setSfx,
    setMusicVolume: setMusicVolume, setSfxVolume: setSfxVolume, volumes: volumes
  };
})();

/* -----------------------------------------------------------------------
 * TROCAR POR UMA MÚSICA SUA (opcional)
 * -----------------------------------------------------------------------
 * A trilha acima é generativa e livre de direitos. Se um dia quiser usar
 * uma faixa própria (.mp3/.ogg), lembre que músicas comerciais podem gerar
 * bloqueio de direitos autorais no Instagram/YouTube. Para usar a sua:
 *
 *   1) coloque o arquivo em  assets/musica.mp3
 *   2) no index.html adicione:  <audio id="track" src="assets/musica.mp3" loop></audio>
 *   3) no botão de música do game.js, chame  document.getElementById('track').play()
 *
 * Recomendo manter a generativa como padrão — é o diferencial do projeto.
 * --------------------------------------------------------------------- */
