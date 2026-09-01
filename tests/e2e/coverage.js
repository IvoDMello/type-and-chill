/* Cobertura do JavaScript de interface, medida no Chrome de verdade.
 *
 * O `node --test --experimental-test-coverage` cobre o que roda no Node —
 * core/, storage.js. Só que metade do jogo é DOM: game.js, notebook.js,
 * options.js, challengeui.js e themes.js nunca aparecem naquele relatório, e
 * era justamente aí que dava para quebrar tudo sem nenhum teste reclamar.
 *
 * Aqui a medida vem do próprio V8, pelo protocolo do Chrome: para cada arquivo
 * o navegador devolve as faixas de bytes que chegaram a executar. É a mesma
 * conta que a aba Coverage do DevTools mostra.
 *
 * Uso:
 *   const cov = criarColetor(BASE);
 *   await cov.iniciar(page);      // antes de navegar
 *   await cov.coletar(page);      // antes de fechar a página
 *   cov.relatorio();              // [{ arquivo, total, coberto, pct }]
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");

/* Une faixas que se sobrepõem — a mesma linha executada em dez páginas
 * diferentes conta uma vez só. */
function unir(faixas) {
  if (!faixas.length) return [];
  const ordenadas = faixas.slice().sort((a, b) => a[0] - b[0]);
  const saida = [ordenadas[0].slice()];
  for (let i = 1; i < ordenadas.length; i++) {
    const atual = ordenadas[i];
    const ultimo = saida[saida.length - 1];
    if (atual[0] <= ultimo[1]) {
      if (atual[1] > ultimo[1]) ultimo[1] = atual[1];
    } else {
      saida.push(atual.slice());
    }
  }
  return saida;
}

function criarColetor(baseUrl, opcoes) {
  const o = opcoes || {};
  const ignorar = o.ignorar || [];
  const arquivos = new Map();          // caminho relativo → { total, faixas }

  async function iniciar(page) {
    try {
      await page.coverage.startJSCoverage({ resetOnNavigation: false });
    } catch (e) { /* sem coverage, os testes seguem: o relatório é que fica vazio */ }
  }

  async function coletar(page) {
    let entradas = [];
    try { entradas = await page.coverage.stopJSCoverage(); } catch (e) { return; }
    for (const e of entradas) {
      if (!e.url || !e.url.startsWith(baseUrl)) continue;
      const rel = e.url.slice(baseUrl.length).replace(/^\//, "").split("?")[0];
      if (!rel.endsWith(".js")) continue;
      if (ignorar.some(p => rel === p)) continue;
      let f = arquivos.get(rel);
      if (!f) { f = { total: (e.text || "").length, faixas: [] }; arquivos.set(rel, f); }
      for (const r of e.ranges || []) f.faixas.push([r.start, r.end]);
    }
  }

  function relatorio() {
    const linhas = [];
    for (const [arquivo, f] of arquivos) {
      const coberto = unir(f.faixas).reduce((s, [a, b]) => s + (b - a), 0);
      linhas.push({
        arquivo,
        total: f.total,
        coberto,
        pct: f.total ? Math.round((coberto / f.total) * 1000) / 10 : 0
      });
    }
    return linhas.sort((a, b) => a.arquivo.localeCompare(b.arquivo));
  }

  /* Tabela legível no terminal, no mesmo espírito do relatório do node:test. */
  function tabela(linhas, limites) {
    const larg = Math.max(24, ...linhas.map(l => l.arquivo.length));
    const regua = "-".repeat(larg + 34);
    const out = [regua,
      "arquivo".padEnd(larg) + " | bytes  | cobertos | cobertura | mínimo",
      regua];
    for (const l of linhas) {
      const min = limites[l.arquivo];
      out.push(
        l.arquivo.padEnd(larg) + " | " +
        String(l.total).padStart(6) + " | " +
        String(l.coberto).padStart(8) + " | " +
        (l.pct.toFixed(1) + "%").padStart(9) + " | " +
        (min === undefined ? "     —" : String(min).padStart(6)) +
        (min !== undefined && l.pct < min ? "  ✗" : "")
      );
    }
    out.push(regua);
    return out.join("\n");
  }

  function salvar(destino, linhas) {
    try {
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, JSON.stringify({ em: new Date().toISOString(), arquivos: linhas }, null, 2));
    } catch (e) { /* relatório em disco é conveniência, não requisito */ }
  }

  return { iniciar, coletar, relatorio, tabela, salvar };
}

module.exports = { criarColetor, unir };
