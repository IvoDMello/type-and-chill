/* Servidor estático mínimo, só para desenvolvimento e testes.
 * O jogo funciona com duplo clique no index.html; isto existe porque o
 * localStorage é mais bem comportado em http:// do que em file://.
 *
 *   npm run serve            → http://127.0.0.1:8123
 *   node tools/serve.js 3000 → outra porta
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = parseInt(process.argv[2], 10) || 8123;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";

  // o ícone do jogo é um data: URI no HTML; sem isto o navegador pede este
  // caminho em toda página e enche o console de 404
  if (rel === "/favicon.ico") { res.writeHead(204).end(); return; }

  const file = path.join(ROOT, rel);
  // não serve nada fora da pasta do projeto
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end("forbidden");
    return;
  }

  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("não encontrado");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(buf);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("Type & Chill em http://127.0.0.1:" + PORT);
});

module.exports = server;
