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
    assert.deepStrictEqual(modos, ["Clássico", "Zen", "Prática"]);

    const niveis = await page.$$eval("#levelChips .chip", ns => ns.map(n => n.textContent));
    assert.deepStrictEqual(niveis, ["A2", "B1", "B2", "C1"]);

    const climas = await page.$$eval("#visualChips .chip", ns => ns.map(n => n.textContent.trim()));
    assert.deepStrictEqual(climas, ["Brasa", "Noite lo-fi", "Chuva", "Manhã"]);
    await page.close();
  });

  await t.test("trocar de clima repinta a interface inteira", async () => {
    const page = await novaPagina();
    for (const [i, chave] of [[1, "lofi"], [2, "rain"], [3, "dawn"], [0, "ember"]]) {
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
      ppm: +document.getElementById("wpm").textContent
    }));
    assert.ok(estado.pontos > 0);
    assert.strictEqual(estado.aprendidas, 1);
    assert.strictEqual(estado.capturadas, 1);
    assert.strictEqual(estado.defVisivel, true);
    assert.ok(estado.traducao.length > 0, "a tradução em PT devia estar preenchida");
    assert.strictEqual(estado.traducaoEscondida, false);
    assert.ok(estado.ppm > 0, "PPM devia ter sido calculado");

    // a gravação é agrupada em 800ms — o caderno não espera o fim da partida
    await sleep(1200);
    const caderno = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("tc.notebook") || "{}"));
    assert.ok(caderno[palavra], "a captura devia ter sido gravada sozinha");
    assert.strictEqual(caderno[palavra].hits, 1);
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

  await t.test("nenhum erro de console em toda a bateria", () => {
    assert.deepStrictEqual(erros, [], "erros no navegador:\n" + erros.join("\n"));
  });

  for (const ctx of contextos) { try { await ctx.close(); } catch (e) {} }
  await browser.close();
  server.kill();
});
