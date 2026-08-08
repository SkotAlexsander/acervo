/**
 * Bancada de ZIP e PDF — a que checa VALIDADE EXTERNA.
 *
 * Testar ida-e-volta contra o próprio código só prova que ele é consistente
 * consigo mesmo: um .zip escrito errado e lido errado do mesmo jeito passaria
 * redondo. Por isso esta bancada faz o cruzamento com ferramentas de fora:
 *
 *   1. um .zip criado pelo app é extraído pelo **PowerShell do Windows**;
 *   2. um .zip criado pelo **PowerShell** é lido e extraído pelo app;
 *   3. o PDF gerado é conferido na estrutura — e cada deslocamento da tabela
 *      xref é validado contra o arquivo, que é onde um escritor caseiro erra.
 *      (Abrir num leitor de terceiro ficou de fora: o Chromium headless BAIXA
 *      o PDF em vez de renderizar, então o resultado não provaria nada.)
 *
 * Precisa do `npm run dev` no ar — o zip/pdf usam APIs do navegador
 * (CompressionStream, canvas) que não existem no Node.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { abrirChromium, BASE, exigirServidor } from './navegador.mjs'

const casos = []
const erros = new Set()

function ok(nome, passou, detalhe) {
  casos.push({ nome, passou, detalhe })
  console.log(`${passou ? '  OK  ' : '  X   '} ${nome}${detalhe ? ' — ' + detalhe : ''}`)
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'acervo-zip-'))
const ps = (comando) =>
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', comando], {
    encoding: 'utf8',
    windowsHide: true,
  })

await exigirServidor()
const { navegador } = await abrirChromium()
const ctx = await navegador.newContext({ viewport: { width: 412, height: 900 }, locale: 'pt-BR' })
const page = await ctx.newPage()
page.on('pageerror', (e) => erros.add('PAGEERROR ' + e.message))
page.on('console', (m) => m.type() === 'error' && erros.add(m.text().slice(0, 200)))

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)

// Os módulos são carregados no contexto da página, com as APIs do navegador.
await page.addScriptTag({
  type: 'module',
  content: `
    import * as zip from '/src/fs/zip.js'
    import * as pdf from '/src/fs/pdf.js'
    import * as imagem from '/src/fs/imagem.js'
    import * as otimizar from '/src/fs/otimizar.js'
    window.__zip = zip
    window.__pdf = pdf
    window.__imagem = imagem
    window.__otimizar = otimizar
    window.__pronto = true
  `,
})
await page.waitForFunction(() => window.__pronto === true, null, { timeout: 15000 })

const CONTEUDOS = {
  'ola.txt': 'Olá, mundo! Acentuação: ção, ãõ, ê, ü.\n'.repeat(40),
  'pasta/dentro.txt': 'Arquivo dentro de uma pasta do zip.\n'.repeat(30),
  'vazio.txt': '',
  'binário com espaço e acento.dat': null, // preenchido com bytes pseudo-aleatórios
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— ZIP: o app escreve, o WINDOWS lê —')

const zipDoApp = await page.evaluate(async (nomes) => {
  const cod = new TextEncoder()
  const entradas = nomes.map(([nome, texto]) => {
    if (texto !== null) return { nome, bytes: cod.encode(texto), mtime: Date.now() }
    // Bytes que NÃO comprimem bem: prova o caminho "guardado" do compactador.
    const b = new Uint8Array(5000)
    let x = 12345
    for (let i = 0; i < b.length; i++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff
      b[i] = x & 0xff
    }
    return { nome, bytes: b, mtime: Date.now() }
  })
  const r = await window.__zip.criarZip(entradas)
  return {
    b64: btoa(String.fromCharCode(...r.bytes.subarray(0, 0))) || null,
    bytes: Array.from(r.bytes),
    comprimido: r.comprimido,
    tamanho: r.bytes.length,
    original: r.original,
  }
}, Object.entries(CONTEUDOS))

ok('O app comprimiu de verdade (não só guardou)', zipDoApp.comprimido === true)
ok(
  'O .zip ficou menor que a entrada',
  zipDoApp.tamanho < zipDoApp.original,
  `${zipDoApp.original} B -> ${zipDoApp.tamanho} B`
)

const arquivoZip = path.join(TMP, 'do-app.zip')
fs.writeFileSync(arquivoZip, Buffer.from(zipDoApp.bytes))

// O Windows abrindo o nosso .zip — este é o teste que vale.
const destino = path.join(TMP, 'extraido')
let extraiu = true
let saidaPs = ''
try {
  saidaPs = ps(
    `Expand-Archive -LiteralPath '${arquivoZip}' -DestinationPath '${destino}' -Force; ` +
      `(Get-ChildItem -Recurse -File '${destino}').Count`
  )
} catch (e) {
  extraiu = false
  saidaPs = String(e.stderr || e.message).slice(0, 200)
}
ok('O Windows (Expand-Archive) abre o .zip do app', extraiu, extraiu ? '' : saidaPs)

if (extraiu) {
  const lido = fs.readFileSync(path.join(destino, 'ola.txt'), 'utf8')
  ok(
    'O conteúdo saiu byte a byte igual, com acentuação',
    lido === CONTEUDOS['ola.txt'],
    `${lido.length} de ${CONTEUDOS['ola.txt'].length} chars`
  )
  ok(
    'A pasta interna do .zip virou pasta de verdade',
    fs.existsSync(path.join(destino, 'pasta', 'dentro.txt'))
  )
  ok(
    'Arquivo de 0 byte sobrevive ao ciclo',
    fs.existsSync(path.join(destino, 'vazio.txt')) &&
      fs.statSync(path.join(destino, 'vazio.txt')).size === 0
  )
  const acentuado = path.join(destino, 'binário com espaço e acento.dat')
  ok('Nome com acento e espaço chega inteiro', fs.existsSync(acentuado), 'binário com espaço…')
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— ZIP: o WINDOWS escreve, o app lê —')

const origem = path.join(TMP, 'origem')
fs.mkdirSync(path.join(origem, 'sub'), { recursive: true })
fs.writeFileSync(path.join(origem, 'a.txt'), 'conteúdo A com acento\n'.repeat(50))
fs.writeFileSync(path.join(origem, 'sub', 'b.txt'), 'conteúdo B\n'.repeat(50))
const zipDoWindows = path.join(TMP, 'do-windows.zip')
ps(`Compress-Archive -Path '${origem}\\*' -DestinationPath '${zipDoWindows}' -Force`)

const bytesWin = Array.from(fs.readFileSync(zipDoWindows))
const leitura = await page.evaluate(async (bs) => {
  const bytes = new Uint8Array(bs)
  const idx = window.__zip.lerIndiceZip(bytes)
  const arquivos = idx.filter((e) => !e.ehPasta)
  const conteudos = {}
  for (const e of arquivos) {
    const d = await window.__zip.extrairEntrada(bytes, e)
    conteudos[e.nome] = new TextDecoder().decode(d)
  }
  return { nomes: arquivos.map((a) => a.nome), conteudos }
}, bytesWin)

ok(
  'O app lê o índice de um .zip feito pelo Windows',
  leitura.nomes.length === 2,
  leitura.nomes.join(', ')
)
ok(
  'O app extrai o conteúdo certo do .zip do Windows',
  leitura.conteudos['a.txt'] === fs.readFileSync(path.join(origem, 'a.txt'), 'utf8'),
  'a.txt confere byte a byte'
)
ok(
  'Caminho com subpasta é preservado na leitura',
  leitura.nomes.some((n) => n.replace(/\\/g, '/') === 'sub/b.txt'),
  leitura.nomes.join(', ')
)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— ZIP: defesas —')

const defesas = await page.evaluate(() => {
  const perigosos = ['../fora.txt', '..\\fora.txt', '/etc/passwd', 'C:\\Windows\\x', 'a/../../b']
  const inocentes = ['normal.txt', 'pasta/arquivo.txt', 'com..ponto.txt', 'a..b/c.txt']
  return {
    pega: perigosos.every((p) => window.__zip.caminhoPerigoso(p)),
    poupa: inocentes.every((p) => !window.__zip.caminhoPerigoso(p)),
  }
})
ok('Recusa caminho que escapa da pasta (Zip Slip)', defesas.pega)
ok('Não recusa nome inocente com pontos', defesas.poupa)

// Devolve ESTRUTURA, não string: a versão anterior comparava a mensagem com
// um regex que casava com a própria frase de fallback ("extraiu mesmo
// corrompido") — uma asserção que nunca reprovaria.
const corrompido = await page.evaluate(async (bs) => {
  const bytes = new Uint8Array(bs)
  const idx = window.__zip.lerIndiceZip(bytes)
  const alvo = idx.find((e) => !e.ehPasta && e.comprimido > 20)
  if (!alvo) return { lancou: false, msg: 'nao achei entrada comprimida pra estragar' }
  // O cabeçalho local tem tamanho variável — o início dos dados precisa ser
  // calculado, não chutado.
  const v = new DataView(bytes.buffer)
  const nomeLen = v.getUint16(alvo.deslocamento + 26, true)
  const extraLen = v.getUint16(alvo.deslocamento + 28, true)
  const inicioDados = alvo.deslocamento + 30 + nomeLen + extraLen
  const alvoByte = inicioDados + Math.floor(alvo.comprimido / 2)
  bytes[alvoByte] = bytes[alvoByte] ^ 0xff
  try {
    const d = await window.__zip.extrairEntrada(bytes, alvo)
    return { lancou: false, msg: `extraiu ${d.length} bytes sem reclamar`, metodo: alvo.metodo }
  } catch (e) {
    return { lancou: true, msg: e.message, metodo: alvo.metodo }
  }
}, bytesWin)
ok(
  'Dado corrompido é recusado, não entregue em silêncio',
  corrompido.lancou === true,
  corrompido.msg.slice(0, 70)
)

const naoEhZip = await page.evaluate(() => {
  try {
    window.__zip.lerIndiceZip(new TextEncoder().encode('isto nao e um zip, so texto'))
    return 'aceitou'
  } catch (e) {
    return e.message
  }
})
ok('Arquivo que não é .zip dá erro em português', /não parece um \.zip/i.test(naoEhZip), naoEhZip.slice(0, 50))

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— PDF: estrutura —')

const pdfImagens = await page.evaluate(async () => {
  // Duas imagens de verdade, uma em pé e uma deitada, feitas no canvas.
  const fazer = async (w, h, cor) => {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const x = c.getContext('2d')
    x.fillStyle = cor
    x.fillRect(0, 0, w, h)
    const b = await new Promise((r) => c.toBlob(r, 'image/png'))
    return new Uint8Array(await b.arrayBuffer())
  }
  const r = await window.__pdf.pdfDeImagens([
    { nome: 'retrato.png', bytes: await fazer(600, 900, '#c33') },
    { nome: 'paisagem.png', bytes: await fazer(900, 600, '#39c') },
  ])
  const txt = new TextDecoder('latin1').decode(r.bytes)
  return {
    paginas: r.paginas,
    falhas: r.falhas,
    tamanho: r.bytes.length,
    comecaCerto: txt.startsWith('%PDF-1.7'),
    terminaCerto: txt.trimEnd().endsWith('%%EOF'),
    temXref: txt.includes('\nxref\n') && txt.includes('startxref'),
    temCatalogo: txt.includes('/Type /Catalog'),
    qtdPaginas: (txt.match(/\/Type \/Page[^s]/g) || []).length,
    temImagem: txt.includes('/DCTDecode'),
    // MediaBox trocado entre retrato e paisagem?
    caixas: (txt.match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g) || []),
    bytes: Array.from(r.bytes),
  }
})

ok('PDF de imagens: começa com %PDF e termina com %%EOF', pdfImagens.comecaCerto && pdfImagens.terminaCerto)
ok('PDF tem tabela xref e catálogo', pdfImagens.temXref && pdfImagens.temCatalogo)
ok('Uma página por imagem', pdfImagens.paginas === 2 && pdfImagens.qtdPaginas === 2, `${pdfImagens.qtdPaginas} páginas`)
ok('Imagem embutida como JPEG (DCTDecode)', pdfImagens.temImagem)
ok(
  'Folha acompanha a orientação da foto',
  pdfImagens.caixas.length === 2 && pdfImagens.caixas[0] !== pdfImagens.caixas[1],
  pdfImagens.caixas.join(' | ')
)
ok('Nenhuma imagem falhou', pdfImagens.falhas.length === 0, pdfImagens.falhas.join('; '))

const pdfTexto = await page.evaluate(async () => {
  const linhas = []
  for (let i = 1; i <= 200; i++) linhas.push(`Linha ${i}: acentuação — “aspas” e travessão, ç ã õ ê`)
  const r = await window.__pdf.pdfDeTexto(linhas.join('\n'))
  const txt = new TextDecoder('latin1').decode(r.bytes)
  return {
    paginas: r.paginas,
    truncado: r.truncado,
    temFonte: txt.includes('/BaseFont /Courier') && txt.includes('/WinAnsiEncoding'),
    // "ç" em WinAnsi é 0xE7; se saiu como "?" (0x3F) a codificação quebrou.
    temAcento: txt.includes('\u00e7'),
    bytes: Array.from(r.bytes),
  }
})

ok('PDF de texto pagina sozinho', pdfTexto.paginas > 1 && !pdfTexto.truncado, `${pdfTexto.paginas} páginas`)
ok('Fonte Courier com WinAnsiEncoding declarada', pdfTexto.temFonte)
ok('Acentuação chega no PDF em WinAnsi, não como "?"', pdfTexto.temAcento)

const quebra = await page.evaluate(() => {
  const cols = window.__pdf.COLUNAS
  const linhas = window.__pdf.quebrarLinhas('a'.repeat(cols * 3) + '\nlinha curta\numa frase com espaços que precisa quebrar em algum ponto razoavel ' + 'x'.repeat(cols))
  return { cols, maior: Math.max(...linhas.map((l) => l.length)), qtd: linhas.length }
})
ok(
  'Nenhuma linha do PDF passa da largura da página',
  quebra.maior <= quebra.cols,
  `maior linha ${quebra.maior} de ${quebra.cols} colunas`
)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— PDF: integridade do xref —')

/*
  Honestidade sobre o que este bloco é: uma checagem ESTRUTURAL, não a
  validação por um leitor de terceiro. Tentei abrir os PDFs no Chromium, mas o
  navegador headless BAIXA o arquivo em vez de renderizar — o resultado não
  provaria nada, então o caso foi trocado em vez de maquiado.

  Mesmo assim vale muito, porque a tabela xref é exatamente onde um escritor de
  PDF caseiro erra: cada linha declara o byte em que um objeto começa, e um
  deslocamento errado por um único byte faz o documento abrir em branco em
  metade dos leitores e funcionar na outra metade. Aqui cada deslocamento é
  conferido contra o arquivo — tem que cair EXATAMENTE em "N 0 obj".
*/

function conferirXref(bytes, rotulo) {
  const txt = Buffer.from(bytes).toString('latin1')

  const iStart = txt.lastIndexOf('startxref')
  if (iStart === -1) return `${rotulo}: sem startxref`
  const inicioXref = parseInt(txt.slice(iStart + 9).trim(), 10)
  if (!Number.isFinite(inicioXref) || txt.slice(inicioXref, inicioXref + 4) !== 'xref') {
    return `${rotulo}: startxref aponta pro byte ${inicioXref}, e ali não está a tabela`
  }

  const trecho = txt.slice(inicioXref)
  const cabecalho = trecho.match(/^xref\n0 (\d+)\n/)
  if (!cabecalho) return `${rotulo}: cabeçalho da tabela ilegível`
  const total = Number(cabecalho[1])

  // Cada linha da tabela tem 20 bytes fixos, logo após "xref\n0 N\n".
  const inicioLinhas = inicioXref + cabecalho[0].length
  for (let i = 1; i < total; i++) {
    const linha = txt.substr(inicioLinhas + i * 20, 20)
    const desloc = parseInt(linha.slice(0, 10), 10)
    const esperado = `${i} 0 obj`
    const achado = txt.substr(desloc, esperado.length)
    if (achado !== esperado) {
      return `${rotulo}: objeto ${i} deveria começar no byte ${desloc}, mas ali está "${achado}"`
    }
  }
  return null
}

const problemaImagens = conferirXref(pdfImagens.bytes, 'PDF de imagens')
ok('PDF de imagens: todo deslocamento do xref cai no objeto certo', !problemaImagens, problemaImagens || '')

const problemaTexto = conferirXref(pdfTexto.bytes, 'PDF de texto')
ok('PDF de texto: todo deslocamento do xref cai no objeto certo', !problemaTexto, problemaTexto || '')

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— CONVERSÃO DE IMAGEM: o arquivo é MESMO do formato que diz ser —')

/*
  Um conversor que devolve PNG com o nome ".webp" não dá erro nenhum — o
  arquivo abre, a tela mostra sucesso, e só meses depois alguém descobre que
  o "webp" tem 3x o tamanho esperado. Chrome faz exatamente isso quando não
  sabe escrever o formato pedido: devolve PNG em silêncio.

  A checagem honesta é olhar os BYTES MÁGICOS do começo do arquivo.
*/
const MAGIA = {
  png: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) =>
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && // "RIFF"
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50, // "WEBP"
}

const conversoes = await page.evaluate(async () => {
  // Uma imagem de teste com detalhe suficiente pra não comprimir a zero.
  const c = document.createElement('canvas')
  c.width = 900
  c.height = 600
  const g = c.getContext('2d')
  const grad = g.createLinearGradient(0, 0, 900, 600)
  grad.addColorStop(0, '#5b5bd6')
  grad.addColorStop(0.5, '#e5537a')
  grad.addColorStop(1, '#0d9488')
  g.fillStyle = grad
  g.fillRect(0, 0, 900, 600)
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.5})`
    g.fillRect(Math.random() * 900, Math.random() * 600, 6, 6)
  }
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  const origem = new Uint8Array(await blob.arrayBuffer())

  const suportados = window.__imagem.formatosDeSaida()
  const saida = { origem: origem.length, suportados, formatos: {} }
  for (const f of ['jpg', 'png', 'webp']) {
    if (!suportados[f]) continue
    const r = await window.__imagem.reencodar(origem, f, { qualidade: 0.85 })
    saida.formatos[f] = {
      cabecalho: [...r.bytes.slice(0, 12)],
      tamanho: r.bytes.length,
      largura: r.largura,
      altura: r.altura,
    }
  }

  // Redimensionar mantendo a proporção.
  const menor = await window.__imagem.reencodar(origem, 'jpg', { qualidade: 0.8, ladoMaximo: 300 })
  saida.menor = { largura: menor.largura, altura: menor.altura, tamanho: menor.bytes.length }

  // O caminho de "deixar mais leve", com o veredito que a tela mostra.
  const leve = await window.__otimizar.otimizarImagem(origem, {
    qualidade: 0.7,
    ladoMaximo: 0,
    formato: suportados.webp ? 'webp' : 'jpg',
  })
  saida.leve = { ganho: leve.ganho, valeAPena: leve.valeAPena, tamanho: leve.bytes.length }
  return saida
})

for (const [f, dados] of Object.entries(conversoes.formatos)) {
  const b = dados.cabecalho
  ok(
    `Converter pra ${f.toUpperCase()} produz um arquivo ${f.toUpperCase()} de verdade`,
    MAGIA[f](b),
    `bytes ${b.slice(0, 4).map((x) => x.toString(16).padStart(2, '0')).join(' ')} · ${dados.tamanho} B`
  )
  ok(
    `${f.toUpperCase()} mantém as dimensões originais (900×600)`,
    dados.largura === 900 && dados.altura === 600,
    `${dados.largura}×${dados.altura}`
  )
}

ok(
  'Reduzir o lado máximo mantém a proporção 3:2',
  conversoes.menor.largura === 300 && conversoes.menor.altura === 200,
  `${conversoes.menor.largura}×${conversoes.menor.altura}`
)

ok(
  'A imagem reduzida é MENOR em bytes que a original',
  conversoes.menor.tamanho < conversoes.origem,
  `${conversoes.origem} → ${conversoes.menor.tamanho} bytes`
)

ok(
  '"Deixar mais leve" encolhe de verdade e diz que vale a pena',
  conversoes.leve.ganho > 0.05 && conversoes.leve.valeAPena === true,
  `${Math.round(conversoes.leve.ganho * 100)}% menor`
)

// E o teste que só falha se o app estiver mentindo: reabrir o convertido.
const reabre = await page.evaluate(async () => {
  const c = document.createElement('canvas')
  c.width = 200
  c.height = 120
  const g = c.getContext('2d')
  g.fillStyle = '#123456'
  g.fillRect(0, 0, 200, 120)
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'))
  const origem = new Uint8Array(await blob.arrayBuffer())
  const r = await window.__imagem.reencodar(origem, 'jpg', { qualidade: 0.9 })
  const bm = await window.__imagem.abrirBitmap(r.bytes)
  return { largura: bm.width, altura: bm.height }
})
ok(
  'O arquivo convertido abre de novo, com o tamanho certo',
  reabre.largura === 200 && reabre.altura === 120,
  `${reabre.largura}×${reabre.altura}`
)

// Os PDFs ficam gravados: quem quiser confere com o olho humano.
fs.writeFileSync(path.join(TMP, 'imagens.pdf'), Buffer.from(pdfImagens.bytes))
fs.writeFileSync(path.join(TMP, 'texto.pdf'), Buffer.from(pdfTexto.bytes))
console.log(`  (PDFs de exemplo gravados em ${TMP})`)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== ERROS DE CONSOLE ===')
if (!erros.size) console.log('nenhum')
else [...erros].forEach((e) => console.log(' ' + e))

const falhas = casos.filter((c) => !c.passou)
console.log(`\n=== ${casos.length - falhas.length}/${casos.length} casos de zip/pdf passaram | ${erros.size} erros ===`)
if (falhas.length) {
  console.log('FALHAS:')
  falhas.forEach((f) => console.log('  - ' + f.nome + (f.detalhe ? ' :: ' + f.detalhe : '')))
}

await navegador.close()
process.exit(falhas.length || erros.size ? 1 : 0)
