/**
 * ZIP — criar e extrair, sem biblioteca.
 *
 * Por que escrito à mão: o container ZIP é um formato simples e bem
 * especificado (APPNOTE da PKWARE), e a parte difícil — comprimir e
 * descomprimir DEFLATE — o próprio navegador já faz, nativo, em
 * `CompressionStream`/`DecompressionStream`. Uma biblioteca traria 11 KB e um
 * terceiro no APK pra resolver a parte fácil.
 *
 * Onde o nativo não existe (WebView antigo), a criação cai pra "guardado"
 * (sem compressão) — o .zip continua válido e abre em qualquer lugar, só não
 * encolhe. A interface diz isso em vez de fingir que comprimiu.
 *
 * Escopo declarado: **ZIP e só ZIP**. `.rar` e `.7z` são formatos fechados
 * cujos descompressores não cabem aqui — e prometer que abre pra depois falhar
 * é pior do que não oferecer.
 */

// ─── CRC-32 ──────────────────────────────────────────────────────────────────

const TABELA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c >>> 0
  }
  return t
})()

export function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ─── DEFLATE pelo navegador ──────────────────────────────────────────────────

/** true quando o navegador sabe comprimir sozinho. */
export function temCompressaoNativa() {
  return typeof CompressionStream !== 'undefined'
}

export function temDescompressaoNativa() {
  return typeof DecompressionStream !== 'undefined'
}

async function passarPorFluxo(bytes, fluxo) {
  const resposta = new Response(new Blob([bytes]).stream().pipeThrough(fluxo))
  return new Uint8Array(await resposta.arrayBuffer())
}

async function comprimir(bytes) {
  if (!temCompressaoNativa()) return null
  try {
    return await passarPorFluxo(bytes, new CompressionStream('deflate-raw'))
  } catch {
    // 'deflate-raw' é mais novo que 'gzip'; se não existir, guarda sem comprimir.
    return null
  }
}

async function descomprimir(bytes) {
  if (!temDescompressaoNativa()) {
    throw new Error('Este navegador não sabe descomprimir. Abra o .zip em outro app.')
  }
  return passarPorFluxo(bytes, new DecompressionStream('deflate-raw'))
}

// ─── Escrita ─────────────────────────────────────────────────────────────────

const codificador = new TextEncoder()

function dataDOS(ms) {
  const d = new Date(ms || Date.now())
  const ano = Math.max(1980, d.getFullYear())
  const data = ((ano - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)
  return { data, hora }
}

class Buffer {
  constructor() {
    this.partes = []
    this.tamanho = 0
  }
  bytes(u8) {
    this.partes.push(u8)
    this.tamanho += u8.length
  }
  u16(n) {
    this.bytes(new Uint8Array([n & 0xff, (n >>> 8) & 0xff]))
  }
  u32(n) {
    this.bytes(new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]))
  }
  juntar() {
    const out = new Uint8Array(this.tamanho)
    let i = 0
    for (const p of this.partes) {
      out.set(p, i)
      i += p.length
    }
    return out
  }
}

/** Limites conscientes — acima disso o WebView do celular não aguenta. */
export const LIMITE_ARQUIVOS = 2000
export const LIMITE_BYTES = 150 * 1024 * 1024

/**
 * Monta um .zip.
 *
 * @param {{nome: string, bytes: Uint8Array, mtime?: number}[]} entradas
 * @param {(feitos: number, total: number, nome: string) => void} [onProgresso]
 * @returns {Promise<{bytes: Uint8Array, comprimido: boolean, original: number}>}
 */
export async function criarZip(entradas, onProgresso) {
  if (entradas.length > LIMITE_ARQUIVOS) {
    throw new Error(`São ${entradas.length} arquivos — o limite é ${LIMITE_ARQUIVOS} por .zip.`)
  }
  const totalBruto = entradas.reduce((s, e) => s + e.bytes.length, 0)
  if (totalBruto > LIMITE_BYTES) {
    throw new Error(
      `São ${(totalBruto / 1048576).toFixed(0)} MB de entrada — o limite é ${LIMITE_BYTES / 1048576} MB. ` +
        'Compacte em partes menores.'
    )
  }

  const saida = new Buffer()
  const central = []
  let usouCompressao = false

  for (let i = 0; i < entradas.length; i++) {
    const e = entradas[i]
    if (onProgresso) onProgresso(i, entradas.length, e.nome)

    const nome = codificador.encode(e.nome)
    const crc = crc32(e.bytes)
    const { data, hora } = dataDOS(e.mtime)

    let dados = await comprimir(e.bytes)
    let metodo = 8 // deflate
    // Comprimir às vezes ENGORDA (arquivo já comprimido: jpg, mp4, zip).
    // Nesse caso guarda o original — é o que qualquer compactador sério faz.
    if (!dados || dados.length >= e.bytes.length) {
      dados = e.bytes
      metodo = 0 // guardado
    } else {
      usouCompressao = true
    }

    const deslocamento = saida.tamanho

    // Cabeçalho local
    saida.u32(0x04034b50)
    saida.u16(metodo === 8 ? 20 : 10) // versão mínima
    saida.u16(0x0800) // bit 11: nome em UTF-8
    saida.u16(metodo)
    saida.u16(hora)
    saida.u16(data)
    saida.u32(crc)
    saida.u32(dados.length)
    saida.u32(e.bytes.length)
    saida.u16(nome.length)
    saida.u16(0)
    saida.bytes(nome)
    saida.bytes(dados)

    central.push({ nome, crc, comp: dados.length, orig: e.bytes.length, metodo, data, hora, deslocamento })

    // Devolve o fio pro navegador: sem isto a interface congela no meio.
    await new Promise((r) => setTimeout(r, 0))
  }

  const inicioCentral = saida.tamanho
  for (const c of central) {
    saida.u32(0x02014b50)
    saida.u16(0x031e) // "feito por": Unix, versão 3.0
    saida.u16(c.metodo === 8 ? 20 : 10)
    saida.u16(0x0800)
    saida.u16(c.metodo)
    saida.u16(c.hora)
    saida.u16(c.data)
    saida.u32(c.crc)
    saida.u32(c.comp)
    saida.u32(c.orig)
    saida.u16(c.nome.length)
    saida.u16(0) // extra
    saida.u16(0) // comentário
    saida.u16(0) // disco
    saida.u16(0) // atributos internos
    saida.u32(0) // atributos externos
    saida.u32(c.deslocamento)
    saida.bytes(c.nome)
  }
  const tamanhoCentral = saida.tamanho - inicioCentral

  // Fim do diretório central
  saida.u32(0x06054b50)
  saida.u16(0)
  saida.u16(0)
  saida.u16(central.length)
  saida.u16(central.length)
  saida.u32(tamanhoCentral)
  saida.u32(inicioCentral)
  saida.u16(0)

  if (onProgresso) onProgresso(entradas.length, entradas.length, '')
  return { bytes: saida.juntar(), comprimido: usouCompressao, original: totalBruto }
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

const decodificador = new TextDecoder('utf-8')
const decodificadorCP437 = new TextDecoder('windows-1252') // aproximação p/ nome legado

function u16(v, i) {
  return v.getUint16(i, true)
}
function u32(v, i) {
  return v.getUint32(i, true)
}

/**
 * Lê a lista de arquivos de um .zip, sem descomprimir nada.
 * @returns {{nome:string, tamanho:number, comprimido:number, metodo:number, crc:number, mtime:number, deslocamento:number}[]}
 */
export function lerIndiceZip(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  // O fim do diretório central fica no FINAL do arquivo, e pode ter até 64 KB
  // de comentário depois. Por isso se procura de trás pra frente.
  let fim = -1
  const minimo = Math.max(0, bytes.length - 65557)
  for (let i = bytes.length - 22; i >= minimo; i--) {
    if (u32(v, i) === 0x06054b50) {
      fim = i
      break
    }
  }
  if (fim === -1) {
    throw new Error('Este arquivo não parece um .zip válido (não achei o índice interno).')
  }

  const qtd = u16(v, fim + 10)
  let p = u32(v, fim + 16)
  const entradas = []

  for (let i = 0; i < qtd; i++) {
    if (u32(v, p) !== 0x02014b50) {
      throw new Error('O .zip está com o índice corrompido.')
    }
    const flags = u16(v, p + 8)
    const metodo = u16(v, p + 10)
    const hora = u16(v, p + 12)
    const data = u16(v, p + 14)
    const crc = u32(v, p + 16)
    const comprimido = u32(v, p + 20)
    const tamanho = u32(v, p + 24)
    const nomeLen = u16(v, p + 28)
    const extraLen = u16(v, p + 30)
    const comentLen = u16(v, p + 32)
    const deslocamento = u32(v, p + 42)
    const cruNome = bytes.subarray(p + 46, p + 46 + nomeLen)
    // Bit 11 ligado = UTF-8. Sem ele, o padrão histórico é CP437; o
    // windows-1252 do navegador é a aproximação mais próxima disponível.
    const nome = flags & 0x0800 ? decodificador.decode(cruNome) : decodificadorCP437.decode(cruNome)

    entradas.push({
      nome,
      tamanho,
      comprimido,
      metodo,
      crc,
      mtime: dataDeDOS(data, hora),
      deslocamento,
      ehPasta: nome.endsWith('/'),
    })
    p += 46 + nomeLen + extraLen + comentLen
  }
  return entradas
}

function dataDeDOS(data, hora) {
  const ano = ((data >> 9) & 0x7f) + 1980
  const mes = ((data >> 5) & 0x0f) - 1
  const dia = data & 0x1f
  const h = (hora >> 11) & 0x1f
  const m = (hora >> 5) & 0x3f
  const s = (hora & 0x1f) * 2
  return new Date(ano, Math.max(0, mes), Math.max(1, dia), h, m, s).getTime()
}

/** Extrai UMA entrada do .zip (já lida por `lerIndiceZip`). */
export async function extrairEntrada(bytes, entrada) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const p = entrada.deslocamento
  if (u32(v, p) !== 0x04034b50) {
    throw new Error(`"${entrada.nome}": cabeçalho do arquivo dentro do .zip está corrompido.`)
  }
  const nomeLen = u16(v, p + 26)
  const extraLen = u16(v, p + 28)
  const inicio = p + 30 + nomeLen + extraLen
  const cru = bytes.subarray(inicio, inicio + entrada.comprimido)

  let dados
  if (entrada.metodo === 0) dados = cru
  else if (entrada.metodo === 8) dados = await descomprimir(cru)
  else {
    throw new Error(
      `"${entrada.nome}" usa um método de compressão que este app não abre (${entrada.metodo}).`
    )
  }

  // O CRC é a prova de que saiu igual ao que entrou. Sem conferir, um .zip
  // meio corrompido vira arquivo meio corrompido em silêncio.
  if (crc32(dados) !== entrada.crc) {
    throw new Error(`"${entrada.nome}" saiu corrompido do .zip (verificação CRC falhou).`)
  }
  return dados
}

/** Nome de entrada de .zip que tenta escapar da pasta de destino. */
export function caminhoPerigoso(nome) {
  if (nome.startsWith('/') || nome.startsWith('\\')) return true
  if (/^[a-zA-Z]:/.test(nome)) return true
  return nome.split(/[/\\]/).some((seg) => seg === '..')
}
