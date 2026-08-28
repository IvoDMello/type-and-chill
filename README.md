# 🌙 Type & Chill

Um jogo de digitação **relaxante** de vocabulário em inglês. Palavras descem devagar;
você digita cada uma antes que ela se apague — e o significado se acende. Trilha ambiente
**generativa** (feita em código, sem direitos autorais) tocando ao vivo, quatro climas
visuais e um **caderno** que guarda tudo que você já aprendeu.

Feito pra deixar aberto no segundo monitor enquanto você assiste algo. 😌

---

## ▶️ Como rodar

O projeto é 100% HTML/CSS/JavaScript puro — **não precisa instalar nada nem compilar**.

**Jeito mais simples (recomendado): extensão Live Server**

1. Abra a pasta do projeto no VS Code (`Arquivo → Abrir Pasta`).
2. Na aba de extensões, instale **Live Server** (autor: Ritwick Dey).
3. Clique com o botão direito no `index.html` → **Open with Live Server**.
4. O jogo abre no navegador e recarrega sozinho a cada arquivo salvo.

**Alternativa sem extensão**

- Só dar **duplo clique** no `index.html`. Funciona. (A trilha só começa depois que você
  clica em "Começar" — é uma regra dos navegadores pra não tocar som sozinho.)
- Ou, com Python: `python -m http.server` na pasta e acesse `http://localhost:8000`.

---

## 🎮 Os três modos

| Modo | Como funciona | Pra quê |
|---|---|---|
| **Clássico** | 3 vidas, o ritmo acelera a cada 8 palavras | A partida de sempre, com recorde |
| **Zen** | Sem vidas, sem fim, ritmo constante | Deixar rodando enquanto faz outra coisa |
| **Prática** | Só as palavras do seu caderno que ainda não estão dominadas | Fixar o que ainda escapa |

No modo Prática cada palavra da fila aparece uma vez só; quando a fila acaba, a revisão
termina e você vê o resumo.

---

## 📓 O caderno

Toda palavra capturada (ou perdida) entra no caderno com o histórico de acertos e erros.
Uma palavra vira **dominada ✦** depois de 3 capturas, desde que os acertos sejam mais que
o dobro dos erros — as outras ficam na fila do modo Prática.

Abra pelo botão **▤** no topo, ou por "Ver meu caderno" nas telas de início e de fim.
Dá pra buscar por palavra, definição ou tradução e filtrar por tema, nível e situação.

Tudo fica salvo no `localStorage` do navegador — nada sai da sua máquina.

---

## ⌨️ Controles

| Tecla | O que faz |
|---|---|
| `a`–`z` | digita a palavra (a mais próxima do fundo é capturada primeiro) |
| `Esc` | pausa e retoma (nenhuma letra é atalho — todas são digitação) |
| Botão `PT` | mostra/esconde a tradução em português |
| Botões `♫` `♪` | música e efeitos sonoros |

---

## 📁 Estrutura

```
Type & Chill/
├── index.html          → a página e a estrutura das telas
├── css/
│   ├── themes.css      → as quatro paletas (só variáveis de cor)
│   └── style.css       → layout e componentes (nenhuma cor solta aqui)
└── js/
    ├── words.js        → o banco de palavras  ← mexa aqui pra adicionar palavras
    ├── storage.js      → preferências, recordes e o caderno (localStorage)
    ├── themes.js       → climas visuais: paleta, fundo animado e clima sonoro
    ├── audio.js        → a trilha ambiente generativa + efeitos
    ├── notebook.js     → a tela do caderno (busca, filtros, revisão)
    └── game.js         → a lógica do jogo (queda, modos, pontuação)
```

Os `<script>` no fim do `index.html` precisam continuar nessa ordem — cada arquivo usa
os globais definidos pelos anteriores.

---

## ✏️ Como personalizar

### Adicionar palavras
Abra `js/words.js`. Cada entrada tem cinco campos:

```js
["twinkle","v","to shine with a soft, flickering light","cintilar","B2"],
```

`palavra` · `classe` (n/v/adj/adv) · `definição em inglês` · `tradução` · `nível` (A2/B1/B2/C1).

Duas regras que o jogo depende: a palavra precisa ser **só letras minúsculas de a–z**
(nada de espaço, hífen ou acento — não daria pra digitar) e **não pode repetir** em
outro tema, porque o caderno guarda uma entrada por palavra.

### Criar um tema novo
No mesmo arquivo, adicione um bloco (o `label` é o nome que aparece no chip):

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
No `js/game.js`:
- `base` dentro de `spawn()` → velocidade de queda
- `spawnInterval` → tempo entre uma palavra e outra
- `cap` dentro de `frame()` → quantas palavras ao mesmo tempo
- `learnedCount % 8` dentro de `capture()` → de quantas em quantas sobe o nível

### Trocar a música
A trilha é generativa de propósito (livre pra postar). Se um dia quiser usar uma faixa
sua, veja a receita comentada no fim de `js/audio.js` — mas atenção: músicas comerciais
podem gerar bloqueio de direitos no Instagram/YouTube.

---

## 🎥 Gravar pro Instagram / TikTok

1. Deixe o navegador em tela cheia (**F11**) pra esconder as abas.
2. Grave a tela: **Windows** `Win + G` ou Clipchamp · **Mac** `Shift + Cmd + 5` ·
   qualquer sistema: [OBS Studio](https://obsproject.com).
3. Pra Reels/TikTok (9:16), grave uma janela estreita — o layout se adapta.
4. A trilha é sua — **sem risco de copyright**. 😉

Dica: o clima **Chuva** e o modo **Zen** juntos dão o melhor vídeo de fundo.

---

## 🗺️ Próximos passos

- [ ] Publicar de graça (GitHub Pages, Netlify ou Vercel — é só subir a pasta).
- [ ] Empacotar com [Capacitor](https://capacitorjs.com) pra virar APK/AAB e ir pra Play Store.
      Como o projeto é HTML/CSS/JS puro, isso não exige reescrever nada — só adicionar
      o build por cima. Antes disso: controle por toque (teclado virtual) e layout retrato.
- [ ] Áudio das palavras (Web Speech API já resolve, sem custo).
- [ ] Sequência de dias jogados e metas semanais.

---

## Licença
Faça o que quiser com ele. A trilha sonora é gerada em tempo real, então é livre
de direitos autorais para gravar e publicar.
