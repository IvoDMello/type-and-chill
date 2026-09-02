/* Type & Chill — service worker.
 *
 * O documento de design falava em empacotar com Tauri ou Electron para virar
 * aplicativo. Um PWA entrega a mesma coisa que interessa aqui — ícone, janela
 * própria, funcionar sem internet — sem trocar de tecnologia, sem instalador
 * e sem loja no meio. O jogo continua sendo a mesma pasta de HTML.
 *
 * Estratégia: cache-first para o que compõe o jogo (ele nunca muda no meio de
 * uma partida), com atualização em segundo plano. Troque CACHE quando publicar
 * uma versão nova.
 */
var CACHE = "type-and-chill-v2";
var SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./css/themes.css",
  "./css/style.css",
  "./js/words.js",
  "./js/examples.js",
  "./js/core/rng.js",
  "./js/core/srs.js",
  "./js/core/scoring.js",
  "./js/core/challenge.js",
  "./js/core/wordbank.js",
  "./js/core/progress.js",
  "./js/storage.js",
  "./js/themes.js",
  "./js/audio.js",
  "./js/ui-fx.js",
  "./js/speech.js",
  "./js/notebook.js",
  "./js/challengeui.js",
  "./js/game.js"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // addAll falha inteiro se um arquivo faltar; um a um é mais tolerante
    return Promise.all(SHELL.map(function (url) {
      return c.add(url).catch(function () { return null; });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) {
      return k === CACHE ? null : caches.delete(k);
    }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // fontes e afins: rede

  e.respondWith(caches.match(req).then(function (hit) {
    var rede = fetch(req).then(function (res) {
      if (res && res.status === 200) {
        var copia = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copia); });
      }
      return res;
    }).catch(function () { return hit; });
    return hit || rede;
  }));
});
