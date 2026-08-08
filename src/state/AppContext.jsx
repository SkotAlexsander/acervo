/**
 * O estado que o app inteiro compartilha: quem é o provider, as preferências,
 * a área de transferência de arquivos, os avisos e a versão dos dados.
 *
 * `versao` é o truque que mantém tudo em sincronia: qualquer operação que
 * mexe em arquivo chama `mudou()`, o número sobe, e toda tela que depende do
 * disco recarrega. Sem isso, você renomeia numa tela e a outra continua
 * mostrando o nome velho.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { obterProvider, resetarDemonstracao } from '../fs/index.js'
import { invalidarCache } from '../fs/scan.js'
import * as prefsStore from './prefs.js'

const Ctx = createContext(null)

export function useApp() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp() precisa estar dentro de <AppProvider>')
  return v
}

let idAviso = 0

export function AppProvider({ children }) {
  const [provider, setProvider] = useState(null)
  const [erroInicial, setErroInicial] = useState(null)
  const [avisoProvider, setAvisoProvider] = useState(null)
  const [prefs, setPrefs] = useState(() => prefsStore.ler())
  const [versao, setVersao] = useState(0)
  const [avisos, setAvisos] = useState([])
  const [transferencia, setTransferencia] = useState(null) // {modo:'mover'|'copiar', paths:[]}
  const timers = useRef(new Map())

  // ── Arranque ───────────────────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true
    obterProvider()
      .then(({ provider: p, aviso }) => {
        if (!vivo) return
        setProvider(p)
        if (aviso) setAvisoProvider(aviso)
      })
      .catch((e) => vivo && setErroInicial((e && e.message) || 'Falha ao iniciar.'))
    return () => {
      vivo = false
    }
  }, [])

  // ── Tema e efeitos ─────────────────────────────────────────────────────────
  useEffect(() => {
    prefsStore.aplicarTema(prefs.tema)
    prefsStore.aplicarEfeitos(prefs.efeitos)
    prefsStore.gravar(prefs)
  }, [prefs])

  // Tema 'sistema' precisa reagir quando o Windows/Android troca de modo.
  useEffect(() => {
    if (prefs.tema !== 'sistema') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const aoTrocar = () => prefsStore.aplicarTema('sistema')
    mq.addEventListener('change', aoTrocar)
    return () => mq.removeEventListener('change', aoTrocar)
  }, [prefs.tema])

  // ── Avisos (toasts) ────────────────────────────────────────────────────────
  const fecharAviso = useCallback((id) => {
    setAvisos((a) => a.filter((x) => x.id !== id))
    const t = timers.current.get(id)
    if (t) {
      clearTimeout(t)
      timers.current.delete(id)
    }
  }, [])

  const avisar = useCallback(
    (texto, tipo, acao) => {
      const id = ++idAviso
      setAvisos((a) => [...a.slice(-2), { id, texto, tipo: tipo || 'info', acao }])
      const ms = tipo === 'erro' ? 6000 : acao ? 7000 : 3500
      const t = setTimeout(() => fecharAviso(id), ms)
      timers.current.set(id, t)
      return id
    },
    [fecharAviso]
  )

  // Ao desmontar, mata os timers pendentes — senão o React reclama de
  // setState em componente que já saiu.
  useEffect(() => {
    const mapa = timers.current
    return () => {
      for (const t of mapa.values()) clearTimeout(t)
      mapa.clear()
    }
  }, [])

  // ── Sincronia depois de mexer em arquivo ───────────────────────────────────
  const mudou = useCallback(() => {
    invalidarCache()
    setVersao((v) => v + 1)
  }, [])

  // ── Preferências ───────────────────────────────────────────────────────────
  const definirPref = useCallback((chave, valor) => {
    setPrefs((p) => ({ ...p, [chave]: typeof valor === 'function' ? valor(p[chave]) : valor }))
  }, [])

  const alternarFavorito = useCallback(
    (path) => {
      setPrefs((p) => {
        const tem = p.favoritos.includes(path)
        return { ...p, favoritos: tem ? p.favoritos.filter((f) => f !== path) : [...p.favoritos, path] }
      })
      return true
    },
    []
  )

  const registrarVisita = useCallback((path) => {
    if (!path || path === '/') return
    setPrefs((p) => {
      if (p.recentes[0] === path) return p
      const lista = [path, ...p.recentes.filter((r) => r !== path)].slice(0, 12)
      return { ...p, recentes: lista }
    })
  }, [])

  // ── Ações de arquivo, com aviso e sincronia embutidos ──────────────────────
  // Toda tela chama estas, nunca o provider direto. É o que garante que
  // nenhuma operação esqueça de invalidar o cache ou de avisar o usuário.
  const executar = useCallback(
    async (fn, msgSucesso) => {
      try {
        const r = await fn()
        mudou()
        if (msgSucesso) avisar(typeof msgSucesso === 'function' ? msgSucesso(r) : msgSucesso, 'ok')
        return { ok: true, resultado: r }
      } catch (e) {
        avisar((e && e.message) || 'Não deu certo.', 'erro')
        return { ok: false, erro: e }
      }
    },
    [avisar, mudou]
  )

  const restaurarDemo = useCallback(async () => {
    await resetarDemonstracao()
    mudou()
    avisar('Dados de demonstração restaurados.', 'ok')
  }, [avisar, mudou])

  const valor = useMemo(
    () => ({
      provider,
      pronto: !!provider,
      erroInicial,
      avisoProvider,
      dispensarAvisoProvider: () => setAvisoProvider(null),
      prefs,
      definirPref,
      alternarFavorito,
      registrarVisita,
      versao,
      mudou,
      avisos,
      avisar,
      fecharAviso,
      executar,
      transferencia,
      setTransferencia,
      restaurarDemo,
    }),
    [
      provider,
      erroInicial,
      avisoProvider,
      prefs,
      definirPref,
      alternarFavorito,
      registrarVisita,
      versao,
      mudou,
      avisos,
      avisar,
      fecharAviso,
      executar,
      transferencia,
      restaurarDemo,
    ]
  )

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}
