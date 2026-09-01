# Prompt para redesign da interface — cole no Claude.ai

Copie tudo o que está entre as linhas abaixo e cole numa conversa nova no Claude.ai.
Anexe também um print da tela inicial e um print de uma partida em andamento.

--- 

Você é designer de produto e de interface. Quero sua ajuda para reduzir a carga
visual de um jogo que eu fiz, sem perder nenhuma função.

## O produto

**Type & Chill** é um jogo de digitação relaxante para aprender vocabulário em inglês.
Palavras em inglês descem devagar na tela; o jogador digita cada uma antes que ela se
apague, e a definição aparece. Público: brasileiros estudando inglês, jogando no PC,
muitas vezes com o jogo aberto no segundo monitor enquanto assistem outra coisa. O clima
é calmo, contemplativo — o oposto de um jogo de reflexo agressivo.

Ele já é funcional e tem bem mais coisa do que parece:

- **3 modos**: Clássico (3 vidas, acelera), Zen (sem fim), Prática (fila de revisão).
- **20 temas de vocabulário** (708 palavras), agrupados em 4 famílias:
  - *Do dia a dia*: Dia a dia, Casa & objetos, Comida & bebida, Roupa & estilo, Dinheiro & compras
  - *Gente & corpo*: Gente & jeitos, Emoções & mente, Corpo & saúde, Esportes & jogos
  - *O mundo lá fora*: Natureza & paisagem, Bichos, Tempo & céu, Cidade & ruas, Viagem
  - *Trabalho, saber & cultura*: Profissões, Trabalho & negócios, Tecnologia, Ciência, Arte & música, Ideias & raciocínio
- **4 níveis CEFR** filtráveis: A2, B1, B2, C1.
- **4 climas visuais** que trocam paleta, partículas de fundo e a harmonia da trilha
  sonora ao mesmo tempo: Brasa (escuro quente), Noite lo-fi (escuro roxo), Chuva (escuro
  azul), Manhã (**claro**).
- **Caderno** com repetição espaçada (SM-2): cada palavra volta pouco antes de o jogador
  esquecer. Tem ofensiva de dias seguidos e meta diária.
- **Desafios entre amigos** sem servidor: um código curto (ex. `TC1-1XQ8YHK-1EKC`) faz
  todo mundo receber a mesma partida, e dá para colar o resultado do amigo num placar local.

## Restrições técnicas — inegociáveis

1. **HTML, CSS e JavaScript puros. Sem build, sem framework, sem dependência externa.**
   O jogo abre com duplo clique num `index.html`. Não sugira React, Tailwind, ícones de
   biblioteca, nem nada que precise de `npm install`.
2. **Todas as cores vêm de variáveis CSS**, redefinidas por tema em
   `html[data-visual="ember" | "lofi" | "rain" | "dawn"]`. O CSS de layout não tem
   nenhuma cor literal, e precisa continuar assim. As variáveis disponíveis são:
   `--text --muted --faint --accent --accent-2 --hot --gold --panel --border --border-hi
   --field --card --card-shadow --overlay --btn-a --btn-b --btn-fg --btn-glow
   --word-bg --word-border --word-bg-on --word-border-on --word-glow --letter --letter-next
   --bg-layers --mono --serif`
   Se você precisar de uma variável nova, diga o nome e o valor para os 4 temas.
3. **Tipografia fixa**: `Fraunces` (serifada, para texto e títulos) e `JetBrains Mono`
   (para números, rótulos em caixa alta e as palavras do jogo).
4. **O teclado é o controle principal.** Nada pode depender de hover ou de mouse preciso.
5. Precisa funcionar de **1440×900 até 620px de largura**, e respeitar
   `prefers-reduced-motion`.
6. Um dos temas é **claro** (Manhã). Qualquer proposta precisa ter contraste suficiente
   nos quatro.

## O que existe hoje na tela inicial, item por item

Tudo isso está empilhado numa única coluna dentro de um cartão que rola:

1. Kicker "UM JOGO RELAXANTE DE VOCABULÁRIO"
2. Título "Type & Chill"
3. Frase de apoio de duas linhas
4. 4 números: Recorde · Dias seguidos · Revisar hoje · Dominadas
5. Barra de meta diária + texto "13 de 20 palavras hoje"
6. Aviso (só às vezes) de armazenamento bloqueado
7. Seletor de **Modo**: 3 fichinhas + uma frase explicando o modo escolhido
8. Seletor de **Temas**: 20 fichinhas, agrupadas em 4 famílias com cabeçalho e atalho
9. Seletor de **Nível**: 4 fichinhas + legenda "A2 básico · B1 intermediário · …"
10. Seletor de **Clima**: 4 fichinhas com bolinha de cor
11. **Preferências**: 4 fichinhas (Tradução PT, Música, Efeitos, Pronúncia)
12. Botão primário "COMEÇAR"
13. Texto "708 palavras neste sorteio"
14. 2 botões secundários: "Jogar com amigos" e "Meu caderno"
15. Bloco recolhível "Como jogar" com 4 passos
16. Rodapé com dicas

## O HUD durante a partida

- Canto superior esquerdo: "Type & Chill", "NÍVEL 1", e (em desafios) o alvo a bater.
- Canto superior direito: 5 métricas (Pontos, Sequência, Aprendidas, PPM, Vidas) e
  5 botões redondos (PT, caderno, música, efeitos, pausar).
- Direita, abaixo do HUD: lista das palavras capturadas na partida.
- Rodapé central: cartão grande com a palavra, classe, nível, definição e tradução.

## Os problemas que eu quero resolver

1. **Densidade uniforme.** Tudo tem mais ou menos o mesmo peso visual, então nada guia
   o olho. O jogador precisa ler a tela inteira para achar o botão de começar.
2. **A ação primária compete com a configuração.** "Começar" fica depois de ~35 fichinhas.
3. **Jogador novo e jogador veterano veem exatamente a mesma tela**, apesar de quererem
   coisas opostas: o novo quer entrar no jogo, o veterano quer ver o que revisar hoje.
4. **Configuração que quase nunca muda ocupa o lugar nobre.** Tema, nível e clima são
   escolhidos uma vez e ficam meses iguais.
5. **O HUD tem 10 elementos** competindo com a informação que realmente importa durante
   a partida, que é a palavra caindo.

## O que eu quero de você

1. **Um diagnóstico curto** (no máximo 5 frases) da hierarquia atual: o que deveria ser
   visto primeiro, segundo e terceiro.
2. **Uma proposta de arquitetura da tela inicial** que diga explicitamente, para cada um
   dos 16 itens acima: continua na tela principal / vira padrão inteligente e some /
   vai para um painel de ajustes / muda de forma. Nenhuma função pode simplesmente
   desaparecer sem você dizer para onde ela foi.
3. **Dois estados desenhados**: (a) primeira vez, caderno vazio, nenhum recorde;
   (b) veterano, com 12 dias de ofensiva e 30 palavras para revisar hoje.
4. **Uma proposta para o HUD** que reduza o peso visual sem esconder o que muda durante
   a partida.
5. **O código**: um artifact HTML único e funcional com a tela inicial redesenhada e o
   HUD, usando só as variáveis CSS listadas acima, com um seletor para eu alternar entre
   os 4 temas e entre os dois estados. Quero poder copiar o CSS direto para o meu projeto.

## Como quero a resposta

- Português do Brasil, tom direto.
- Primeiro o diagnóstico e as decisões, depois o artifact.
- Se você achar que alguma função deveria ser cortada de vez, diga qual e por quê —
  mas separe isso claramente das mudanças de layout.
- Não invente funcionalidade nova antes de resolver a hierarquia do que já existe.

## Anexo — as cores reais do jogo

Este é o `css/themes.css` inteiro, do jeito que está no projeto. Use estes valores
no seu artifact para que ele fique com a cara real do jogo, e não com cores inventadas.

```css
/* Type & Chill — paletas.
 *
 * Cada bloco html[data-visual="..."] é um clima completo. O jogo troca o
 * atributo data-visual no <html> (veja themes.js) e a interface inteira muda.
 *
 * Para criar um clima novo: copie um bloco, troque a chave e as cores, e
 * adicione a entrada correspondente em js/themes.js (label, swatch, bg, audio).
 * Todo o resto do CSS lê só estas variáveis — nada de cor solta em style.css.
 */

:root {
  --mono: 'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace;
  --serif: 'Fraunces', Georgia, 'Times New Roman', serif;
}

/* ---------- Brasa: o clima original, quente e escuro ---------- */
html[data-visual="ember"] {
  --bg-layers:
    radial-gradient(1200px 760px at 50% 118%, rgba(255,106,61,0.30), transparent 60%),
    radial-gradient(900px 620px at 82% -6%, rgba(255,77,61,0.20), transparent 62%),
    radial-gradient(760px 560px at 12% 6%, rgba(255,157,77,0.12), transparent 60%),
    linear-gradient(170deg, #2a0e0d 0%, #160709 52%, #0c0405 100%);
  --text: #fbeee4;
  --muted: #d0a48c;
  --faint: #a3766a;
  --accent: #ff9d4d;
  --accent-2: #ff6a3d;
  --hot: #ff4d3d;
  --gold: #ffd08a;
  --panel: rgba(48,18,14,0.62);
  --border: rgba(255,150,90,0.18);
  --border-hi: rgba(255,157,77,0.5);
  --word-bg: rgba(22,7,9,0.42);
  --word-border: rgba(255,150,90,0.14);
  --word-bg-on: rgba(60,20,12,0.72);
  --word-border-on: rgba(255,157,77,0.6);
  --word-glow: rgba(255,106,61,0.30);
  --letter: #f0cdb4;
  --letter-next: #fff6ee;
  --overlay: radial-gradient(900px 720px at 50% 32%, rgba(42,14,13,0.72), rgba(12,4,5,0.92));
  --card: linear-gradient(165deg, rgba(66,24,16,0.92), rgba(24,9,9,0.95));
  --card-shadow: 0 24px 80px rgba(0,0,0,0.55);
  --field: rgba(22,7,9,0.5);
  --btn-a: #ffb266;
  --btn-b: #ff6a3d;
  --btn-fg: #1a0705;
  --btn-glow: rgba(255,106,61,0.38);
}

/* ---------- Noite lo-fi: roxo e azul, poeira caindo ---------- */
html[data-visual="lofi"] {
  --bg-layers:
    radial-gradient(1100px 720px at 50% 116%, rgba(167,139,250,0.24), transparent 62%),
    radial-gradient(880px 600px at 84% -6%, rgba(125,211,252,0.16), transparent 62%),
    radial-gradient(720px 520px at 10% 4%, rgba(244,114,182,0.12), transparent 60%),
    linear-gradient(170deg, #1a1130 0%, #0e0a1a 54%, #06040d 100%);
  --text: #ece7fb;
  --muted: #b3a8d6;
  --faint: #8177ab;
  --accent: #a78bfa;
  --accent-2: #7dd3fc;
  --hot: #f472b6;
  --gold: #fcd34d;
  --panel: rgba(30,22,54,0.62);
  --border: rgba(167,139,250,0.20);
  --border-hi: rgba(167,139,250,0.55);
  --word-bg: rgba(14,10,26,0.45);
  --word-border: rgba(167,139,250,0.16);
  --word-bg-on: rgba(46,32,84,0.75);
  --word-border-on: rgba(167,139,250,0.62);
  --word-glow: rgba(125,211,252,0.28);
  --letter: #cfc4f0;
  --letter-next: #ffffff;
  --overlay: radial-gradient(900px 720px at 50% 32%, rgba(26,17,48,0.74), rgba(8,6,16,0.93));
  --card: linear-gradient(165deg, rgba(48,33,86,0.92), rgba(16,11,30,0.95));
  --card-shadow: 0 24px 80px rgba(0,0,0,0.6);
  --field: rgba(14,10,26,0.55);
  --btn-a: #c4b5fd;
  --btn-b: #8b5cf6;
  --btn-fg: #140e26;
  --btn-glow: rgba(139,92,246,0.40);
}

/* ---------- Chuva: azul frio, gotas descendo ---------- */
html[data-visual="rain"] {
  --bg-layers:
    radial-gradient(1100px 720px at 50% 118%, rgba(56,189,248,0.20), transparent 62%),
    radial-gradient(900px 620px at 80% -6%, rgba(103,232,249,0.14), transparent 62%),
    radial-gradient(700px 520px at 12% 6%, rgba(94,234,212,0.10), transparent 60%),
    linear-gradient(170deg, #0d2030 0%, #061019 55%, #03080d 100%);
  --text: #e6f6fb;
  --muted: #9fc3d3;
  --faint: #6f93a5;
  --accent: #67e8f9;
  --accent-2: #38bdf8;
  --hot: #5eead4;
  --gold: #a5f3fc;
  --panel: rgba(12,32,46,0.62);
  --border: rgba(103,232,249,0.18);
  --border-hi: rgba(103,232,249,0.5);
  --word-bg: rgba(6,16,25,0.45);
  --word-border: rgba(103,232,249,0.15);
  --word-bg-on: rgba(14,45,64,0.75);
  --word-border-on: rgba(103,232,249,0.58);
  --word-glow: rgba(56,189,248,0.28);
  --letter: #bfe4ef;
  --letter-next: #ffffff;
  --overlay: radial-gradient(900px 720px at 50% 32%, rgba(10,28,42,0.74), rgba(3,9,14,0.93));
  --card: linear-gradient(165deg, rgba(14,44,64,0.92), rgba(5,15,23,0.95));
  --card-shadow: 0 24px 80px rgba(0,0,0,0.6);
  --field: rgba(6,16,25,0.55);
  --btn-a: #a5f3fc;
  --btn-b: #22b8d4;
  --btn-fg: #04141d;
  --btn-glow: rgba(34,184,212,0.38);
}

/* ---------- Manhã: claro, para jogar de dia sem cansar a vista ---------- */
html[data-visual="dawn"] {
  --bg-layers:
    radial-gradient(1100px 720px at 50% 118%, rgba(224,122,95,0.20), transparent 62%),
    radial-gradient(900px 620px at 82% -8%, rgba(212,163,90,0.20), transparent 62%),
    radial-gradient(720px 520px at 10% 4%, rgba(233,196,168,0.28), transparent 60%),
    linear-gradient(170deg, #fdf1e3 0%, #fbe6d5 58%, #f6dcc8 100%);
  --text: #3b2b26;
  --muted: #7a5f53;
  --faint: #a58a7c;
  --accent: #d1603f;
  --accent-2: #b8863a;
  --hot: #c25b46;
  --gold: #a97c2f;
  --panel: rgba(255,252,248,0.72);
  --border: rgba(184,98,72,0.24);
  --border-hi: rgba(184,98,72,0.55);
  --word-bg: rgba(255,252,248,0.66);
  --word-border: rgba(184,98,72,0.20);
  --word-bg-on: rgba(255,255,255,0.94);
  --word-border-on: rgba(184,98,72,0.62);
  --word-glow: rgba(224,122,95,0.28);
  --letter: #6b4c42;
  --letter-next: #2a1c17;
  --overlay: radial-gradient(900px 720px at 50% 32%, rgba(253,241,227,0.84), rgba(244,220,199,0.94));
  --card: linear-gradient(165deg, rgba(255,253,250,0.96), rgba(251,235,221,0.96));
  --card-shadow: 0 20px 60px rgba(120,72,48,0.18);
  --field: rgba(255,255,255,0.8);
  --btn-a: #e8926f;
  --btn-b: #c8543a;
  --btn-fg: #fff6f0;
  --btn-glow: rgba(200,84,58,0.30);
}
```

---

## Depois que o Claude responder

Se você gostar do resultado, me traga de volta:

- o HTML/CSS que ele gerou, ou o link do artifact;
- as decisões que você aceitou e as que rejeitou.

Eu adapto ao `index.html` e ao `css/style.css` reais, mantendo os IDs que o `game.js`
usa (a lista está em `js/game.js`, função `boot()`), e rodo `npm run test:e2e` para
garantir que nada quebrou.
