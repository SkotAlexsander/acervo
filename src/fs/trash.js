/**
 * Lixeira.
 *
 * Um organizador de arquivos que apaga de vez no primeiro toque é uma
 * armadilha. Aqui "excluir" move pra uma pasta oculta e anota de onde veio;
 * apagar pra sempre é uma segunda decisão, tomada em outra tela.
 *
 * Funciona igual no PC e no celular porque só usa o contrato do provider
 * (move / mkdir / remove / readText / writeText) — nada específico de plataforma.
 */

import { join, baseName, parentOf, normalize } from './util.js'

export const PASTA_LIXEIRA = '/.Acervo/Lixeira'
const MANIFESTO = '/.Acervo/lixeira.json'

async function lerManifesto(provider) {
  try {
    const txt = await provider.readText(MANIFESTO)
    if (!txt) return []
    const dados = JSON.parse(txt)
    return Array.isArray(dados) ? dados : []
  } catch {
    return []
  }
}

async function gravarManifesto(provider, itens) {
  await provider.writeText(MANIFESTO, JSON.stringify(itens))
}

async function garantirPasta(provider) {
  const info = await provider.stat(PASTA_LIXEIRA)
  if (info && info.isDir) return
  const partes = PASTA_LIXEIRA.split('/').filter(Boolean)
  let pai = '/'
  for (const parte of partes) {
    const alvo = join(pai, parte)
    const existe = await provider.stat(alvo)
    if (!existe) await provider.mkdir(pai, parte)
    pai = alvo
  }
}

let contador = 0
function novoId() {
  contador += 1
  return `${Date.now().toString(36)}-${contador.toString(36)}`
}

/**
 * Manda itens pra lixeira.
 * @returns {Promise<{movidos: number, erros: string[]}>}
 */
export async function paraLixeira(provider, paths) {
  await garantirPasta(provider)
  const manifesto = await lerManifesto(provider)
  const erros = []
  let movidos = 0

  for (const bruto of paths) {
    const p = normalize(bruto)
    if (p.startsWith(PASTA_LIXEIRA)) continue
    const info = await provider.stat(p)
    if (!info) {
      erros.push(`"${baseName(p)}" já não existe.`)
      continue
    }
    try {
      const [destino] = await provider.move([p], PASTA_LIXEIRA)
      manifesto.push({
        id: novoId(),
        nome: info.name,
        // Onde ele está agora (o move pode ter renumerado o nome).
        atual: destino,
        // Pra onde ele volta.
        origem: parentOf(p),
        caminhoOriginal: p,
        isDir: info.isDir,
        size: info.size || 0,
        mtime: info.mtime || 0,
        apagadoEm: Date.now(),
      })
      movidos++
    } catch (e) {
      erros.push(`"${info.name}": ${(e && e.message) || 'não consegui mover'}`)
    }
  }
  await gravarManifesto(provider, manifesto)
  return { movidos, erros }
}

/**
 * O que está na lixeira. Cruza o manifesto com a realidade: se o arquivo sumiu
 * por fora (outro app apagou), a linha some do manifesto em vez de virar
 * um item fantasma que não abre.
 */
export async function listarLixeira(provider) {
  const manifesto = await lerManifesto(provider)
  const vivos = []
  let mudou = false
  for (const item of manifesto) {
    const info = await provider.stat(item.atual)
    if (info) vivos.push({ ...item, size: info.isDir ? item.size : info.size })
    else mudou = true
  }
  if (mudou) await gravarManifesto(provider, vivos)
  return vivos.sort((a, b) => b.apagadoEm - a.apagadoEm)
}

/** Devolve itens pro lugar de onde vieram. Se a pasta original sumiu, recria. */
export async function restaurar(provider, ids) {
  const manifesto = await lerManifesto(provider)
  const alvo = new Set(ids)
  const restantes = []
  const erros = []
  let restaurados = 0

  for (const item of manifesto) {
    if (!alvo.has(item.id)) {
      restantes.push(item)
      continue
    }
    try {
      const destino = await garantirCaminho(provider, item.origem)
      await provider.move([item.atual], destino)
      restaurados++
    } catch (e) {
      erros.push(`"${item.nome}": ${(e && e.message) || 'não consegui restaurar'}`)
      restantes.push(item)
    }
  }
  await gravarManifesto(provider, restantes)
  return { restaurados, erros }
}

/** Cria a cadeia de pastas de um caminho, se faltar. Devolve o caminho final. */
async function garantirCaminho(provider, path) {
  const p = normalize(path)
  if (p === '/') return '/'
  const info = await provider.stat(p)
  if (info && info.isDir) return p
  const partes = p.split('/').filter(Boolean)
  let pai = '/'
  for (const parte of partes) {
    const alvo = join(pai, parte)
    const existe = await provider.stat(alvo)
    if (!existe) {
      const criado = await provider.mkdir(pai, parte)
      pai = criado
    } else {
      pai = alvo
    }
  }
  return pai
}

/** Apaga de vez. Sem `ids`, esvazia a lixeira inteira. */
export async function apagarDeVez(provider, ids) {
  const manifesto = await lerManifesto(provider)
  const alvo = ids ? new Set(ids) : null
  const aApagar = alvo ? manifesto.filter((i) => alvo.has(i.id)) : manifesto
  const restantes = alvo ? manifesto.filter((i) => !alvo.has(i.id)) : []

  if (aApagar.length) {
    await provider.remove(aApagar.map((i) => i.atual))
  }
  await gravarManifesto(provider, restantes)
  return { apagados: aApagar.length }
}

/** Quantos itens e quantos bytes a lixeira está segurando. */
export function resumoLixeira(itens) {
  return {
    qtd: itens.length,
    bytes: itens.reduce((s, i) => s + (i.size || 0), 0),
  }
}
