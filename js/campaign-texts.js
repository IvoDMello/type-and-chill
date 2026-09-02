/* Type & Chill — os capítulos da campanha.
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │  COMO ESCREVER UM CAPÍTULO                                              │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 *   {
 *     id: "a2-03",              // nível + número, só a-z 0-9 e hífen, único
 *     level: "A2",              // A1 · A2 · B1 · B2 · C1
 *     title: "A feira de sábado",          // curto, em português
 *     intro: "Uma manhã no mercado ...",   // uma linha em português, situa o texto
 *     text: "On Saturday morning ...",     // o texto em inglês, 40 a 160 palavras
 *     pt: "Na manhã de sábado ...",        // tradução (opcional, mas ajuda muito no A1/A2)
 *     targets: ["grocery", "ripe"],        // 3 a 12 palavras-alvo, só minúsculas
 *     words: [                             // opcional: fichas das palavras-alvo que
 *       ["chilly","adj","cold in a way that is unpleasant","gelado","A2",
 *        "The morning air was chilly."]    //   ainda não estão no banco de 708
 *     ]
 *   }
 *
 * Regras que os testes cobram a cada capítulo novo (`npm test`):
 *   · o texto tem entre 40 e 160 palavras — uma a duas sessões de ônibus;
 *   · todo caractere precisa ser digitável: letras, números, espaço e
 *     . , ; : ! ? ' " ( ) -   (aspas curvas, travessão e … são convertidos
 *     sozinhos, então pode colar de qualquer editor);
 *   · cada palavra-alvo precisa aparecer no texto — flexão regular vale
 *     ("wake" na lista casa com "wakes" ou "waking" no texto);
 *   · cada palavra-alvo precisa ter ficha: ou já está no banco (js/words.js),
 *     ou vem declarada aqui no capítulo, no mesmo formato de seis campos;
 *   · o id não pode repetir.
 *
 * Digitação, na campanha: pontuação é exigida, maiúscula não. Tecla errada é
 * ignorada — o jogo espera a certa, como no resto do jogo.
 *
 * Os cinco capítulos abaixo são o ponto de partida, um por nível. Podem ser
 * trocados à vontade: eles existem para o modo nascer jogável.
 */
(function (root) {
  "use strict";

var CAMPAIGN_CHAPTERS = [

  {
    id: "a1-01",
    level: "A1",
    title: "Uma manhã devagar",
    intro: "O sábado que não tem hora para começar.",
    text: "I wake up late on Saturday. The house is quiet and the light is soft. " +
          "I put the kettle on and wait. My kitchen is small, but it is cozy, and " +
          "I like it in the morning. I have no plans today. My routine is simple: " +
          "coffee, a book, and a long walk before lunch. The neighbor waters her " +
          "plants and says hello. The street is quiet. Nothing happens, and that is " +
          "the good part.",
    pt: "Eu acordo tarde no sábado. A casa está quieta e a luz está suave. " +
        "Ponho a chaleira no fogo e espero. Minha cozinha é pequena, mas é " +
        "aconchegante, e eu gosto dela de manhã. Não tenho planos hoje. Minha " +
        "rotina é simples: café, um livro e uma longa caminhada antes do almoço. " +
        "A vizinha rega as plantas e diz oi. A rua está silenciosa. Não acontece " +
        "nada, e essa é a parte boa.",
    targets: ["kettle", "cozy", "routine", "neighbor", "quiet"],
    // "quiet" ainda não está no banco de 708, então a ficha vem no capítulo —
    // é assim que se ensina uma palavra que o texto pede e o banco não tem
    words: [
      ["quiet", "adj", "making little or no noise", "quieto, silencioso", "A1",
       "The street is quiet on Sunday morning."]
    ]
  },

  {
    id: "a2-01",
    level: "A2",
    title: "A feira de sábado",
    intro: "Onde a fruta é boa, o preço se discute e o café é caro.",
    text: "The market opens early, and by nine it is already crowded. I walk slowly " +
          "between the tables and look at everything before I buy. The mangoes are " +
          "ripe, so I take four. A man sells honey and offers me a taste. At the last " +
          "table I find a jacket for half the normal price, which is a real bargain. " +
          "My grocery bag is heavy on the way home, but the coffee I drink on the " +
          "corner is the best part of the week.",
    pt: "O mercado abre cedo e, às nove, já está cheio. Eu ando devagar entre as " +
        "bancas e olho tudo antes de comprar. As mangas estão maduras, então levo " +
        "quatro. Um homem vende mel e me oferece uma prova. Na última banca acho " +
        "uma jaqueta pela metade do preço normal, o que é uma pechincha de verdade. " +
        "A sacola de compras fica pesada na volta, mas o café que eu tomo na esquina " +
        "é a melhor parte da semana.",
    targets: ["crowded", "ripe", "bargain", "grocery", "corner"]
  },

  {
    id: "b1-01",
    level: "B1",
    title: "O trem das seis",
    intro: "Uma viagem curta que muda de humor por causa de um atraso.",
    text: "The journey takes four hours, and I always choose the scenic route along " +
          "the coast. This time there is a delay, so I sit on my luggage and watch " +
          "the platform fill up. Nobody complains; everyone simply waits. When the " +
          "train finally arrives, I find a seat by the window and the sea appears " +
          "twenty minutes later. There is an old lighthouse on the cliff, the same " +
          "landmark my father used to point at when I was small. I take no photos " +
          "this time. I would rather look.",
    pt: "A viagem leva quatro horas, e eu sempre escolho o caminho panorâmico pela " +
        "costa. Desta vez há um atraso, então sento na minha mala e vejo a plataforma " +
        "encher. Ninguém reclama; todo mundo simplesmente espera. Quando o trem " +
        "enfim chega, acho um lugar na janela e o mar aparece vinte minutos depois. " +
        "Há um farol velho no penhasco, o mesmo ponto de referência que meu pai " +
        "apontava quando eu era pequeno. Não tiro fotos desta vez. Prefiro olhar.",
    targets: ["journey", "scenic", "delay", "luggage", "landmark", "cliff"]
  },

  {
    id: "b2-01",
    level: "B2",
    title: "Primeiro dia no trabalho novo",
    intro: "O dia em que todo mundo é simpático e nada faz sentido ainda.",
    text: "My new colleague meets me at the door and explains the building twice, " +
          "which does not help at all. There is a deadline on Friday that nobody " +
          "mentioned in the interview, and the amount of information in the first " +
          "hour is enough to overwhelm anyone. At lunch my manager notices my face " +
          "and tries to reassure me: the first two weeks are supposed to feel like " +
          "this. By six I have learned three names, one password and where the good " +
          "coffee is, which is more than I expected. I go home tired and, strangely, " +
          "content.",
    pt: "Meu colega novo me encontra na porta e explica o prédio duas vezes, o que " +
        "não ajuda em nada. Há um prazo na sexta que ninguém mencionou na entrevista, " +
        "e a quantidade de informação na primeira hora é suficiente para sobrecarregar " +
        "qualquer um. No almoço, minha gerente nota minha cara e tenta me tranquilizar: " +
        "as duas primeiras semanas são para parecer assim mesmo. Às seis eu aprendi " +
        "três nomes, uma senha e onde fica o café bom, o que é mais do que eu esperava. " +
        "Vou para casa cansado e, estranhamente, satisfeito.",
    targets: ["colleague", "deadline", "overwhelm", "reassure", "content"]
  },

  {
    id: "c1-01",
    level: "C1",
    title: "A cidade que não dorme",
    intro: "Um passeio noturno por um centro antigo, com saudade no meio.",
    text: "The old quarter is labyrinthine by design, and getting lost in it is less " +
          "a risk than an invitation. Even after midnight the main thoroughfare is " +
          "bustling: waiters fold chairs, someone plays a guitar badly, and the " +
          "bakeries begin their second day before the first one ends. I turn into a " +
          "narrow alley I have not walked in years, and the smell of bread brings a " +
          "sharp wave of nostalgia. The city has changed almost everything and kept " +
          "exactly the thing I came back for. I walk until the sky turns grey, and " +
          "the last tram home is empty except for me.",
    pt: "O bairro antigo é labiríntico de propósito, e se perder nele é menos um " +
        "risco do que um convite. Mesmo depois da meia-noite a avenida principal está " +
        "movimentada: garçons dobram cadeiras, alguém toca violão mal, e as padarias " +
        "começam o segundo dia antes de o primeiro acabar. Entro numa viela estreita " +
        "que não percorro há anos, e o cheiro de pão traz uma onda aguda de nostalgia. " +
        "A cidade mudou quase tudo e guardou exatamente aquilo por que eu voltei. " +
        "Caminho até o céu ficar cinza, e o último bonde para casa está vazio, tirando eu.",
    targets: ["labyrinthine", "thoroughfare", "bustling", "alley", "nostalgia"]
  }

];

  if (typeof module === "object" && module.exports) {
    module.exports = { CAMPAIGN_CHAPTERS: CAMPAIGN_CHAPTERS };
  }
  if (root) root.CAMPAIGN_CHAPTERS = CAMPAIGN_CHAPTERS;
})(typeof window !== "undefined" ? window : null);
