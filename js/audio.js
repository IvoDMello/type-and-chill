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
  var musicBus = null, melodyGain = null, padGain = null, padFilter = null, lfo = null;
  var padVoices = [], rainSrc = null, rainGain = null, rainFilter = null;
  var chordIdx = 0, nextNoteTime = 0, schedTimer = null, chordTimer = null;
  var musicOn = true, sfxOn = true, started = false;

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

  function bell(freq, when, vol, dur) {
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = "sine"; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, when + (dur || 1.9));
    o.connect(g);
    g.connect(melodyGain);                    // seco
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

    musicBus = AC.createGain(); musicBus.gain.value = musicOn ? 0.9 : 0.0;
    musicBus.connect(master);
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
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.06);
  }
  function capture() {
    if (!sfxOn || !AC) return;
    var i = (Math.random() * (mood.scale.length - 1)) | 0;
    var t = AC.currentTime;
    bell(mood.scale[i], t, 0.16, 1.4);
    bell(mood.scale[i + 1], t + 0.09, 0.14, 1.6);
  }
  function miss() {
    if (!sfxOn || !AC) return;
    var o = AC.createOscillator(), g = AC.createGain();
    o.type = "sine"; o.frequency.value = 150;
    var t = AC.currentTime;
    o.frequency.exponentialRampToValueAtTime(90, t + 0.3);
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + 0.36);
  }
  function levelUp() {
    if (!sfxOn || !AC) return;
    var t = AC.currentTime;
    bell(mood.scale[0], t, 0.13, 1.2);
    bell(mood.scale[2], t + 0.11, 0.13, 1.3);
    bell(mood.scale[4], t + 0.22, 0.13, 1.6);
  }

  // -------- controles --------
  function setMusic(on) {
    musicOn = on;
    if (musicBus && AC) {
      musicBus.gain.linearRampToValueAtTime(on ? 0.9 : 0.0, AC.currentTime + 0.4);
    }
  }
  function setSfx(on) { sfxOn = on; }

  return {
    init: init, resume: resume, setMood: setMood,
    key: key, capture: capture, miss: miss, levelUp: levelUp,
    setMusic: setMusic, setSfx: setSfx
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
