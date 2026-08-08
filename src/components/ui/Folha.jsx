import { useEffect, useRef } from 'react'
import Icone from '../Icone.jsx'
import { useCamada } from '../../state/voltar.js'
import css from './Folha.module.css'

/**
 * Folha que sobe de baixo (bottom sheet) — o padrão do Android pra ação
 * contextual. Usada pro menu de arquivo, pra ordenação e pro seletor de pasta.
 *
 * Cuidados que fazem diferença de verdade:
 *  · Esc fecha e o foco volta pro elemento que abriu — sem isso, quem usa
 *    teclado fica preso.
 *  · o fundo trava a rolagem enquanto está aberta.
 *  · a barrinha do topo é decorativa, mas a área toda dela também fecha.
 */
export default function Folha({ aberta, aoFechar, titulo, children, rodape, alturaMax }) {
  const painelRef = useRef(null)
  const focoAnterior = useRef(null)

  // O botão físico de voltar do Android fecha esta folha antes de navegar.
  // Sem isto, voltar com o menu aberto saía da pasta por baixo do menu.
  useCamada(aberta, aoFechar)

  useEffect(() => {
    if (!aberta) return
    focoAnterior.current = document.activeElement

    const aoTeclar = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        aoFechar()
      }
      if (e.key === 'Tab') prenderFoco(e, painelRef.current)
    }
    document.addEventListener('keydown', aoTeclar, true)

    // Manda o foco pro painel pra leitura de tela começar do lugar certo.
    const t = setTimeout(() => {
      const alvo = painelRef.current?.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      ;(alvo || painelRef.current)?.focus()
    }, 40)

    return () => {
      document.removeEventListener('keydown', aoTeclar, true)
      clearTimeout(t)
      const anterior = focoAnterior.current
      if (anterior && typeof anterior.focus === 'function') anterior.focus()
    }
  }, [aberta, aoFechar])

  if (!aberta) return null

  return (
    <div className={css.camada}>
      <button
        type="button"
        className={css.veu}
        onClick={aoFechar}
        aria-label="Fechar"
        tabIndex={-1}
      />
      <div
        className={css.painel}
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-label={titulo || 'Opções'}
        tabIndex={-1}
        style={alturaMax ? { maxHeight: alturaMax } : undefined}
      >
        <div className={css.puxador} onClick={aoFechar} />
        {titulo && (
          <header className={css.cabecalho}>
            <h2 className={css.titulo}>{titulo}</h2>
            <button type="button" className={css.fechar} onClick={aoFechar} aria-label="Fechar">
              <Icone nome="fechar" tamanho={19} />
            </button>
          </header>
        )}
        <div className={`${css.corpo} rolavel`}>{children}</div>
        {rodape && <footer className={css.rodape}>{rodape}</footer>}
      </div>
    </div>
  )
}

/** Mantém o Tab circulando dentro do painel. */
function prenderFoco(e, container) {
  if (!container) return
  const focaveis = [
    ...container.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
    ),
  ].filter((el) => el.offsetParent !== null)
  if (!focaveis.length) return
  const primeiro = focaveis[0]
  const ultimo = focaveis[focaveis.length - 1]
  if (e.shiftKey && document.activeElement === primeiro) {
    e.preventDefault()
    ultimo.focus()
  } else if (!e.shiftKey && document.activeElement === ultimo) {
    e.preventDefault()
    primeiro.focus()
  }
}

/** Linha de ação dentro da folha. */
export function AcaoFolha({ icone, children, descricao, perigo, aoClicar, desabilitado }) {
  return (
    <button
      type="button"
      className={`${css.acao} ${perigo ? css.acaoPerigo : ''}`}
      onClick={aoClicar}
      disabled={desabilitado}
    >
      <span className={css.acaoIcone}>
        <Icone nome={icone} tamanho={20} />
      </span>
      <span className={css.acaoTextos}>
        <span className={css.acaoTitulo}>{children}</span>
        {descricao && <span className={css.acaoDescricao}>{descricao}</span>}
      </span>
    </button>
  )
}
