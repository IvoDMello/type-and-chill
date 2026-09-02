/* Testes de ponta a ponta: o jogo de verdade, num Chrome de verdade.
 *
 * Precisa de Chrome ou Edge instalado (nenhum download) e de puppeteer-core:
 *     npm install
 *     npm run test:e2e
 *
 * Sem um dos dois, os testes são pulados em vez de falhar — assim `npm test`
 * continua verde numa máquina sem navegador.
 */
const test = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { criarColetor } = require("./coverage.js");

let puppeteer = null;
try { puppeteer = require("puppeteer-core"); } catch (e) { /* pulado abaixo */ }

const PORT = 8199;
const BASE = "http://127.0.0.1:" + PORT;
const SERVE = path.resolve(__dirname, "../../tools/serve.js");

function findBrowser() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ];
  return candidates.find(p => { try { return fs.existsSync(p); } catch (e) { return false; } }) || null;
}

const browserPath = puppeteer ? findBrowser() : null;
const skip = !puppeteer
  ? "puppeteer-core não instalado — rode `npm install`"
  : (!browserPath ? "nenhum Chrome/Edge encontrado (defina CHROME_PATH)" : false);

const sleep = ms => new Promise(r => setTimeout(r, ms));

function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    (function tentar() {
      http.get(BASE + "/index.html", res => { res.resume(); resolve(); })
        .on("error", () => {
          if (Date.now() > deadline) reject(new Error("servidor não subiu"));
          else setTimeout(tentar, 150);
        });
    })();
  });
}

test("jogo completo no navegador", { skip, concurrency: 1 }, async (t) => {
  const server = spawn(process.execPath, [SERVE, String(PORT)], { stdio: "ignore" });
  await waitForServer(10000);

  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: "new",
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"]
  });

  const erros = [];
  const contextos = [];

  /* Mede quanto do JS de interface os testes de fato executam. Sem isto, dava
   * para apagar metade de um arquivo de UI e ver a bateria inteira passar. */
  const cobertura = criarColetor(BASE, { ignorar: ["js/words.js", "js/examples.js"] });

  /* Cada subteste ganha um contexto anônimo próprio, com armazenamento
   * isolado. Limpar o localStorage e recarregar não bastava: o `pagehide` da
   * página antiga grava o caderno que ainda está em memória, desfazendo a
   * limpeza e vazando o caderno de um subteste para o seguinte. */
  async function novaPagina(prepararArmazenamento, janela) {
    const ctx = browser.createBrowserContext
      ? await browser.createBrowserContext()
      : await browser.createIncognitoBrowserContext();
    contextos.push(ctx);

    const page = await ctx.newPage();
    await page.setViewport(janela || { width: 1440, height: 900 });
    await cobertura.iniciar(page);

    // fechar a página é o último momento em que dá para ler a cobertura dela
    const fecharDeVerdade = page.close.bind(page);
    page.close = async function () {
      await cobertura.coletar(page);
      return fecharDeVerdade();
    };

    if (prepararArmazenamento) {
      // semeia numa página vazia da mesma origem: se o app já tivesse
      // carregado, o `pagehide` da navegação seguinte regravaria por cima
      await page.goto(BASE + "/__semente", { waitUntil: "domcontentloaded" });
      await page.evaluate(prepararArmazenamento);
    }

    // só a partir daqui os erros contam: o 404 da semente é nosso, não do jogo
    page.on("pageerror", e => erros.push("PAGEERROR: " + e.message));
    page.on("console", m => { if (m.type() === "error") erros.push("CONSOLE: " + m.text()); });
    page.on("response", r => { if (r.status() >= 400) erros.push("HTTP " + r.status() + ": " + r.url()); });

    await page.goto(BASE + "/index.html", { waitUntil: "networkidle2" });
    await page.waitForSelector("#startBtn");
    return page;
  }

  /* Espera cair uma palavra que satisfaça o filtro e devolve o texto. */
  async function esperarPalavra(page, filtro, timeoutMs) {
    const deadline = Date.now() + (timeoutMs || 30000);
    while (Date.now() < deadline) {
      const w = await page.evaluate((f) => {
        const ws = [...document.querySelectorAll("#stage .word")].map(n => n.textContent);
        if (!f) {
          const ordenadas = [...document.querySelectorAll("#stage .word")]
            .sort((a, b) => b.getBoundingClientRect().top - a.getBoundingClientRect().top);
          return ordenadas.length ? ordenadas[0].textContent : null;
        }
        return ws.find(t => t.includes(f)) || null;
      }, filtro || null);
      if (w) return w;
      await sleep(150);
    }
    return null;
  }

  async function digitar(page, palavra) {
    for (const ch of palavra) { await page.keyboard.press(ch); await sleep(40); }
    await sleep(300);
  }

  /* Registra, na ordem, as palavras que aparecem no palco. */
  async function coletarOrdem(page, quantas, timeoutMs) {
    const vistas = [];
    const deadline = Date.now() + (timeoutMs || 25000);
    while (vistas.length < quantas && Date.now() < deadline) {
      const atuais = await page.$$eval("#stage .word", ns => ns.map(n => n.textContent));
      for (const w of atuais) if (!vistas.includes(w)) vistas.push(w);
      await sleep(120);
    }
    return vistas.slice(0, quantas);
  }

  await t.test("a tela inicial carrega com o banco inteiro e os controles", async () => {
    const page = await novaPagina();
    const nota = await page.$eval("#poolNote", e => e.textContent);
    assert.match(nota, /\d+ palavras neste sorteio/);

    const modos = await page.$$eval("#modeChips .chip", ns => ns.map(n => n.textContent));
    assert.deepStrictEqual(modos, ["Clássico", "Zen", "Prática", "Deck"]);

    const niveis = await page.$$eval("#levelChips .chip", ns => ns.map(n => n.textContent));
    assert.deepStrictEqual(niveis, ["A2", "B1", "B2", "C1"]);

    // Climas fechados continuam na tela — é o que dá o que perseguir —, e a
    // ficha mostra o marco que falta. Perfil novo tem só os dois primeiros.
    const climas = await page.$$eval("#visualChips .chip", ns => ns.map(n => n.textContent.trim()));
    assert.deepStrictEqual(climas, ["Brasa", "Noite lo-fi", "Chuva · 150", "Manhã · 450", "Aurora · 900"]);
    const abertos = await page.$$eval("#visualChips .chip", ns => ns.filter(n => !n.disabled).length);
    assert.strictEqual(abertos, 2, "quem começa escolhe entre dois climas");
    await page.close();
  });

  await t.test("trocar de clima repinta a interface inteira", async () => {
    const page = await novaPagina();
    // só os climas abertos: os outros chegam por palavras digitadas
    for (const [i, chave] of [[1, "lofi"], [0, "ember"]]) {
      await page.$$eval("#visualChips .chip", (ns, idx) => ns[idx].click(), i);
      await sleep(200);
      const attr = await page.evaluate(() => document.documentElement.getAttribute("data-visual"));
      assert.strictEqual(attr, chave);
    }
    await page.close();
  });

  await t.test("palavras com a letra p podem ser digitadas", async () => {
    // Regressão: "P" já foi atalho de pausa e vinha antes da digitação no
    // handler, o que tornava impossível capturar 84 palavras do banco.
    const page = await novaPagina();
    // no modo Zen não há vidas: enquanto o teste espera cair uma palavra com
    // "p", as outras podem escapar sem encerrar a partida por game over
    await page.$$eval("#modeChips .chip", ns => ns[1].click());
    await page.click("#startBtn");
    await page.waitForSelector("#stage .word");

    // só vale uma palavra ainda na metade de cima: mais abaixo ela pode cair
    // no meio da digitação e o teste falharia por corrida, não pelo bug
    let capturada = null;
    const deadline = Date.now() + 60000;
    while (!capturada && Date.now() < deadline) {
      const alvo = await page.evaluate(() => {
        const n = [...document.querySelectorAll("#stage .word")]
          .find(w => w.textContent.includes("p") &&
                     w.getBoundingClientRect().top < window.innerHeight * 0.45);
        return n ? n.textContent : null;
      });
      if (!alvo) { await sleep(200); continue; }
      await digitar(page, alvo);
      if (await page.$eval("#score b", e => +e.textContent) > 0) capturada = alvo;
    }

    assert.ok(capturada, "nenhuma palavra com p pôde ser capturada");
    assert.match(capturada, /p/);
    const pausado = await page.$eval("#pauseScreen", e => !e.hasAttribute("hidden"));
    assert.strictEqual(pausado, false, 'digitar "p" não pode pausar o jogo');
    await page.close();
  });

  await t.test("capturar pontua, mostra a definição e entra no caderno", async () => {
    const page = await novaPagina();
    await page.$$eval("#prefChips .chip", ns => ns[0].click());   // liga tradução PT
    await page.click("#startBtn");
    await page.waitForSelector("#stage .word");

    const palavra = await esperarPalavra(page, null);
    await digitar(page, palavra);

    const estado = await page.evaluate(() => ({
      pontos: +document.querySelector("#score b").textContent,
      aprendidas: +document.getElementById("learned").textContent,
      capturadas: document.querySelectorAll("#clist li").length,
      defVisivel: document.getElementById("defcard").classList.contains("show"),
      traducao: document.querySelector("#defcard .dt").textContent,
      traducaoEscondida: document.querySelector("#defcard .dt").hidden,
      exemplo: document.querySelector("#defcard .dx").textContent,
      exemploEscondido: document.querySelector("#defcard .dx").hidden,
      ppm: +document.getElementById("wpm").textContent
    }));
    assert.ok(estado.pontos > 0);
    assert.strictEqual(estado.aprendidas, 1);
    assert.strictEqual(estado.capturadas, 1);
    assert.strictEqual(estado.defVisivel, true);
    assert.ok(estado.traducao.length > 0, "a tradução em PT devia estar preenchida");
    assert.strictEqual(estado.traducaoEscondida, false);
    assert.ok(estado.ppm > 0, "PPM devia ter sido calculado");
    // a frase de exemplo é obrigatória no banco: se ela não aparecer aqui, a
    // palavra chega ao caderno sem o contexto que a faz grudar
    assert.strictEqual(estado.exemploEscondido, false, "faltou a frase de exemplo");
    assert.ok(estado.exemplo.toLowerCase().includes(palavra.slice(0, Math.max(4, palavra.length - 2))),
      `a frase "${estado.exemplo}" não usa a palavra ${palavra}`);

    // a gravação é agrupada em 800ms — o caderno não espera o fim da partida
    await sleep(1200);
    const caderno = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("tc.notebook") || "{}"));
    assert.ok(caderno[palavra], "a captura devia ter sido gravada sozinha");
    assert.strictEqual(caderno[palavra].hits, 1);
    assert.ok(caderno[palavra].seen >= 1, "a aparição da palavra devia ter sido contada");
    assert.ok(caderno[palavra].msN >= 1, "o tempo de digitação devia ter sido medido");
    assert.ok(caderno[palavra].srs.due > Date.now(), "a palavra devia ter sido reagendada");
    // palavras que caíram durante o teste também entram, como erro — é o
    // comportamento desejado: o que escapou é o que mais precisa de revisão
    for (const [texto, e] of Object.entries(caderno)) {
      if (texto !== palavra) assert.strictEqual(e.hits, 0, `${texto} entrou sem ter sido capturada`);
    }
    await page.close();
  });

  await t.test("o caderno abre com progresso, busca e fila de revisão", async () => {
    const page = await novaPagina();
    await page.click("#startBtn");
    await page.waitForSelector("#stage .word");
    const palavra = await esperarPalavra(page, null);
    await digitar(page, palavra);

    await page.click("#notebookBtn");
    await page.waitForSelector("#notebookScreen:not([hidden])");

    const linhas = await page.$$eval("#nbList li", ns => ns.length);
    assert.ok(linhas >= 1, "o caderno devia listar ao menos a palavra capturada");
    const barras = await page.$$eval("#nbProgress .bar", ns => ns.length);
    assert.strictEqual(barras, 4, "uma barra de progresso por nível");

    await page.type("#nbSearch", "zzzzz");
    await sleep(250);
    assert.strictEqual(await page.$$eval("#nbList li", ns => ns.length), 0);
    const vazio = await page.$eval("#nbEmpty", e => e.hidden);
    assert.strictEqual(vazio, false, "a mensagem de lista vazia devia aparecer");

    await page.evaluate(() => { document.getElementById("nbSearch").value = ""; });
    await page.type("#nbSearch", palavra);
    await sleep(250);
    const achadas = await page.$$eval("#nbList .cw", ns => ns.map(n => n.textContent));
    assert.ok(achadas.includes(palavra), "a busca devia achar a palavra capturada");

    await page.click("#nbClose");
    await sleep(200);
    await page.close();
  });

  await t.test("modo prática consome a fila e termina sozinho", async () => {
    // caderno montado à mão com uma palavra só: fila determinística e curta
    const page = await novaPagina(() => {
      const agora = Date.now();
      localStorage.setItem("tc.version", "2");
      localStorage.setItem("tc.notebook", JSON.stringify({
        meadow: {
          pos: "n", en: "a field of grass and wildflowers", pt: "prado, campina",
          lvl: "B1", theme: "nature", hits: 1, misses: 0, typos: 0,
          first: agora - 86400000, last: agora - 86400000,
          srs: { ease: 2.5, interval: 1, reps: 1, lapses: 0, due: agora - 3600000 }
        }
      }));
    });

    await page.click("#notebookBtn2");
    await page.waitForSelector("#notebookScreen:not([hidden])");
    await page.click("#nbPractice");
    await page.waitForSelector("#stage .word", { timeout: 15000 });

    const hud = await page.evaluate(() => ({
      modo: document.getElementById("lvl").textContent,
      rotulo: document.getElementById("livesLabel").textContent,
      restantes: document.getElementById("lives").textContent
    }));
    assert.strictEqual(hud.modo, "Prática");
    assert.strictEqual(hud.rotulo, "Restantes");
    assert.strictEqual(hud.restantes, "1");

    const alvo = await esperarPalavra(page, null);
    await digitar(page, alvo);
    await page.waitForSelector("#overScreen:not([hidden])", { timeout: 15000 });
    const titulo = await page.$eval("#overTitle", e => e.textContent);
    assert.strictEqual(titulo, "Revisão concluída");
    await page.close();
  });

  await t.test("o caderno mostra a curva de evolução e as que te pegam", async () => {
    const page = await novaPagina(() => {
      const agora = Date.now();
      const hist = [];
      for (let i = 0; i < 6; i++) {
        hist.push({ at: agora - (6 - i) * 86400000, mode: "classic", score: 100 + i,
                    learned: 5, wpm: 30 + i, accuracy: 90 + i, chars: 60, ms: 60000 });
      }
      localStorage.setItem("tc.version", "3");
      localStorage.setItem("tc.history", JSON.stringify(hist));
      localStorage.setItem("tc.notebook", JSON.stringify({
        meadow: {
          pos: "n", en: "a field of grass and wildflowers", pt: "prado, campina",
          ex: "Bees move slowly across the meadow.",
          lvl: "B1", theme: "nature", hits: 1, misses: 3, typos: 4, seen: 6, msSum: 9000, msN: 2,
          first: agora - 86400000, last: agora - 3600000,
          srs: { ease: 1.5, interval: 1, reps: 0, lapses: 3, due: agora - 3600000 }
        },
        harbor: {
          pos: "n", en: "a sheltered place where ships stay safely", pt: "porto",
          ex: "Small boats rocked gently in the harbor.",
          lvl: "B1", theme: "travel", hits: 3, misses: 0, typos: 0, seen: 3, msSum: 4000, msN: 2,
          first: agora - 86400000, last: agora,
          srs: { ease: 2.5, interval: 6, reps: 3, lapses: 0, due: agora + 5 * 86400000 }
        }
      }));
    });

    await page.click("#notebookBtn2");
    await page.waitForSelector("#notebookScreen:not([hidden])");

    const grafico = await page.evaluate(() => ({
      visivel: !document.getElementById("nbEvolution").hidden,
      linhas: document.querySelectorAll("#nbChart svg polyline").length,
      tendencia: document.getElementById("nbTrend").textContent
    }));
    assert.strictEqual(grafico.visivel, true, "seis sessões já são uma curva");
    assert.strictEqual(grafico.linhas, 2, "uma linha de PPM e uma de precisão");
    assert.match(grafico.tendencia, /ppm/);

    // a frase de exemplo aparece na linha da palavra
    const frases = await page.$$eval("#nbList .cx", ns => ns.map(n => n.textContent));
    assert.ok(frases.some(f => /meadow/.test(f)), "faltou a frase de exemplo no caderno");

    // e o tempo médio de digitação entra no contador da linha
    const contadores = await page.$$eval("#nbList .nbtally", ns => ns.map(n => n.textContent));
    assert.ok(contadores.some(c => /4.5s/.test(c)), "faltou o tempo médio: " + contadores.join(" | "));

    await page.select("#nbStatus", "hard");
    await sleep(200);
    const pegam = await page.evaluate(() => ({
      palavras: Array.from(document.querySelectorAll("#nbList .cw")).map(n => n.textContent),
      botao: document.getElementById("nbPractice").textContent
    }));
    assert.deepStrictEqual(pegam.palavras, ["meadow"], "só a palavra que escapa entra na lista");
    assert.match(pegam.botao, /^Enfrentar/, "o botão vira o deck quando o filtro é esse");

    await page.click("#nbClose");
    await sleep(150);
    await page.close();
  });

  await t.test("o deck traz as que te pegam, não as que vencem hoje", async () => {
    // Duas palavras no caderno: uma que já escapou duas vezes e outra limpa.
    // A fila do Deck é ordenada pelo tropeço, então "meadow" vem primeiro —
    // e "harbor", que nem venceu ainda, nem entra.
    const page = await novaPagina(() => {
      const agora = Date.now();
      localStorage.setItem("tc.version", "3");
      localStorage.setItem("tc.notebook", JSON.stringify({
        meadow: {
          pos: "n", en: "a field of grass and wildflowers", pt: "prado, campina",
          lvl: "B1", theme: "nature", hits: 1, misses: 2, typos: 3, seen: 5, msSum: 0, msN: 0,
          first: agora - 86400000, last: agora - 3600000,
          srs: { ease: 1.6, interval: 1, reps: 0, lapses: 2, due: agora - 3600000 }
        },
        harbor: {
          pos: "n", en: "a sheltered place where ships stay safely", pt: "porto",
          lvl: "B1", theme: "travel", hits: 2, misses: 0, typos: 0, seen: 2, msSum: 0, msN: 0,
          first: agora - 86400000, last: agora,
          srs: { ease: 2.5, interval: 6, reps: 2, lapses: 0, due: agora + 5 * 86400000 }
        }
      }));
    });

    await page.click("#setupBtn");
    await page.waitForSelector("#setupScreen:not([hidden])");
    await page.$$eval("#modeChips .chip", ns => ns[3].click());   // Deck
    await page.click("#setupDone");
    await sleep(200);

    const cta = await page.evaluate(() => ({
      rotulo: document.getElementById("startLabel").textContent,
      dica: document.getElementById("ctaHint").textContent
    }));
    assert.match(cta.rotulo, /^Enfrentar 1 palavras?$/, "só a palavra que escapou entra no deck");
    assert.match(cta.dica, /Modo deck/);

    await page.click("#startBtn");
    await page.waitForSelector("#stage .word", { timeout: 15000 });
    const hud = await page.evaluate(() => ({
      modo: document.getElementById("lvl").textContent,
      rotulo: document.getElementById("livesLabel").textContent
    }));
    assert.strictEqual(hud.modo, "Deck");
    assert.strictEqual(hud.rotulo, "Restantes");

    const alvo = await esperarPalavra(page, null);
    assert.strictEqual(alvo, "meadow", "o deck ignora a palavra que ninguém errou");
    await digitar(page, alvo);
    await page.waitForSelector("#overScreen:not([hidden])", { timeout: 15000 });
    const titulo = await page.$eval("#overTitle", e => e.textContent);
    assert.strictEqual(titulo, "Deck limpo");
    await page.close();
  });

  await t.test("as palavras nunca caem atrás dos painéis", async () => {
    // Regressão de usabilidade: o palco ocupa a tela toda, então as palavras
    // caíam por trás da lista de capturadas e do cartão de definição, que têm
    // z-index maior — a informação mais importante ficava ilegível.
    const page = await novaPagina();
    await page.click("#startBtn");
    await page.waitForSelector("#stage .word");

    const invasoes = [];
    const fim = Date.now() + 12000;
    while (Date.now() < fim) {
      const amostra = await page.evaluate(() => {
        const painel = document.getElementById("collected").getBoundingClientRect();
        const horizonte = document.getElementById("horizon").getBoundingClientRect().top;
        const visivel = getComputedStyle(document.getElementById("collected")).display !== "none";
        return [...document.querySelectorAll("#stage .word")].map(n => {
          const r = n.getBoundingClientRect();
          return {
            texto: n.textContent,
            sobrePainel: visivel && r.right > painel.left && r.bottom > painel.top && r.top < painel.bottom,
            abaixoDoHorizonte: r.top > horizonte + 4,
            foraDaTela: r.left < 0 || r.right > window.innerWidth
          };
        });
      });
      for (const w of amostra) {
        if (w.sobrePainel) invasoes.push(`${w.texto} invadiu a lista lateral`);
        if (w.abaixoDoHorizonte) invasoes.push(`${w.texto} passou do horizonte`);
        if (w.foraDaTela) invasoes.push(`${w.texto} saiu da tela`);
      }
      await sleep(100);
    }

    assert.deepStrictEqual([...new Set(invasoes)], [], "palavras sobrepostas por painéis");
    await page.close();
  });

  await t.test("a tela inicial muda entre novato e veterano", async () => {
    // Quem chega agora e quem já tem caderno querem coisas opostas: um quer
    // entrar no jogo, o outro quer saber o que revisar hoje.
    const novato = await novaPagina();
    const antes = await novato.evaluate(() => ({
      cta: document.getElementById("startLabel").textContent,
      apresentacao: !document.getElementById("homeNew").hidden,
      revisao: !document.getElementById("homeVet").hidden,
      comoJogar: !document.getElementById("howBox").hidden,
      atalho: document.getElementById("altStartBtn").hidden,
      resumo: document.getElementById("setupSummary").textContent
    }));
    assert.strictEqual(antes.cta, "Começar");
    assert.strictEqual(antes.apresentacao, true, "o novato precisa ver o que é o jogo");
    assert.strictEqual(antes.revisao, false);
    assert.strictEqual(antes.comoJogar, true, "as regras abrem sozinhas na primeira vez");
    assert.strictEqual(antes.atalho, true, "sem caderno não há revisão para oferecer");
    assert.match(antes.resumo, /Clássico · todos os temas · A2–C1/);

    // a configuração toda vive num painel, não na tela principal
    await novato.keyboard.press("a");
    await sleep(250);
    const painel = await novato.evaluate(() => ({
      aberto: !document.getElementById("setupScreen").hasAttribute("hidden"),
      temas: document.querySelectorAll("#themeChips .chip").length,
      familias: document.querySelectorAll("#themeChips .chipgroup").length
    }));
    assert.strictEqual(painel.aberto, true, "a tecla A precisa abrir os ajustes");
    assert.strictEqual(painel.familias, 4);
    assert.ok(painel.temas >= 20);
    await novato.keyboard.press("Escape");
    await sleep(200);
    assert.strictEqual(
      await novato.$eval("#setupScreen", e => e.hasAttribute("hidden")), true,
      "Esc precisa fechar os ajustes"
    );
    await novato.close();

    const veterano = await novaPagina(() => {
      const agora = Date.now();
      const nb = {};
      for (const w of ["meadow", "harvest", "linger"]) {
        nb[w] = {
          pos: "n", en: "def", pt: "trad", lvl: "B1", theme: "nature",
          hits: 2, misses: 0, typos: 0, first: agora - 8e8, last: agora - 9e7,
          srs: { ease: 2.4, interval: 3, reps: 2, lapses: 0, due: agora - 36e5 }
        };
      }
      localStorage.setItem("tc.version", "2");
      localStorage.setItem("tc.notebook", JSON.stringify(nb));
    });
    const depois = await veterano.evaluate(() => ({
      cta: document.getElementById("startLabel").textContent,
      apresentacao: !document.getElementById("homeNew").hidden,
      revisao: !document.getElementById("homeVet").hidden,
      numero: document.getElementById("homeDue").textContent,
      atalho: document.getElementById("altStartBtn").textContent,
      atalhoOculto: document.getElementById("altStartBtn").hidden
    }));
    assert.strictEqual(depois.cta, "Revisar 3 palavras", "a ação primária do veterano é revisar");
    assert.strictEqual(depois.apresentacao, false);
    assert.strictEqual(depois.revisao, true);
    assert.strictEqual(depois.numero, "3");
    assert.strictEqual(depois.atalhoOculto, false);
    assert.match(depois.atalho, /Partida nova/);

    // e o caminho da partida normal continua a um clique de distância
    await veterano.click("#altStartBtn");
    await veterano.waitForSelector("#stage .word", { timeout: 15000 });
    assert.strictEqual(await veterano.$eval("#lvl", e => e.textContent), "1");
    await veterano.close();
  });

  await t.test("no celular nada estoura a tela nem cobre as palavras", async () => {
    const page = await novaPagina(null, { width: 390, height: 844, isMobile: true, hasTouch: true });

    const inicio = await page.evaluate(() => ({
      rolagemH: document.documentElement.scrollWidth - window.innerWidth,
      ctaTopo: Math.round(document.getElementById("startBtn").getBoundingClientRect().bottom),
      lista: getComputedStyle(document.getElementById("collected")).display
    }));
    assert.strictEqual(inicio.rolagemH, 0, "a tela inicial não pode rolar na horizontal");
    assert.ok(inicio.ctaTopo < 844, "o botão de começar precisa caber sem rolar");
    assert.strictEqual(inicio.lista, "none", "a lista lateral não cabe no celular");

    await page.click("#startBtn");
    await page.waitForSelector("#stage .word");

    const problemas = [];
    const fim = Date.now() + 8000;
    while (Date.now() < fim) {
      const amostra = await page.evaluate(() => {
        const botoes = document.getElementById("tools").getBoundingClientRect();
        const horizonte = document.getElementById("horizon").getBoundingClientRect().top;
        return {
          rolagemH: document.documentElement.scrollWidth - window.innerWidth,
          palavras: [...document.querySelectorAll("#stage .word")].map(n => {
            const r = n.getBoundingClientRect();
            return {
              texto: n.textContent,
              fora: r.left < 0 || r.right > window.innerWidth,
              passou: r.top > horizonte + 4,
              sobreBotoes: r.right > botoes.left && r.bottom > botoes.top && r.top < botoes.bottom
            };
          })
        };
      });
      if (amostra.rolagemH > 0) problemas.push("a partida gerou rolagem horizontal");
      for (const w of amostra.palavras) {
        if (w.fora) problemas.push(w.texto + " saiu da tela");
        if (w.passou) problemas.push(w.texto + " passou do horizonte");
        if (w.sobreBotoes) problemas.push(w.texto + " caiu sobre os botões do rodapé");
      }
      await sleep(120);
    }
    assert.deepStrictEqual([...new Set(problemas)], []);
    await page.close();
  });

  await t.test("sair da aba pausa o jogo sozinho", async () => {
    const page = await novaPagina();
    await page.click("#startBtn");
    await page.waitForSelector("#stage .word");

    // simula a aba indo para segundo plano
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", { value: true, configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await sleep(300);

    const pausa = await page.evaluate(() => ({
      visivel: !document.getElementById("pauseScreen").hasAttribute("hidden"),
      nota: document.getElementById("pauseNote").textContent
    }));
    assert.strictEqual(pausa.visivel, true);
    assert.match(pausa.nota, /saiu da aba/);
    await page.close();
  });

  await t.test("criar um desafio gera código válido e placar", async () => {
    const page = await novaPagina(() => {
      const p = JSON.parse(localStorage.getItem("tc.prefs") || "{}");
      p.name = "EU"; localStorage.setItem("tc.prefs", JSON.stringify(p));
    });

    await page.click("#challengeBtn");
    await page.waitForSelector("#challengeScreen:not([hidden])");
    await page.click("#chCreate");
    await sleep(250);

    const codigo = await page.$eval("#chCode", e => e.textContent);
    assert.match(codigo, /^TC1-[0-9A-Z]+-[0-9A-Z]+$/, "código do desafio malformado: " + codigo);

    await page.click("#chPlay");
    await page.waitForSelector("#stage .word", { timeout: 15000 });
    const palavra = await esperarPalavra(page, null);
    await digitar(page, palavra);

    await page.keyboard.press("Escape");
    await sleep(200);
    await page.click("#endBtn");
    await page.waitForSelector("#overScreen:not([hidden])");

    const desafio = await page.evaluate(() => ({
      visivel: !document.getElementById("overChallenge").hasAttribute("hidden"),
      codigo: document.getElementById("overCode").textContent,
      linhas: document.querySelectorAll("#overBoard li").length,
      eu: document.querySelector("#overBoard .is-me") !== null
    }));
    assert.strictEqual(desafio.visivel, true);
    assert.strictEqual(desafio.codigo, codigo);
    assert.strictEqual(desafio.linhas, 1);
    assert.strictEqual(desafio.eu, true, "meu resultado devia estar marcado no placar");
    await page.close();
  });

  await t.test("o mesmo código entrega a mesma partida", async () => {
    // O coração da competição: se isto quebrar, dois amigos com o mesmo
    // código jogam partidas diferentes sem perceber.
    const page = await novaPagina();
    await page.click("#challengeBtn");
    await page.waitForSelector("#challengeScreen:not([hidden])");
    await page.click("#chCreate");
    await sleep(250);
    const codigo = await page.$eval("#chCode", e => e.textContent);
    await page.click("#chPlay");
    await page.waitForSelector("#stage .word", { timeout: 15000 });
    const primeira = await coletarOrdem(page, 5);
    await page.close();

    assert.ok(primeira.length >= 4, "não deu tempo de ver palavras suficientes");

    // outra sessão, do zero, entrando só com o código
    const page2 = await novaPagina();
    await page2.click("#challengeBtn");
    await page2.waitForSelector("#challengeScreen:not([hidden])");
    await page2.type("#chJoinInput", codigo);
    await page2.click("#chJoin");
    await sleep(250);
    assert.strictEqual(await page2.$eval("#chCode", e => e.textContent), codigo);

    await page2.click("#chPlay");
    await page2.waitForSelector("#stage .word", { timeout: 15000 });
    const segunda = await coletarOrdem(page2, 5);
    await page2.close();

    assert.deepStrictEqual(
      segunda.slice(0, primeira.length), primeira,
      "as duas partidas do mesmo código tinham que trazer as mesmas palavras na mesma ordem"
    );
  });

  await t.test("colar o resultado de um amigo monta o placar", async () => {
    const page = await novaPagina();
    await page.click("#challengeBtn");
    await page.waitForSelector("#challengeScreen:not([hidden])");
    await page.click("#chCreate");
    await sleep(200);
    const codigo = await page.$eval("#chCode", e => e.textContent);

    // monta o código de resultado do "amigo" com o mesmo núcleo do desafio
    const resultado = await page.evaluate((code) => {
      const ordem = { themes: Object.keys(window.WORD_THEMES), levels: window.WORD_LEVELS };
      const desafio = window.TCChallenge.decode(code, ordem);
      return window.TCChallenge.encodeResult(
        { challenge: desafio, name: "ANA", score: 4321, learned: 30, wpm: 55 }, ordem);
    }, codigo);

    await page.type("#chFriendInput", resultado);
    await page.click("#chAddFriend");
    await sleep(250);

    const placar = await page.$$eval("#chBoard li", ns => ns.map(n => n.textContent));
    assert.strictEqual(placar.length, 1);
    assert.match(placar[0], /ANA/);
    assert.match(placar[0], /4321/);

    const nota = await page.$eval("#chNote", e => e.textContent);
    assert.match(nota, /ANA/);
    await page.close();
  });

  await t.test("código inválido avisa em vez de quebrar", async () => {
    const page = await novaPagina();
    await page.click("#challengeBtn");
    await page.waitForSelector("#challengeScreen:not([hidden])");
    await page.type("#chJoinInput", "TC1-NAO-EXISTE-MESMO");
    await page.click("#chJoin");
    await sleep(200);

    const nota = await page.evaluate(() => ({
      texto: document.getElementById("chNote").textContent,
      erro: document.getElementById("chNote").classList.contains("is-error")
    }));
    assert.match(nota.texto, /não reconhecido/i);
    assert.strictEqual(nota.erro, true);
    assert.strictEqual(await page.$eval("#chPlay", e => e.disabled), true);
    await page.close();
  });

  /* Cursor de faixa: o Puppeteer não arrasta, então mexemos no valor e
   * disparamos o mesmo evento que o navegador dispararia. */
  async function ajustar(page, sel, valor) {
    await page.$eval(sel, (n, v) => {
      n.value = String(v);
      n.dispatchEvent(new Event("input", { bubbles: true }));
    }, valor);
    await sleep(60);
  }
  function lerPrefs(page) {
    return page.evaluate(() => JSON.parse(localStorage.getItem("tc.prefs") || "{}"));
  }

  await t.test("o menu de opções aplica cada ajuste na hora", async () => {
    const page = await novaPagina();
    await page.click("#optionsBtn2");
    await page.waitForSelector("#optionsScreen:not([hidden])");

    const abas = await page.$$eval(".opttab", ns => ns.map(n => n.textContent));
    assert.deepStrictEqual(abas, ["Áudio", "Gráficos", "Exibição", "Jogo", "Dados"]);

    // ---- Áudio ----
    await page.click('[data-opt="music"] .switch');
    await page.click('[data-opt="sfx"] .switch');
    await ajustar(page, '[data-opt="musicVol"] input[type="range"]', 0.35);
    await ajustar(page, '[data-opt="sfxVol"] input[type="range"]', 0.5);
    // a pronúncia só aparece onde o navegador tem a API de fala
    if (await page.$('[data-opt="speak"] .switch')) {
      await page.click('[data-opt="speak"] .switch');
      await sleep(150);
      await page.click('[data-opt="speak"] .switch');
    }
    const rotulo = await page.$eval('[data-opt="music"] .switch', n => n.textContent);
    assert.strictEqual(rotulo, "Desligado", "o interruptor precisa dizer o estado");
    assert.strictEqual(
      await page.$eval('[data-opt="musicVol"] .optvalue', n => n.textContent), "35%");

    // ---- Gráficos ----
    await page.click('.opttab[data-tab="video"]');
    for (const q of ["high", "medium", "low", "off", "auto"]) {
      await page.click(`[data-opt="quality"] .seg[data-value="${q}"]`);
      await sleep(50);
    }
    for (const m of ["full", "reduced", "auto"]) {
      await page.click(`[data-opt="motion"] .seg[data-value="${m}"]`);
      await sleep(50);
    }
    const segMarcado = await page.$$eval('[data-opt="quality"] .seg',
      ns => ns.filter(n => n.getAttribute("aria-checked") === "true").map(n => n.dataset.value));
    assert.deepStrictEqual(segMarcado, ["auto"], "só uma opção fica marcada por vez");

    // ---- Exibição ----
    await page.click('.opttab[data-tab="display"]');
    await ajustar(page, '[data-opt="wordScale"] input[type="range"]', 1.3);
    await page.click('[data-opt="showPT"] .switch');
    await page.click('[data-opt="showExample"] .switch');
    await page.click('[data-opt="showCollected"] .switch');

    const exibicao = await page.evaluate(() => ({
      escala: document.documentElement.style.getPropertyValue("--word-scale"),
      escondeLista: document.body.classList.contains("hide-collected")
    }));
    assert.strictEqual(exibicao.escala.trim(), "1.3");
    assert.strictEqual(exibicao.escondeLista, true, "desligar a lista tem que escondê-la");

    // ---- Jogo ----
    await page.click('.opttab[data-tab="game"]');
    await ajustar(page, '[data-opt="dailyGoal"] input[type="range"]', 40);
    await page.click('[data-opt="name"] input');
    await page.type('[data-opt="name"] input', "ANA");
    await sleep(80);

    let prefs = await lerPrefs(page);
    assert.strictEqual(prefs.music, false);
    assert.strictEqual(prefs.sfx, false);
    assert.strictEqual(prefs.musicVol, 0.35);
    assert.strictEqual(prefs.sfxVol, 0.5);
    assert.strictEqual(prefs.quality, "auto");
    assert.strictEqual(prefs.motion, "auto");
    assert.strictEqual(prefs.wordScale, 1.3);
    assert.strictEqual(prefs.showPT, true);
    assert.strictEqual(prefs.showExample, false);
    assert.strictEqual(prefs.showCollected, false);
    assert.strictEqual(prefs.dailyGoal, 40);
    assert.strictEqual(prefs.name, "ANA");

    // a meta nova precisa aparecer na tela inicial sem recarregar nada
    await page.click("#optDone");
    await page.waitForFunction(
      () => /de 40 palavras/.test(document.getElementById("goalText").textContent),
      { timeout: 8000 });

    // ---- Restaurar padrões ----
    await page.click("#optionsBtn2");
    await page.waitForSelector("#optionsScreen:not([hidden])");
    await page.click("#optReset");
    await page.waitForFunction(
      () => JSON.parse(localStorage.getItem("tc.prefs") || "{}").wordScale === 1,
      { timeout: 8000 });
    prefs = await lerPrefs(page);
    assert.strictEqual(prefs.music, true);
    assert.strictEqual(prefs.wordScale, 1);
    assert.strictEqual(prefs.dailyGoal, 20);
    assert.strictEqual(prefs.showCollected, true);
    assert.strictEqual(prefs.name, "ANA", "restaurar opções não pode apagar seu apelido");
    assert.strictEqual(
      await page.evaluate(() => document.body.classList.contains("hide-collected")), false);

    await page.click("#optClose");
    await sleep(100);
    await page.close();
  });

  await t.test("tela cheia e caminhos de dados do menu de opções", async () => {
    const page = await novaPagina(() => {
      localStorage.setItem("tc.version", "3");
      localStorage.setItem("tc.notebook", JSON.stringify({
        meadow: {
          pos: "n", en: "a field of grass and wildflowers", pt: "prado",
          ex: "Bees move slowly across the meadow.", lvl: "B1", theme: "nature",
          hits: 1, misses: 1, typos: 0, seen: 2, msSum: 3000, msN: 1,
          first: Date.now() - 86400000, last: Date.now(),
          srs: { ease: 2.2, interval: 1, reps: 1, lapses: 1, due: Date.now() - 1000 }
        }
      }));
    });

    await page.click("#optionsBtn2");
    await page.waitForSelector("#optionsScreen:not([hidden])");
    await page.click('.opttab[data-tab="video"]');
    // entrar e sair da tela cheia: o navegador pode recusar, e recusar também
    // é um caminho que precisa não quebrar nada
    await page.click('[data-opt="fullscreen"] button');
    await sleep(250);
    await page.click('[data-opt="fullscreen"] button');
    await sleep(250);

    // Dados: abrir o caderno pela engrenagem fecha o menu
    await page.click('.opttab[data-tab="data"]');
    const linhaDados = await page.$eval('[data-opt="notebook"] .opthint', n => n.textContent);
    assert.match(linhaDados, /1 palavra guardada/);

    await page.click('[data-opt="notebook"] button');
    await page.waitForSelector("#notebookScreen:not([hidden])");
    assert.strictEqual(await page.$eval("#optionsScreen", n => n.hasAttribute("hidden")), true);
    await page.click("#nbClose");
    await sleep(120);

    // apagar o caderno pede confirmação — e a confirmação é respeitada
    page.once("dialog", d => d.dismiss());
    await page.click("#optionsBtn2");
    await page.waitForSelector("#optionsScreen:not([hidden])");
    await page.click('.opttab[data-tab="data"]');
    await page.click('[data-opt="clear"] button');
    await sleep(200);
    assert.strictEqual(
      await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("tc.notebook") || "{}")).length),
      1, "cancelar a confirmação não pode apagar nada");

    page.once("dialog", d => d.accept());
    await page.click('[data-opt="clear"] button');
    await page.waitForFunction(
      () => Object.keys(JSON.parse(localStorage.getItem("tc.notebook") || "{}")).length === 0,
      { timeout: 8000 });

    await page.click("#optDone");
    await sleep(100);
    await page.close();
  });

  await t.test("a engrenagem pausa a partida", async () => {
    const page = await novaPagina();
    await page.click("#startBtn");
    await page.waitForSelector("#stage .word");

    await page.click("#optionsBtn");            // engrenagem do rodapé
    await sleep(250);
    const durante = await page.evaluate(() => ({
      opcoes: !document.getElementById("optionsScreen").hasAttribute("hidden"),
      pausa: !document.getElementById("pauseScreen").hasAttribute("hidden")
    }));
    assert.strictEqual(durante.opcoes, true);
    assert.strictEqual(durante.pausa, true, "mexer nas opções no meio da partida tem que pausar");

    // com as opções abertas, digitar não captura nada por baixo
    await page.keyboard.press("a");
    await page.keyboard.press("Escape");
    await sleep(200);
    assert.strictEqual(await page.$eval("#optionsScreen", n => n.hasAttribute("hidden")), true);
    assert.strictEqual(await page.$eval("#pauseScreen", n => n.hasAttribute("hidden")), false,
      "fechar as opções volta para a pausa, não direto para o jogo");

    // e a engrenagem da tela de pausa abre o mesmo menu
    await page.click("#optionsBtn3");
    await page.waitForSelector("#optionsScreen:not([hidden])");
    await page.click("#optDone");
    await sleep(150);

    await page.click("#resumeBtn");
    await page.waitForSelector("#pauseScreen[hidden]", { timeout: 8000 });
    await page.close();
  });

  await t.test("os atalhos de teclado abrem cada tela", async () => {
    const page = await novaPagina();

    // tela inicial: letra solta é atalho, porque ali não se digita palavra
    await page.keyboard.press("o");
    await page.waitForSelector("#optionsScreen:not([hidden])");
    await page.keyboard.press("Escape");
    await sleep(120);

    await page.keyboard.press("a");
    await page.waitForSelector("#setupScreen:not([hidden])");
    await page.keyboard.press("Escape");
    await sleep(120);

    await page.keyboard.press("c");
    await page.waitForSelector("#notebookScreen:not([hidden])");
    await page.keyboard.press("Escape");
    await sleep(120);

    // Enter começa a partida — mas só depois que o banco terminou de carregar
    await page.waitForFunction(() => !document.getElementById("startBtn").disabled,
      { timeout: 8000 });
    await page.keyboard.press("Enter");
    await page.waitForSelector("#stage .word", { timeout: 15000 });

    // na partida, todo atalho usa Alt — letra solta é sempre digitação
    const antes = await lerPrefs(page);
    await page.keyboard.down("Alt");
    await page.keyboard.press("p");
    await page.keyboard.press("m");
    await page.keyboard.press("s");
    await page.keyboard.up("Alt");
    await sleep(200);
    const depois = await lerPrefs(page);
    assert.strictEqual(depois.showPT, !antes.showPT, "Alt+P alterna a tradução");
    assert.strictEqual(depois.music, !antes.music, "Alt+M alterna a música");
    assert.strictEqual(depois.sfx, !antes.sfx, "Alt+S alterna os efeitos");

    await page.keyboard.down("Alt");
    await page.keyboard.press("o");
    await page.keyboard.up("Alt");
    await page.waitForSelector("#optionsScreen:not([hidden])");
    await page.keyboard.press("Escape");
    await sleep(120);

    await page.keyboard.down("Alt");
    await page.keyboard.press("c");
    await page.keyboard.up("Alt");
    await page.waitForSelector("#notebookScreen:not([hidden])");
    await page.keyboard.press("Escape");
    await sleep(150);
    await page.close();
  });

  await t.test("o caderno exporta CSV e conversa com o Anki", async () => {
    const page = await novaPagina(() => {
      localStorage.setItem("tc.version", "3");
      localStorage.setItem("tc.notebook", JSON.stringify({
        meadow: {
          pos: "n", en: "a field of grass and wildflowers", pt: "prado",
          ex: "Bees move slowly across the meadow.", lvl: "B1", theme: "nature",
          hits: 2, misses: 1, typos: 1, seen: 4, msSum: 6000, msN: 2,
          first: Date.now() - 86400000, last: Date.now(),
          srs: { ease: 2.2, interval: 1, reps: 1, lapses: 1, due: Date.now() - 1000 }
        },
        harbor: {
          pos: "n", en: "a sheltered place where ships stay safely", pt: "porto",
          ex: "Small boats rocked gently in the harbor.", lvl: "B1", theme: "travel",
          hits: 3, misses: 0, typos: 0, seen: 3, msSum: 4000, msN: 2,
          first: Date.now() - 86400000, last: Date.now(),
          srs: { ease: 2.5, interval: 6, reps: 3, lapses: 0, due: Date.now() + 5 * 86400000 }
        }
      }));
    });

    await page.click("#notebookBtn2");
    await page.waitForSelector("#notebookScreen:not([hidden])");

    // filtros: busca, tema, nível e situação
    await page.type("#nbSearch", "porto");
    await sleep(200);
    assert.deepStrictEqual(await page.$$eval("#nbList .cw", ns => ns.map(n => n.textContent)), ["harbor"]);
    await page.$eval("#nbSearch", n => { n.value = ""; n.dispatchEvent(new Event("input", { bubbles: true })); });
    await sleep(150);
    await page.select("#nbTheme", "nature");
    await sleep(150);
    assert.deepStrictEqual(await page.$$eval("#nbList .cw", ns => ns.map(n => n.textContent)), ["meadow"]);
    await page.select("#nbTheme", "");
    await page.select("#nbLevel", "B1");
    await sleep(150);
    assert.strictEqual((await page.$$eval("#nbList .cw", ns => ns.length)), 2);
    await page.select("#nbStatus", "mastered");
    await sleep(150);
    assert.match(await page.$eval("#nbEmpty", n => n.textContent), /Nenhuma palavra/);
    await page.select("#nbStatus", "");
    await page.select("#nbLevel", "");
    await sleep(150);

    // CSV: em vez de baixar de verdade, escutamos o clique no link
    await page.evaluate(() => {
      window.__baixado = null;
      const original = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        window.__baixado = { nome: this.download, href: String(this.href).slice(0, 5) };
        return original ? undefined : undefined;
      };
    });
    await page.click("#nbExport");
    await sleep(250);
    const baixado = await page.evaluate(() => window.__baixado);
    assert.ok(baixado, "o CSV nem chegou a ser oferecido");
    assert.strictEqual(baixado.nome, "type-and-chill-caderno.csv");
    assert.strictEqual(baixado.href, "blob:");

    // Anki com o add-on respondendo: o botão conta quantas notas entraram
    await page.evaluate(() => {
      window.__pedidos = [];
      window.fetch = function (url, opcoes) {
        window.__pedidos.push(JSON.parse(opcoes.body).action);
        const acao = JSON.parse(opcoes.body).action;
        const resultado = acao === "addNotes" ? [111, null] : null;
        return Promise.resolve({ json: () => Promise.resolve({ result: resultado, error: null }) });
      };
    });
    await page.click("#nbAnki");
    await sleep(400);
    const pedidos = await page.evaluate(() => window.__pedidos);
    assert.deepStrictEqual(pedidos, ["createDeck", "addNotes"], "cria o baralho antes de mandar as notas");
    assert.match(await page.$eval("#nbAnki", n => n.textContent), /1 no Anki · 1 já lá/);

    // Anki fechado: explica o que fazer em vez de falhar calado.
    // O botão só volta a aceitar clique quando termina de mostrar o resultado
    // do envio anterior — por isso a espera.
    await page.waitForFunction(() => !document.getElementById("nbAnki").disabled,
      { timeout: 8000 });
    await page.evaluate(() => {
      window.fetch = function () { return Promise.reject(new Error("Failed to fetch")); };
    });
    let aviso = null;
    page.once("dialog", async d => { aviso = d.message(); await d.accept(); });
    await page.click("#nbAnki");
    await sleep(600);
    assert.ok(aviso && /AnkiConnect/.test(aviso), "o aviso precisa dizer o que fazer: " + aviso);
    assert.match(aviso, /webCorsOriginList/);

    await page.click("#nbClose");
    await sleep(150);
    await page.close();
  });

  await t.test("desafio do dia, cópia do código e apelido", async () => {
    const page = await novaPagina();
    await page.click("#challengeBtn");
    await page.waitForSelector("#challengeScreen:not([hidden])");

    await page.click("#chDaily");
    await sleep(200);
    const diario = await page.evaluate(() => ({
      codigo: document.getElementById("chCode").textContent,
      dia: document.getElementById("chDay").textContent,
      diaVisivel: !document.getElementById("chDay").hidden,
      titulo: document.getElementById("chTitle").textContent
    }));
    assert.match(diario.codigo, /^TC1-/);
    assert.strictEqual(diario.titulo, "Desafio do dia");
    assert.strictEqual(diario.diaVisivel, true);
    assert.match(diario.dia, /^\d{4}-\d{2}-\d{2}$/);

    // copiar pela API da área de transferência
    await page.evaluate(() => {
      window.__copiado = null;
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: t => { window.__copiado = t; return Promise.resolve(); } }
      });
    });
    await page.click("#chCopy");
    await sleep(250);
    assert.strictEqual(await page.evaluate(() => window.__copiado), diario.codigo);
    assert.match(await page.$eval("#chNote", n => n.textContent), /copiado/i);

    // e quando ela falha, o caminho antigo (textarea + execCommand) assume
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: { writeText: () => Promise.reject(new Error("bloqueado")) }
      });
    });
    await page.click("#chCopy");
    await sleep(300);
    assert.ok((await page.$eval("#chNote", n => n.textContent)).length > 0);

    // apelido: entra saneado e reaparece no placar
    await page.click("#chName");
    await page.type("#chName", "a n a  do  grupo");
    await page.$eval("#chName", n => n.dispatchEvent(new Event("change", { bubbles: true })));
    await sleep(200);
    const apelido = await page.$eval("#chName", n => n.value);
    assert.strictEqual(apelido, apelido.toUpperCase(), "o apelido é padronizado em maiúsculas");
    assert.ok(apelido.length <= 12);

    // Enter no campo do código faz o mesmo que o botão
    await page.click("#chJoinInput");
    await page.type("#chJoinInput", "TC1-NAO-SERVE");
    await page.keyboard.press("Enter");
    await sleep(200);
    assert.match(await page.$eval("#chNote", n => n.textContent), /não reconhecido/i);

    await page.click("#chClose");
    await sleep(150);
    await page.close();
  });

  await t.test("abrir um clima novo aparece no fim da partida", async () => {
    // uma palavra antes do marco de 150: a captura desta partida abre o clima
    const page = await novaPagina(() => {
      localStorage.setItem("tc.version", "3");
      localStorage.setItem("tc.stats", JSON.stringify({
        best: 10, bestZen: 0, bestCombo: 3, captured: 149, missed: 0, sessions: 4,
        playedMs: 60000, keystrokes: 100, correctKeys: 100, chars: 100,
        streak: 1, bestStreak: 2, lastDay: "", todayCount: 0, freezes: 0, frozenDay: ""
      }));
    });

    // no Zen a partida não acaba sozinha: encerramos pela tela de pausa
    await page.click("#setupBtn");
    await page.waitForSelector("#setupScreen:not([hidden])");
    await page.$$eval("#modeChips .chip", ns => ns[1].click());
    await page.click("#setupDone");
    await page.click("#startBtn");
    await page.waitForSelector("#stage .word", { timeout: 15000 });

    const palavra = await esperarPalavra(page, null);
    await digitar(page, palavra);

    await page.keyboard.press("Escape");        // pausa
    await page.waitForSelector("#pauseScreen:not([hidden])");
    await page.click("#endBtn");
    await page.waitForSelector("#overScreen:not([hidden])", { timeout: 15000 });

    const desbloqueio = await page.evaluate(() => ({
      visivel: !document.getElementById("overUnlock").hidden,
      texto: document.getElementById("overUnlock").textContent
    }));
    assert.strictEqual(desbloqueio.visivel, true, "abrir um clima tem que ser dito na hora");
    assert.match(desbloqueio.texto, /Chuva/);

    // e o clima novo passa a ser escolhível no painel de ajustes
    await page.click("#homeBtn");
    await sleep(200);
    await page.click("#setupBtn");
    await page.waitForSelector("#setupScreen:not([hidden])");
    const chuvaAberta = await page.$$eval("#visualChips .chip",
      ns => !ns[2].disabled && ns[2].textContent.indexOf("150") < 0);
    assert.strictEqual(chuvaAberta, true, "o clima aberto não pode continuar com cadeado");
    await page.click("#setupDone");
    await sleep(120);
    await page.close();
  });

  await t.test("jogar de novo reinicia sem passar pela tela inicial", async () => {
    const page = await novaPagina();
    await page.click("#startBtn");
    await page.waitForSelector("#stage .word", { timeout: 15000 });
    await page.keyboard.press("Escape");
    await page.waitForSelector("#pauseScreen:not([hidden])");
    await page.click("#endBtn");
    await page.waitForSelector("#overScreen:not([hidden])", { timeout: 15000 });

    await page.click("#againBtn");
    await page.waitForSelector("#stage .word", { timeout: 15000 });
    const estado = await page.evaluate(() => ({
      inicio: !document.getElementById("startScreen").hasAttribute("hidden"),
      fim: !document.getElementById("overScreen").hasAttribute("hidden"),
      pontos: +document.querySelector("#score b").textContent
    }));
    assert.strictEqual(estado.inicio, false);
    assert.strictEqual(estado.fim, false);
    assert.strictEqual(estado.pontos, 0, "a partida nova começa do zero");
    await page.close();
  });

  await t.test("a campanha lista os capítulos e o leitor digita o texto inteiro", async () => {
    const page = await novaPagina();
    await page.click("#campaignBtn");
    await page.waitForSelector("#campaignScreen:not([hidden])");

    const titulos = await page.$$eval(".capitulo .capnome", ns => ns.map(n => n.textContent));
    assert.ok(titulos.length >= 5, "a campanha nasce com um capítulo por nível");
    assert.strictEqual(titulos[0], "Uma manhã devagar", "a lista começa no A1");
    const niveis = await page.$$eval(".capitulo .caplvl", ns => ns.map(n => n.textContent));
    assert.deepStrictEqual(niveis, ["A1", "A2", "B1", "B2", "C1"], "ordem de estudo, do A1 ao C1");
    assert.match(await page.$eval("#capCount", n => n.textContent), /^0 de 5/);

    await page.click("#capContinue");
    await page.waitForSelector("#readerScreen:not([hidden])");
    const texto = await page.$eval("#capText", n => n.textContent);
    assert.ok(texto.length > 200, "o texto do capítulo tinha que estar na tela");
    assert.strictEqual(await page.$eval("#capLevel", n => n.textContent), "A1");

    // tecla errada é ignorada: o texto não anda e a precisão registra
    await page.keyboard.press("z");
    await sleep(120);
    let hud = await page.evaluate(() => ({
      feitos: document.querySelectorAll("#capText .feito").length,
      acc: document.getElementById("capAcc").textContent,
      pct: document.getElementById("capPct").textContent
    }));
    assert.strictEqual(hud.feitos, 0, "a letra errada não pode avançar o texto");
    assert.strictEqual(hud.pct, "0%");

    // a tradução do capítulo abre e fecha
    await page.click("#capPtBtn");
    await sleep(120);
    assert.strictEqual(await page.$eval("#capPt", n => n.hidden), false);
    assert.match(await page.$eval("#capPt", n => n.textContent), /sábado/);

    // e agora o texto inteiro, com maiúsculas e pontuação
    await page.keyboard.type(texto, { delay: 0 });
    await page.waitForSelector("#capDone:not([hidden])", { timeout: 30000 });

    const fim = await page.evaluate(() => ({
      ppm: +document.getElementById("capFinalWpm").textContent,
      acc: document.getElementById("capFinalAcc").textContent,
      palavras: +document.getElementById("capFinalWords").textContent,
      recap: document.querySelectorAll("#capFinalList .cw").length,
      proximo: document.getElementById("capNext").textContent
    }));
    assert.ok(fim.ppm > 0, "o PPM do capítulo tinha que ser calculado");
    assert.strictEqual(fim.palavras, 5, "as cinco palavras-alvo entram no caderno");
    assert.strictEqual(fim.recap, 5, "e aparecem no resumo do fim");
    assert.match(fim.proximo, /Próximo · A feira de sábado/);
    assert.notStrictEqual(fim.acc, "100%", "o erro de propósito lá em cima tem que aparecer aqui");

    // caderno e progresso gravados
    await sleep(400);
    const gravado = await page.evaluate(() => ({
      caderno: JSON.parse(localStorage.getItem("tc.notebook") || "{}"),
      campanha: JSON.parse(localStorage.getItem("tc.campaign") || "{}")
    }));
    assert.strictEqual(gravado.campanha.chapters["a1-01"].done, true);
    assert.ok(gravado.campanha.chapters["a1-01"].bestWpm > 0);
    ["kettle", "cozy", "routine", "neighbor", "quiet"].forEach(w => {
      assert.ok(gravado.caderno[w], "faltou " + w + " no caderno");
      assert.strictEqual(gravado.caderno[w].hits, 1);
      assert.ok(gravado.caderno[w].srs.due > Date.now(), w + " não foi agendada");
    });
    assert.match(gravado.caderno.quiet.en, /making little or no noise/,
      "a ficha declarada no capítulo é a que vale para uma palavra fora do banco");

    // o próximo capítulo abre pelo botão do fim
    await page.click("#capNext");
    await page.waitForSelector("#readerScreen:not([hidden])");
    assert.strictEqual(await page.$eval("#capTitle", n => n.textContent), "A feira de sábado");
    assert.strictEqual(await page.$eval("#capPct", n => n.textContent), "0%", "capítulo novo começa do zero");

    // Esc volta para a lista, e a lista já mostra o capítulo concluído
    await page.keyboard.press("Escape");
    await page.waitForSelector("#campaignScreen:not([hidden])");
    assert.match(await page.$eval("#capCount", n => n.textContent), /^1 de 5/);
    assert.strictEqual(
      await page.$eval('.capitulo[data-chapter="a1-01"]', n => n.classList.contains("is-done")), true);
    assert.match(await page.$eval("#capContinue", n => n.textContent), /^Continuar · A feira de sábado/);

    // e o caminho para o tutorial sai daqui
    await page.click("#capTutorial");
    await page.waitForSelector("#tutorialScreen:not([hidden])");
    await page.click("#tutDone");
    await sleep(150);
    await page.click("#capClose");
    await sleep(150);
    assert.strictEqual(await page.$eval("#campaignScreen", n => n.hasAttribute("hidden")), true);
    await page.close();
  });

  await t.test("repetir um capítulo não piora o que já estava gravado", async () => {
    const page = await novaPagina(() => {
      localStorage.setItem("tc.version", "3");
      localStorage.setItem("tc.campaign", JSON.stringify({
        // recorde alto de propósito: o Puppeteer digita a 3000 ppm e passaria
        // por cima de qualquer marca humana
        chapters: { "a1-01": { done: true, plays: 1, bestWpm: 9999, bestAcc: 100, first: Date.now(), at: Date.now() } },
        lastId: "a1-01"
      }));
    });

    await page.keyboard.press("t");                 // atalho da campanha
    await page.waitForSelector("#campaignScreen:not([hidden])");
    await page.click('.capitulo[data-chapter="a1-01"] .capbtn');
    await page.waitForSelector("#readerScreen:not([hidden])");

    const texto = await page.$eval("#capText", n => n.textContent);
    await page.keyboard.type(texto, { delay: 0 });
    await page.waitForSelector("#capDone:not([hidden])", { timeout: 30000 });
    await sleep(300);

    const c = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("tc.campaign")).chapters["a1-01"]);
    assert.strictEqual(c.bestWpm, 9999, "reler um texto não pode derrubar o melhor PPM");
    assert.strictEqual(c.plays, 2);
    assert.strictEqual(c.done, true);

    // e o botão de repetir devolve o mesmo capítulo do zero
    await page.click("#capRetry");
    await sleep(200);
    assert.strictEqual(await page.$eval("#capTitle", n => n.textContent), "Uma manhã devagar");
    assert.strictEqual(await page.$eval("#capPct", n => n.textContent), "0%");
    await page.click("#capBack");
    await sleep(150);
    assert.strictEqual(await page.$eval("#campaignScreen", n => n.hasAttribute("hidden")), false);
    await page.close();
  });

  await t.test("o tutorial ensina repetição espaçada em cinco abas", async () => {
    const page = await novaPagina();
    await page.keyboard.press("e");                 // atalho de "Como estudar"
    await page.waitForSelector("#tutorialScreen:not([hidden])");

    const abas = await page.$$eval("#tutTabs .opttab", ns => ns.map(n => n.textContent));
    assert.deepStrictEqual(abas, ["O problema", "A ideia", "Aqui dentro", "Na prática", "O que esperar"]);

    // a curva do esquecimento é o argumento inteiro numa imagem
    const grafico = await page.evaluate(() => ({
      linhas: document.querySelectorAll("#tutBody .tutchart polyline").length,
      semRevisar: document.querySelectorAll("#tutBody .tutchart .tutsem").length,
      legenda: document.querySelector("#tutBody .tutlegenda") ? true : false
    }));
    assert.ok(grafico.linhas >= 2, "o gráfico precisa das duas curvas");
    assert.strictEqual(grafico.semRevisar, 1);
    assert.strictEqual(grafico.legenda, true);

    for (const aba of ["ideia", "aqui", "pratica", "esperar"]) {
      await page.click(`#tutTabs .opttab[data-tab="${aba}"]`);
      await sleep(80);
      const texto = await page.$eval("#tutBody", n => n.textContent);
      assert.ok(texto.length > 120, "a aba " + aba + " veio vazia");
    }
    assert.match(await page.$eval("#tutBody", n => n.textContent), /caderno ainda está vazio/);

    // "Aqui dentro" leva ao caderno
    await page.click('#tutTabs .opttab[data-tab="aqui"]');
    await sleep(100);
    await page.click("#tutBody .tutacoes .btn");
    await page.waitForSelector("#notebookScreen:not([hidden])");
    assert.strictEqual(await page.$eval("#tutorialScreen", n => n.hasAttribute("hidden")), true);

    // e o caderno tem o caminho de volta para o tutorial
    await page.click("#nbTutorial");
    await page.waitForSelector("#tutorialScreen:not([hidden])");
    assert.strictEqual(await page.$eval("#notebookScreen", n => n.hasAttribute("hidden")), true);
    assert.strictEqual(
      await page.$eval('#tutTabs .opttab[data-tab="aqui"]', n => n.getAttribute("aria-selected")),
      "true", "vindo do caderno, abre direto na aba que explica o caderno");

    await page.keyboard.press("Escape");
    await sleep(150);
    assert.strictEqual(await page.$eval("#tutorialScreen", n => n.hasAttribute("hidden")), true);
    await page.close();
  });

  await t.test("nenhum erro de console em toda a bateria", () => {
    assert.deepStrictEqual(erros, [], "erros no navegador:\n" + erros.join("\n"));
  });

  /* O piso de cobertura da interface.
   *
   * Os números não são iguais para todo arquivo, e não é por preguiça:
   *   · game.js, options.js, notebook.js e challengeui.js são o jogo — 85%;
   *   · themes.js desenha partículas quadro a quadro, e parte disso só roda
   *     com o clima certo na tela;
   *   · audio.js e speech.js dependem de placa de som e de vozes instaladas,
   *     que o Chrome sem cabeça não tem — medimos, mas exigir deles o mesmo
   *     que de um arquivo de lógica seria fingir cobertura.
   */
  await t.test("cobertura do JavaScript de interface", () => {
    const LIMITES = {
      "js/game.js": 85,
      "js/options.js": 90,
      "js/campaign.js": 85,
      "js/tutorial.js": 85,
      "js/notebook.js": 90,
      "js/challengeui.js": 85,
      "js/storage.js": 85,
      "js/themes.js": 82,
      "js/audio.js": 85,
      "js/speech.js": 75
      // core/*.js não entra aqui: no navegador só rodam os caminhos que a
      // interface usa. Quem cobra 85% deles é o relatório do node:test, que
      // roda a lógica inteira — ver "npm run coverage".
    };
    const linhas = cobertura.relatorio();
    console.log(cobertura.tabela(linhas, LIMITES));
    cobertura.salvar("coverage/interface.json", linhas);

    const vistos = {};
    linhas.forEach(l => { vistos[l.arquivo] = l.pct; });

    const nuncaCarregou = Object.keys(LIMITES).filter(a => vistos[a] === undefined);
    assert.deepStrictEqual(nuncaCarregou, [], "arquivos que nem chegaram a carregar");

    const abaixo = Object.keys(LIMITES)
      .filter(a => vistos[a] < LIMITES[a])
      .map(a => a + " " + vistos[a] + "% (mínimo " + LIMITES[a] + "%)");
    assert.deepStrictEqual(abaixo, [], "cobertura abaixo do piso: " + abaixo.join(" · "));
  });

  for (const ctx of contextos) { try { await ctx.close(); } catch (e) {} }
  await browser.close();
  server.kill();
});
