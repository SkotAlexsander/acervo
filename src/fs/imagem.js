/**
 * Decodificar e reencodar imagem — a base de "converter formato" e de
 * "deixar mais leve".
 *
 * Mora num arquivo só porque as duas operações fazem exatamente o mesmo
 * caminho (bytes → bitmap → canvas → bytes) e só mudam o formato e a
 * qualidade de saída. Duplicar isso seria garantir que uma das duas
 * ficasse pra trás no primeiro conserto — foi o que já aconteceu com o
 * botão de voltar, que existia em cinco cópias.
 *
 * Tudo aqui depende do CANVAS, e o canvas não sabe abrir arquivo nenhum
 * sozinho: quem decodifica é o navegador. Na prática isso significa que o
 * que abre no WebView do Android abre aqui, e o que não abre (RAW de
 * câmera, PSD, HEIC em aparelho velho) falha com mensagem clara em vez de
 * gerar um arquivo preto.
 */

/** Formatos de saída que o canvas produz. `image/gif` não entra: canvas não escreve GIF. */
export const SAIDAS = {
  jpg: { mime: 'image/jpeg', ext: 'jpg', rotulo: 'JPG', perdas: true, alfa: false },
  png: { mime: 'image/png', ext: 'png', rotulo: 'PNG', perdas: false, alfa: true },
  webp: { mime: 'image/webp', ext: 'webp', rotulo: 'WebP', perdas: true, alfa: true },
}

/** Extensões que costumam decodificar. Espelha a lista do gerador de PDF. */
export const ENTRADAS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif', 'heic', 'heif', 'ico']

export function ehImagem(item) {
  return !!item && !item.isDir && ENTRADAS.includes(item.ext)
}

/**
 * Descobre, de verdade, quais formatos de saída este navegador escreve.
 *
 * Não dá pra confiar na tabela: navegador que não sabe escrever WebP não
 * lança erro — ele devolve **PNG silenciosamente** com o nome errado.
 * Um teste de 1×1 pixel resolve, e o resultado fica em cache.
 */
let suportadas = null
export function formatosDeSaida() {
  if (suportadas) return suportadas
  suportadas = {}
  try {
    const c = document.createElement('canvas')
    c.width = 1
    c.height = 1
    for (const [id, def] of Object.entries(SAIDAS)) {
      const url = c.toDataURL(def.mime)
      suportadas[id] = url.startsWith(`data:${def.mime}`)
    }
  } catch {
    suportadas = { jpg: true, png: true, webp: false }
  }
  return suportadas
}

/** Abre os bytes como bitmap. Erro aqui é sempre "o navegador não sabe ler isto". */
export async function abrirBitmap(bytes) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes])
  try {
    return await createImageBitmap(blob)
  } catch {
    throw new Error('Não consegui abrir esta imagem — o formato não é reconhecido aqui.')
  }
}

/**
 * Reencoda uma imagem.
 *
 * @param {Uint8Array} bytes     conteúdo original
 * @param {string} formato       'jpg' | 'png' | 'webp'
 * @param {{qualidade?: number, ladoMaximo?: number}} [opts]
 *   qualidade   0..1, só vale pra jpg/webp (PNG é sempre sem perdas)
 *   ladoMaximo  reduz proporcionalmente se o maior lado passar disto
 * @returns {Promise<{bytes: Uint8Array, largura: number, altura: number,
 *                    larguraOriginal: number, alturaOriginal: number}>}
 */
export async function reencodar(bytes, formato, opts = {}) {
  const def = SAIDAS[formato]
  if (!def) throw new Error(`Formato de saída desconhecido: ${formato}`)
  if (!formatosDeSaida()[formato]) {
    throw new Error(`Este aparelho não sabe gravar ${def.rotulo}.`)
  }

  const bitmap = await abrirBitmap(bytes)
  const lO = bitmap.width
  const aO = bitmap.height

  let l = lO
  let a = aO
  const max = opts.ladoMaximo || 0
  if (max > 0 && Math.max(l, a) > max) {
    const fator = max / Math.max(l, a)
    // Arredondar pra cima e travar em 1: uma imagem de 8px reduzida por um
    // fator pequeno viraria 0px, e canvas de largura 0 lança exceção.
    l = Math.max(1, Math.round(l * fator))
    a = Math.max(1, Math.round(a * fator))
  }

  const canvas = document.createElement('canvas')
  canvas.width = l
  canvas.height = a
  const ctx = canvas.getContext('2d')

  // JPEG não tem canal alfa. Sem esta base branca, o transparente do PNG
  // vira PRETO — é o erro clássico de "converti pra jpg e ficou tudo escuro".
  if (!def.alfa) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, l, a)
  }
  // Reduzir em um passo só borra menos do que parece com estas duas linhas —
  // é a interpolação boa do canvas, e sem ela imagem diminuída fica serrilhada.
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, l, a)
  bitmap.close && bitmap.close()

  const q = def.perdas ? Math.min(1, Math.max(0.05, opts.qualidade ?? 0.85)) : undefined
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('O aparelho não conseguiu gravar a imagem.'))),
      def.mime,
      q
    )
  )

  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    largura: l,
    altura: a,
    larguraOriginal: lO,
    alturaOriginal: aO,
  }
}

/** Só as dimensões, sem reencodar. Usado pra mostrar "3024×4032" antes de decidir. */
export async function dimensoes(bytes) {
  const bitmap = await abrirBitmap(bytes)
  const r = { largura: bitmap.width, altura: bitmap.height }
  bitmap.close && bitmap.close()
  return r
}
