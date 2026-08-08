import Icone from '../Icone.jsx'
import css from './BotaoVoltar.module.css'

/**
 * O botão de voltar do cabeçalho.
 *
 * Existe como componente porque cinco telas usavam o mesmo botão com cinco
 * cópias do mesmo CSS — e as cinco estavam com 38px, abaixo do alvo de dedo.
 * Consertar em cinco lugares é como um deles fica pra trás.
 */
export default function BotaoVoltar({ aoClicar, rotulo = 'Voltar' }) {
  return (
    <button type="button" className={css.voltar} onClick={aoClicar} aria-label={rotulo}>
      <Icone nome="voltar" tamanho={20} />
    </button>
  )
}
