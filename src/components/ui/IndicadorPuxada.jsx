import Icone from '../Icone.jsx'
import css from './IndicadorPuxada.module.css'

/**
 * O anel que aparece quando você puxa a lista pra baixo.
 *
 * Ele gira proporcionalmente ao quanto você puxou — não com uma animação
 * solta. É esse acoplamento com o dedo que faz o gesto parecer físico; um
 * ícone que só aparece pronto no fim parece um alerta, não um controle.
 */
export default function IndicadorPuxada({ puxada, atualizando, armado, limite }) {
  if (!puxada && !atualizando) return null

  const progresso = Math.min(1, puxada / limite)
  const altura = atualizando ? 44 : puxada

  return (
    <div
      className={css.faixa}
      style={{ height: altura }}
      aria-hidden={!atualizando}
      role={atualizando ? 'status' : undefined}
    >
      <span
        className={`${css.anel} ${atualizando ? css.girando : ''} ${armado ? css.armado : ''}`}
        style={
          atualizando
            ? undefined
            : { transform: `rotate(${progresso * 300}deg)`, opacity: 0.3 + progresso * 0.7 }
        }
      >
        <Icone nome="atualizar" tamanho={19} />
      </span>
    </div>
  )
}
