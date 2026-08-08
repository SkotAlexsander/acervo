# O que pode melhorar

Ordenado por **retorno pelo esforço** — não por dificuldade nem por vontade.

Quatro passadas até aqui. O que foi construído em cada uma está marcado com
✅; o que **não** foi, e por quê, fica no fim — essa parte é a que importa.

---

## O que era a maior dúvida — e deixou de ser

Durante todo o projeto esta seção abria com: *"o app nunca rodou num celular"*.
**Agora rodou.** O APK foi compilado, assinado, instalado num Android 16 e
exercitado por uma bancada que confere cada resultado pelo `adb`, por fora do
app (`testes/aparelho.mjs`, 13/13).

O que a tabela de suposições dizia, e o que se verificou:

| Suposição | Veredito |
|---|---|
| `Filesystem.readdir` devolve `size` e `mtime` de todo item | **Certa.** A lista sai com tamanho e data corretos; o mapa de espaço e as somas de pasta funcionam |
| `Filesystem.rename` funciona entre pastas | **Certa.** Renomear e mover funcionam, inclusive movendo pasta com conteúdo pra lixeira |
| `MANAGE_EXTERNAL_STORAGE` basta pra ler `/storage/emulated/0` | **Certa no emulador.** Falta confirmar em aparelho de fabricante que aperta mais (Xiaomi, Samsung) |
| A varredura termina em tempo aceitável | **Não medida em escala real** — o emulador tinha 21 arquivos, não 20 mil |
| Somar pasta não trava a lista | **Não medida em escala real**, mesma razão |

### O que o aparelho revelou que nenhum teste de navegador pegaria

1. **O bug que travava o app na tela de abertura.** `registerPlugin` do Capacitor
   devolve um **Proxy** que transforma acesso a propriedade em chamada nativa.
   Devolver esse proxy de uma função `async` faz o JavaScript sondar `.then` nele —
   e o proxy interpreta como "chame `then()` no Android", que não existe:

   ```
   "AcessoArquivos.then()" is not implemented on android
   ```

   No navegador o plugin nem é criado, então o erro era **invisível** até o APK.

2. **Dois modais empilhados.** "Criar pasta aqui" abria o diálogo sem fechar a
   folha, e o botão de baixo continuava alcançável.

3. **A permissão precisava de código nativo.** Não existe API JS pra pedir
   "acesso a todos os arquivos" — só dá pra levar o usuário à tela do sistema.
   Foram ~40 linhas de Java e uma tela dedicada.

### O que ainda não foi provado

- **Aparelho de verdade, não emulador.** Fabricantes mexem no armazenamento;
  Xiaomi e Samsung são os casos conhecidos.
- **Escala.** 21 arquivos não estressam varredura, índice nem soma de pastas.
- **PDF aberto por olho humano.** A estrutura é conferida (inclusive cada
  deslocamento do xref), o Android confirma `%PDF-1.7`, mas ninguém olhou uma
  página ainda.

---

## ✅ Quarta rodada — converter, proteger, aliviar, voltar

O pedido foi: *"a parte de pegar algo e transformar em pdf ou em qualquer outro
arquivo tem que ter e funcionar; algo pra descriptografar e criptografar; melhorar
a parte de clicar pra voltar; notificações se possível; uma opção de compactar um
arquivo pra deixar mais leve sem danificar ele"*.

| O quê | Como ficou |
|---|---|
| **Transformar em…** | Uma folha só, no lugar de "Gerar PDF" + "Compactar em .zip" separados. Ela **pergunta ao aparelho** o que ele sabe gravar e lista só os destinos possíveis, cada um com o preço na etiqueta: *sem perder nada* / *reencoda a imagem* / *muda a formatação* |
| Destinos que funcionam | imagem → **JPG, PNG, WebP, PDF** · texto → **PDF** · **CSV ⇄ JSON** · Markdown/HTML → texto puro · qualquer coisa → **ZIP** |
| **Proteger com senha** | AES-GCM 256 com chave derivada por PBKDF2 (210 mil rodadas). Em blocos de 1 MiB, com progresso. O nome do arquivo vai **dentro**, criptografado. Abrir é tocar no `.acv` |
| **Deixar mais leve** | Foto: reencoda com três níveis de qualidade e mostra a **balança antes → depois com o número REAL**, mais a prévia da imagem. Resto: `.zip` sem perder um bit. Quando não vale a pena, a tela diz |
| **Voltar** | Uma regra em camadas para o botão físico do Android, o Esc e o **gesto de deslizar da borda esquerda**: fecha a folha → sobe uma pasta → volta pro início → confirma antes de sair |
| **Notificações** | Só quando o app **não está na frente** e o trabalho passou de 3 segundos. Mais o aviso de armazenamento quase cheio, no máximo 1x/dia. Vem **desligado**, e ligar pede a permissão do sistema de verdade |
| **Efeitos novos** | Quarta mancha (quente, contrapondo a paleta fria), faixa de luz que varre em 28s, vinheta parada, transição de entrada por tela, afundamento ao tocar na linha, anel de progresso nas operações longas |
| **Responsividade** | A bancada passou a medir **celular deitado** (740×360, 915×412), **tablet deitado** e **280px** (Galaxy Fold fechado) — e a abrir as folhas, não só visitar rotas |

### O que as bancadas acharam nesta rodada

1. **O gesto de voltar estava morto e nada acusava.** O hook recebia um `ref`; o
   efeito rodava uma vez com `ref.current` ainda `null` (a área de conteúdo só
   existe depois da tela de "abrindo o armazenamento…") e **nunca mais rodava**,
   porque a identidade de um ref não muda. Passou a receber o elemento em estado.
2. **O "X" de fechar das folhas tinha 34×34** — abaixo do alvo de dedo, desde o
   primeiro dia. Passou despercebido porque a bancada de dedo só visitava rotas e
   **nunca abria uma folha**.
3. **Um `.zip` oferecia virar `.zip`.** O catálogo de destinos não excluía a
   própria extensão de origem.

### As verificações novas

| Bancada | O que provou |
|---|---|
| `unidade.mjs` (68 casos) | CSV com `;`, aspas e vírgula dentro do campo; JSON embrulhado em `{dados:[…]}`; ida e volta da criptografia; **senha errada, byte trocado, cabeçalho adulterado e arquivo truncado são todos detectados** |
| **Validação cruzada da cripto** | O `.acv` é decifrado pelo **`node:crypto` clássico** (`pbkdf2Sync` + `createDecipheriv`), que é outra implementação. Prova que o formato é AES-GCM padrão, não um dialeto que só o Acervo lê |
| `zip-pdf.mjs` (36 casos) | Os **bytes mágicos** do arquivo convertido: se diz WebP, começa com `RIFF....WEBP`. Chrome que não sabe escrever um formato devolve **PNG em silêncio** com o nome errado — só o cabeçalho denuncia |
| `funcoes.mjs` (110 casos) | O ciclo inteiro pela interface: proteger → tentar com senha errada (erro em português) → abrir com a certa → **o conteúdo é exatamente o original** |

---

## ✅ Segunda rodada — gestos, índice e desfazer

| # | O quê | Como ficou |
|---|---|---|
| 1 | **Toque longo pra selecionar** | Segurar 420ms entra no modo de seleção com o item já marcado. Rolar cancela, o clique seguinte é engolido, e vibra 12ms quando pega |
| 2 | **Ordenação visível** | Virou uma ficha na barra da trilha, que **mostra** a ordem em vigor ("Nome ↑"). Antes era invisível — só se descobria abrindo o menu |
| 3 | **Puxar pra atualizar** | Com deslocamento amortecido e anel que gira acompanhando o dedo. Só arma quando a lista já está no topo |
| 4 | **Tamanho da pasta na lista** | Calculado só pra pasta que está na tela, no máximo 3 por vez, com cache. Desligável nos Ajustes |
| 7 | **Varredura persistida** | O índice fica gravado: na abertura o app mostra o resultado antigo NA HORA e revalida por trás. Vence em 24h e é apagado a cada alteração |
| 8 | **Desfazer no mover** | O aviso de "movido" traz "Desfazer", que devolve cada item pra pasta de onde saiu — uma por uma, porque podem ser diferentes. Copiar também ganhou (apaga a cópia) |
| 9 | **Renomear em lote** | Nome-base + contador, com **prévia obrigatória**. Extensão nunca entra no padrão. Nome repetido é barrado antes de tocar em arquivo |
| 10 | **Recortes na Categoria** | Fichas de > 5/50/500 MB e esta semana/mês/ano. O estado vazio distingue "não existe" de "o filtro escondeu" |
| 11 | **"Onde foi meu espaço"** | Pastas de primeiro nível em ordem, barra dividida por tipo. Não desce a árvore de novo: soma em cima da varredura que já existe |
| 12 | **Leitor de texto** | Abre .txt/.md/.json/.log e afins dentro do app, só leitura, com teto de 512 KB dito na cara |

### Terceira rodada — compactar e converter

| O quê | Como ficou |
|---|---|
| **Compactar em .zip** | Escritor de ZIP próprio, sem biblioteca. Comprime pelo `CompressionStream` do navegador; onde ele não existe, guarda sem comprimir **e avisa**. Limites de 150 MB / 2.000 arquivos, ditos antes de tentar |
| **Abrir e extrair .zip** | Tocar num `.zip` mostra o que tem dentro (nomes, tamanhos, quanto encolheu) antes de extrair. Sai numa subpasta com o nome do arquivo; **Zip Slip** é recusado e mostrado; o CRC de cada entrada é conferido |
| **PDF de imagens** | Uma página por foto, folha A4 em pé ou deitada conforme a imagem |
| **PDF de texto** | Paginado em Courier, com acentuação em WinAnsi |
| **Baixar pro computador** | No PC, "compartilhar" virou download — é o que fecha o ciclo: o `.zip` e o PDF gerados na demonstração abrem no seu descompactador e no seu leitor de verdade |
| **Tocar = abrir** | A regra ficou coerente: `.zip` abre o zip, `.txt` abre o texto, o resto abre a ficha |

### Dívida técnica quitada

| O quê | Como |
|---|---|
| Sem testes unitários | **35 testes** de `util.js` e `scan.js`, em milissegundos, sem browser. Acharam um bug de verdade (abaixo) |
| `useMemo` decorativo em `useAcoesArquivo` | Removido. O objeto mudar de identidade está certo; o que precisa ser estável são as **funções**, e as telas passaram a depender delas, não do objeto |
| `useMiniatura` recalculando a cada render | Cache por caminho, invalidado quando os dados mudam |
| Nenhum tratamento de "armazenamento cheio" | `ENOSPC`, `EROFS`, `EISDIR` e nome longo demais agora viram frase em português |
| Três cópias da barra de seleção | Viraram um `<BarraSelecao>` — e foi ele que deu renomear-em-lote às três telas de uma vez |
| Cinco cópias do botão "voltar" | Já tinham virado `<BotaoVoltar>` na rodada anterior |

> **O bug que o teste de unidade achou:** `buscar()` nunca classificava um resultado
> como "exato", porque comparava o nome **com a extensão**. Digitar "contrato" não
> fazia `contrato.pdf` subir pro topo — ele ficava misturado com
> `meu-contrato-antigo.pdf`. Nenhuma captura de tela mostraria isso.

---

## O que ficou de fora, e por quê

### 5. Miniaturas de verdade no celular
`previewUrl()` já devolve a URI real do arquivo, então tecnicamente "funciona" — mas
carregar 200 fotos em tamanho cheio numa grade vai engasgar. Precisa de
redimensionamento e cache em disco, e **não dá pra ajustar direito sem medir num
aparelho de verdade**. Fazer às cegas seria chutar o tamanho do cache e a resolução.
*Espera o APK.*

### 6. Duração de vídeo e áudio
Um `.mp4` de 380 MB pode ser 2 minutos em 4K ou 3 horas em 480p, e a duração muda a
decisão de apagar. Exige ler metadado do container — o que só é testável com arquivo
real. *Espera o APK.*

### Ainda na fila, por ordem de valor

| O quê | Por que vale | Custo |
|---|---|---|
| **Selecionar por faixa** ("do primeiro ao que eu tocar") | Marcar 60 fotos uma a uma é o que faz desistir da limpeza | Médio |
| **Ordenar as pastas por tamanho** | O tamanho já aparece na linha; ordenar por ele ainda não dá, porque a soma chega depois da ordenação | Médio — exige a soma pronta antes de ordenar |
| **Cartão SD** | `Directory.ExternalStorage` só cobre a memória interna | Alto — Storage Access Framework é outra árvore de permissões |
| **Filtro de duplicado por conteúdo (hash)** | Tiraria o "provável" do nome da tela | Alto — ler byte a byte 500 arquivos derrete bateria |

---

## Dívida técnica que sobrou

| O quê | Por que incomoda | Gravidade |
|---|---|---|
| `useAcoesArquivo` continua grande | Menu + renomear + lote + mover + copiar + excluir + compartilhar + detalhes + leitor. Funciona e é usado por 4 telas, mas já passou do ponto de caber na cabeça de uma vez | **Média** — quebrar em dois na próxima ação que entrar |
| A varredura guarda tudo em memória | ~520 arquivos aqui não é nada; 20 mil num celular real é um array grande vivo o tempo todo | Média — só medível no aparelho |
| Cache de miniatura sem teto | Cresce enquanto o app estiver aberto. No mock são strings pequenas; no aparelho serão URIs (também pequenas), mas a política de despejo não existe | Baixa |
| `Espaco` só agrupa o primeiro nível | "WhatsApp: 1,7 GB" não diz se o peso está em Images ou Video. Descer um nível seria bem mais útil | Baixa — melhoria, não defeito |
| Sem teste de tema no `dedo.mjs` | Contraste de texto nunca foi medido por bancada, só olhado | Média |
| `useAcoesArquivo` cresceu de novo | Ganhou três folhas (transformar, proteger, mais leve). Já estava grande demais antes disso | **Alta** — quebrar em `useAcoesBasicas` + `useAcoesDeArquivo` na próxima que entrar |
| A cripto passa o arquivo inteiro pela memória | Igual ao zip: 150 MB de entrada viram 150 MB de buffer + a saída. Os blocos de 1 MiB resolvem o pico do `encrypt`, não o da leitura | Média — só streaming resolve |
| Nenhum `.acv` foi aberto depois de um tempo longo | Ida e volta na mesma sessão está provada. Proteger hoje e abrir daqui a seis meses, com outra versão do app, só o tempo diz | Baixa — o campo `versão` no cabeçalho existe justamente pra isso |
| PDF nunca foi aberto por um leitor de terceiro | A bancada confere a estrutura e cada deslocamento do xref — que é onde um escritor caseiro erra — mas o Chromium headless BAIXA o PDF em vez de renderizar. Os PDFs de exemplo ficam gravados pra conferência humana | **Média** — vale abrir um com o olho |
| Zip e PDF montam tudo na memória | 150 MB de entrada viram 150 MB de `ArrayBuffer` + a saída. Os limites protegem, mas streaming seria o certo | Média — só medível no aparelho |

---

## O que eu faria primeiro, se fosse escolher três

1. **Instalar no seu celular e usar de verdade, com os seus arquivos.** Continua
   sendo o número 1, e agora com mais motivo: a criptografia de um arquivo de
   80 MB e a reencodagem de uma foto de 12 megapixels são as duas operações mais
   pesadas do app, e nenhuma delas foi medida num processador de celular.
2. **Proteger um arquivo, fechar o app, e abrir de novo no dia seguinte.** A ida
   e volta está provada dentro da mesma sessão. O que ninguém testou é o caso que
   importa de verdade: voltar num arquivo protegido semanas depois.
3. **Abrir um PDF gerado, com o olho.** A estrutura é conferida e o Android
   confirma que é PDF, mas ninguém olhou uma página ainda. Gere um no celular e
   abra no leitor que você já usa.

---

## Ideias que apareceram construindo esta rodada

Nenhuma delas foi pedida. Ficam anotadas porque o custo de anotar é zero e o de
lembrar depois é alto.

| Ideia | Por que pode valer |
|---|---|
| **Proteger uma pasta inteira** | Hoje é um arquivo por vez. Juntar num `.zip` e proteger o zip já daria isso com o código que existe |
| **Converter vários de uma vez** | "Transformar em…" é de um arquivo só; a barra de seleção só oferece zip e PDF. Converter 40 fotos pra WebP de uma vez é o caso real de quem quer liberar espaço |
| **"Deixar mais leve" a pasta toda** | A tela de Espaço já sabe qual pasta pesa mais. Oferecer "aliviar esta pasta" ali seria fechar o ciclo entre diagnóstico e ação |
| **Lembrar o formato preferido** | Quem converte pra WebP uma vez costuma querer sempre. Um padrão nos Ajustes pouparia dois toques por conversão |
