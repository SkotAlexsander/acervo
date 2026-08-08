import { NavLink, useLocation } from 'react-router-dom'
import Icone from '../Icone.jsx'
import css from './BarraAbas.module.css'

const ABAS = [
  { para: '/', icone: 'casa', rotulo: 'Início' },
  { para: '/pastas', icone: 'pasta', rotulo: 'Pastas' },
  { para: '/limpeza', icone: 'brilho', rotulo: 'Limpeza' },
  { para: '/ajustes', icone: 'ajustes', rotulo: 'Ajustes' },
]

/**
 * Navegação principal — quatro destinos, no alcance do polegar.
 *
 * A aba "Pastas" continua acesa quando você está três pastas fundo dentro
 * dela: `/pastas/DCIM/Camera` ainda é "Pastas". Sem isso a barra apaga
 * inteira assim que você navega e o app parece perder o lugar.
 */
export default function BarraAbas() {
  const { pathname } = useLocation()

  const ativa = (para) => {
    if (para === '/') return pathname === '/'
    return pathname === para || pathname.startsWith(para + '/')
  }

  return (
    <nav className={css.barra} aria-label="Navegação principal">
      {ABAS.map((aba) => {
        const acesa = ativa(aba.para)
        return (
          <NavLink
            key={aba.para}
            to={aba.para}
            className={`${css.aba} ${acesa ? css.abaAtiva : ''}`}
            aria-current={acesa ? 'page' : undefined}
          >
            <span className={css.abaIcone}>
              <Icone nome={aba.icone} tamanho={21} />
            </span>
            <span className={css.abaRotulo}>{aba.rotulo}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
