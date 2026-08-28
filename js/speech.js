/* Type & Chill — pronúncia das palavras.
 *
 * Usa a Web Speech API, que já vem no navegador: nenhum arquivo de áudio,
 * nenhuma API paga, nenhuma chave. Se o navegador não tiver vozes em inglês
 * (acontece em alguns Linux), o recurso simplesmente se desliga sozinho e o
 * resto do jogo segue igual.
 */
window.TCSpeech = (function () {
  "use strict";

  var synth = window.speechSynthesis || null;
  var voice = null, ready = false, enabled = false;

  function pickVoice() {
    if (!synth) return null;
    var voices = synth.getVoices() || [];
    if (!voices.length) return null;
    // preferimos uma voz en-US local (não depende de rede e soa mais estável)
    var byName = function (re) {
      for (var i = 0; i < voices.length; i++) if (re.test(voices[i].name)) return voices[i];
      return null;
    };
    var enLocal = voices.filter(function (v) { return /^en(-|_)/i.test(v.lang) && v.localService; });
    var en = voices.filter(function (v) { return /^en(-|_)/i.test(v.lang); });
    return byName(/Google US English/i) || enLocal[0] || en[0] || null;
  }

  function init() {
    if (!synth || ready) return isAvailable();
    voice = pickVoice();
    // no Chrome a lista chega assíncrona; reavaliamos quando ela aparecer
    if (!voice && typeof synth.addEventListener === "function") {
      synth.addEventListener("voiceschanged", function () { voice = pickVoice(); }, { once: true });
    }
    ready = true;
    return isAvailable();
  }

  function isAvailable() { return !!synth; }

  function setEnabled(on) {
    enabled = !!on;
    if (enabled) init(); else cancel();
  }

  function cancel() { if (synth) { try { synth.cancel(); } catch (e) {} } }

  /* Fala uma palavra. Cancela a anterior para não empilhar fila numa
   * sequência rápida de capturas. */
  function say(text) {
    if (!enabled || !synth || !text) return;
    try {
      if (!voice) voice = pickVoice();
      synth.cancel();
      var u = new SpeechSynthesisUtterance(text);
      if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = "en-US"; }
      u.rate = 0.95;
      u.pitch = 1;
      u.volume = 0.9;
      synth.speak(u);
    } catch (e) { /* alguns navegadores lançam se a aba perdeu o foco */ }
  }

  return { init: init, isAvailable: isAvailable, setEnabled: setEnabled, say: say, cancel: cancel };
})();
