import css from './Fundo.module.css'

/**
 * Efeito de fundo — quatro manchas de cor que passeiam devagar, uma faixa de
 * luz que varre a tela, uma vinheta que fecha as bordas e um grão fino por cima.
 *
 * Três escolhas de desempenho que importam num celular:
 *  · a suavidade vem de `radial-gradient`, não de `filter: blur()`. Blur em
 *    elemento grande derruba o quadro no WebView do Android.
 *  · só `transform` e `opacity` são animados — as duas propriedades que a GPU
 *    resolve sem recalcular layout.
 *  · a vinheta é um elemento PARADO. Um degradê imóvel não custa nada por
 *    quadro; é ele que dá profundidade sem pedir mais trabalho da GPU.
 *
 * A camada nova aqui é a `faixa`: uma diagonal clara que atravessa a tela em
 * 28 segundos. É o que tira a sensação de "papel de parede estático" sem
 * acrescentar mais uma mancha, que só deixaria o fundo mais colorido e mais
 * pesado — o efeito precisa de MOVIMENTO diferente, não de mais cor.
 *
 * `aria-hidden` porque é decoração pura: leitor de tela não deve anunciar nada.
 */
export default function Fundo() {
  return (
    <div className={css.fundo} aria-hidden="true">
      <div className={`${css.mancha} ${css.m1}`} />
      <div className={`${css.mancha} ${css.m2}`} />
      <div className={`${css.mancha} ${css.m3}`} />
      <div className={`${css.mancha} ${css.m4}`} />
      <div className={css.faixa} />
      <div className={css.vinheta} />
      <div className={css.grao} />
    </div>
  )
}
