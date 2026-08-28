# 🌙 Type & Chill

Um jogo de digitação **relaxante** de vocabulário em inglês. Palavras descem devagar;
você digita cada uma antes que ela se apague — e o significado se acende.

O que o separa de um joguinho de digitação qualquer:

- **Trilha ambiente generativa**, feita em código, sem direitos autorais.
- **Quatro climas** que mudam paleta, fundo e harmonia da trilha ao mesmo tempo.
- **Caderno com repetição espaçada** (SM-2): cada palavra volta pouco antes de você esquecer.
- **Desafios entre amigos** sem servidor: um código faz todo mundo jogar a mesma partida.

Feito pra deixar aberto no segundo monitor enquanto você assiste algo. 😌

---

## ▶️ Como rodar

O jogo é 100% HTML/CSS/JavaScript puro — **não precisa instalar nada nem compilar**.

- **Duplo clique no `index.html`.** Funciona. (A trilha só começa depois que você clica em
  "Começar" — é uma regra dos navegadores pra não tocar som sozinho.)
- **Live Server** no VS Code: botão direito no `index.html` → *Open with Live Server*.
- **`npm run serve`** → `http://127.0.0.1:8123`, se você já tiver o Node instalado.

O `npm` só é necessário para os **testes**. O jogo em si nunca depende dele.

---

## 🎮 Os três modos

| Modo | Como funciona | Pra quê |
|---|---|---|
| **Clássico** | 3 vidas, o ritmo acelera a cada 8 palavras (até o nível 12) | A partida de sempre, com recorde |
| **Zen** | Sem vidas, sem fim, ritmo constante | Deixar rodando enquanto faz outra coisa |
| **Prática** | A fila de revisão do caderno, na ordem do agendamento | Fixar o que ainda escapa |

No modo Prática cada palavra da fila aparece uma vez só; quando a fila acaba, a revisão
termina e você vê o resumo.

---

## 📓 O caderno e a repetição espaçada

Toda palavra capturada **ou perdida** entra no caderno. A perdida entra de propósito: é
justamente a que mais precisa de revisão.

Cada palavra carrega um agendamento no estilo **SM-2** (o algoritmo do Anki, enxuto):

- acertou sem errar tecla → nota 5 · com 1 erro → 4 · com 2+ → 3 · deixou cair → 0
- os intervalos sobem em escada: **1 dia → 3 dias → intervalo × facilidade**
- errar zera as repetições, devolve a palavra para amanhã e derruba a facilidade
- **dominada ✦** = 3 repetições certas e intervalo de 21 dias ou mais

A tela do caderno mostra o progresso por nível, deixa buscar por palavra, definição ou
tradução, filtrar por tema/nível/situação, e **baixar tudo em CSV** (pronto pra importar
no Anki, Quizlet ou planilha).

Também na tela inicial: **ofensiva de dias seguidos**, **meta diária** e quantas palavras
vencem hoje.

Tudo fica no `localStorage`, gravado sozinho a cada captura — nada sai da sua máquina.

---

## 🏁 Desafios entre amigos

Sem conta, sem servidor, sem back-end. Um desafio é uma **semente** mais as regras da
partida, empacotadas num código curto:

```
Desafio     TC1-1XQ8YHK-1EKC
Resultado   TC1R-1XQ8YHK-1EKC-8T-K-1H-ANA
```

Quem joga o mesmo código recebe **as mesmas palavras, na mesma ordem, com as mesmas
velocidades** — dá pra comparar placar de forma justa. Três caminhos:

- **Desafio do dia** — a semente vem da data, então hoje todo mundo joga a mesma partida
  sem precisar combinar nada (o modelo do Wordle).
- **Criar desafio** — gera um código com os seus temas e níveis atuais.
- **Entrar com um código** — cole o do desafio ou o resultado de um amigo.

Colando o **código de resultado** de alguém, essa pessoa entra no placar local daquele
desafio. Durante a partida, o melhor placar do desafio aparece como **alvo** no topo e
acende quando você passa. No fim, "Copiar meu resultado" monta o texto pronto pro grupo.

---

## ⌨️ Controles

| Tecla | O que faz |
|---|---|
| `a`–`z` | digita a palavra (a mais próxima do fundo é capturada primeiro) |
| `Esc` | pausa e retoma (nenhuma letra é atalho — todas são digitação) |
| Botão `PT` | mostra/esconde a tradução em português |
| Botões `♫` `♪` | música e efeitos sonoros |
| Botão `▤` | abre o caderno |

O jogo **pausa sozinho** quando você troca de aba, e grava o caderno nesse momento.

---

## 📁 Estrutura

```
Type & Chill/
├── index.html            → a página e a estrutura das telas
├── css/
│   ├── themes.css        → as quatro paletas (só variáveis de cor)
│   └── style.css         → layout e componentes (nenhuma cor solta aqui)
├── js/
│   ├── words.js          → o banco de palavras  ← mexa aqui pra adicionar palavras
│   ├── core/             → lógica pura, sem DOM, coberta por testes
│   │   ├── rng.js        → aleatoriedade determinística e o baralho da partida
│   │   ├── srs.js        → repetição espaçada (SM-2)
│   │   ├── scoring.js    → pontuação, ritmo, PPM e precisão
│   │   ├── challenge.js  → códigos de desafio e de resultado
│   │   └── wordbank.js   → leitura e validação do banco
│   ├── storage.js        → preferências, caderno, ofensiva e placares
│   ├── themes.js         → climas: paleta, fundo animado e clima sonoro
│   ├── audio.js          → a trilha ambiente generativa + efeitos
│   ├── speech.js         → pronúncia das palavras (Web Speech API)
│   ├── notebook.js       → a tela do caderno
│   ├── challengeui.js    → a tela de desafios
│   └── game.js           → o laço do jogo e os modos
├── tests/
│   ├── unit/             → 73 testes, sem navegador (node:test)
│   └── e2e/              → 12 testes no Chrome de verdade
└── tools/serve.js        → servidor estático de desenvolvimento
```

Os `<script>` no fim do `index.html` precisam continuar nessa ordem — cada arquivo usa os
globais definidos pelos anteriores. Os módulos de `js/core/` funcionam nos dois mundos:
viram `window.TCRng`, `window.TCSrs`… no navegador e `require()` no Node.

---

## 🧪 Testes

```bash
npm install        # só na primeira vez (puppeteer-core, ~3 MB, sem baixar navegador)
npm test           # 73 testes de unidade, ~1s
npm run test:e2e   # 12 testes de ponta a ponta num Chrome headless, ~80s
npm run test:all   # os dois
```

Os testes de unidade cobrem o banco de palavras, o gerador determinístico, o SM-2, a
pontuação, os códigos de desafio e o armazenamento (inclusive migração, JSON corrompido e
armazenamento bloqueado). Não precisam de navegador.

Os de ponta a ponta abrem o Chrome (ou Edge) que você já tem instalado — **nada é
baixado**. Se não houver navegador nem `puppeteer-core`, eles são **pulados**, não
falham. Para apontar outro binário: `CHROME_PATH=/caminho/do/chrome npm run test:e2e`.

Dois testes existem por causa de bugs que já aconteceram:
- *"palavras com a letra p podem ser digitadas"* — `P` já foi atalho de pausa e vinha
  antes da digitação no handler, o que tornava impossível capturar 84 palavras do banco.
- *"o mesmo código entrega a mesma partida"* — se isso quebrar, dois amigos com o mesmo
  código jogam partidas diferentes sem perceber.

---

## ✏️ Como personalizar

### Adicionar palavras
Abra `js/words.js`. Cada entrada tem cinco campos:

```js
["twinkle","v","to shine with a soft, flickering light","cintilar","B2"],
```

`palavra` · `classe` (n/v/adj/adv) · `definição em inglês` · `tradução` · `nível` (A2/B1/B2/C1).

Duas regras que o jogo depende, e que o `npm test` verifica: a palavra precisa ser **só
letras minúsculas de a–z** (espaço, hífen ou acento seriam impossíveis de digitar) e **não
pode repetir** em outro tema, porque o caderno guarda uma entrada por palavra.

### Criar um tema novo

```js
science: {
  label: "Ciência",
  words: [
    ["gravity","n","the force that pulls objects toward the earth","gravidade","B1"]
  ]
},
```

### Criar um clima visual novo
1. Em `css/themes.css`, copie um bloco `html[data-visual="..."]` e troque as cores.
2. Em `js/themes.js`, adicione a entrada com a **mesma chave**: `label`, `swatch`
   (as duas cores do preview), `bg` (como as partículas se movem) e `audio`
   (acordes e escala da trilha).

O `style.css` não tem nenhuma cor fixa, então o clima novo já pega a interface inteira.

### Deixar mais fácil / mais difícil
Tudo em `js/core/scoring.js`: `capturePoints`, `levelFor`, `spawnInterval`, `fallSpeed`,
`maxOnScreen`. São funções puras — mexa e rode `npm test` pra ver o efeito.

### Ajustar a agressividade da revisão
`js/core/srs.js`: `MATURE_DAYS`, `MATURE_REPS` e os limites de `ease`.

### Trocar a música
A trilha é generativa de propósito (livre pra postar). Se um dia quiser usar uma faixa
sua, veja a receita comentada no fim de `js/audio.js` — mas atenção: músicas comerciais
podem gerar bloqueio de direitos no Instagram/YouTube.

---

## ⚙️ Desempenho e robustez

- **Um único `requestAnimationFrame`** para menu, jogo e pausa.
- **Qualidade adaptativa**: o jogo mede o FPS e reduz as partículas do fundo em máquina fraca.
- **Elementos reaproveitados** e larguras de palavra em cache — sem releitura de layout a cada quadro.
- **Pausa automática** ao trocar de aba, com o tempo parado descontado do PPM.
- **Gravação automática** do caderno 800ms após cada captura, mais `pagehide` e
  `visibilitychange` (mais confiáveis que `beforeunload`, sobretudo no Android).
- **Armazenamento tolerante**: janela anônima, cota estourada ou JSON corrompido não
  derrubam o jogo — ele avisa e segue em memória.
- **Migração versionada** dos dados, inclusive do recorde da versão Driftwords.
- Tela de erro amigável se a inicialização falhar, em vez de página preta.

---

## 🎥 Gravar pro Instagram / TikTok

1. Deixe o navegador em tela cheia (**F11**) pra esconder as abas.
2. Grave a tela: **Windows** `Win + G` ou Clipchamp · **Mac** `Shift + Cmd + 5` ·
   qualquer sistema: [OBS Studio](https://obsproject.com).
3. Pra Reels/TikTok (9:16), grave uma janela estreita — o layout se adapta.
4. A trilha é sua — **sem risco de copyright**. 😉

Dica: o clima **Chuva** com o modo **Zen** dá o melhor vídeo de fundo.

---

## 🗺️ Próximos passos

- [ ] Publicar de graça (GitHub Pages, Netlify ou Vercel — é só subir a pasta).
- [ ] Controle por toque (teclado virtual) e layout retrato — o que falta antes do mobile.
- [ ] Empacotar com [Capacitor](https://capacitorjs.com) pra virar APK/AAB e ir pra Play Store.
      Como o projeto é HTML/CSS/JS puro, isso não exige reescrever nada.
- [ ] Placar online opcional, se um dia valer a pena ter servidor.

---

## Licença
Faça o que quiser com ele. A trilha sonora é gerada em tempo real, então é livre
de direitos autorais para gravar e publicar.
