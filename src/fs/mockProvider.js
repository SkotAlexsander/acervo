/**
 * Provider de MENTIRA — a memória de celular que roda no navegador do PC.
 *
 * Implementa o mesmo contrato do provider real (types.js). Toda tela do app
 * fala com esta interface, então o dia em que o app rodar no celular a única
 * coisa que muda é qual provider foi escolhido em index.js.
 *
 * As alterações são gravadas no localStorage: você renomeia um arquivo, recarrega
 * a página, e ele continua renomeado — como aconteceria no aparelho de verdade.
 */

import { construirArvore, CAPACIDADE, AGORA, TEXTOS } from './mockData.js'
import { normalize, join, parentOf, baseName, extOf, uniqueName, isInside } from './util.js'

const CHAVE = 'acervo.mock.v1'

// ─── Estado interno ──────────────────────────────────────────────────────────
// nós: Map<path, {path, name, isDir, size, mtime, ext}>
// filhos: Map<pathDaPasta, Set<pathDoFilho>>
let nos = new Map()
let filhos = new Map()
let textos = new Map()
// Bytes de verdade — de arquivos que o próprio app gravou (.zip, .pdf,
// extrações) e de imagens materializadas sob demanda. Só nesta sessão.
let binarios = new Map()

const EXTS_IMAGEM = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'])

/**
 * Gera um JPEG de verdade a partir do degradê determinístico do arquivo.
 *
 * A demonstração não tem foto nenhuma — mas "virar PDF" precisa de uma imagem
 * decodificável pra existir. Este JPEG é sintético e sempre o mesmo pro mesmo
 * caminho, então o resultado do PDF também é reprodutível.
 */
async function jpegSintetico(path) {
  if (typeof document === 'undefined') return null
  try {
    const h = hash(path)
    const m1 = h % 360
    const m2 = (m1 + 40 + (h % 60)) % 360
    // Retrato ou paisagem conforme o hash: exercita os dois caminhos do PDF.
    const deitada = (h >> 3) % 2 === 0
    const canvas = document.createElement('canvas')
    canvas.width = deitada ? 1200 : 900
    canvas.height = deitada ? 900 : 1200
    const ctx = canvas.getContext('2d')
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
    grad.addColorStop(0, `hsl(${m1} 62% 62%)`)
    grad.addColorStop(1, `hsl(${m2} 58% 44%)`)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(255,255,255,.35)'
    ctx.beginPath()
    ctx.arc(canvas.width * 0.3, canvas.height * 0.25, canvas.width * 0.12, 0, Math.PI * 2)
    ctx.fill()
    // Escreve o nome na imagem: quem abrir o PDF vê de qual arquivo veio.
    ctx.fillStyle = 'rgba(255,255,255,.9)'
    ctx.font = `${Math.round(canvas.width / 26)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(baseName(path), canvas.width / 2, canvas.height - canvas.width / 14)
    ctx.font = `${Math.round(canvas.width / 40)}px sans-serif`
    ctx.fillStyle = 'rgba(255,255,255,.65)'
    ctx.fillText('imagem de demonstração', canvas.width / 2, canvas.height - canvas.width / 26)

    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.82))
    if (!blob) return null
    return new Uint8Array(await blob.arrayBuffer())
  } catch {
    return null
  }
}

function novoNo(path, isDir, size, mtime) {
  const p = normalize(path)
  const name = baseName(p)
  return {
    path: p,
    name,
    isDir: !!isDir,
    size: isDir ? 0 : Math.round(size || 0),
    mtime: mtime || AGORA,
    ext: isDir ? '' : extOf(name),
  }
}

function inserir(no) {
  nos.set(no.path, no)
  if (no.isDir && !filhos.has(no.path)) filhos.set(no.path, new Set())
  if (no.path !== '/') {
    const pai = parentOf(no.path)
    if (!filhos.has(pai)) filhos.set(pai, new Set())
    filhos.get(pai).add(no.path)
  }
}

function semear() {
  nos = new Map()
  filhos = new Map()
  textos = new Map()
  binarios = new Map()
  inserir(novoNo('/', true, 0, AGORA))

  const arvore = construirArvore()
  const descer = (node, base) => {
    for (const [chave, valor] of Object.entries(node)) {
      if (chave === '_arquivos') {
        // Colisão de nome dentro da mesma pasta: mantém a primeira e renumera
        // a segunda, exatamente como o Android faria.
        const usados = nomesEm(base)
        for (const arq of valor) {
          const nome = uniqueName(arq.name, usados)
          usados.add(nome)
          inserir(novoNo(join(base, nome), false, arq.size, arq.mtime))
        }
      } else {
        const p = join(base, chave)
        inserir(novoNo(p, true, 0, AGORA))
        descer(valor, p)
      }
    }
  }
  descer(arvore, '/')

  // Alguns arquivos ganham conteúdo de verdade, pra o leitor de texto ter o
  // que mostrar na demonstração. O tamanho passa a ser o tamanho real deles.
  for (const [caminho, conteudo] of Object.entries(TEXTOS)) {
    const p = normalize(caminho)
    if (!nos.has(p)) continue
    textos.set(p, conteudo)
    nos.set(p, { ...nos.get(p), size: new Blob([conteudo]).size })
  }
}

// ─── Persistência ────────────────────────────────────────────────────────────

function salvar() {
  try {
    const lista = []
    for (const no of nos.values()) {
      if (no.path === '/') continue
      lista.push([no.path, no.isDir ? 1 : 0, no.size, no.mtime])
    }
    localStorage.setItem(
      CHAVE,
      JSON.stringify({ v: 1, lista, textos: [...textos.entries()] })
    )
  } catch (e) {
    // Cota estourada ou modo anônimo: o app continua funcionando na memória,
    // só não sobrevive ao recarregar. Não é motivo pra quebrar a tela.
    console.warn('[acervo] não deu pra gravar o estado local:', e && e.message)
  }
}

function carregar() {
  let bruto
  try {
    bruto = localStorage.getItem(CHAVE)
  } catch {
    return false
  }
  if (!bruto) return false
  try {
    const dados = JSON.parse(bruto)
    if (!dados || dados.v !== 1 || !Array.isArray(dados.lista)) return false
    nos = new Map()
    filhos = new Map()
    textos = new Map(dados.textos || [])
    binarios = new Map()
    inserir(novoNo('/', true, 0, AGORA))
    for (const [path, isDir, size, mtime] of dados.lista) {
      // Garante que as pastas do caminho existam antes do filho.
      const segs = normalize(path).split('/').filter(Boolean)
      let acc = ''
      for (let i = 0; i < segs.length - 1; i++) {
        acc += '/' + segs[i]
        if (!nos.has(acc)) inserir(novoNo(acc, true, 0, AGORA))
      }
      inserir(novoNo(path, !!isDir, size, mtime))
    }
    return nos.size > 1
  } catch {
    return false
  }
}

// ─── Miniatura falsa ─────────────────────────────────────────────────────────
// Não existe imagem de verdade aqui. Em vez de mostrar um quadrado cinza, o
// mock gera um degradê determinístico a partir do nome: fica vivo na grade e,
// como é derivado do nome, o mesmo arquivo tem sempre a mesma cara.

function hash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function miniatura(path) {
  const h = hash(path)
  const m1 = h % 360
  const m2 = (m1 + 40 + (h % 60)) % 360
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${m1} 62% 62%)"/>` +
    `<stop offset="1" stop-color="hsl(${m2} 58% 44%)"/>` +
    `</linearGradient></defs>` +
    `<rect width="64" height="64" fill="url(#g)"/>` +
    `<circle cx="${18 + (h % 28)}" cy="${16 + ((h >> 8) % 20)}" r="${6 + (h % 7)}" fill="rgba(255,255,255,.35)"/>` +
    `</svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

// ─── Operações ───────────────────────────────────────────────────────────────

const clone = (no) => ({ ...no })

function exigirPasta(path) {
  const p = normalize(path)
  const no = nos.get(p)
  if (!no) throw new Error(`A pasta "${baseName(p)}" não existe mais.`)
  if (!no.isDir) throw new Error(`"${no.name}" é um arquivo, não uma pasta.`)
  return no
}

function nomesEm(dir) {
  return new Set([...(filhos.get(normalize(dir)) || [])].map((c) => baseName(c)))
}

/** Reescreve o caminho de um nó e de toda a sua descendência. */
function reencaminhar(deOrigem, paraDestino) {
  const origem = normalize(deOrigem)
  const destino = normalize(paraDestino)
  const afetados = [origem, ...descendentes(origem)]
  const copias = afetados.map((p) => ({ antigo: p, no: nos.get(p) }))

  // Remove tudo antes de reinserir, senão o Set de filhos fica com fantasma.
  for (const { antigo } of copias) {
    nos.delete(antigo)
    filhos.delete(antigo)
  }
  const paiAntigo = parentOf(origem)
  if (filhos.has(paiAntigo)) filhos.get(paiAntigo).delete(origem)

  for (const { antigo, no } of copias) {
    const novo = antigo === origem ? destino : destino + antigo.slice(origem.length)
    inserir({ ...no, path: novo, name: baseName(novo), ext: no.isDir ? '' : extOf(baseName(novo)) })
    const t = textos.get(antigo)
    if (t !== undefined) {
      textos.delete(antigo)
      textos.set(novo, t)
    }
    const b = binarios.get(antigo)
    if (b !== undefined) {
      binarios.delete(antigo)
      binarios.set(novo, b)
    }
  }
}

function descendentes(path) {
  const raiz = normalize(path)
  const out = []
  const fila = [...(filhos.get(raiz) || [])]
  while (fila.length) {
    const p = fila.pop()
    out.push(p)
    const f = filhos.get(p)
    if (f) fila.push(...f)
  }
  return out
}

function apagarRecursivo(path) {
  const p = normalize(path)
  if (p === '/') throw new Error('Não dá pra apagar a raiz do armazenamento.')
  for (const d of descendentes(p)) {
    nos.delete(d)
    filhos.delete(d)
    textos.delete(d)
    binarios.delete(d)
  }
  nos.delete(p)
  filhos.delete(p)
  textos.delete(p)
  binarios.delete(p)
  const pai = parentOf(p)
  if (filhos.has(pai)) filhos.get(pai).delete(p)
}

function copiarRecursivo(origem, destinoPath) {
  const no = nos.get(normalize(origem))
  if (!no) return
  inserir({ ...no, path: destinoPath, name: baseName(destinoPath), ext: no.isDir ? '' : extOf(baseName(destinoPath)) })
  const t = textos.get(no.path)
  if (t !== undefined) textos.set(destinoPath, t)
  const b = binarios.get(no.path)
  if (b !== undefined) binarios.set(destinoPath, new Uint8Array(b))
  for (const filho of filhos.get(no.path) || []) {
    copiarRecursivo(filho, join(destinoPath, baseName(filho)))
  }
}

export const mockProvider = {
  id: 'mock',
  label: 'Demonstração (dados de exemplo)',
  realFiles: false,
  // Os arquivos da demonstração não têm conteúdo de verdade. `readBytes`
  // materializa algo plausível pra que compactar e gerar PDF funcionem aqui —
  // mas a interface precisa dizer isso, e diz.
  conteudoReal: false,

  async init() {
    if (!carregar()) {
      semear()
      salvar()
    }
  },

  /** Recria a árvore original. Usado no botão "restaurar demonstração". */
  async reset() {
    semear()
    salvar()
  },

  async list(path) {
    const dir = exigirPasta(path)
    return [...(filhos.get(dir.path) || [])].map((p) => clone(nos.get(p))).filter(Boolean)
  },

  async stat(path) {
    const no = nos.get(normalize(path))
    return no ? clone(no) : null
  },

  async rename(path, novoNome) {
    const p = normalize(path)
    const no = nos.get(p)
    if (!no) throw new Error('Esse item não existe mais.')
    if (p === '/') throw new Error('Não dá pra renomear a raiz.')
    const dir = parentOf(p)
    const usados = nomesEm(dir)
    usados.delete(no.name)
    if (usados.has(novoNome)) throw new Error(`Já existe "${novoNome}" nesta pasta.`)
    const destino = join(dir, novoNome)
    reencaminhar(p, destino)
    salvar()
    return destino
  },

  async move(paths, destDir) {
    const destino = exigirPasta(destDir).path
    const finais = []
    for (const bruto of paths) {
      const p = normalize(bruto)
      const no = nos.get(p)
      if (!no) continue
      if (parentOf(p) === destino) {
        finais.push(p)
        continue
      }
      if (no.isDir && isInside(destino, p)) {
        throw new Error(`Não dá pra mover "${no.name}" pra dentro dela mesma.`)
      }
      const nome = uniqueName(no.name, nomesEm(destino))
      const alvo = join(destino, nome)
      reencaminhar(p, alvo)
      finais.push(alvo)
    }
    salvar()
    return finais
  },

  async copy(paths, destDir) {
    const destino = exigirPasta(destDir).path
    const finais = []
    for (const bruto of paths) {
      const p = normalize(bruto)
      const no = nos.get(p)
      if (!no) continue
      if (no.isDir && isInside(destino, p)) {
        throw new Error(`Não dá pra copiar "${no.name}" pra dentro dela mesma.`)
      }
      const nome = uniqueName(no.name, nomesEm(destino))
      const alvo = join(destino, nome)
      copiarRecursivo(p, alvo)
      finais.push(alvo)
    }
    salvar()
    return finais
  },

  async remove(paths) {
    for (const p of paths) apagarRecursivo(p)
    salvar()
  },

  async mkdir(parent, nome) {
    const dir = exigirPasta(parent).path
    const livre = uniqueName(nome, nomesEm(dir))
    const p = join(dir, livre)
    inserir(novoNo(p, true, 0, Date.now()))
    salvar()
    return p
  },

  async readText(path) {
    const p = normalize(path)
    if (textos.has(p)) return textos.get(p)
    const no = nos.get(p)
    if (!no || no.isDir) return null

    // Arquivo gravado como BYTES (extraído de um .zip, por exemplo) também
    // precisa poder ser lido como TEXTO. No aparelho os dois caminhos batem no
    // mesmo arquivo; aqui eram dois mapas separados, e o texto extraído de um
    // .zip abria vazio. Mock que não é fiel esconde bug em vez de revelar.
    if (binarios.has(p)) {
      try {
        return new TextDecoder('utf-8', { fatal: false }).decode(binarios.get(p))
      } catch {
        return null
      }
    }
    return null
  },

  async writeText(path, texto) {
    const p = normalize(path)
    const dir = parentOf(p)
    if (!nos.has(dir)) {
      // Cria a árvore de pastas que faltar (usado pela lixeira).
      const segs = normalize(dir).split('/').filter(Boolean)
      let acc = ''
      for (const s of segs) {
        acc += '/' + s
        if (!nos.has(acc)) inserir(novoNo(acc, true, 0, Date.now()))
      }
    }
    textos.set(p, texto)
    const tamanho = new Blob([texto]).size
    if (nos.has(p)) nos.set(p, { ...nos.get(p), size: tamanho, mtime: Date.now() })
    else inserir(novoNo(p, false, tamanho, Date.now()))
    salvar()
  },

  async readBytes(path) {
    const p = normalize(path)
    const no = nos.get(p)
    if (!no || no.isDir) return null

    // 1. Bytes gravados de verdade (saída de um .zip, extração, PDF gerado).
    if (binarios.has(p)) return binarios.get(p)

    // 2. Texto que existe de verdade na demonstração.
    if (textos.has(p)) return new TextEncoder().encode(textos.get(p))

    // 3. Imagem: materializa um JPEG DE VERDADE a partir do mesmo degradê
    //    determinístico da miniatura. É o que permite testar "virar PDF" no
    //    PC — com bytes falsos o gerador não teria o que decodificar.
    if (EXTS_IMAGEM.has(no.ext)) {
      const jpeg = await jpegSintetico(p)
      if (jpeg) return jpeg
    }

    // 4. Qualquer outro arquivo: um bilhete explicando o que ele é.
    //    NÃO se inventa 300 MB de lixo pra bater com o tamanho declarado —
    //    isso estouraria a memória e mentiria duas vezes.
    return new TextEncoder().encode(
      `Este arquivo faz parte da DEMONSTRAÇÃO do Acervo.\n\n` +
        `Nome original: ${no.name}\n` +
        `Tamanho declarado: ${no.size} bytes\n\n` +
        `Na demonstração do PC os arquivos têm nome, tamanho e data, mas não têm\n` +
        `conteúdo. Instalado no celular, este mesmo app leva o arquivo de verdade.\n`
    )
  },

  async writeBytes(path, bytes) {
    const p = normalize(path)
    const dir = parentOf(p)
    if (!nos.has(dir)) {
      const segs = normalize(dir).split('/').filter(Boolean)
      let acc = ''
      for (const s of segs) {
        acc += '/' + s
        if (!nos.has(acc)) inserir(novoNo(acc, true, 0, Date.now()))
      }
    }
    const copia = new Uint8Array(bytes)
    binarios.set(p, copia)
    if (nos.has(p)) nos.set(p, { ...nos.get(p), size: copia.length, mtime: Date.now() })
    else inserir(novoNo(p, false, copia.length, Date.now()))
    // Binário NÃO vai pro localStorage: um .zip de 40 MB estouraria a cota na
    // hora. Ele vive só nesta sessão, e a interface avisa quando isso importa.
    salvar()
  },

  async previewUrl(path) {
    const no = nos.get(normalize(path))
    if (!no || no.isDir) return null
    return miniatura(no.path)
  },

  async storage() {
    let usado = 0
    for (const no of nos.values()) if (!no.isDir) usado += no.size
    // O aparelho tem sistema e apps ocupando espaço que este app não enxerga.
    // Somar um valor fixo evita a mentira de "128 GB, 12 GB usados".
    const sistema = 22 * 1024 * 1024 * 1024
    const total = CAPACIDADE
    const used = Math.min(total, usado + sistema)
    return { total, used, free: total - used, systemReserved: sistema, visible: usado }
  },
}
