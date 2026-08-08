/**
 * Bancada DE APARELHO — dirige o app instalado num Android de verdade.
 *
 * Diferente das outras: aqui não há mock nenhum. O app roda dentro do APK,
 * lendo e escrevendo em `/sdcard`, e **cada resultado é conferido pelo `adb`**,
 * olhando o sistema de arquivos por fora. Se o app disser "criei o .zip" e o
 * `ls` não achar, o caso reprova.
 *
 * É o teste que responde a pergunta que ficou aberta o projeto inteiro:
 * "isso funciona num Android de verdade?".
 *
 * Precisa de: emulador (ou celular) conectado por adb, com o APK instalado e
 * a permissão de todos os arquivos concedida.
 *
 *   adb shell appops set --uid br.pessoal.acervo MANAGE_EXTERNAL_STORAGE allow
 *   node testes/aparelho.mjs
 */

import { execFileSync } from 'node:child_process'

const ADB = process.env.ADB || 'A:\\Dev\\Android\\Sdk\\platform-tools\\adb.exe'
const PACOTE = 'br.pessoal.acervo'

const casos = []
const ok = (nome, passou, detalhe) => {
  casos.push({ nome, passou, detalhe })
  console.log(`${passou ? '  OK  ' : '  X   '} ${nome}${detalhe ? ' — ' + detalhe : ''}`)
}

const adb = (...args) =>
  execFileSync(ADB, args, { encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 24 })

/**
 * Escapa o caminho pro shell do aparelho.
 *
 * As aspas NÃO sobrevivem à travessia `adb shell` — um caminho com espaço vira
 * dois argumentos e o comando falha. Na primeira rodada isso fez o teste jurar
 * que o .zip não existia enquanto o `unzip` do próprio Android o abria.
 */
const esc = (caminho) => caminho.replace(/([ '"()&$`\\])/g, '\\$1')

/** Olha o sistema de arquivos POR FORA do app. É isto que faz o teste valer. */
const existeNoDisco = (caminho) => {
  try {
    // `[ -e ]` responde SIM/NAO. Antes eu media pelo texto do `ls`, e a
    // mensagem de erro dele contava como "existe".
    return adb('shell', `[ -e ${esc(caminho)} ] && echo SIM || echo NAO`).includes('SIM')
  } catch {
    return false
  }
}

const tamanhoNoDisco = (caminho) => {
  try {
    const r = adb('shell', `stat -c %s ${esc(caminho)} 2>/dev/null || echo 0`)
    return parseInt(r.trim(), 10) || 0
  } catch {
    return 0
  }
}

// ─── Ponte CDP com o WebView ────────────────────────────────────────────────

function acharSocket() {
  const linhas = adb('shell', 'cat /proc/net/unix')
  const m = [...linhas.matchAll(/@(webview_devtools_remote_\d+)/g)]
  if (!m.length) throw new Error('WebView não está com depuração aberta — o app está rodando?')
  return m[m.length - 1][1]
}

adb('forward', '--remove-all')
adb('forward', 'tcp:9222', `localabstract:${acharSocket()}`)
await new Promise((r) => setTimeout(r, 800))

const alvos = await (await fetch('http://localhost:9222/json/list')).json()
const alvo = alvos.find((a) => a.type === 'page') || alvos[0]
const ws = new WebSocket(alvo.webSocketDebuggerUrl)
let id = 0
const pend = new Map()
const errosConsole = []

ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m)
    pend.delete(m.id)
  } else if (m.method === 'Runtime.exceptionThrown') {
    errosConsole.push(m.params.exceptionDetails?.exception?.description?.slice(0, 200) || 'exceção')
  }
})

const enviar = (method, params) =>
  new Promise((res) => {
    const meu = ++id
    pend.set(meu, res)
    ws.send(JSON.stringify({ id: meu, method, params }))
  })

await new Promise((r) => ws.addEventListener('open', r))
await enviar('Runtime.enable')

const avaliar = async (expr, ms = 30000) => {
  const r = await enviar('Runtime.evaluate', {
    expression: expr,
    awaitPromise: true,
    returnByValue: true,
    timeout: ms,
  })
  if (r.result?.exceptionDetails) {
    throw new Error(r.result.exceptionDetails.exception?.description?.slice(0, 200) || 'erro')
  }
  return r.result?.result?.value
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Espera um arquivo APARECER e PARAR DE CRESCER.
 *
 * Substituiu um `sleep` fixo de 15 s que reprovava o app injustamente: um .zip
 * de 16 MB no emulador demora mais que isso, e o teste concluía "não existe"
 * sobre um arquivo que estava sendo escrito naquele instante.
 */
const esperarArquivo = async (caminho, msMax = 120000) => {
  const ate = Date.now() + msMax
  let anterior = -1
  let estavel = 0
  while (Date.now() < ate) {
    const t = tamanhoNoDisco(caminho)
    if (t > 0 && t === anterior) {
      if (++estavel >= 2) return t
    } else {
      estavel = 0
    }
    anterior = t
    await esperar(1500)
  }
  return tamanhoNoDisco(caminho)
}

/**
 * Clica no elemento cujo texto contenha o trecho.
 *
 * `dentroDoDialogo` restringe a busca ao modal mais recente — sem isso o
 * clique pode pegar um botão homônimo que ficou embaixo, e o teste passa a
 * medir outra coisa.
 */
const clicar = async (texto, dentroDoDialogo = false) =>
  avaliar(`(() => {
    const raiz = ${dentroDoDialogo}
      ? [...document.querySelectorAll('[role="dialog"],[role="alertdialog"]')].pop() || document
      : document
    const alvos = [...raiz.querySelectorAll('button')]
    const el = alvos.find(e => (e.getAttribute('aria-label') || e.textContent || '').includes(${JSON.stringify(texto)}))
    if (!el) return 'NAO ACHOU: ' + ${JSON.stringify(texto)}
    el.click()
    return 'clicou'
  })()`)

/** Preenche um input controlado por React (precisa do setter nativo). */
const digitar = async (rotulo, valor) =>
  avaliar(`(() => {
    const i = document.querySelector('input[aria-label=' + JSON.stringify(${JSON.stringify(rotulo)}) + ']')
    if (!i) return 'CAMPO AUSENTE: ' + ${JSON.stringify(rotulo)}
    const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    set.call(i, ${JSON.stringify(valor)})
    i.dispatchEvent(new Event('input', { bubbles: true }))
    return i.value
  })()`)

const irPara = async (hash) => {
  // Trocar o hash não fecha folha aberta, e o véu dela engole os cliques
  // seguintes. Fecha antes de navegar.
  await avaliar(`(() => {
    let n = 0
    while (document.querySelector('[role="dialog"],[role="alertdialog"]') && n < 4) {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      n++
    }
    return n
  })()`)
  await esperar(500)
  await avaliar(`location.hash = ${JSON.stringify(hash)}`)
  await esperar(1400)
}

const textoDaTela = () =>
  avaliar(`(document.body.innerText||'').replace(/\\s+/g,' ').slice(0,400)`)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— LEITURA DO ARMAZENAMENTO REAL —')

await irPara('#/pastas/DCIM/Camera')
const listaCamera = await textoDaTela()
ok(
  'O app lista os arquivos que existem em /sdcard/DCIM/Camera',
  listaCamera.includes('IMG_2026080'),
  listaCamera.slice(0, 70)
)
ok(
  'Tamanho e data vêm preenchidos (não "0 B" nem "—")',
  /\d+([,.]\d+)?\s?(KB|MB)/.test(listaCamera) && !/0 B ·/.test(listaCamera),
  (listaCamera.match(/\d+([,.]\d+)?\s?(KB|MB)/) || [''])[0]
)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— CRIAR PASTA (e conferir pelo adb) —')

const PASTA = 'Teste Aparelho'
adb('shell', `rm -rf ${esc('/sdcard/Documents/' + PASTA)}`)
await irPara('#/pastas/Documents')
await clicar('Mais opções desta pasta')
await esperar(700)
await clicar('Criar pasta aqui')
await esperar(700)
await digitar('Nome da nova pasta', PASTA)
await esperar(400)
await clicar('Criar', true)
await esperar(1500)

ok(
  'A pasta criada pelo app existe no /sdcard de verdade',
  existeNoDisco(`/sdcard/Documents/${PASTA}`),
  `/sdcard/Documents/${PASTA}`
)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— RENOMEAR (e conferir pelo adb) —')

await irPara('#/pastas/Documents')
await clicar(`Opções de ${PASTA}`)
await esperar(700)
await clicar('Renomear')
await esperar(700)
await digitar('Renomear', 'Renomeada No Aparelho')
await esperar(400)
await clicar('Salvar', true)
await esperar(1500)

ok(
  'Renomear muda o nome no sistema de arquivos',
  existeNoDisco('/sdcard/Documents/Renomeada No Aparelho') &&
    !existeNoDisco(`/sdcard/Documents/${PASTA}`)
)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— COMPACTAR EM .ZIP (e conferir pelo adb) —')

adb('shell', `rm -f ${esc('/sdcard/Download/Pacote Aparelho.zip')}`)
await irPara('#/pastas/Download')
await clicar('Mais opções desta pasta')
await esperar(700)
await clicar('Selecionar itens')
await esperar(900)
await clicar('Mais ações para os selecionados')
await esperar(900)
await clicar('Compactar em .zip')
await esperar(1200)
await digitar('Nome do arquivo a criar', 'Pacote Aparelho')
await esperar(500)
await clicar('Compactar', true)

const zipNoDisco = '/sdcard/Download/Pacote Aparelho.zip'
const tamZip = await esperarArquivo(zipNoDisco)
ok('O .zip existe no /sdcard', tamZip > 0, `${(tamZip / 1024).toFixed(0)} KB`)

// O teste decisivo: o Android consegue abrir o .zip que o app escreveu?
let listouZip = ''
try {
  listouZip = adb('shell', `cd /data/local/tmp && rm -rf zt && mkdir zt && cd zt && unzip -o ${esc(zipNoDisco)} >/dev/null 2>&1; ls`)
} catch {
  listouZip = ''
}
ok(
  'O `unzip` do próprio Android abre o .zip que o app criou',
  listouZip.trim().length > 0,
  listouZip.replace(/\s+/g, ' ').slice(0, 80)
)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— GERAR PDF (e conferir pelo adb) —')

adb('shell', `rm -f ${esc('/sdcard/DCIM/Camera/Fotos Aparelho.pdf')}`)
await irPara('#/pastas/DCIM/Camera')
await clicar('Mais opções desta pasta')
await esperar(700)
await clicar('Selecionar itens')
await esperar(900)
await clicar('Mais ações para os selecionados')
await esperar(900)
await clicar('Gerar PDF')
await esperar(1200)
await digitar('Nome do arquivo a criar', 'Fotos Aparelho')
await esperar(500)
await clicar('Gerar', true)

const pdfNoDisco = '/sdcard/DCIM/Camera/Fotos Aparelho.pdf'
const tamPdf = await esperarArquivo(pdfNoDisco)
ok('O PDF existe no /sdcard', tamPdf > 1000, `${(tamPdf / 1024).toFixed(0)} KB`)

const cabecalho = adb('shell', `head -c 8 ${esc(pdfNoDisco)} 2>/dev/null || echo vazio`)
ok('O arquivo gerado é mesmo um PDF (%PDF no começo)', cabecalho.includes('%PDF'), cabecalho.trim())

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— EXCLUIR VAI PRA LIXEIRA (e não some do disco) —')

/*
  Este caso cria o próprio alvo, em vez de reaproveitar a pasta renomeada lá
  de cima. Depender de estado criado três etapas antes fazia o caso reprovar
  por causa de qualquer atraso nas etapas do meio — e o relatório apontava pro
  app quando o defeito era do roteiro.
*/
const ALVO = 'Para Excluir'
adb('shell', `rm -rf /sdcard/.Acervo ${esc('/sdcard/Documents/' + ALVO)}`)
adb('shell', `mkdir -p ${esc('/sdcard/Documents/' + ALVO)}`)
adb(
  'shell',
  `dd if=/dev/urandom of=${esc('/sdcard/Documents/' + ALVO + '/dentro.bin')} bs=1024 count=10 2>/dev/null`
)

await irPara('#/pastas/Documents')
await esperar(1500)

const achouAlvo = await clicar(`Opções de ${ALVO}`)
ok('A pasta a excluir aparece na lista do app', achouAlvo === 'clicou', String(achouAlvo))
await esperar(900)

const achouExcluir = await clicar('Excluir', true)
ok('O menu do item oferece "Excluir"', achouExcluir === 'clicou', String(achouExcluir))
await esperar(900)

await clicar('Mandar pra lixeira', true)
await esperar(4000)

ok('O item saiu da pasta original', !existeNoDisco(`/sdcard/Documents/${ALVO}`))

const naLixeira = adb('shell', 'ls /sdcard/.Acervo/Lixeira 2>/dev/null || echo VAZIO')
ok(
  'E foi parar na lixeira do app, dentro do /sdcard',
  naLixeira.includes(ALVO),
  naLixeira.replace(/\s+/g, ' ').slice(0, 60)
)
ok(
  'O conteúdo da pasta foi junto (não ficou pra trás nem sumiu)',
  existeNoDisco(`/sdcard/.Acervo/Lixeira/${ALVO}/dentro.bin`)
)


// ─── Faxina e relatório ─────────────────────────────────────────────────────

adb('shell', `rm -rf ${esc('/sdcard/Documents/' + PASTA)} ${esc('/sdcard/Documents/Renomeada No Aparelho')} /data/local/tmp/zt`)

console.log('\n=== ERROS DE JAVASCRIPT ===')
if (!errosConsole.length) console.log('nenhum')
else [...new Set(errosConsole)].forEach((e) => console.log(' ' + e))

const falhas = casos.filter((c) => !c.passou)
console.log(
  `\n=== ${casos.length - falhas.length}/${casos.length} casos no APARELHO passaram | ${errosConsole.length} erros ===`
)
if (falhas.length) {
  console.log('FALHAS:')
  falhas.forEach((f) => console.log('  - ' + f.nome + (f.detalhe ? ' :: ' + f.detalhe : '')))
}

ws.close()
process.exit(falhas.length || errosConsole.length ? 1 : 0)
