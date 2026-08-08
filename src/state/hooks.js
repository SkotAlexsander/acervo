/** Hooks de leitura do disco. Cada um cuida de carregamento, erro e cancelamento. */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from './AppContext.jsx'
import { sortEntries } from '../fs/util.js'
import { varrer, varrerComCache, tamanhoDaPasta, indiceGravado } from '../fs/scan.js'
import { listarLixeira } from '../fs/trash.js'
import { useVisivel } from './gestos.js'

/**
 * Lista uma pasta.
 * Recarrega sozinho quando `versao` muda (alguém mexeu em arquivo) ou quando
 * a ordenação muda.
 */
export function useDiretorio(path) {
  const { provider, versao, prefs } = useApp()
  const [estado, setEstado] = useState({ itens: [], carregando: true, erro: null })

  useEffect(() => {
    if (!provider) return
    let vivo = true
    setEstado((e) => ({ ...e, carregando: true, erro: null }))
    provider
      .list(path)
      .then((itens) => vivo && setEstado({ itens, carregando: false, erro: null }))
      .catch((e) =>
        vivo && setEstado({ itens: [], carregando: false, erro: (e && e.message) || 'Erro ao ler a pasta.' })
      )
    return () => {
      vivo = false
    }
  }, [provider, path, versao])

  const itens = useMemo(() => {
    const visiveis = prefs.mostrarOcultos
      ? estado.itens
      : estado.itens.filter((i) => !i.name.startsWith('.'))
    return sortEntries(visiveis, prefs.ordem, prefs.ordemDesc)
  }, [estado.itens, prefs.ordem, prefs.ordemDesc, prefs.mostrarOcultos])

  return { ...estado, itens, brutos: estado.itens }
}

/**
 * Varre a árvore inteira. É a operação cara do app — por isso tem cache,
 * progresso e cancelamento de verdade.
 */
export function useVarredura(ativo) {
  const { provider, versao, prefs } = useApp()
  const [estado, setEstado] = useState({
    arquivos: [],
    pastas: [],
    carregando: false,
    progresso: 0,
    parciais: false,
    pronto: false,
    doRascunho: false,
  })
  const sinalRef = useRef(null)

  useEffect(() => {
    if (!provider || ativo === false) return
    let vivo = true
    const sinal = { cancelado: false }
    sinalRef.current = sinal

    // Mostra o índice gravado NA HORA, e varre de verdade por trás.
    // Sem isso, abrir a Limpeza num celular cheio é olhar pra uma barra de
    // progresso por vinte segundos toda santa vez.
    const rascunho = indiceGravado(provider.id)
    if (rascunho && rascunho.arquivos.length) {
      setEstado({
        arquivos: rascunho.arquivos,
        pastas: rascunho.pastas,
        carregando: true,
        progresso: rascunho.arquivos.length,
        parciais: false,
        pronto: true,
        doRascunho: true,
      })
    } else {
      setEstado((e) => ({ ...e, carregando: true, progresso: 0, pronto: false, doRascunho: false }))
    }

    varrerComCache(provider, {
      sinal,
      incluirOcultos: prefs.mostrarOcultos,
      onProgresso: (n) => vivo && setEstado((e) => ({ ...e, progresso: n })),
    })
      .then((r) => {
        if (!vivo || sinal.cancelado) return
        setEstado({
          arquivos: r.arquivos,
          pastas: r.pastas,
          carregando: false,
          progresso: r.arquivos.length,
          parciais: r.parciais,
          pronto: true,
          doRascunho: false,
        })
      })
      .catch(() => vivo && setEstado((e) => ({ ...e, carregando: false, pronto: true })))

    return () => {
      vivo = false
      sinal.cancelado = true
    }
  }, [provider, versao, ativo, prefs.mostrarOcultos])

  return estado
}

/** Varredura sem cache, pra uma sub-árvore específica (usado na busca dentro de pasta). */
export function useVarreduraDe(raiz, ativo) {
  const { provider, versao, prefs } = useApp()
  const [estado, setEstado] = useState({ arquivos: [], pastas: [], carregando: false })

  useEffect(() => {
    if (!provider || !ativo) return
    let vivo = true
    const sinal = { cancelado: false }
    setEstado({ arquivos: [], pastas: [], carregando: true })
    varrer(provider, { raiz, sinal, incluirOcultos: prefs.mostrarOcultos })
      .then((r) => vivo && setEstado({ arquivos: r.arquivos, pastas: r.pastas, carregando: false }))
      .catch(() => vivo && setEstado({ arquivos: [], pastas: [], carregando: false }))
    return () => {
      vivo = false
      sinal.cancelado = true
    }
  }, [provider, raiz, ativo, versao, prefs.mostrarOcultos])

  return estado
}

export function useArmazenamento() {
  const { provider, versao } = useApp()
  const [info, setInfo] = useState(null)
  useEffect(() => {
    if (!provider) return
    let vivo = true
    provider
      .storage()
      .then((i) => vivo && setInfo(i))
      .catch(() => vivo && setInfo(null))
    return () => {
      vivo = false
    }
  }, [provider, versao])
  return info
}

export function useLixeira() {
  const { provider, versao } = useApp()
  const [estado, setEstado] = useState({ itens: [], carregando: true })
  useEffect(() => {
    if (!provider) return
    let vivo = true
    setEstado((e) => ({ ...e, carregando: true }))
    listarLixeira(provider)
      .then((itens) => vivo && setEstado({ itens, carregando: false }))
      .catch(() => vivo && setEstado({ itens: [], carregando: false }))
    return () => {
      vivo = false
    }
  }, [provider, versao])
  return estado
}

// ─── Caches de cálculo caro ──────────────────────────────────────────────────
// Guardados fora do React de propósito: sobrevivem ao desmontar da linha, que
// é exatamente o que acontece o tempo todo numa lista que rola.

const cacheMiniatura = new Map()
const cacheTamanhoPasta = new Map()
let selo = '' // provider + versão dos dados; muda = tudo que está guardado venceu

function conferirSelo(provider, versao) {
  const atual = `${provider ? provider.id : '-'}#${versao}`
  if (atual !== selo) {
    selo = atual
    cacheMiniatura.clear()
    cacheTamanhoPasta.clear()
  }
}

/**
 * Miniatura de um arquivo.
 *
 * Com cache: sem ele, rolar a grade pra baixo e voltar refazia a chamada de
 * cada imagem. No mock isso é barato; no aparelho é uma ida à camada nativa
 * por linha, e a rolagem sente.
 */
export function useMiniatura(path, ativo) {
  const { provider, versao } = useApp()
  const [url, setUrl] = useState(() => cacheMiniatura.get(path) || null)

  useEffect(() => {
    if (!provider || !path || ativo === false) {
      setUrl(null)
      return
    }
    conferirSelo(provider, versao)
    if (cacheMiniatura.has(path)) {
      setUrl(cacheMiniatura.get(path))
      return
    }
    let vivo = true
    provider
      .previewUrl(path)
      .then((u) => {
        cacheMiniatura.set(path, u)
        if (vivo) setUrl(u)
      })
      .catch(() => vivo && setUrl(null))
    return () => {
      vivo = false
    }
  }, [provider, path, ativo, versao])

  return url
}

// Fila com limite de simultaneidade. Medir o tamanho de uma pasta é descer a
// árvore inteira dela; disparar 80 de uma vez congela a interface.
const fila = []
let rodando = 0
const LIMITE_SIMULTANEO = 3

function enfileirar(tarefa) {
  return new Promise((resolve, reject) => {
    fila.push({ tarefa, resolve, reject })
    girar()
  })
}

function girar() {
  while (rodando < LIMITE_SIMULTANEO && fila.length) {
    const { tarefa, resolve, reject } = fila.shift()
    rodando++
    tarefa()
      .then(resolve, reject)
      .finally(() => {
        rodando--
        girar()
      })
  }
}

/**
 * Tamanho de uma pasta, calculado só quando ela aparece na tela.
 *
 * O sistema de arquivos não guarda esse número — é preciso somar a árvore
 * inteira. Por isso: só para o que está à vista, no máximo três por vez,
 * e o resultado fica guardado.
 *
 * @returns {[React.RefObject, {bytes,qtdArquivos,qtdPastas}|null]} ref pra pendurar na linha
 */
export function useTamanhoPasta(path, ehPasta, ligado) {
  const { provider, versao } = useApp()
  const ativo = !!(ehPasta && ligado)
  const [ref, visivel] = useVisivel(ativo)
  const [dados, setDados] = useState(() => cacheTamanhoPasta.get(path) || null)

  useEffect(() => {
    if (!provider || !ativo || !visivel) return
    conferirSelo(provider, versao)
    const guardado = cacheTamanhoPasta.get(path)
    if (guardado) {
      setDados(guardado)
      return
    }
    let vivo = true
    const sinal = { cancelado: false }
    enfileirar(() => tamanhoDaPasta(provider, path, sinal))
      .then((r) => {
        if (sinal.cancelado) return
        cacheTamanhoPasta.set(path, r)
        if (vivo) setDados(r)
      })
      .catch(() => {})
    return () => {
      vivo = false
      // Saiu da tela antes de terminar: para de descer a árvore. Rolar rápido
      // por uma lista longa não pode deixar 60 varreduras órfãs correndo.
      sinal.cancelado = true
    }
  }, [provider, path, ativo, visivel, versao])

  return [ref, dados]
}

/** Debounce simples — segura a busca até a digitação parar. */
export function useAtraso(valor, ms) {
  const [v, setV] = useState(valor)
  useEffect(() => {
    const t = setTimeout(() => setV(valor), ms || 220)
    return () => clearTimeout(t)
  }, [valor, ms])
  return v
}
