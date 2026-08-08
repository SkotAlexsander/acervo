# Decisões de arquitetura

Registro do que foi decidido, e do **porquê** — pra não refazer a discussão daqui
a três meses.

---

## 1. Vite + React + Capacitor, não PWA nem React Native

**Contexto:** o pedido era ver o app no PC primeiro e instalar no celular depois.

**Decisão:** app web (Vite + React) empacotado em APK pelo Capacitor.

**Por quê:**
- **PWA estava fora** desde o começo. Um organizador de arquivos precisa listar o
  armazenamento; a `File System Access API` não existe no Chrome do Android, e onde
  existe só enxerga pastas escolhidas uma a uma. Um "organizador" que não enxerga
  nada não é um organizador.
- **React Native/Expo** daria arquivos reais, mas a pré-visualização no PC seria por
  um emulador ou pela versão web do Expo — as duas piores do que abrir o navegador.
- **Capacitor** roda o mesmo bundle no navegador do PC e dentro do APK. É o único
  que atende as duas metades do pedido sem código duplicado.

**Custo aceito:** gerar o APK exige Android Studio (~4 GB). Não há como fugir disso
para um app que lê o armazenamento — ver `android.md`.

---

## 2. A camada `FsProvider` — a decisão que sustenta tudo

**Problema:** como construir e testar o app inteiro hoje, no PC, se os arquivos só
existem no celular?

**Decisão:** um contrato único (`src/fs/types.js`) com duas implementações:

| | `mockProvider` | `deviceProvider` |
|---|---|---|
| Onde roda | navegador do PC | dentro do APK |
| Dados | árvore Android simulada | arquivos reais (`@capacitor/filesystem`) |
| Alterações | gravadas no `localStorage` | gravadas no armazenamento |

`src/fs/index.js` é **a única linha do projeto que sabe da diferença**. Nenhuma tela
importa nenhum dos dois.

**O que isso comprou:**
- O app foi construído, projetado e testado por inteiro sem tocar num celular.
- No dia do APK, a mudança é de zero linhas de tela.
- A lixeira, a varredura e a busca são escritas **uma vez** e funcionam nos dois —
  porque só usam o contrato.

**O que isso custou:** o mock precisa ser fiel de verdade. Nome duplicado renumera
como o Android renumera, mover pra dentro de si mesmo é recusado, apagar é recursivo.
Um mock complacente teria escondido bugs até o aparelho.

---

## 3. Dados de demonstração com semente fixa e sujeira plantada

`mockData.js` gera a árvore com um PRNG semeado (`mulberry32`, semente `20260808`).

**Por quê a semente:** recarregar a página dá exatamente a mesma árvore. Sem isso,
"a Limpeza achou 5 cópias" viraria um número diferente a cada F5 e não daria pra
testar nada — nem à mão, nem por bancada.

**Por quê a sujeira:** duplicados de verdade (mesmo nome, mesmo tamanho, em pastas
diferentes), arquivos de 0 byte, uma pasta vazia, arquivos de 1 GB. Sem eles a tela
de Limpeza pareceria funcionar só porque estaria vazia.

---

## 4. Excluir manda pra lixeira. Sempre.

**Decisão:** `excluir` = mover pra `/.Acervo/Lixeira` + anotar a origem num manifesto
JSON. Apagar de vez é uma segunda decisão, em outra tela, com confirmação numerada.

**Por quê:** é um app de arquivos pessoais, operado com o polegar, com um botão de
menu a 8px do vizinho. A pergunta certa não é "e se ele errar?" — é "quando ele
errar, dá pra voltar?".

A lixeira vive no contrato do provider (`move` + `readText`/`writeText`), então é
**uma implementação só** pros dois mundos.

---

## 5. A Limpeza nunca limpa sozinha

Todo app de "limpeza" que apaga com um toque um dia some com a foto do casamento de
alguém. Aqui:

- cada grupo abre uma lista com caixas de seleção;
- as **cópias repetidas** vêm pré-marcadas, mas sempre poupando a mais antiga;
- **arquivos grandes** e **antigos** vêm desmarcados — não são lixo por definição;
- o aviso diz, com todas as letras, que a comparação é por **nome + tamanho, não por
  conteúdo**. Dois arquivos iguais em nome e tamanho quase sempre são o mesmo. "Quase
  sempre" não é "sempre", e quem apaga precisa saber disso.

---

## 6. Roteamento por hash (`HashRouter`)

Dentro do APK — e ao abrir `dist/index.html` direto no navegador — não existe servidor
pra responder por rota. Com `#/pastas/DCIM`, a navegação funciona nos dois casos sem
nenhuma configuração.

Junto: `base: './'` no `vite.config.js`, senão o APK procura os arquivos na raiz do
sistema e abre em branco.

**Ganho de brinde:** o caminho da pasta mora na URL. O botão "voltar" do Android
funciona de graça, e qualquer tela manda o usuário direto pra uma pasta.

---

## 7. Fonte empacotada, não Google Fonts

`@fontsource-variable/inter` entra no bundle. Um app de arquivos precisa abrir sem
internet, e dentro do APK não há rede garantida. Um `<link>` pro Google Fonts daria
um app que muda de cara quando o Wi-Fi cai.

---

## 8. Ícones desenhados no projeto, não biblioteca

40 ícones em `src/components/Icone.jsx`, todos com traço 1.6 e as mesmas pontas
arredondadas. Uma biblioteca traria centenas (peso no APK) e uma família visual que
não é a nossa. **É a uniformidade do traço que faz um conjunto parecer um conjunto.**

Dois detalhes que só apareceram na tela: os três pontinhos do menu viram `<circle>`
preenchidos (ponto feito de traço sai com 1,6px e some no celular), e a "vassoura"
da Limpeza virou **brilhos** — vassoura só fica legível acima de ~28px, e a barra
de abas usa 21px.

---

## 9. Tema em três estados, não dois

O tema tem **sistema**, **claro** e **escuro** — e os três precisam funcionar, inclusive
"claro escolhido na mão com o Windows no escuro".

Por isso `tokens.css` define **toda** cor no `:root` e apenas **redefine** dentro de
`@media (prefers-color-scheme: dark)` e `[data-tema='escuro']`. O media query é
guardado por `:not([data-tema='claro'])`, que é o que faz a escolha manual vencer o
sistema.

**A armadilha evitada:** uma cor definida só dentro do `@media` some no instante em
que o usuário escolhe o tema na mão.

---

## 10. Moldura de celular na pré-visualização do PC

No PC o app aparece dentro de uma moldura de ~420px centralizada; abaixo de 560px de
largura (ou 620px de altura), a moldura some e o app ocupa tudo. Dentro do APK ela
nunca aparece — `App.jsx` marca `data-nativo` no documento e o CSS derruba a moldura.

**Por quê:** é um app de celular. Vê-lo esticado em 1920px mentiria sobre como ele
fica na mão, e decisões de design tomadas em cima dessa mentira quebrariam no aparelho.

---

## 11. Paginação na lista, não virtualização

Categorias podem ter 400 imagens. A lista renderiza 80 e carrega o próximo lote quando
a rolagem chega perto do fim (`IntersectionObserver`), com botão manual de garantia.

Virtualização (`react-window` e afins) seria mais eficiente, mas custa uma dependência
e quebra a rolagem restaurada. Para o tamanho real de um armazenamento de celular,
paginar resolve.

---

## 12. Gestos por evento de PONTEIRO, não de toque

Toque longo e puxar-pra-atualizar usam `pointerdown`/`pointermove`, não
`touchstart`/`touchmove`.

**Por quê:** ponteiro é a mesma API pra dedo, caneta e mouse. Com ela, os dois
gestos são testáveis no navegador do PC — e de fato há três casos de bancada
segurando o botão do mouse por 700ms. Com eventos de toque, seriam dois recursos
verificáveis só no aparelho, ou seja: não verificáveis hoje.

Três detalhes que decidem se o toque longo parece nativo ou quebrado, e que estão
no código por causa disso:

- **rolar cancela** (mais de 10px de arrasto desarma) — senão deslizar a lista
  seleciona itens sem querer;
- **o clique seguinte é engolido** — senão soltar o dedo abre a pasta que você
  acabou de selecionar;
- **`user-select: none` + `-webkit-touch-callout: none`** nas linhas — sem isso o
  Android abre o balãozinho de copiar texto e mata o gesto no meio.

---

## 13. Índice gravado: mostrar o velho enquanto lê o novo

A varredura da árvore morre quando o app fecha. Num armazenamento real, isso é uma
espera a cada abertura.

**Decisão:** o resultado da varredura fica gravado (formato posicional, ~40% menor
que objetos). Na abertura, o índice velho aparece **na hora** e a varredura de
verdade roda por trás, trocando o resultado quando termina.

**A honestidade que isso exige:** o índice gravado pode estar errado — outro app
apagou uma foto, a câmera gravou um vídeo. Por isso ele nunca é a resposta final,
só o primeiro rascunho; vence em 24 horas; e é apagado a cada alteração feita pelo
próprio app. Se a cota do `localStorage` estourar, ele simplesmente deixa de
existir e o app segue igual, só sem o atalho.

---

## 14. Somar pasta só do que está na tela

O sistema de arquivos não guarda o tamanho de uma pasta — é preciso descer a árvore
dela inteira. Mostrar isso em toda linha de uma lista de 80 pastas seria 80
varreduras completas de uma vez.

**Decisão:** um `IntersectionObserver` **único e compartilhado** avisa quais linhas
estão à vista; só essas entram numa fila de no máximo 3 cálculos simultâneos; o
resultado fica em cache; e sair da tela **cancela** o cálculo em andamento.

E há um interruptor nos Ajustes, porque numa pasta de 10 mil arquivos isso pesa e
a decisão de pagar esse custo é de quem está usando.

---

## 15. Renomear em lote tem prévia obrigatória

Renomear 40 arquivos com um padrão errado é um estrago que ninguém desfaz na mão.
Por isso o resultado aparece na tela **antes** de qualquer arquivo ser tocado, a
extensão nunca entra no padrão (trocar `.jpg` por engano transforma foto em arquivo
que nenhum app abre), e um padrão que geraria nomes repetidos é recusado — não
porque o provider não saberia renumerar, mas porque aí o resultado sairia diferente
da prévia, e a prévia é a única coisa que a pessoa está olhando.

---

## 16. "Onde foi meu espaço" não desce a árvore de novo

A tela do ranking de pastas poderia chamar `tamanhoDaPasta()` pra cada pasta de
primeiro nível — 13 varreduras completas.

Em vez disso ela faz **uma passada linear** sobre a lista de arquivos que a
varredura já deixou na memória, somando cada um na conta da pasta de primeiro nível
a que pertence. Mesmo resultado, custo próximo de zero.

É o tipo de coisa que só aparece quando se pergunta "de onde esse número já vem?"
antes de perguntar "como eu calculo esse número?".

---

## 17. ZIP e PDF escritos à mão, sem biblioteca

O app compacta em `.zip`, extrai `.zip` e gera PDF — e não trouxe nenhuma
dependência nova pra isso.

**ZIP.** O container é um formato simples e bem especificado (APPNOTE da
PKWARE). A parte difícil — comprimir e descomprimir DEFLATE — o navegador já
faz nativo, em `CompressionStream`/`DecompressionStream`. Uma biblioteca traria
11 KB e mais um terceiro dentro do APK pra resolver a parte fácil. Onde o
nativo não existe (WebView antigo), a criação cai pra "guardado" — o `.zip`
continua válido e abre em qualquer lugar, só não encolhe, **e a interface diz
isso** em vez de fingir que comprimiu.

**PDF.** `pdf-lib` e `jspdf` pesam ~350 KB cada — mais que o app inteiro — pra
fazer o que cabe em 200 linhas. Um PDF de imagens é um envelope simples, e a
decodificação de imagem também é do navegador (canvas).

Duas escolhas dentro do PDF que não são óbvias:

- **Toda imagem é reencodada como JPEG baseline**, mesmo quando já era JPEG. O
  PDF só aceita JPEG *baseline* no filtro `DCTDecode`, e boa parte das fotos de
  celular hoje é JPEG **progressivo** — que abriria em branco. Passar pelo
  canvas normaliza tudo (PNG, WebP, o que o navegador souber abrir) ao custo de
  uma perda de qualidade uniforme.
- **Texto usa Courier**, não Helvetica. Courier é monoespaçada: todo glifo mede
  exatos 600/1000 de em, então a quebra de linha vira aritmética exata, sem
  precisar embutir uma tabela de larguras de fonte no app. E é a fonte certa
  pro conteúdo (log, código, tabela em texto).

---

## 18. Só `.zip`. Não `.rar`, não `.7z`

`.rar` e `.7z` são formatos fechados. Não existe descompressor pequeno o
bastante pra caber num app assim, e oferecer "abre arquivos compactados" pra
depois falhar em metade deles é pior do que oferecer só o que funciona.

Mesma régua pra `.docx` → PDF: converter exige renderizar o formato inteiro —
layout, fontes, tabelas. Isso é um editor de texto, não uma função.

**A regra por trás das duas:** prometer só o que se entrega inteiro.

---

## 19. O mock precisou produzir bytes de verdade

Compactar e gerar PDF exigem o **conteúdo** do arquivo, e a demonstração do PC
só tinha nome, tamanho e data. Sem resolver isso, as duas funções seriam
inverificáveis até existir um APK.

A saída foi o mock materializar bytes plausíveis: imagens viram um JPEG de
verdade renderizado no canvas a partir do mesmo degradê determinístico da
miniatura (com o nome do arquivo escrito nela); textos usam o conteúdo que já
existia; o resto vira um bilhete explicando o que é.

**O que NÃO foi feito:** inventar 300 MB de bytes aleatórios pra bater com o
tamanho declarado. Isso estouraria a memória e mentiria duas vezes.

E o provider passou a declarar `conteudoReal: false`, que a interface lê e
exibe: *"na demonstração os arquivos não têm conteúdo de verdade; o .zip sai
válido, mas com conteúdo de exemplo"*. Uma demonstração pode ser falsa — não
pode ser falsa **em silêncio**.

---

## 20. Zip Slip é tratado, e mostrado

Uma entrada de `.zip` chamada `../../../algo` faria a extração escrever fora da
pasta escolhida. É um ataque conhecido e antigo, e vale mesmo num app pessoal —
basta baixar um `.zip` de procedência ruim.

Entradas assim são **recusadas e mostradas como recusadas**, com o nome à
vista. Renomear em silêncio esconderia que o arquivo era malicioso.

O CRC de cada entrada também é conferido na extração: um `.zip` meio corrompido
vira arquivo meio corrompido **em silêncio** se ninguém checar.

---

## 21. A permissão de arquivos exigiu código nativo

Desde o Android 11, "acesso a todos os arquivos" **não se pede por diálogo**. Não
existe API JavaScript, e o `@capacitor/filesystem` não expõe nem a checagem. O app
só pode LEVAR o usuário à tela de configurações e perguntar de novo depois.

Por isso existe `android/app/src/main/java/br/pessoal/acervo/AcessoArquivos.java`
— ~40 linhas com dois métodos: `verificar()` e `abrirConfiguracoes()`. O segundo
tenta três intents em cascata, porque nem todo fabricante implementa a tela
específica do app.

**A alternativa era pior:** sem isso, o app abriria mostrando um armazenamento
vazio, e qualquer pessoa concluiria que ele está quebrado. A tela de permissão
diz o que houve, leva ao lugar certo e detecta a volta sozinha
(`visibilitychange`).

---

## 22. O Proxy do Capacitor não pode ser devolvido de uma função `async`

`registerPlugin()` devolve um **Proxy** que transforma qualquer acesso a
propriedade numa chamada nativa. Uma função `async` que devolve esse proxy faz o
JavaScript sondar `.then` nele pra saber se é uma promessa — e o proxy entende
como "chame o método `then()` no Android":

```
"AcessoArquivos.then()" is not implemented on android
```

O app ficava preso na tela de abertura. **No navegador o erro não existe**, porque
o plugin nem chega a ser criado — só apareceu quando o APK rodou num aparelho.

A regra que fica: **plugin do Capacitor sempre embrulhado** (`return { p: plugin }`),
nunca devolvido nu de um `async`.

---

## 23. APK de release assinado, não debug

O `assembleDebug` gera um APK que instala e funciona — mas com depuração ligada
(o WebView aceita conexão do DevTools) e sem otimização. Para uso de verdade, o
release assinado é 28% menor (3,5 MB contra 4,9) e não expõe o WebView.

A chave é autoassinada. Ela existe só porque o Android recusa instalar APK sem
assinatura — não atesta identidade nenhuma.

> **Atualizado pela decisão 30.** Enquanto o projeto vivia numa pasta só desta
> máquina, a senha ficava em texto claro no `build.gradle` e isso estava certo.
> Com o código no GitHub, a chave passou pra `android/keystore.properties`, fora
> do repositório.

O que continua valendo: **perder a chave significa nunca mais poder atualizar o
app já instalado** — o Android recusa atualização assinada por outra chave, e a
única saída é desinstalar, perdendo os dados.

## 24. Criptografia: usar o `crypto.subtle`, nunca escrever a conta

`zip.js` e `pdf.js` foram escritos à mão de propósito — são formatos de arquivo, e
errar neles produz um arquivo que não abre, o que se descobre no primeiro teste.

**Criptografia é o oposto.** Um AES escrito à mão que "funciona" — protege e abre
de volta — pode estar completamente quebrado, e nada no comportamento denuncia.
Erro em cripto não aparece: aparece anos depois, na mão de quem não devia ter
acesso.

Então `cripto.js` **não implementa nada**. Ele usa o `crypto.subtle` do próprio
sistema (código nativo, auditado, acelerado por hardware). O trabalho aqui é só
**usar direito**, e as escolhas foram:

| Escolha | Por quê |
|---|---|
| **AES-GCM**, não CBC | GCM autentica. Um byte trocado no arquivo faz a abertura FALHAR, em vez de devolver um documento silenciosamente alterado |
| **PBKDF2-SHA256, 210 mil rodadas** | É a recomendação atual da OWASP. Deriva a chave uma vez por arquivo, não por bloco |
| **Blocos de 1 MiB, IV próprio por bloco** | Um `encrypt` de 80 MB de uma vez trava a tela e estoura a memória do celular. Em blocos dá pra mostrar progresso e o pico de memória é previsível |
| **O nome do arquivo vai DENTRO** (bloco 0) | Guardar `exame-de-sangue.pdf` em claro no cabeçalho seria vazar metade do segredo pra quem só olhou a lista de arquivos |
| **AAD = cabeçalho + número do bloco** | Amarra cada bloco ao arquivo E à posição. Trocar dois blocos de lugar, ou colar um bloco de outro arquivo com a mesma senha, passa a falhar na autenticação |
| **O tamanho total vai no bloco 0** | Blocos que faltam não têm como falhar sozinhos. Conferir a soma no fim é o que denuncia um arquivo cortado |

E a validação que dá confiança de verdade: o teste de unidade decifra o `.acv`
com o **`node:crypto` clássico** (`pbkdf2Sync` + `createDecipheriv`), que é outra
implementação. Se as duas chegam no mesmo texto, o formato é AES-GCM padrão — e
não um dialeto que só o Acervo lê. Mesmo princípio do `.zip` contra o PowerShell.

**O que a tela é obrigada a dizer, e diz:** senha perdida = arquivo perdido. Não
existe recuperação. Um jeito de recuperar sem a senha seria uma porta dos fundos.

---

## 25. "Deixar mais leve" são DUAS coisas, e o app não finge que é uma

"Comprimir sem danificar" quer dizer coisas diferentes dependendo do arquivo:

- **Foto** → reencodar com menos dados. Os pixels mudam, o olho não percebe, o
  arquivo cai pra um terço. Tecnicamente é perda.
- **Qualquer outro** → guardar num `.zip`. Volta byte por byte igual. Sem perda
  nenhuma, mas o arquivo passa a viver dentro do zip.

Chamar o primeiro de "sem perder nada" seria mentira técnica; chamar de "danifica"
seria mentira prática. A tela mostra os **dois números — antes e depois** — e diz
qual dos dois caminhos está usando.

**O número do "depois" é real, não estimativa.** A imagem é reencodada de verdade
na memória a cada mudança de ajuste, e só é gravada quando você aperta o botão.
Custa uns décimos de segundo e evita a única coisa que não dá pra desfazer aqui:
descobrir depois de gravar que não valeu a pena.

**E quando não vale a pena, a tela DIZ.** Um JPEG já comprimido reencodado com
qualidade alta sai *maior* que o original. Abaixo de 5% de ganho, a resposta
honesta é "este arquivo já está otimizado, deixa quieto" — com o botão ainda
disponível, porque a decisão é de quem usa.

---

## 26. O conversor só oferece o que ele realmente faz

Um conversor que lista trinta formatos e falha em vinte é pior que um que lista
seis e entrega os seis: a pessoa perde o arquivo de vista e não sabe se a culpa
foi dela.

Por isso `alvosDe()` é a peça central de `converter.js`. Ela olha o arquivo,
**pergunta ao navegador o que ele sabe gravar** e devolve só os destinos
possíveis, cada um com o preço declarado na etiqueta: *sem perder nada* /
*reencoda a imagem* / *muda a formatação*.

A pergunta ao navegador não é frescura. **Chrome que não sabe escrever WebP não dá
erro — devolve PNG em silêncio, com o nome errado.** O teste de 1×1 pixel em
`imagem.js` resolve isso, e a bancada de formatos confere os **bytes mágicos** do
arquivo produzido: se diz WebP, começa com `RIFF....WEBP`.

**O que ficou de fora, e por quê:**

| Não converte | Motivo |
|---|---|
| PDF → imagem/texto | Exigiria um interpretador de PDF inteiro. **Ler** PDF é uma ordem de grandeza mais difícil que escrever um |
| vídeo/áudio entre formatos | O navegador decodifica, mas não codifica vídeo de forma utilizável. Isso é trabalho de ffmpeg |
| `.docx`/`.xlsx` | São `.zip` de XML: daria pra LER, mas escrever um que o Word aceite sem reclamar é outro projeto |

Nesses casos a tela diz isso em português, em vez de sumir com a opção — sumir
faz a pessoa procurar pra sempre.

---

## 27. O CSV brasileiro usa ponto e vírgula

A armadilha do CSV em português: o **Excel exporta com `;`**, não com `,`. Um
leitor que só entende vírgula não dá erro — devolve uma coluna gigante com tudo
dentro, e ninguém percebe até ser tarde.

`farejarSeparador()` conta candidatos (`,` `;` tab `|`) **fora das aspas** na
primeira linha e escolhe o vencedor. Na volta, `converter` grava CSV com `;` e
com **BOM** — sem o BOM o Excel mostra `JoÃ£o` no lugar de `João`.

O arquivo de demonstração `gastos-do-mes.csv` tem as três armadilhas de
propósito: separador `;`, campo com vírgula preso entre aspas (`"Pão, leite e
café"`) e decimal com vírgula. Se a conversão acerta ali, acerta na planilha real.

---

## 28. Voltar tem quatro significados, e o Android manda todos pelo mesmo botão

Num app de arquivos, "voltar" pode querer dizer: fechar a folha aberta, subir uma
pasta, sair da tela, ou fechar o app. Sem uma ordem explícita, o botão de voltar
com o menu aberto dentro de `Documentos/Contratos/2025` fechava **o app inteiro**.

A ordem, do mais perto do dedo pro mais longe, vive em `state/voltar.js`:

```
1. tem folha/diálogo aberto?          → fecha ele
2. está dentro de uma subpasta?       → sobe UM nível
3. está numa tela que não é o início? → volta pro início
4. está no início?                    → dois toques em 2s pra sair
```

Duas decisões de implementação que importam:

- **A pilha de camadas é um módulo, não um contexto React.** O ouvinte do botão
  físico é registrado uma vez no arranque e precisa enxergar a pilha *atual*. Com
  contexto, ele veria a pilha congelada do momento em que foi criado — o bug
  clássico de closure velha, que só aparece no aparelho.
- **`App.addListener('backButton')` assume o evento.** Sem isso o Capacitor faz
  `history.back()` no WebView, que com HashRouter ora anda pro lugar certo, ora
  sai do app, dependendo de como a tela chegou ali.

O gesto de **deslizar da borda esquerda** usa a mesma regra, e Pointer Events em
vez de Touch — assim funciona com o mouse na pré-visualização do PC e **pode ser
testado por uma bancada de navegador**. Um gesto que só existe no aparelho é um
gesto que ninguém verifica.

> E ele já cobrou: a primeira versão passava um `ref` pro hook do gesto. O efeito
> rodava uma vez com `ref.current` ainda `null` (a área de conteúdo só existe
> depois da tela de "abrindo o armazenamento…") e nunca mais rodava, porque a
> identidade do ref não muda. **O gesto ficava morto e nada acusava** — só a
> bancada. Passou a receber o elemento em estado.

---

## 29. Notificação é interrupção, então vem desligada

A pergunta que decidiu: **um organizador de arquivos tem o direito de te
interromper?** Quase nunca. Notificação de app que não precisa notificar é a razão
pela qual as pessoas desligam notificação de tudo.

A regra ficou estreita, e mora num lugar só (`fs/notificar.js`):

- só avisa quando o app **não está na frente** (`document.hidden`);
- só sobre coisa que você mandou fazer e foi embora esperar — e que demorou mais
  de 3 segundos;
- mais o armazenamento quase cheio, no máximo **uma vez por dia**;
- e o interruptor nos Ajustes **vem desligado**.

Ligar o interruptor **pede a permissão do sistema antes de gravar a preferência**.
Gravar "ligado" com a permissão negada seria um ajuste que diz sim e não faz nada
— o pior tipo de ajuste que existe.

Detalhe do Android que custa uma tarde: **sem criar o canal de notificação antes
da primeira mensagem, o sistema descarta em silêncio** e nada aparece. E o `id` da
notificação precisa caber num `int` de 32 bits do Java — um `Date.now()` inteiro
estoura e some sem erro.

---

## 30. A chave de assinatura saiu do repositório

A decisão 23 dizia que a senha em texto claro no `build.gradle` estava certa: o
app não ia pra loja nenhuma e vivia numa pasta só desta máquina.

**Publicar no GitHub muda o fato, então muda a decisão.** A chave e as senhas
foram pra `android/keystore.properties`, que não é versionado; o modelo público é
`keystore.properties.exemplo`. Sem o arquivo, o `assembleDebug` continua
funcionando e o `assembleRelease` **avisa em português** em vez de falhar com uma
mensagem do Gradle que ninguém entende.

O ponto que fica: segredo que depende de o repositório continuar privado não é
segredo. A distância entre "privado" e "público" é um `git push` que se dá sem
pensar.

---

## 31. Uma bancada que só visita rotas não vê metade do app

As bancadas de layout e de dedo passavam limpo há semanas — porque só navegavam
entre telas. Elas **nunca abriam uma folha**, que é justamente onde ficam os
controles densos: lista de opções, campo de senha, caixa de marcar, botões lado a
lado no rodapé.

Assim que passaram a abrir as folhas, o primeiro achado apareceu: o **"X" de
fechar tinha 34×34** — abaixo do alvo de dedo — desde o primeiro dia.

Três medições novas vieram junto:

- **celular deitado** (740×360 e 915×412): a altura despenca e o rodapé com os
  botões é o primeiro a sair da tela. Um app conferido só em pé descobre isso na
  mão do usuário;
- **280px** (Galaxy Fold fechado), a menor largura que ainda existe no mundo;
- **botão alcançável**: além de não estourar pra fora, o rodapé da folha precisa
  estar *dentro* da janela — senão não dá pra confirmar nem cancelar.

---


## O que **não** foi feito, e por quê

| Não feito | Motivo |
|---|---|
| Abrir/reproduzir arquivo dentro do app | Isso é trabalho da galeria/player do celular. O app organiza; "Compartilhar" manda pro app certo |
| Comparar conteúdo pra achar duplicado (hash) | Ler byte a byte 500 arquivos derrete a bateria. Nome + tamanho pega 99% dos casos e a tela é honesta sobre a diferença |
| Nuvem, conta, sincronização | O pedido era uso pessoal. Sem conta é menos código, menos risco e nenhum dado saindo do aparelho |
| Cartão SD | `Directory.ExternalStorage` cobre a memória interna. SD exige Storage Access Framework, que é outra árvore de permissões |
