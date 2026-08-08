import { useCallback, useEffect, useState } from 'react'
import Icone from '../../components/Icone.jsx'
import Botao from '../../components/ui/Botao.jsx'
import { abrirConfiguracoesDePermissao, verificarPermissao } from '../../fs/permissao.js'
import css from './Permissao.module.css'

/**
 * A tela que aparece no celular antes de tudo, quando o Android ainda não
 * liberou o acesso aos arquivos.
 *
 * Ela existe porque a alternativa é péssima: sem a permissão, o app abriria
 * mostrando um armazenamento vazio, e qualquer pessoa concluiria que ele está
 * quebrado. Aqui o problema é dito, o botão leva direto à tela certa do
 * sistema, e a volta é detectada sozinha.
 */
export default function Permissao({ aoLiberar }) {
  const [tentando, setTentando] = useState(false)
  const [voltouSemLiberar, setVoltouSemLiberar] = useState(false)

  const conferir = useCallback(
    async (marcarFalha) => {
      const r = await verificarPermissao()
      if (r.concedida) {
        aoLiberar()
        return true
      }
      if (marcarFalha) setVoltouSemLiberar(true)
      return false
    },
    [aoLiberar]
  )

  // Voltar das configurações não recarrega o app — só traz a aba de volta.
  // É esse evento que permite detectar "já liberei" sem o usuário tocar em nada.
  useEffect(() => {
    const aoVoltar = () => {
      if (document.visibilityState === 'visible') conferir(tentando)
    }
    document.addEventListener('visibilitychange', aoVoltar)
    window.addEventListener('focus', aoVoltar)
    return () => {
      document.removeEventListener('visibilitychange', aoVoltar)
      window.removeEventListener('focus', aoVoltar)
    }
  }, [conferir, tentando])

  const pedir = async () => {
    setTentando(true)
    setVoltouSemLiberar(false)
    const r = await abrirConfiguracoesDePermissao()
    if (r.concedida) aoLiberar()
  }

  return (
    <div className={css.tela}>
      <span className={css.selo}>
        <Icone nome="cadeado" tamanho={30} />
      </span>

      <h1 className={css.titulo}>Falta liberar o acesso</h1>
      <p className={css.texto}>
        O Android esconde o armazenamento dos aplicativos por padrão. Sem a sua
        autorização, o Acervo abre <strong>vazio</strong> — não porque quebrou, mas
        porque não enxerga nada.
      </p>

      <Botao variante="primario" tamanho="lg" largura="total" icone="ajustes" onClick={pedir}>
        Abrir as configurações
      </Botao>

      <div className={css.passos}>
        <span className={css.passosTitulo}>Lá dentro, ligue:</span>
        <span className={css.chave}>
          <Icone nome="confere" tamanho={15} />
          Permitir acesso a todos os arquivos
        </span>
        <span className={css.passosNota}>
          Depois é só voltar — o app percebe sozinho e continua.
        </span>
      </div>

      {voltouSemLiberar && (
        <p className={css.aindaNao}>
          <Icone nome="alerta" tamanho={15} />
          Ainda não está liberado. Em alguns aparelhos a chave fica em{' '}
          <em>Aplicativos → Acesso especial → Acesso a todos os arquivos</em>.
        </p>
      )}

      <button type="button" className={css.jaLiberei} onClick={() => conferir(true)}>
        Já liberei, verificar de novo
      </button>

      <p className={css.rodape}>
        <Icone nome="cadeado" tamanho={13} />
        O Acervo não envia nada pra lugar nenhum. Tudo acontece dentro do aparelho.
      </p>
    </div>
  )
}
