/**
 * Varredura da árvore — o que alimenta Categorias, Busca e Limpeza.
 *
 * Navegar uma pasta é barato (uma chamada). Responder "quantas imagens tem no
 * celular inteiro" não é: exige descer a árvore toda. Por isso a varredura
 * roda uma vez, guarda o resultado, e só refaz quando alguma coisa muda.
 */

import { normalize, join, kindOf, fold, baseName } from './util.js'

/** Pastas que a varredura nunca abre. */
const IGNORAR = new Set([
  'Android', // data/obb: milhares de arquivos de app, ilegíveis e intocáveis
  '.Acervo', // a nossa própria lixeira
  '.thumbnails',
  '.trashed',
  'LOST.DIR',
])

const cache = {
  arquivos: null,
  pastas: null,
  carregadoEm: 0,
  provider: null,
}

export function invalidarCache() {
  cache.arquivos = null
  cache.pastas = null
  cache.carregadoEm = 0
  apagarIndiceGravado()
}

// ─── Índice gravado em disco ─────────────────────────────────────────────────
/*
  A varredura em memória morre quando o app fecha. Num armazenamento real de
  20 mil arquivos isso significa esperar a cada abertura, e é a espera que faz
  um app de arquivos parecer lento.

  A solução aqui é *mostrar o velho enquanto lê o novo*: o índice gravado
  aparece na hora, a varredura de verdade roda por trás, e o resultado é
  trocado quando termina. Se nada mudou, você não vê a troca acontecer.

  Honestidade: o índice gravado PODE estar velho — outro app apagou uma foto,
  a câmera gravou um vídeo. Por isso ele nunca é a resposta final, só o
  primeiro rascunho, e sempre existe uma varredura de verdade atrás dele.
*/

const CHAVE_INDICE = 'acervo.indice.v1'
const VALIDADE_MS = 24 * 60 * 60 * 1000 // um dia: passou disso, nem mostra o rascunho

function gravarIndice(providerId, arquivos, pastas) {
  try {
    // Formato posicional (array de arrays), não objetos: o mesmo dado ocupa
    // ~40% menos, e o localStorage tem 5 MB no total.
    const enxugar = (e) => [e.path, e.size || 0, e.mtime || 0]
    const dados = {
      v: 1,
      provider: providerId,
      em: Date.now(),
      arquivos: arquivos.map(enxugar),
      pastas: pastas.map((p) => p.path),
    }
    localStorage.setItem(CHAVE_INDICE, JSON.stringify(dados))
  } catch {
    // Cota estourada (índice grande demais). O app segue normal, só sem o
    // atalho de abertura — não é motivo pra falhar nada.
    apagarIndiceGravado()
  }
}

function apagarIndiceGravado() {
  try {
    localStorage.removeItem(CHAVE_INDICE)
  } catch {
    /* modo anônimo */
  }
}

function lerIndice(providerId) {
  let bruto
  try {
    bruto = localStorage.getItem(CHAVE_INDICE)
  } catch {
    return null
  }
  if (!bruto) return null
  try {
    const d = JSON.parse(bruto)
    if (!d || d.v !== 1 || d.provider !== providerId) return null
    if (Date.now() - d.em > VALIDADE_MS) return null
    const engordar = ([path, size, mtime]) => {
      const nome = path.slice(path.lastIndexOf('/') + 1)
      const i = nome.lastIndexOf('.')
      return {
        path,
        name: nome,
        isDir: false,
        size,
        mtime,
        ext: i > 0 ? nome.slice(i + 1).toLowerCase() : '',
      }
    }
    return {
      arquivos: (d.arquivos || []).map(engordar),
      pastas: (d.pastas || []).map((path) => ({
        path,
        name: path.slice(path.lastIndexOf('/') + 1),
        isDir: true,
        size: 0,
        mtime: 0,
        ext: '',
      })),
      em: d.em,
    }
  } catch {
    return null
  }
}

/** O rascunho gravado, se existir e ainda valer. Devolve null quando não. */
export function indiceGravado(providerId) {
  return lerIndice(providerId)
}

/**
 * Desce a árvore inteira a partir de `raiz`.
 * @param {object} provider
 * @param {object} [opts] { raiz, onProgresso(qtd), sinal: {cancelado:boolean}, incluirOcultos }
 * @returns {Promise<{arquivos: object[], pastas: object[], parciais: boolean}>}
 */
export async function varrer(provider, opts) {
  const o = opts || {}
  const raiz = normalize(o.raiz || '/')
  const sinal = o.sinal || { cancelado: false }
  const arquivos = []
  const pastas = []
  const fila = [raiz]
  const vistos = new Set([raiz])
  let parciais = false
  let desdeUltimoAviso = 0

  while (fila.length) {
    if (sinal.cancelado) return { arquivos, pastas, parciais: true }
    const dir = fila.shift()
    let itens
    try {
      itens = await provider.list(dir)
    } catch {
      // Pasta sem permissão (comum no Android). Registra e segue —
      // não é motivo pra abortar a varredura inteira.
      parciais = true
      continue
    }
    for (const item of itens) {
      const oculto = item.name.startsWith('.')
      if (oculto && !o.incluirOcultos) continue
      if (item.isDir) {
        if (IGNORAR.has(item.name)) continue
        pastas.push(item)
        if (!vistos.has(item.path)) {
          vistos.add(item.path)
          fila.push(item.path)
        }
      } else {
        arquivos.push(item)
      }
    }
    desdeUltimoAviso += itens.length
    if (o.onProgresso && desdeUltimoAviso >= 200) {
      desdeUltimoAviso = 0
      o.onProgresso(arquivos.length)
      // Devolve o fio pro navegador pra interface não travar.
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  return { arquivos, pastas, parciais }
}

/** Varredura com cache. Chame `invalidarCache()` depois de qualquer alteração. */
export async function varrerComCache(provider, opts) {
  if (cache.arquivos && cache.provider === provider.id) {
    return { arquivos: cache.arquivos, pastas: cache.pastas, parciais: false, doCache: true }
  }
  const r = await varrer(provider, opts)
  if (!(opts && opts.sinal && opts.sinal.cancelado)) {
    cache.arquivos = r.arquivos
    cache.pastas = r.pastas
    cache.provider = provider.id
    cache.carregadoEm = Date.now()
    gravarIndice(provider.id, r.arquivos, r.pastas)
  }
  return { ...r, doCache: false }
}

// ─── Consultas sobre o resultado da varredura ────────────────────────────────

/** Conta e soma bytes por categoria. */
export function resumoPorCategoria(arquivos) {
  const out = {}
  for (const a of arquivos) {
    const k = kindOf(a)
    if (!out[k]) out[k] = { id: k, qtd: 0, bytes: 0 }
    out[k].qtd++
    out[k].bytes += a.size || 0
  }
  return out
}

export function filtrarPorCategoria(arquivos, kind) {
  return arquivos.filter((a) => kindOf(a) === kind)
}

/**
 * Busca por nome. Ordena por relevância: quem começa com o termo vem antes de
 * quem só o contém — é o que a mão espera ao digitar as primeiras letras.
 */
export function buscar(itens, consulta, limite) {
  const q = fold(consulta).trim()
  if (!q) return []
  const exatos = []
  const inicio = []
  const meio = []
  for (const item of itens) {
    const n = fold(item.name)
    // O acerto exato precisa comparar SEM a extensão. Ninguém digita
    // "contrato.pdf" pra achar o contrato — digita "contrato", e antes disso
    // o balde de exatos nunca disparava pra arquivo nenhum.
    const semExt = item.ext ? n.slice(0, n.length - item.ext.length - 1) : n
    if (n === q || semExt === q) exatos.push(item)
    else if (n.startsWith(q)) inicio.push(item)
    else if (n.includes(q)) meio.push(item)
  }
  const r = [...exatos, ...inicio, ...meio]
  return limite ? r.slice(0, limite) : r
}

// ─── Limpeza ─────────────────────────────────────────────────────────────────

/**
 * Duplicados prováveis: mesmo nome-base E mesmo tamanho, em caminhos diferentes.
 *
 * Honestidade: isto NÃO compara o conteúdo. Dois arquivos com nome e tamanho
 * idênticos são quase sempre o mesmo arquivo, mas "quase sempre" não é "sempre" —
 * por isso a tela chama de "prováveis" e nunca apaga sozinha.
 */
export function acharDuplicados(arquivos) {
  const grupos = new Map()
  for (const a of arquivos) {
    if (!a.size) continue // 0 byte cai na lista de vazios, não na de duplicados
    const chave = fold(a.name) + '|' + a.size
    if (!grupos.has(chave)) grupos.set(chave, [])
    grupos.get(chave).push(a)
  }
  const out = []
  for (const [chave, itens] of grupos) {
    if (itens.length < 2) continue
    const ordenados = [...itens].sort((x, y) => (x.mtime || 0) - (y.mtime || 0))
    out.push({
      chave,
      nome: ordenados[0].name,
      tamanho: ordenados[0].size,
      itens: ordenados,
      // O mais antigo é o "original"; o resto é o que dá pra recuperar.
      recuperavel: ordenados[0].size * (ordenados.length - 1),
    })
  }
  return out.sort((a, b) => b.recuperavel - a.recuperavel)
}

export function acharGrandes(arquivos, minBytes) {
  const min = minBytes || 100 * 1024 * 1024
  return arquivos.filter((a) => (a.size || 0) >= min).sort((a, b) => b.size - a.size)
}

export function acharVazios(arquivos) {
  return arquivos.filter((a) => !a.size)
}

export function acharAntigos(arquivos, dias, agora) {
  const corte = (agora || Date.now()) - (dias || 365) * 86400000
  return arquivos
    .filter((a) => a.mtime && a.mtime < corte && (a.size || 0) > 0)
    .sort((a, b) => (a.mtime || 0) - (b.mtime || 0))
}

/** Pastas sem nenhum filho — ficam pra trás quando você move as coisas. */
export async function acharPastasVazias(provider, pastas, sinal) {
  const out = []
  for (const p of pastas) {
    if (sinal && sinal.cancelado) break
    try {
      const filhos = await provider.list(p.path)
      if (filhos.length === 0) out.push(p)
    } catch {
      /* sem permissão: ignora */
    }
  }
  return out
}

/** Soma o tamanho de uma pasta descendo a árvore dela. */
export async function tamanhoDaPasta(provider, path, sinal) {
  let bytes = 0
  let qtdArquivos = 0
  let qtdPastas = 0
  const fila = [normalize(path)]
  while (fila.length) {
    if (sinal && sinal.cancelado) break
    const dir = fila.pop()
    let itens
    try {
      itens = await provider.list(dir)
    } catch {
      continue
    }
    for (const i of itens) {
      if (i.isDir) {
        qtdPastas++
        fila.push(i.path)
      } else {
        qtdArquivos++
        bytes += i.size || 0
      }
    }
  }
  return { bytes, qtdArquivos, qtdPastas }
}

export { join, baseName }
