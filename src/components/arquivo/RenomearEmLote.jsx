import { useMemo, useState } from 'react'
import Folha from '../ui/Folha.jsx'
import Botao from '../ui/Botao.jsx'
import Icone from '../Icone.jsx'
import { stripExt, extOf, validateName } from '../../fs/util.js'
import css from './RenomearEmLote.module.css'

/**
 * Renomear vários de uma vez: "IMG_20250706_045313.jpg" × 40 → "Viagem 01.jpg" …
 *
 * A decisão que faz essa tela prestar é a PRÉVIA. Renomear 40 arquivos com um
 * padrão errado é um estrago que ninguém desfaz na mão — então o resultado
 * aparece na tela antes de qualquer arquivo ser tocado.
 *
 * A extensão nunca entra no padrão: trocar `.jpg` por engano transforma foto
 * em arquivo que nenhum app abre.
 */
export default function RenomearEmLote({ aberto, aoFechar, itens, aoConfirmar }) {
  const [base, setBase] = useState('Arquivo')
  const [inicio, setInicio] = useState(1)
  const [manterOriginal, setManterOriginal] = useState(false)

  const digitos = Math.max(2, String(itens.length + Number(inicio) - 1).length)

  const nomes = useMemo(() => {
    const limpo = String(base).trim()
    return itens.map((item, i) => {
      const ext = extOf(item.name)
      const sufixo = ext ? '.' + ext : ''
      const numero = String(Number(inicio) + i).padStart(digitos, '0')
      const original = manterOriginal ? ' — ' + stripExt(item.name) : ''
      return {
        de: item.name,
        para: `${limpo} ${numero}${original}${sufixo}`,
        path: item.path,
      }
    })
  }, [itens, base, inicio, digitos, manterOriginal])

  const erro = useMemo(() => {
    if (!String(base).trim()) return 'Escreva um nome-base.'
    const problema = nomes.map((n) => validateName(n.para)).find(Boolean)
    if (problema) return problema
    // Nome repetido entre os próprios itens do lote: o provider renumeraria
    // sozinho, mas o resultado sairia diferente da prévia — e a prévia é a
    // única coisa que o usuário está olhando.
    const vistos = new Set()
    for (const n of nomes) {
      const chave = n.para.toLowerCase()
      if (vistos.has(chave)) return 'Esse padrão gera nomes repetidos.'
      vistos.add(chave)
    }
    return null
  }, [base, nomes])

  const mostrar = nomes.slice(0, 4)

  return (
    <Folha
      aberta={aberto}
      aoFechar={aoFechar}
      titulo={`Renomear ${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar} largura="total">
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            largura="total"
            disabled={!!erro}
            onClick={() => aoConfirmar(nomes)}
          >
            Renomear {itens.length}
          </Botao>
        </>
      }
    >
      <div className={css.campos}>
        <label className={css.campo}>
          <span className={css.rotulo}>Nome</span>
          <input
            className={css.entrada}
            value={base}
            onChange={(e) => setBase(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <label className={`${css.campo} ${css.campoNumero}`}>
          <span className={css.rotulo}>Começa em</span>
          <input
            className={css.entrada}
            type="number"
            min="0"
            max="9999"
            value={inicio}
            onChange={(e) => setInicio(Math.max(0, Math.min(9999, Number(e.target.value) || 0)))}
          />
        </label>
      </div>

      <button
        type="button"
        className={css.opcao}
        role="switch"
        aria-checked={manterOriginal}
        onClick={() => setManterOriginal((v) => !v)}
      >
        <span className={`${css.caixinha} ${manterOriginal ? css.caixinhaMarcada : ''}`}>
          {manterOriginal && <Icone nome="confere" tamanho={13} />}
        </span>
        <span>
          Manter o nome antigo no fim
          <span className={css.opcaoNota}>
            Útil pra não perder a informação que já estava no nome
          </span>
        </span>
      </button>

      {erro ? (
        <p className={css.erro} role="alert">
          <Icone nome="alerta" tamanho={15} />
          {erro}
        </p>
      ) : (
        <div className={css.previa}>
          <span className={css.previaTitulo}>Como vai ficar</span>
          {mostrar.map((n) => (
            <div key={n.path} className={css.previaLinha}>
              <span className={`${css.previaDe} corta`}>{n.de}</span>
              <Icone nome="avancar" tamanho={13} className={css.previaSeta} />
              <span className={`${css.previaPara} corta`}>{n.para}</span>
            </div>
          ))}
          {nomes.length > mostrar.length && (
            <span className={css.previaResto}>
              …e mais {nomes.length - mostrar.length}, no mesmo padrão
            </span>
          )}
        </div>
      )}

      <p className={css.aviso}>
        <Icone nome="info" tamanho={14} />A extensão de cada arquivo (.jpg, .pdf) é
        preservada — só o nome muda.
      </p>
    </Folha>
  )
}
