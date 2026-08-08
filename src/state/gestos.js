/**
 * Gestos de dedo: toque longo e puxar pra atualizar.
 *
 * Os dois usam eventos de PONTEIRO, não de toque. `pointerdown`/`pointermove`
 * funcionam igual pra dedo, caneta e mouse — o que permite testar os dois
 * gestos no navegador do PC antes de existir um celular na história.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const DESISTIR_APOS_PX = 10 // arrastou mais que isso: era rolagem, não toque longo
const SEGURAR_MS = 420

/**
 * Toque longo — o gesto que entra no modo de seleção.
 *
 * Três cuidados que decidem se ele parece nativo ou quebrado:
 *  · rolar cancela. Sem isso, deslizar a lista seleciona itens sem querer.
 *  · o clique seguinte é engolido. Sem isso, soltar o dedo abre a pasta que
 *    você acabou de selecionar.
 *  · vibra 12ms quando dispara, se o aparelho souber vibrar. É o retorno que
 *    diz "o gesto pegou" sem precisar olhar.
 */
export function useToqueLongo(aoDisparar, ativo = true) {
  const temporizador = useRef(null)
  const origem = useRef(null)
  const disparou = useRef(false)

  const cancelar = useCallback(() => {
    if (temporizador.current) {
      clearTimeout(temporizador.current)
      temporizador.current = null
    }
    origem.current = null
  }, [])

  useEffect(() => cancelar, [cancelar])

  const aoApertar = useCallback(
    (e) => {
      if (!ativo || !aoDisparar) return
      // Botão direito do mouse já tem o menu de contexto; não duplicar.
      if (e.pointerType === 'mouse' && e.button !== 0) return
      disparou.current = false
      origem.current = { x: e.clientX, y: e.clientY }
      temporizador.current = setTimeout(() => {
        temporizador.current = null
        disparou.current = true
        if (navigator.vibrate) {
          try {
            navigator.vibrate(12)
          } catch {
            /* alguns navegadores exigem gesto anterior; falhar aqui é irrelevante */
          }
        }
        aoDisparar()
      }, SEGURAR_MS)
    },
    [ativo, aoDisparar]
  )

  const aoMover = useCallback(
    (e) => {
      if (!origem.current || !temporizador.current) return
      const dx = Math.abs(e.clientX - origem.current.x)
      const dy = Math.abs(e.clientY - origem.current.y)
      if (dx > DESISTIR_APOS_PX || dy > DESISTIR_APOS_PX) cancelar()
    },
    [cancelar]
  )

  /** Chame no início do onClick: `if (consumiuOClique()) return`. */
  const consumiuOClique = useCallback(() => {
    if (!disparou.current) return false
    disparou.current = false
    return true
  }, [])

  return {
    handlers: {
      onPointerDown: aoApertar,
      onPointerMove: aoMover,
      onPointerUp: cancelar,
      onPointerCancel: cancelar,
      onPointerLeave: cancelar,
    },
    consumiuOClique,
  }
}

const PUXAR_LIMITE = 72 // distância que arma a atualização
const PUXAR_MAX = 110 // até onde o indicador acompanha o dedo

/**
 * Puxar pra atualizar.
 *
 * Só arma quando a lista já está no topo — senão brigaria com a rolagem.
 * O deslocamento é amortecido (raiz quadrada): o indicador acompanha o dedo
 * no começo e vai ficando "pesado", que é o que faz o gesto parecer físico
 * em vez de um contador subindo.
 */
export function usePuxarParaAtualizar(refDoContainer, aoAtualizar) {
  const [puxada, setPuxada] = useState(0)
  const [atualizando, setAtualizando] = useState(false)
  const inicioY = useRef(null)
  const armado = useRef(false)

  useEffect(() => {
    const el = refDoContainer.current
    if (!el || !aoAtualizar) return

    const aoApertar = (e) => {
      if (e.pointerType === 'mouse') return // no PC não existe esse gesto
      if (el.scrollTop > 1 || atualizando) return
      inicioY.current = e.clientY
      armado.current = true
    }

    const aoMover = (e) => {
      if (!armado.current || inicioY.current == null) return
      const bruto = e.clientY - inicioY.current
      if (bruto <= 0) {
        setPuxada(0)
        return
      }
      // Se a lista saiu do topo no meio do gesto, desiste.
      if (el.scrollTop > 1) {
        armado.current = false
        setPuxada(0)
        return
      }
      const amortecido = Math.min(PUXAR_MAX, Math.sqrt(bruto) * 7)
      setPuxada(amortecido)
    }

    const aoSoltar = async () => {
      if (!armado.current) return
      armado.current = false
      inicioY.current = null
      const distancia = puxada
      setPuxada(0)
      if (distancia >= PUXAR_LIMITE && !atualizando) {
        setAtualizando(true)
        try {
          await aoAtualizar()
        } finally {
          // Um mínimo de tempo visível: atualização instantânea sem nenhum
          // sinal na tela passa a sensação de que nada aconteceu.
          setTimeout(() => setAtualizando(false), 420)
        }
      }
    }

    el.addEventListener('pointerdown', aoApertar, { passive: true })
    el.addEventListener('pointermove', aoMover, { passive: true })
    el.addEventListener('pointerup', aoSoltar)
    el.addEventListener('pointercancel', aoSoltar)
    return () => {
      el.removeEventListener('pointerdown', aoApertar)
      el.removeEventListener('pointermove', aoMover)
      el.removeEventListener('pointerup', aoSoltar)
      el.removeEventListener('pointercancel', aoSoltar)
    }
  }, [refDoContainer, aoAtualizar, puxada, atualizando])

  return {
    puxada,
    atualizando,
    armado: puxada >= PUXAR_LIMITE,
    limite: PUXAR_LIMITE,
  }
}

/**
 * "Este elemento está à vista?" — com UM observador compartilhado por todos.
 *
 * Um IntersectionObserver por linha numa lista de 80 é desperdício puro;
 * este mantém um só e distribui o resultado por callback.
 */
const observados = new WeakMap()
let observador = null

function pegarObservador() {
  if (observador || typeof IntersectionObserver === 'undefined') return observador
  observador = new IntersectionObserver(
    (entradas) => {
      for (const entrada of entradas) {
        const aviso = observados.get(entrada.target)
        if (aviso) aviso(entrada.isIntersecting)
      }
    },
    { rootMargin: '120px' }
  )
  return observador
}

export function useVisivel(ativo = true) {
  const ref = useRef(null)
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    const el = ref.current
    const obs = pegarObservador()
    if (!el || !ativo || !obs) {
      // Sem IntersectionObserver (WebView muito antigo), assume visível:
      // é melhor calcular demais do que nunca mostrar o dado.
      if (ativo && !obs) setVisivel(true)
      return
    }
    observados.set(el, setVisivel)
    obs.observe(el)
    return () => {
      obs.unobserve(el)
      observados.delete(el)
    }
  }, [ativo])

  return [ref, visivel]
}
