import { useEffect, useRef, useState } from 'react'
import Botao from './Botao.jsx'
import Icone from '../Icone.jsx'
import { useCamada } from '../../state/voltar.js'
import css from './Dialogo.module.css'

/**
 * Diálogo modal — confirmação e entrada de texto.
 *
 * Existe porque `window.confirm` e `window.prompt` são bloqueados dentro do
 * WebView do Capacitor em algumas configurações, e porque uma pergunta sobre
 * apagar 40 arquivos merece dizer QUAIS 40.
 */
export default function Dialogo({
  aberto,
  aoFechar,
  titulo,
  mensagem,
  detalhe,
  tipo = 'confirmar', // 'confirmar' | 'texto' | 'aviso'
  valorInicial = '',
  rotuloConfirmar = 'Confirmar',
  rotuloCancelar = 'Cancelar',
  perigo = false,
  validar,
  aoConfirmar,
  selecionarAte,
}) {
  const [valor, setValor] = useState(valorInicial)
  const [erro, setErro] = useState(null)
  const entradaRef = useRef(null)
  const focoAnterior = useRef(null)

  // Voltar do Android cancela o diálogo — nunca confirma. Um "voltar" que
  // apaga 40 arquivos porque a confirmação estava aberta é indefensável.
  useCamada(aberto, aoFechar)

  useEffect(() => {
    if (!aberto) return
    setValor(valorInicial)
    setErro(null)
    focoAnterior.current = document.activeElement
    const t = setTimeout(() => {
      const el = entradaRef.current
      if (!el) return
      el.focus()
      // Ao renomear "foto.jpg", seleciona só "foto": a extensão quase nunca
      // é o que se quer trocar, e deixá-la selecionada faz apagar sem querer.
      const ate = typeof selecionarAte === 'number' ? selecionarAte : valorInicial.length
      el.setSelectionRange(0, Math.max(0, ate))
    }, 50)
    return () => {
      clearTimeout(t)
      const anterior = focoAnterior.current
      if (anterior && typeof anterior.focus === 'function') anterior.focus()
    }
  }, [aberto, valorInicial, selecionarAte])

  useEffect(() => {
    if (!aberto) return
    const aoTeclar = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        aoFechar()
      }
    }
    document.addEventListener('keydown', aoTeclar, true)
    return () => document.removeEventListener('keydown', aoTeclar, true)
  }, [aberto, aoFechar])

  if (!aberto) return null

  const confirmar = () => {
    if (tipo === 'texto') {
      const v = valor.trim()
      const msgErro = validar ? validar(v) : null
      if (msgErro) {
        setErro(msgErro)
        entradaRef.current?.focus()
        return
      }
      aoConfirmar(v)
    } else {
      aoConfirmar()
    }
  }

  return (
    <div className={css.camada}>
      <div className={css.veu} onClick={aoFechar} />
      <div className={css.caixa} role="alertdialog" aria-modal="true" aria-label={titulo}>
        {perigo && (
          <span className={css.selo} aria-hidden="true">
            <Icone nome="alerta" tamanho={22} />
          </span>
        )}
        <h2 className={css.titulo}>{titulo}</h2>
        {mensagem && <p className={css.mensagem}>{mensagem}</p>}
        {detalhe && <div className={css.detalhe}>{detalhe}</div>}

        {tipo === 'texto' && (
          <div className={css.campo}>
            <input
              ref={entradaRef}
              className={`${css.entrada} ${erro ? css.entradaErro : ''}`}
              value={valor}
              onChange={(e) => {
                setValor(e.target.value)
                if (erro) setErro(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  confirmar()
                }
              }}
              spellCheck={false}
              autoComplete="off"
              aria-invalid={!!erro}
              aria-label={titulo}
            />
            {erro && (
              <p className={css.erro} role="alert">
                {erro}
              </p>
            )}
          </div>
        )}

        <div className={css.acoes}>
          <Botao variante="fantasma" onClick={aoFechar} largura="total">
            {rotuloCancelar}
          </Botao>
          <Botao
            variante={perigo ? 'perigo' : 'primario'}
            onClick={confirmar}
            largura="total"
            disabled={tipo === 'texto' && !valor.trim()}
          >
            {rotuloConfirmar}
          </Botao>
        </div>
      </div>
    </div>
  )
}
