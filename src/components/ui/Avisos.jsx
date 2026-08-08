import { useApp } from '../../state/AppContext.jsx'
import Icone from '../Icone.jsx'
import css from './Avisos.module.css'

const ICONE = { ok: 'confereCirculo', erro: 'alerta', info: 'info' }

/**
 * Avisos rápidos (toasts).
 *
 * `aria-live="polite"` faz o leitor de tela anunciar sem interromper.
 * O aviso com AÇÃO (o "desfazer" da exclusão) fica mais tempo na tela —
 * um desfazer que some em 3 segundos não é desfazer, é enfeite.
 */
export default function Avisos() {
  const { avisos, fecharAviso } = useApp()
  if (!avisos.length) return null

  return (
    <div className={css.pilha} role="status" aria-live="polite">
      {avisos.map((a) => (
        <div key={a.id} className={`${css.aviso} ${css[a.tipo] || ''}`}>
          <Icone nome={ICONE[a.tipo] || 'info'} tamanho={19} className={css.icone} />
          <span className={css.texto}>{a.texto}</span>
          {a.acao && (
            <button
              type="button"
              className={css.acao}
              onClick={() => {
                a.acao.aoClicar()
                fecharAviso(a.id)
              }}
            >
              {a.acao.rotulo}
            </button>
          )}
          <button
            type="button"
            className={css.fechar}
            onClick={() => fecharAviso(a.id)}
            aria-label="Dispensar aviso"
          >
            <Icone nome="fechar" tamanho={15} />
          </button>
        </div>
      ))}
    </div>
  )
}
