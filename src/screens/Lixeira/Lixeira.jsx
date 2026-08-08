import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icone, { ICONE_POR_TIPO, COR_POR_TIPO } from '../../components/Icone.jsx'
import BotaoVoltar from '../../components/ui/BotaoVoltar.jsx'
import Botao from '../../components/ui/Botao.jsx'
import Dialogo from '../../components/ui/Dialogo.jsx'
import { Carregando, Vazio } from '../../components/ui/Estados.jsx'
import { useApp } from '../../state/AppContext.jsx'
import { useLixeira } from '../../state/hooks.js'
import { restaurar, apagarDeVez } from '../../fs/trash.js'
import { formatBytes, formatDate, kindOf, extOf } from '../../fs/util.js'
import tela from '../tela.module.css'
import css from './Lixeira.module.css'

/**
 * A lixeira — e o único lugar do app onde alguma coisa some pra sempre.
 *
 * Cada item mostra DE ONDE veio, porque restaurar sem saber o destino é um
 * salto no escuro. E o "apagar de vez" pede confirmação com o número na cara.
 */
export default function Lixeira() {
  const navegar = useNavigate()
  const { provider, executar, avisar } = useApp()
  const { itens, carregando } = useLixeira()

  const [selecao, setSelecao] = useState(() => new Set())
  const [confirmando, setConfirmando] = useState(null) // 'selecionados' | 'tudo'

  const bytes = useMemo(() => itens.reduce((s, i) => s + (i.size || 0), 0), [itens])
  const selecionados = useMemo(() => itens.filter((i) => selecao.has(i.id)), [itens, selecao])
  const bytesSelecionados = selecionados.reduce((s, i) => s + (i.size || 0), 0)

  const alternar = useCallback((id) => {
    setSelecao((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }, [])

  const restaurarSelecionados = async () => {
    const ids = selecionados.map((i) => i.id)
    setSelecao(new Set())
    const r = await executar(() => restaurar(provider, ids), null)
    if (!r.ok) return
    const { restaurados, erros } = r.resultado
    if (erros.length) avisar(erros[0], 'erro')
    if (restaurados) {
      avisar(
        `${restaurados} ${restaurados === 1 ? 'item voltou' : 'itens voltaram'} pro lugar de origem.`,
        'ok'
      )
    }
  }

  const apagar = async () => {
    const alvo = confirmando
    setConfirmando(null)
    const ids = alvo === 'tudo' ? null : selecionados.map((i) => i.id)
    setSelecao(new Set())
    await executar(
      () => apagarDeVez(provider, ids),
      (r) => `${r.apagados} ${r.apagados === 1 ? 'item apagado' : 'itens apagados'} de vez.`
    )
  }

  const modoSelecao = selecao.size > 0

  return (
    <div className={tela.tela}>
      <header className={tela.cabecalho}>
        <BotaoVoltar aoClicar={() => navegar('/limpeza')} rotulo="Voltar à limpeza" />
        <div className={tela.cabecalhoTextos}>
          <h1 className={tela.titulo}>Lixeira</h1>
          <span className={`${tela.subtitulo} num`}>
            {carregando
              ? 'lendo…'
              : itens.length === 0
                ? 'vazia'
                : `${itens.length} ${itens.length === 1 ? 'item' : 'itens'} · ${formatBytes(bytes)}`}
          </span>
        </div>
        {itens.length > 0 && (
          <Botao variante="fantasma" tamanho="sm" onClick={() => setConfirmando('tudo')}>
            Esvaziar
          </Botao>
        )}
      </header>

      {modoSelecao && (
        <div className={tela.barraSelecao}>
          <Botao
            variante="icone"
            icone="fechar"
            aria-label="Cancelar seleção"
            onClick={() => setSelecao(new Set())}
          />
          <span className={tela.barraSelecaoContagem}>
            {selecao.size} · {formatBytes(bytesSelecionados)}
          </span>
          <Botao variante="secundario" tamanho="sm" icone="restaurar" onClick={restaurarSelecionados}>
            Restaurar
          </Botao>
          <Botao
            variante="icone"
            icone="lixeira"
            aria-label="Apagar de vez"
            onClick={() => setConfirmando('selecionados')}
          />
        </div>
      )}

      <div className={tela.corpo}>
        {carregando ? (
          <Carregando linhas={5} />
        ) : itens.length === 0 ? (
          <Vazio
            icone="confereCirculo"
            titulo="Lixeira vazia"
            texto="Tudo que você excluir aparece aqui antes de sumir de vez."
            acao={<Botao icone="voltar" onClick={() => navegar('/limpeza')}>Voltar</Botao>}
          />
        ) : (
          <>
            <p className={css.explicacao}>
              <Icone nome="info" tamanho={14} />
              Estes itens continuam ocupando espaço até serem apagados de vez.
            </p>
            <ul className={css.lista}>
              {itens.map((item) => {
                const tipo = item.isDir ? 'folder' : kindOf({ isDir: false, ext: extOf(item.nome), name: item.nome })
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      className={`${css.item} ${selecao.has(item.id) ? css.itemMarcado : ''}`}
                      onClick={() => alternar(item.id)}
                    >
                      <span
                        className={`${css.caixinha} ${selecao.has(item.id) ? css.caixinhaMarcada : ''}`}
                      >
                        {selecao.has(item.id) && <Icone nome="confere" tamanho={13} />}
                      </span>
                      <span className={css.itemIcone} style={{ color: COR_POR_TIPO[tipo] }}>
                        <Icone nome={ICONE_POR_TIPO[tipo]} tamanho={19} />
                      </span>
                      <span className={css.itemTextos}>
                        <span className={`${css.itemNome} corta`}>{item.nome}</span>
                        <span className={`${css.itemMeta} corta num`}>
                          {formatBytes(item.size)} · excluído {formatDate(item.apagadoEm)}
                        </span>
                        <span className={`${css.itemOrigem} corta`}>
                          <Icone nome="restaurar" tamanho={11} />
                          volta para {item.origem === '/' ? 'a raiz' : item.origem}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>

      <Dialogo
        aberto={!!confirmando}
        aoFechar={() => setConfirmando(null)}
        perigo
        titulo={confirmando === 'tudo' ? 'Esvaziar a lixeira?' : 'Apagar de vez?'}
        mensagem={
          confirmando === 'tudo'
            ? `${itens.length} ${itens.length === 1 ? 'item' : 'itens'} (${formatBytes(bytes)}) serão apagados PARA SEMPRE. Isso não tem desfazer.`
            : `${selecionados.length} ${selecionados.length === 1 ? 'item' : 'itens'} (${formatBytes(bytesSelecionados)}) serão apagados PARA SEMPRE. Isso não tem desfazer.`
        }
        detalhe={(confirmando === 'tudo' ? itens : selecionados)
          .slice(0, 10)
          .map((i) => i.nome)
          .join('\n')}
        rotuloConfirmar="Apagar para sempre"
        aoConfirmar={apagar}
      />
    </div>
  )
}
