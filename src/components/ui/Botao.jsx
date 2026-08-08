import Icone from '../Icone.jsx'
import css from './Botao.module.css'

/**
 * Botão do app.
 * `variante`: primario | secundario | fantasma | perigo | icone
 * Alvo de toque nunca abaixo de 44px — regra de dedo, não de estética.
 */
export default function Botao({
  variante = 'secundario',
  tamanho = 'md',
  icone,
  iconeDepois,
  children,
  className = '',
  largura,
  ...resto
}) {
  const classes = [
    css.botao,
    css[variante],
    css[tamanho],
    largura === 'total' ? css.total : '',
    !children ? css.soIcone : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" className={classes} {...resto}>
      {icone && <Icone nome={icone} tamanho={tamanho === 'sm' ? 17 : 19} />}
      {children && <span className={css.texto}>{children}</span>}
      {iconeDepois && <Icone nome={iconeDepois} tamanho={17} />}
    </button>
  )
}
