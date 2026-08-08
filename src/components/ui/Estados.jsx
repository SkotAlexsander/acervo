import Icone from '../Icone.jsx'
import css from './Estados.module.css'

/**
 * Estados de tela vazia, carregando e erro.
 *
 * Uma tela vazia sem explicação parece um app quebrado. Cada estado aqui diz
 * o que aconteceu e, quando cabe, o que fazer a respeito.
 */

export function Vazio({ icone = 'pasta', titulo, texto, acao }) {
  return (
    <div className={css.vazio}>
      <span className={css.vazioIcone}>
        <Icone nome={icone} tamanho={30} />
      </span>
      <p className={css.vazioTitulo}>{titulo}</p>
      {texto && <p className={css.vazioTexto}>{texto}</p>}
      {acao && <div className={css.vazioAcao}>{acao}</div>}
    </div>
  )
}

/** Esqueleto de lista — evita o "pulo" de tela em branco → conteúdo. */
export function Carregando({ linhas = 6, grade = false }) {
  const itens = Array.from({ length: linhas }, (_, i) => i)
  if (grade) {
    return (
      <div className={css.esqueletoGrade} aria-hidden="true">
        {itens.map((i) => (
          <div key={i} className={css.esqueletoLadrilho}>
            <div className={css.pulsoQuadrado} />
            <div className={css.pulsoLinha} style={{ width: '80%' }} />
            <div className={css.pulsoLinha} style={{ width: '45%' }} />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div aria-hidden="true">
      {itens.map((i) => (
        <div key={i} className={css.esqueletoLinha}>
          <div className={css.pulsoSelo} />
          <div className={css.esqueletoTextos}>
            <div className={css.pulsoLinha} style={{ width: `${58 + ((i * 13) % 30)}%` }} />
            <div className={css.pulsoLinha} style={{ width: '32%', height: 9 }} />
          </div>
        </div>
      ))}
    </div>
  )
}

export function Erro({ mensagem, acao }) {
  return (
    <div className={css.vazio}>
      <span className={`${css.vazioIcone} ${css.vazioIconeErro}`}>
        <Icone nome="alerta" tamanho={30} />
      </span>
      <p className={css.vazioTitulo}>Não deu pra abrir</p>
      <p className={css.vazioTexto}>{mensagem}</p>
      {acao && <div className={css.vazioAcao}>{acao}</div>}
    </div>
  )
}

/** Barra de progresso indeterminada, pra varredura da árvore. */
export function Progresso({ rotulo }) {
  return (
    <div className={css.progresso}>
      <div className={css.trilho}>
        <div className={css.pulga} />
      </div>
      {rotulo && <span className={css.progressoRotulo}>{rotulo}</span>}
    </div>
  )
}
