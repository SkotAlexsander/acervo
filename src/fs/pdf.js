/**
 * PDF — escritor mínimo, sem biblioteca.
 *
 * Faz duas coisas, e só elas:
 *   · **imagens → PDF** (uma página por imagem, ajustada à folha)
 *   · **texto → PDF** (paginado, em Courier)
 *
 * O que NÃO faz, e por quê: .docx, .xlsx e .pptx viram PDF renderizando o
 * formato inteiro — layout, fontes, tabelas. Isso é um projeto do tamanho de
 * um editor de texto, não uma função. Pra esses, o caminho honesto é
 * "Compartilhar" e deixar o app que entende do formato converter.
 *
 * Por que escrito à mão: um PDF de imagens é um envelope simples. `pdf-lib` e
 * `jspdf` pesam ~350 KB cada — mais que o app inteiro — pra fazer o que cabe
 * em 200 linhas que eu controlo.
 */

const codificador = new TextEncoder()

// A4 em pontos tipográficos (1 pt = 1/72 pol).
export const A4 = { largura: 595.28, altura: 841.89 }
const MARGEM = 24

// ─── Montador de arquivo PDF ─────────────────────────────────────────────────

class Documento {
  constructor() {
    this.partes = []
    this.tamanho = 0
    this.deslocamentos = [0] // objeto 0 é o "livre" obrigatório
    this.escrever('%PDF-1.7\n')
    // Comentário com bytes altos: marca o arquivo como binário, senão
    // ferramentas antigas tratam como texto e corrompem na transferência.
    this.bytes(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]))
  }

  bytes(u8) {
    this.partes.push(u8)
    this.tamanho += u8.length
  }

  escrever(txt) {
    this.bytes(codificador.encode(txt))
  }

  /** Registra um objeto e devolve o número dele. */
  objeto(corpo, fluxo) {
    const n = this.deslocamentos.length
    this.deslocamentos.push(this.tamanho)
    this.escrever(`${n} 0 obj\n${corpo}\n`)
    if (fluxo) {
      this.escrever('stream\n')
      this.bytes(fluxo)
      this.escrever('\nendstream\n')
    }
    this.escrever('endobj\n')
    return n
  }

  /** Reserva um número de objeto pra ser preenchido depois (referência circular). */
  reservar() {
    const n = this.deslocamentos.length
    this.deslocamentos.push(-1)
    return n
  }

  preencher(n, corpo) {
    this.deslocamentos[n] = this.tamanho
    this.escrever(`${n} 0 obj\n${corpo}\nendobj\n`)
  }

  finalizar(raiz) {
    const inicioXref = this.tamanho
    const total = this.deslocamentos.length
    let xref = `xref\n0 ${total}\n0000000000 65535 f \n`
    for (let i = 1; i < total; i++) {
      xref += String(this.deslocamentos[i]).padStart(10, '0') + ' 00000 n \n'
    }
    this.escrever(xref)
    this.escrever(`trailer\n<< /Size ${total} /Root ${raiz} 0 R >>\nstartxref\n${inicioXref}\n%%EOF\n`)

    const out = new Uint8Array(this.tamanho)
    let i = 0
    for (const p of this.partes) {
      out.set(p, i)
      i += p.length
    }
    return out
  }
}

// ─── Imagens ─────────────────────────────────────────────────────────────────

export const LIMITE_PAGINAS = 200

/**
 * Decodifica uma imagem e devolve JPEG baseline em DeviceRGB.
 *
 * Por que reencodar em vez de embutir o JPEG original: o PDF só aceita JPEG
 * *baseline* no filtro DCTDecode, e boa parte das fotos de celular hoje é
 * JPEG **progressivo** — que abriria em branco. Passar pelo canvas normaliza
 * tudo (PNG, WebP, HEIC que o navegador saiba abrir) e garante que o PDF
 * resultante abre em qualquer leitor.
 */
async function paraJpeg(bytes, qualidade = 0.85) {
  const blob = new Blob([bytes])
  let bitmap
  try {
    bitmap = await createImageBitmap(blob)
  } catch {
    throw new Error('não consegui abrir esta imagem')
  }
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  // Fundo branco: PNG com transparência viraria preto no PDF, que não tem
  // canal alfa em DCTDecode.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close && bitmap.close()

  const jpeg = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('falha ao converter'))), 'image/jpeg', qualidade)
  )
  return {
    bytes: new Uint8Array(await jpeg.arrayBuffer()),
    largura: canvas.width,
    altura: canvas.height,
  }
}

/**
 * Monta um PDF com uma página por imagem.
 *
 * @param {{nome: string, bytes: Uint8Array}[]} imagens
 * @param {{qualidade?: number, onProgresso?: (feitos:number, total:number, nome:string)=>void}} [opts]
 * @returns {Promise<{bytes: Uint8Array, paginas: number, falhas: string[]}>}
 */
export async function pdfDeImagens(imagens, opts = {}) {
  if (!imagens.length) throw new Error('Nenhuma imagem selecionada.')
  if (imagens.length > LIMITE_PAGINAS) {
    throw new Error(`São ${imagens.length} imagens — o limite é ${LIMITE_PAGINAS} páginas por PDF.`)
  }

  const doc = new Documento()
  const paginasRef = doc.reservar()
  const paginas = []
  const falhas = []

  for (let i = 0; i < imagens.length; i++) {
    const img = imagens[i]
    if (opts.onProgresso) opts.onProgresso(i, imagens.length, img.nome)
    let jpeg
    try {
      jpeg = await paraJpeg(img.bytes, opts.qualidade)
    } catch (e) {
      falhas.push(`${img.nome}: ${(e && e.message) || 'falhou'}`)
      continue
    }

    const objImagem = doc.objeto(
      `<< /Type /XObject /Subtype /Image /Width ${jpeg.largura} /Height ${jpeg.altura} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.bytes.length} >>`,
      jpeg.bytes
    )

    // Folha na orientação da foto: imagem deitada em página em pé sairia
    // minúscula, com duas tarjas brancas enormes.
    const deitada = jpeg.largura > jpeg.altura
    const pl = deitada ? A4.altura : A4.largura
    const pa = deitada ? A4.largura : A4.altura

    const dispL = pl - MARGEM * 2
    const dispA = pa - MARGEM * 2
    const escala = Math.min(dispL / jpeg.largura, dispA / jpeg.altura)
    const l = jpeg.largura * escala
    const a = jpeg.altura * escala
    const x = (pl - l) / 2
    const y = (pa - a) / 2

    const conteudo = codificador.encode(
      `q\n${l.toFixed(2)} 0 0 ${a.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm\n/Im0 Do\nQ\n`
    )
    const objConteudo = doc.objeto(`<< /Length ${conteudo.length} >>`, conteudo)

    paginas.push(
      doc.objeto(
        `<< /Type /Page /Parent ${paginasRef} 0 R /MediaBox [0 0 ${pl.toFixed(2)} ${pa.toFixed(2)}] ` +
          `/Resources << /XObject << /Im0 ${objImagem} 0 R >> >> /Contents ${objConteudo} 0 R >>`
      )
    )
    await new Promise((r) => setTimeout(r, 0))
  }

  if (!paginas.length) {
    throw new Error('Nenhuma das imagens pôde ser convertida.' + (falhas[0] ? ` ${falhas[0]}` : ''))
  }

  doc.preencher(
    paginasRef,
    `<< /Type /Pages /Kids [${paginas.map((p) => `${p} 0 R`).join(' ')}] /Count ${paginas.length} >>`
  )
  const raiz = doc.objeto(`<< /Type /Catalog /Pages ${paginasRef} 0 R >>`)

  if (opts.onProgresso) opts.onProgresso(imagens.length, imagens.length, '')
  return { bytes: doc.finalizar(raiz), paginas: paginas.length, falhas }
}

// ─── Texto ───────────────────────────────────────────────────────────────────

// Caracteres do CP1252 que não estão no Latin-1 e aparecem em texto real
// colado da web (aspas curvas, travessão, reticências).
const CP1252_EXTRA = {
  '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85,
  '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a,
  '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92,
  '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
  '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c,
  'ž': 0x9e, 'Ÿ': 0x9f,
}

/** Texto → bytes WinAnsi, escapando o que o PDF trata como sintaxe. */
function textoPdf(s) {
  const out = []
  for (const ch of s) {
    let b = CP1252_EXTRA[ch]
    if (b === undefined) {
      const c = ch.codePointAt(0)
      b = c <= 0xff ? c : 0x3f // fora do WinAnsi vira "?"
    }
    if (b === 0x28 || b === 0x29 || b === 0x5c) out.push(0x5c) // ( ) \
    out.push(b)
  }
  return new Uint8Array(out)
}

const FONTE = 10
const ENTRELINHA = 13.2
const MARGEM_TEXTO = 48
// Courier é monoespaçada e todo glifo mede exatamente 600/1000 de em. É por
// isso que ela foi escolhida: a quebra de linha vira aritmética exata, sem
// precisar embutir uma tabela de larguras de fonte no app.
const LARGURA_GLIFO = FONTE * 0.6

export const COLUNAS = Math.floor((A4.largura - MARGEM_TEXTO * 2) / LARGURA_GLIFO)
export const LINHAS_POR_PAGINA = Math.floor((A4.altura - MARGEM_TEXTO * 2) / ENTRELINHA)
export const LIMITE_LINHAS = LIMITE_PAGINAS * LINHAS_POR_PAGINA

/** Quebra o texto em linhas que cabem na largura, preservando as quebras originais. */
export function quebrarLinhas(texto, colunas = COLUNAS) {
  const out = []
  for (const bruta of String(texto).replace(/\r\n?/g, '\n').split('\n')) {
    const linha = bruta.replace(/\t/g, '    ')
    if (linha.length <= colunas) {
      out.push(linha)
      continue
    }
    // Quebra preferindo espaço; palavra maior que a linha é cortada na força.
    let resto = linha
    while (resto.length > colunas) {
      let corte = resto.lastIndexOf(' ', colunas)
      if (corte <= 0) corte = colunas
      out.push(resto.slice(0, corte))
      resto = resto.slice(corte).replace(/^ /, '')
    }
    out.push(resto)
  }
  return out
}

/**
 * Monta um PDF a partir de texto.
 * @returns {Promise<{bytes: Uint8Array, paginas: number, truncado: boolean}>}
 */
export async function pdfDeTexto(texto, opts = {}) {
  const titulo = opts.titulo || ''
  let linhas = quebrarLinhas(texto)
  const truncado = linhas.length > LIMITE_LINHAS
  if (truncado) {
    linhas = linhas.slice(0, LIMITE_LINHAS)
    linhas.push('', `[cortado aqui — o PDF vai até ${LIMITE_PAGINAS} páginas]`)
  }

  const doc = new Documento()
  const paginasRef = doc.reservar()
  const objFonte = doc.objeto(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>'
  )

  const paginas = []
  for (let i = 0; i < linhas.length; i += LINHAS_POR_PAGINA) {
    const bloco = linhas.slice(i, i + LINHAS_POR_PAGINA)
    const partes = [
      codificador.encode(
        `BT\n/F1 ${FONTE} Tf\n${ENTRELINHA} TL\n` +
          `${MARGEM_TEXTO} ${(A4.altura - MARGEM_TEXTO - FONTE).toFixed(2)} Td\n`
      ),
    ]
    for (const l of bloco) {
      partes.push(codificador.encode('('))
      partes.push(textoPdf(l))
      partes.push(codificador.encode(") Tj T*\n"))
    }
    partes.push(codificador.encode('ET\n'))

    let tam = 0
    for (const p of partes) tam += p.length
    const conteudo = new Uint8Array(tam)
    let k = 0
    for (const p of partes) {
      conteudo.set(p, k)
      k += p.length
    }

    const objConteudo = doc.objeto(`<< /Length ${conteudo.length} >>`, conteudo)
    paginas.push(
      doc.objeto(
        `<< /Type /Page /Parent ${paginasRef} 0 R ` +
          `/MediaBox [0 0 ${A4.largura.toFixed(2)} ${A4.altura.toFixed(2)}] ` +
          `/Resources << /Font << /F1 ${objFonte} 0 R >> >> /Contents ${objConteudo} 0 R >>`
      )
    )
    if (paginas.length % 20 === 0) await new Promise((r) => setTimeout(r, 0))
  }

  doc.preencher(
    paginasRef,
    `<< /Type /Pages /Kids [${paginas.map((p) => `${p} 0 R`).join(' ')}] /Count ${paginas.length} >>`
  )
  const raiz = doc.objeto(`<< /Type /Catalog /Pages ${paginasRef} 0 R >>`)
  void titulo
  return { bytes: doc.finalizar(raiz), paginas: paginas.length, truncado }
}

/** Extensões que o gerador de PDF sabe converter. */
export const IMAGENS_ACEITAS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif']
export const TEXTOS_ACEITOS = [
  'txt', 'md', 'log', 'csv', 'json', 'xml', 'ini', 'conf', 'yml', 'yaml',
  'js', 'css', 'html', 'srt', 'vtt',
]

export function podeVirarPdf(item) {
  if (!item || item.isDir) return null
  if (IMAGENS_ACEITAS.includes(item.ext)) return 'imagem'
  if (TEXTOS_ACEITOS.includes(item.ext)) return 'texto'
  return null
}
