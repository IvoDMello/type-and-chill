# 🌙 Type & Chill

Um jogo de digitação **relaxante** de vocabulário em inglês. Palavras descem devagar;
você digita cada uma antes que ela se apague — e o significado se acende.

O que o separa de um joguinho de digitação qualquer:

- **20 temas de vocabulário** em recortes estreitos — esportes, profissões, bichos, roupa,
  dinheiro, tempo… — separados em quatro famílias na hora de escolher.
- **708 palavras com frase de exemplo** — todas. Definição ensina a reconhecer;
  frase ensina a usar.
- **Campanha**: textos do A1 ao C1 digitados por inteiro, com palavras-alvo que entram
  no caderno com agendamento.
- **Um tutorial de repetição espaçada**, porque o método é o pulo do gato — e ninguém
  usa o que não entende.
- **Trilha ambiente generativa**, feita em código, sem direitos autorais.
- **Cinco climas** que mudam paleta, fundo e harmonia da trilha ao mesmo tempo — dois
  abertos desde o começo, três que chegam por palavras digitadas.
- **Caderno com repetição espaçada** (SM-2): cada palavra volta pouco antes de você esquecer,
  com estatística por palavra e envio direto pro Anki.
- **Desafios entre amigos** sem servidor: um código faz todo mundo jogar a mesma partida.
- **Menu de opções** de jogo de verdade: volume separado de música e efeitos, qualidade
  gráfica, animações, tamanho das palavras, tela cheia.
- **Instalável** como aplicativo (PWA), e funciona sem internet depois da primeira visita.

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

## 🎮 Os quatro modos

| Modo | Como funciona | Pra quê |
|---|---|---|
| **Clássico** | 3 vidas, o ritmo acelera a cada 8 palavras (até o nível 12) | A partida de sempre, com recorde |
| **Zen** | Sem vidas, sem fim, ritmo constante | Deixar rodando enquanto faz outra coisa |
| **Prática** | A fila de revisão do caderno, na ordem do agendamento | Fixar o que vence hoje |
| **Deck** | Só as palavras em que você tropeça, as mais falhadas primeiro | Encarar o que te pega |

A **Campanha** é uma tela à parte, não um modo da partida: em vez de palavras caindo,
um texto parado que você digita do começo ao fim. Está logo abaixo.

Prática e Deck são os dois **modos de fila**: cada palavra aparece uma vez só e a partida
termina quando a fila acaba. A diferença é a ordem — Prática segue o **agendamento** (o que
você está prestes a esquecer), Deck segue o **tropeço** (o que escapou, errou ou demorou).
O Deck sem tropeço nenhum cai na fila da revisão, em vez de abrir vazio.

---

## 📖 A campanha

Um capítulo é um texto curto (40 a 160 palavras) que você digita inteiro. Cinco a dez
**palavras-alvo** ficam sublinhadas no texto; ao completar cada uma, ela abre o cartão com
definição, tradução e exemplo e **entra no caderno com agendamento** — o mesmo cano das
palavras capturadas jogando. Nada cai, não há vidas nem cronômetro: o progresso é capítulo
concluído, com o melhor PPM e a melhor precisão de cada um.

Digitação na campanha: **pontuação é exigida, maiúscula não** (`i` vale por `I`), e a
tecla errada é **ignorada** — o cursor espera a certa, como no resto do jogo. Errar não
suja o texto; custa precisão no resumo do fim.

### Escrever um capítulo

Os textos ficam em [`js/campaign-texts.js`](js/campaign-texts.js), um objeto por capítulo:

```js
{
  id: "a2-03",                          // nível + número, único
  level: "A2",                          // A1 · A2 · B1 · B2 · C1
  title: "A feira de sábado",           // curto, em português
  intro: "Onde a fruta é boa...",       // uma linha em português
  text: "The market opens early...",    // o texto em inglês, 40 a 160 palavras
  pt: "O mercado abre cedo...",         // tradução (opcional, ajuda muito no A1/A2)
  targets: ["crowded", "ripe"],         // 3 a 12 palavras-alvo
  words: [                              // opcional: ficha das que não estão no banco
    ["quiet","adj","making little or no noise","quieto","A1","The street is quiet."]
  ]
}
```

O `npm test` cobra cada capítulo novo e diz o que está torto:

- o texto tem entre 40 e 160 palavras;
- todo caractere é digitável — letras, números, espaço e `. , ; : ! ? ' " ( ) -`
  (aspas curvas, travessão e reticências são convertidos sozinhos, então pode colar de
  qualquer editor);
- cada palavra-alvo **aparece no texto**, e flexão regular vale: `wake` na lista casa
  com *wakes* ou *waking* no texto;
- cada palavra-alvo **tem ficha**: já está no banco de 708 ou vem declarada no capítulo;
- o `id` não repete.

Foi assim que o primeiro capítulo escrito aqui foi pego: a lista dizia `neighbor` e o
texto escrevia *neighbour*.

---

## 🧠 Como estudar (o tutorial)

Tela própria, com cinco abas, aberta pela tecla **E**, pelo link da tela inicial, pelo
caderno e pelo fim de um capítulo da campanha:

| Aba | O que responde |
|---|---|
| **O problema** | A curva do esquecimento, desenhada em SVG: por que o que você estudou domingo já sumiu na quarta |
| **A ideia** | Rever pouco antes de esquecer; por que os intervalos crescem (1 → 3 → 8 → 20 dias) |
| **Aqui dentro** | O que o jogo faz sozinho (nota 5/4/3/0, dominada ✦) e o que você escolhe (Prática, Deck, Campanha, Caderno) |
| **Na prática** | Dez minutos por dia batem duas horas no domingo; errar é o sinal, não o fracasso |
| **O que esperar** | Os números, sem promessa mágica, e o seu estado de hoje |

O caderno é um sistema de repetição espaçada inteiro; quem não sabe o que isso é vê só
"uma lista de palavras". Esta tela existe para transformar o recurso em método.

---

## ⚙️ O menu de opções

A engrenagem fica no canto da tela inicial, no rodapé durante a partida e na tela de
pausa — e responde à tecla **O** (ou **Alt+O** jogando). Abrir a engrenagem no meio de uma
partida **pausa**: mexer no volume enquanto as palavras caem custaria três delas.

| Aba | O que tem |
|---|---|
| **Áudio** | Música e efeitos com **volume separado** (a trilha baixinha e a tecla audível, ou o contrário) e a pronúncia das palavras |
| **Gráficos** | Qualidade das partículas (Auto · Alta · Média · Baixa · Desligada), animações (Auto · Completas · Reduzidas) e tela cheia |
| **Exibição** | Tamanho das palavras que caem, tradução em português, frase de exemplo e a lista de capturadas |
| **Jogo** | Meta diária, apelido no placar e o atalho para os ajustes da partida |
| **Dados** | Caderno, download do CSV, onde ficam seus dados e apagar o caderno |

Cada linha grava sozinha e aplica na hora — não existe botão de "salvar", que é o tipo de
coisa que faz a pessoa mexer no volume, fechar e perder o ajuste. **Restaurar padrões**
devolve só o que este menu controla: temas, níveis e caderno não são opções.

Em **Qualidade**, "Auto" é o padrão e deixa o jogo medir o FPS e aliviar sozinho em máquina
fraca. Escolher um nível desliga essa medição — quem mandou foi você.

O que **jogar** (modo, temas, níveis, clima) continua no painel de *Ajustes da partida*,
tecla **A**: são duas perguntas diferentes, e misturá-las faria um menu que ninguém acha.

---

## 📓 O caderno e a repetição espaçada

Toda palavra capturada **ou perdida** entra no caderno. A perdida entra de propósito: é
justamente a que mais precisa de revisão.

Cada palavra carrega um agendamento no estilo **SM-2** (o algoritmo do Anki, enxuto):

- acertou sem errar tecla → nota 5 · com 1 erro → 4 · com 2+ → 3 · deixou cair → 0
- os intervalos sobem em escada: **1 dia → 3 dias → intervalo × facilidade**
- errar zera as repetições, devolve a palavra para amanhã e derruba a facilidade
- **dominada ✦** = 3 repetições certas e intervalo de 21 dias ou mais

Cada palavra guarda quatro números, e todos aparecem na linha dela: **quantas vezes
apareceu** (👁), **quantas foram capturadas** (✓), **quantas escaparam** (✕) e **quanto
tempo você leva pra digitá-la**. Juntos eles viram a *fragilidade* — o quanto a palavra
ainda te pega —, que é o que ordena o filtro **"as que te pegam"** e a fila do modo Deck.

A tela do caderno mostra o progresso por nível, a **curva de evolução** (PPM e precisão nas
últimas 30 sessões), deixa buscar por palavra, definição ou tradução, filtrar por
tema/nível/situação, e exportar de dois jeitos:

- **Baixar CSV** — abre em planilha e importa em Anki ou Quizlet. Traz a frase de exemplo,
  as estatísticas e a data da próxima revisão.
- **Enviar pro Anki** — manda as palavras da tela direto pro baralho *Type & Chill*, sem
  arquivo nenhum. Precisa do Anki aberto com o add-on **AnkiConnect**, e do endereço desta
  página na `webCorsOriginList` do add-on. Se algo faltar, o jogo explica o que fazer em vez
  de falhar calado.

Também na tela inicial: **ofensiva de dias seguidos**, **meta diária** e quantas palavras
vencem hoje.

A ofensiva **congela em vez de zerar**. Faltou um dia, a contagem para de pé (e a tela diz
"dias congelados ❄"); o próximo dia jogado retoma de onde estava. Perder três semanas de
hábito por causa de uma viagem é o tipo de punição que faz a pessoa não voltar.

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

Durante a partida:

| Tecla | O que faz |
|---|---|
| `a`–`z` | digita a palavra (a mais próxima do fundo é capturada primeiro) |
| `Esc` | pausa e retoma |
| `Alt`+`P` | mostra/esconde a tradução em português |
| `Alt`+`M` · `Alt`+`S` | música e efeitos sonoros |
| `Alt`+`C` | abre o caderno |
| `Alt`+`O` | abre as opções (e pausa) |

**Todo atalho da partida usa `Alt`**, e não é por capricho: letra solta é sempre
digitação. Um dia `P` foi atalho de pausa e isso tornou impossível capturar as 84
palavras do banco que têm a letra p.

Na tela inicial, onde não se digita nada, as letras podem ser atalho:

| Tecla | O que faz |
|---|---|
| `Enter` | começa a partida |
| `A` | abre os ajustes da partida |
| `O` | abre as opções |
| `C` | abre o caderno |
| `T` | abre a campanha |
| `E` | abre "Como estudar" |

O jogo **pausa sozinho** quando você troca de aba, e grava o caderno nesse momento.

### No celular

O layout se adapta de 1440px até 320px, e a partida abre o **teclado do sistema**:
toque na tela para chamá-lo de volta se ele sumir. A área onde as palavras caem
encolhe junto com a viewport visível, então nada cai atrás do teclado.

---

## 📁 Estrutura

```
Type & Chill/
├── index.html            → a página e a estrutura das telas
├── manifest.webmanifest  → o que faz o jogo poder ser instalado
├── sw.js                 → cache offline (service worker)
├── icon.svg              → ícone do aplicativo instalado
├── css/
│   ├── themes.css        → as cinco paletas (só variáveis de cor)
│   └── style.css         → layout e componentes (nenhuma cor solta aqui)
├── js/
│   ├── words.js          → o banco de palavras  ← mexa aqui pra adicionar palavras
│   ├── examples.js       → a frase de exemplo de cada palavra
│   ├── campaign-texts.js → os capítulos da campanha  ← e aqui pra escrever textos
│   ├── core/             → lógica pura, sem DOM, coberta por testes
│   │   ├── rng.js        → aleatoriedade determinística e o baralho da partida
│   │   ├── srs.js        → repetição espaçada (SM-2) e fragilidade
│   │   ├── scoring.js    → pontuação, ritmo, PPM e precisão
│   │   ├── challenge.js  → códigos de desafio e de resultado
│   │   ├── wordbank.js   → leitura e validação do banco
│   │   ├── progress.js   → marcos dos climas, curva de evolução e ofensiva
│   │   └── campaign.js   → leitura, marcação dos alvos e validação dos capítulos
│   ├── storage.js        → preferências, caderno, ofensiva, histórico e placares
│   ├── themes.js         → climas: paleta, fundo animado e clima sonoro
│   ├── audio.js          → a trilha ambiente generativa + efeitos
│   ├── ui-fx.js          → cursor com rastro, som e respingo nos botões
│   ├── speech.js         → pronúncia das palavras (Web Speech API)
│   ├── notebook.js       → a tela do caderno, o gráfico, o CSV e o Anki
│   ├── options.js        → o menu da engrenagem (áudio, gráficos, exibição, dados)
│   ├── campaign.js       → a lista de capítulos e o leitor
│   ├── tutorial.js       → a tela "Como estudar"
│   ├── challengeui.js    → a tela de desafios
│   └── game.js           → o laço do jogo e os modos
├── tests/
│   ├── unit/             → 174 testes, sem navegador (node:test)
│   ├── e2e/              → 30 testes no Chrome de verdade
│   │   └── coverage.js   → mede quanto do JS de interface os testes executam
└── tools/serve.js        → servidor estático de desenvolvimento
```

Os `<script>` no fim do `index.html` precisam continuar nessa ordem — cada arquivo usa os
globais definidos pelos anteriores. Os módulos de `js/core/` funcionam nos dois mundos:
viram `window.TCRng`, `window.TCSrs`… no navegador e `require()` no Node.

---

## 🧪 Testes

```bash
npm install        # só na primeira vez (puppeteer-core, ~3 MB, sem baixar navegador)
npm test           # 174 testes de unidade, ~1s
npm run coverage   # os mesmos testes, com piso de cobertura de 85%
npm run test:e2e   # 30 testes de ponta a ponta num Chrome headless, ~180s
npm run test:all   # cobertura + ponta a ponta
```

### Cobertura, e onde cada arquivo é cobrado

A cobertura é medida nos dois mundos, porque metade do jogo é DOM e nunca apareceria
num relatório só de Node:

| Onde | Como | Piso |
|---|---|---|
| Lógica (`js/core/`, `js/storage.js`) | `npm run coverage` — o coletor do próprio Node | **85%** de linhas, ramos e funções |
| Interface (`js/game.js`, `options.js`, `campaign.js`, `tutorial.js`, `notebook.js`, `challengeui.js`, `themes.js`, `audio.js`) | `npm run test:e2e` — o V8 do Chrome, pelo mesmo caminho da aba *Coverage* do DevTools | **85%** de bytes executados |

Números da última medição: **99,8% de linhas · 88,6% de ramos · 99,5% de funções** no Node,
e na interface **campanha 94% · tutorial 98% · options 96% · notebook 95% · áudio 90% ·
desafios 89% · climas 86% · game 86%**. O relatório da interface é gravado em `coverage/interface.json`, e a tabela
aparece no fim do `npm run test:e2e`.

Dois arquivos têm piso menor e é de propósito: `speech.js` (75%) depende de vozes
instaladas no sistema e `themes.js` (82%) desenha partículas quadro a quadro — exigir
deles o mesmo que de um arquivo de lógica seria fingir cobertura. `words.js`, `examples.js` e
`campaign-texts.js` ficam fora da conta: são dados, não código.

Os testes de unidade cobrem o banco de palavras (inclusive **100% de cobertura das frases
de exemplo**, e se cada frase usa mesmo a própria palavra), o gerador determinístico, o
SM-2 e a fragilidade, a pontuação, os marcos dos climas, a ofensiva congelada, os códigos
de desafio e o armazenamento (inclusive migração desde o Driftwords, JSON corrompido,
armazenamento bloqueado para leitura ou escrita e o jogo rodando **sem** os módulos de
agendamento e de progresso). Não precisam de navegador.

`tests/unit/robustez.test.js` existe só para os caminhos defensivos — o que acontece
quando falta alguma coisa. São os ramos que nunca aparecem numa partida normal, e é
justamente por isso que quebram sem ninguém ver.

Os de ponta a ponta abrem o Chrome (ou Edge) que você já tem instalado — **nada é
baixado**. Se não houver navegador nem `puppeteer-core`, eles são **pulados**, não
falham. Para apontar outro binário: `CHROME_PATH=/caminho/do/chrome npm run test:e2e`.

Os de ponta a ponta também cobrem o menu de opções inteiro (as cinco abas, restaurar
padrões, tela cheia), os atalhos de teclado, o CSV e as duas pontas do AnkiConnect (o
add-on respondendo e o Anki fechado), o desafio do dia com as duas formas de copiar o
código, e o clima que abre no meio da partida.

Cinco testes existem por causa de bugs que já aconteceram:
- *"palavras com a letra p podem ser digitadas"* — `P` já foi atalho de pausa e vinha
  antes da digitação no handler, o que tornava impossível capturar 84 palavras do banco.
- *"o mesmo código entrega a mesma partida"* — se isso quebrar, dois amigos com o mesmo
  código jogam partidas diferentes sem perceber.
- *"as palavras nunca caem atrás dos painéis"* — o palco ocupa a tela toda, e sem uma
  área de queda calculada as palavras somem por trás do HUD e da lista lateral.
- *"a tela inicial muda entre novato e veterano"* — as duas telas nascem do mesmo HTML;
  quando uma quebra, a outra costuma continuar de pé e o erro passa despercebido.
- *"o menu de opções aplica cada ajuste na hora"* — a barra do topo era escondida para
  quem chegava agora, e levava junto a engrenagem: o jogador novo ficava sem caminho
  nenhum até as opções.

---

## ✏️ Como personalizar

### Adicionar palavras
Abra `js/words.js`. Cada entrada tem cinco campos:

```js
["twinkle","v","to shine with a soft, flickering light","cintilar","B2"],
```

`palavra` · `classe` (n/v/adj/adv) · `definição em inglês` · `tradução` · `nível` (A2/B1/B2/C1).

E abra `js/examples.js` para a **frase de exemplo**, que é obrigatória:

```js
"twinkle": "The first stars twinkle above the hill.",
```

Três regras que o jogo depende, e que o `npm test` verifica: a palavra precisa ser **só
letras minúsculas de a–z** (espaço, hífen ou acento seriam impossíveis de digitar), **não
pode repetir** em outro tema (o caderno guarda uma entrada por palavra), e **precisa ter
frase de exemplo** — uma frase curta que use a própria palavra (flexão regular vale:
`walk` → *walked*). A frase aparece no cartão da captura, no resumo do fim, no caderno, no
CSV e no cartão do Anki.

Se preferir, a frase também pode vir como sexto campo da linha em `js/words.js`; quando as
duas existem, a do banco ganha.

### Criar um tema novo
Todo tema declara a **família** (`group`) a que pertence — é o que separa as fichinhas da
tela inicial em blocos em vez de um paredão único. As famílias ficam em `WORD_GROUPS`, no
topo do mesmo arquivo: `daily` (do dia a dia), `human` (gente & corpo), `world` (o mundo lá
fora) e `mind` (trabalho, saber & cultura).

```js
music: {
  label: "Música", group: "mind",
  words: [
    ["melody","n","a series of notes that make a tune","melodia","B1"]
  ]
},
```

Prefira **recortes estreitos** — *esportes*, *profissões*, *bichos* — a temas guarda-chuva:
é o que permite treinar um assunto de cada vez. Um tema precisa de **20 palavras ou mais**
(o `npm test` cobra isso, senão o sorteio fica repetitivo).

### Criar um clima visual novo
1. Em `css/themes.css`, copie um bloco `html[data-visual="..."]` e troque as cores.
2. Em `js/themes.js`, adicione a entrada com a **mesma chave**: `label`, `swatch`
   (as duas cores do preview), `bg` (como as partículas se movem) e `audio`
   (acordes e escala da trilha).
3. Se ele deve ser uma recompensa, some a chave em `MILESTONES` (`js/core/progress.js`)
   com o número de palavras que abre. Clima sem marco nasce aberto.

O `style.css` não tem nenhuma cor fixa, então o clima novo já pega a interface inteira.

### Mudar os marcos de desbloqueio
`js/core/progress.js`, na constante `MILESTONES`. Hoje: **Brasa** e **Noite lo-fi** abertos,
**Chuva** com 150 palavras digitadas, **Manhã** com 450 e **Aurora** com 900. Um clima que
já esteja em uso nunca fecha, mesmo que o marco mude — ninguém perde o próprio tema.

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

## 🎨 Como a interface está organizada

A tela inicial tem **dois estados**, montados do mesmo HTML:

- **primeira vez** — kicker, título grande e uma frase; o "como jogar" já vem aberto;
- **veterano** — quantas palavras vencem hoje, em corpo grande, e a ofensiva no topo.

A ação primária acompanha: quem tem revisão vencida vê *"Revisar N palavras"*, quem não
tem vê *"Começar"*. O outro caminho fica logo abaixo, como texto.

Toda a configuração — modo, temas, níveis, clima, preferências — vive num **painel**
(`#setupScreen`, tecla `A`), resumido numa linha na tela inicial. São escolhas que se
fazem uma vez e ficam meses iguais; elas não precisavam do lugar nobre.

Durante a partida o HUD guarda só o que muda a cada instante: nível, pontos, sequência,
vidas e pausar. PPM e Aprendidas aparecem na tela de pausa; os botões de som, tradução e
caderno ficam no rodapé, longe de onde as palavras caem.

---

## 📲 Instalar como aplicativo

O jogo é um **PWA**: servido por http(s), o navegador oferece instalar, e aí ele ganha ícone,
janela sem abas e funciona sem internet (`sw.js` guarda a pasta inteira no cache).

- No Chrome/Edge: o botão **"Instalar o jogo"** aparece sozinho na tela inicial quando o
  navegador considera que dá; também dá pra usar o ícone na barra de endereço.
- Abrindo o `index.html` no dedo (`file://`) tudo funciona **menos** a instalação e o
  offline — service worker exige http(s). O `npm run serve` já basta pra testar.
- Publicou uma versão nova? Troque a constante `CACHE` no `sw.js`, senão os navegadores
  antigos continuam servindo a versão em cache.

Um PWA entrega o que o empacotamento desktop entregaria (ícone, janela própria, offline)
sem trocar de tecnologia, sem instalador e sem loja no meio — veja a nota abaixo.

---

## 🗺️ Próximos passos

- [x] Frase de exemplo em todas as palavras do banco.
- [x] Estatística por palavra, lista "as que te pegam" e modo Deck.
- [x] Curva de evolução, climas por marco e ofensiva que congela.
- [x] Exportar pro Anki (CSV e AnkiConnect).
- [x] Instalável como aplicativo (PWA) e offline.
- [x] Layout responsivo e teclado virtual no celular.
- [ ] **Encher o banco**: de 708 para 2.000 palavras (com frase de exemplo cada uma).
      É a tarefa que mais muda a experiência e a mais chata — e a que mais adia o "acabou".
- [ ] Publicar de graça (GitHub Pages, Netlify ou Vercel — é só subir a pasta).
- [ ] Alvos de toque no lugar do teclado (tocar na palavra pra escolhê-la) e testes em
      aparelho de verdade — o que falta antes de encarar a Play Store.
- [ ] Empacotar com [Capacitor](https://capacitorjs.com) pra virar APK/AAB e ir pra Play Store.
      Como o projeto é HTML/CSS/JS puro, isso não exige reescrever nada.
- [x] Campanha: o motor, o leitor, a validação dos capítulos e cinco textos de partida.
- [ ] Escrever os capítulos de verdade — a campanha nasce com um por nível, e é conteúdo
      que só o autor faz.
- [ ] Placar online opcional, se um dia valer a pena ter servidor.

### Sobre distribuir e cobrar

O documento de design original falava em **Tauri ou Electron, mirando a Steam**. Vale
registrar por que o rumo aqui é outro:

- Na Steam, um jogo de digitação sem arco de conteúdo (sem história, sem arte cara, sem
  chefes) compete com *Epistory* e *The Textorcist* e com sites gratuitos como o Monkeytype.
  Some a taxa de entrada, os 30% da plataforma, a janela de reembolso de 2h — cruel pra um
  jogo de sessões curtas — e a fama de "site numa janela" que jogos empacotados carregam.
- Quem paga por isto não paga pelo *jogo*: paga por **aprender inglês**. É esse o produto —
  banco grande, revisão espaçada, campanha, exportação — e é aí que a disposição a pagar
  existe de verdade.
- Por isso: **web primeiro, instalável como PWA**, cobrando direto (assinatura barata ou
  compra única, com Pix/cartão) por um plano *Pro* — banco completo, campanha, sincronia e
  exportação —, deixando o núcleo gratuito para trazer gente. Play Store depois, via
  Capacitor, como canal de descoberta com a mesma base de código.
- A Steam continua possível, mas como **experimento posterior** e produto separado: só
  depois que a campanha existir e houver gente pagando na web. Um Tauri por cima do mesmo
  código é barato de fazer quando esse dia chegar — e não entrega nada que o PWA já não dê
  antes disso.

> Nada de cobrança está implementado: não há conta, servidor nem trava por recurso.
> Isso é decisão de produto, não de código, e entra quando houver o que vender.

---

## Licença
Faça o que quiser com ele. A trilha sonora é gerada em tempo real, então é livre
de direitos autorais para gravar e publicar.
