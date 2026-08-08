/**
 * Voltar — uma regra só, para o botão físico do Android, o Esc do teclado e
 * o deslizar da borda.
 *
 * O problema que isto resolve: num app de arquivos, "voltar" tem quatro
 * significados empilhados, e o Android manda todos pelo MESMO botão. Sem
 * uma ordem explícita, o botão de voltar com uma folha aberta dentro da
 * pasta `Documentos/Contratos/2025` fechava o app inteiro — e o usuário
 * perdia o lugar em que estava.
 *
 * A ordem, do mais perto do dedo pro mais longe:
 *
 *   1. tem folha/diálogo aberto?     → fecha ele
 *   2. está dentro de uma subpasta?  → sobe UM nível
 *   3. está numa tela que não é o início? → volta pro início
 *   4. está no início?               → confirma antes de sair
 *
 * O passo 4 existe porque sair sem querer é a pior das saídas: você tocou
 * uma vez a mais e o app sumiu. Dois toques em 2 segundos é o padrão do
 * próprio Android, e a pessoa já conhece.
 */

import { useEffect, useRef } from 'react'
import { parentOf } from '../fs/util.js'

/* ── Pilha de camadas (folhas, diálogos, painéis) ──────────────────────── */

let sequencia = 0
const camadas = []

/**
 * Registra uma camada aberta. Devolve a função que a desregistra.
 *
 * Fica num módulo, e não num contexto React, de propósito: o ouvinte do
 * botão físico é registrado UMA vez no arranque e precisa enxergar a pilha
 * atual sem depender de re-render nenhum. Com contexto, o ouvinte veria a
 * pilha congelada do momento em que foi criado — o bug clássico de closure
 * velha, que só aparece no aparelho.
 */
export function abrirCamada(fechar) {
  const id = ++sequencia
  camadas.push({ id, fechar })
  return () => {
    const i = camadas.findIndex((c) => c.id === id)
    if (i >= 0) camadas.splice(i, 1)
  }
}

export function temCamadaAberta() {
  return camadas.length > 0
}

/** Fecha a camada mais de cima. `false` = não havia nenhuma. */
export function fecharCamadaDoTopo() {
  const topo = camadas[camadas.length - 1]
  if (!topo) return false
  try {
    topo.fechar()
  } catch {
    /* uma camada que explode ao fechar não pode travar o botão de voltar */
  }
  return true
}

/**
 * Hook de uso direto: registra enquanto `aberta` for verdadeiro.
 *
 * `aoFechar` entra por ref pra que trocar a função (o caso normal — ela é
 * recriada a cada render) não desregistre e registre a camada de novo,
 * o que a jogaria pro topo da pilha e inverteria a ordem de fechamento.
 */
export function useCamada(aberta, aoFechar) {
  const ref = useRef(aoFechar)
  ref.current = aoFechar
  useEffect(() => {
    if (!aberta) return undefined
    return abrirCamada(() => ref.current && ref.current())
  }, [aberta])
}

/* ── Para onde "voltar" leva ───────────────────────────────────────────── */

/**
 * O destino de voltar a partir de uma rota. `null` = já está na raiz.
 * Função pura de propósito: é testável sem navegador, e foi um teste de
 * unidade que pegou o caso de `/pastas` virar `/pastas` pra sempre.
 */
export function destinoDeVoltar(pathname) {
  if (pathname.startsWith('/pastas')) {
    const dentro = pathname.slice('/pastas'.length)
    if (dentro && dentro !== '/') {
      const pai = parentOf(dentro)
      return pai === '/' ? '/pastas' : '/pastas' + pai
    }
    // Já na raiz do navegador de pastas: o passo seguinte é o Início.
    return '/'
  }
  return pathname === '/' ? null : '/'
}

/* ── O botão físico do Android ─────────────────────────────────────────── */

/**
 * Liga o botão de voltar do aparelho na regra acima.
 *
 * Sem `App.addListener('backButton')` o Capacitor faz `history.back()` no
 * WebView — que, com HashRouter, ora anda pro lugar certo, ora sai do app,
 * dependendo de como a tela chegou ali. Assumir o evento é o que torna o
 * comportamento previsível.
 */
export function useVoltarDoAparelho({ pathname, navegar, aoSair }) {
  const estado = useRef({ pathname, navegar, aoSair })
  estado.current = { pathname, navegar, aoSair }

  useEffect(() => {
    let remover = null
    let vivo = true
    let ultimoPedidoDeSair = 0

    const tratar = () => {
      const { pathname: rota, navegar: ir, aoSair: sair } = estado.current

      if (fecharCamadaDoTopo()) return

      const destino = destinoDeVoltar(rota)
      if (destino) {
        ir(destino)
        return
      }

      // Raiz. Dois toques em 2 segundos pra sair.
      const agora = Date.now()
      if (agora - ultimoPedidoDeSair < 2000) sair(true)
      else {
        ultimoPedidoDeSair = agora
        sair(false)
      }
    }

    import('@capacitor/app')
      .then(({ App }) => {
        if (!vivo) return
        // `addListener` devolve promessa no Capacitor 7 — sem o await, o
        // `remove()` no desmonte chamaria método de uma promessa.
        return App.addListener('backButton', tratar).then((h) => {
          if (!vivo) h.remove()
          else remover = () => h.remove()
        })
      })
      .catch(() => {
        /* navegador do PC: não existe botão físico, e está tudo certo */
      })

    return () => {
      vivo = false
      if (remover) remover()
    }
  }, [])
}

/* ── Deslizar da borda esquerda ────────────────────────────────────────── */

const LARGURA_BORDA = 26 // px a partir da esquerda que iniciam o gesto
const DISTANCIA_MINIMA = 70 // px pra confirmar o voltar

/**
 * Deslizar da borda esquerda pra voltar — o gesto que todo Android tem.
 *
 * Usa Pointer Events, não Touch: assim o gesto também funciona com o mouse
 * na pré-visualização do PC e pode ser testado por uma bancada de navegador.
 * Um gesto que só existe no aparelho é um gesto que ninguém verifica.
 *
 * Recebe o ELEMENTO, não um `ref` — e isso não é detalhe de estilo. Com
 * `ref`, o efeito roda uma vez com `ref.current` ainda `null` (o app começa
 * na tela de "abrindo o armazenamento…", e a área de conteúdo só existe
 * depois) e NUNCA mais roda, porque a identidade do ref não muda. O gesto
 * ficava morto e nada acusava. Com o elemento em estado, o efeito roda de
 * novo no instante em que ele aparece.
 *
 * @param {HTMLElement|null} el  container que recebe o gesto
 * @param {() => void} aoVoltar
 * @param {boolean} ativo
 * @param {(px:number)=>void} [aoArrastar] px puxados, pra desenhar a dica
 */
export function useDeslizarParaVoltar(el, aoVoltar, ativo = true, aoArrastar) {
  const cb = useRef({ aoVoltar, aoArrastar })
  cb.current = { aoVoltar, aoArrastar }

  useEffect(() => {
    if (!el || !ativo) return undefined

    let id = null
    let x0 = 0
    let y0 = 0
    let valendo = false

    const aoDescer = (e) => {
      if (id !== null) return
      if (e.clientX - el.getBoundingClientRect().left > LARGURA_BORDA) return
      id = e.pointerId
      x0 = e.clientX
      y0 = e.clientY
      valendo = false
    }

    const aoMover = (e) => {
      if (e.pointerId !== id) return
      const dx = e.clientX - x0
      const dy = e.clientY - y0
      // Só assume o gesto quando o movimento é claramente horizontal —
      // senão ele rouba a rolagem vertical da lista, que é o uso principal.
      if (!valendo) {
        if (Math.abs(dy) > Math.abs(dx)) {
          id = null
          return
        }
        if (dx < 12) return
        valendo = true
      }
      cb.current.aoArrastar && cb.current.aoArrastar(Math.max(0, dx))
    }

    const aoSubir = (e) => {
      if (e.pointerId !== id) return
      const dx = e.clientX - x0
      id = null
      cb.current.aoArrastar && cb.current.aoArrastar(0)
      if (valendo && dx >= DISTANCIA_MINIMA) cb.current.aoVoltar()
      valendo = false
    }

    el.addEventListener('pointerdown', aoDescer, { passive: true })
    el.addEventListener('pointermove', aoMover, { passive: true })
    el.addEventListener('pointerup', aoSubir, { passive: true })
    el.addEventListener('pointercancel', aoSubir, { passive: true })
    return () => {
      el.removeEventListener('pointerdown', aoDescer)
      el.removeEventListener('pointermove', aoMover)
      el.removeEventListener('pointerup', aoSubir)
      el.removeEventListener('pointercancel', aoSubir)
    }
  }, [el, ativo])
}
