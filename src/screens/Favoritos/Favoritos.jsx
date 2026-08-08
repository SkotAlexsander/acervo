import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icone from '../../components/Icone.jsx'
import BotaoVoltar from '../../components/ui/BotaoVoltar.jsx'
import Botao from '../../components/ui/Botao.jsx'
import { Carregando, Vazio } from '../../components/ui/Estados.jsx'
import { LinhaArquivo } from '../../components/arquivo/ItemArquivo.jsx'
import useAcoesArquivo from '../../components/arquivo/useAcoesArquivo.jsx'
import { useApp } from '../../state/AppContext.jsx'
import { parentOf, baseName } from '../../fs/util.js'
import tela from '../tela.module.css'
import css from './Favoritos.module.css'

/**
 * Os itens fixados.
 *
 * Favorito guarda um CAMINHO, e caminho pode morrer — o arquivo foi apagado
 * por outro app, ou movido por fora. Por isso a tela confere item por item e
 * mostra os quebrados como quebrados, com um botão pra tirar da lista. Sumir
 * com eles em silêncio faria você achar que o app perdeu seus favoritos.
 */
export default function Favoritos() {
  const navegar = useNavigate()
  const { provider, prefs, alternarFavorito, versao } = useApp()
  const acoes = useAcoesArquivo()

  const [estado, setEstado] = useState({ vivos: [], mortos: [], carregando: true })

  useEffect(() => {
    if (!provider) return
    let ativo = true
    setEstado((e) => ({ ...e, carregando: true }))
    Promise.all(prefs.favoritos.map((p) => provider.stat(p).catch(() => null)))
      .then((resultados) => {
        if (!ativo) return
        const vivos = []
        const mortos = []
        resultados.forEach((info, i) => {
          if (info) vivos.push(info)
          else mortos.push(prefs.favoritos[i])
        })
        setEstado({ vivos, mortos, carregando: false })
      })
      .catch(() => ativo && setEstado({ vivos: [], mortos: [], carregando: false }))
    return () => {
      ativo = false
    }
  }, [provider, prefs.favoritos, versao])

  return (
    <div className={tela.tela}>
      <header className={tela.cabecalho}>
        <BotaoVoltar aoClicar={() => navegar('/')} rotulo="Voltar ao início" />
        <div className={tela.cabecalhoTextos}>
          <h1 className={tela.titulo}>Favoritos</h1>
          <span className={tela.subtitulo}>
            {estado.carregando
              ? 'conferindo…'
              : `${estado.vivos.length} ${estado.vivos.length === 1 ? 'item fixado' : 'itens fixados'}`}
          </span>
        </div>
      </header>

      <div className={tela.corpo}>
        {estado.carregando ? (
          <Carregando linhas={4} />
        ) : estado.vivos.length === 0 && estado.mortos.length === 0 ? (
          <Vazio
            icone="estrela"
            titulo="Nenhum favorito ainda"
            texto="Segure em qualquer arquivo ou pasta e escolha “Favoritar” pra fixar um atalho aqui."
            acao={<Botao icone="pasta" onClick={() => navegar('/pastas')}>Abrir as pastas</Botao>}
          />
        ) : (
          <>
            {estado.vivos.length > 0 && (
              <div className={tela.lista}>
                {estado.vivos.map((item) => (
                  <LinhaArquivo
                    key={item.path}
                    item={item}
                    selecionado={false}
                    modoSelecao={false}
                    favorito
                    aoAbrir={(i) =>
                      i.isDir ? navegar(`/pastas${i.path}`) : acoes.abrirArquivo(i)
                    }
                    aoAlternarSelecao={() => {}}
                    aoPedirMenu={acoes.abrirMenu}
                    segundaLinha={`em ${baseName(parentOf(item.path))}`}
                  />
                ))}
              </div>
            )}

            {estado.mortos.length > 0 && (
              <section className={tela.secao}>
                <div className={tela.secaoCabecalho}>
                  <h2 className={tela.secaoTitulo}>Não existem mais</h2>
                </div>
                <div className={css.quebrados}>
                  {estado.mortos.map((p) => (
                    <div key={p} className={css.quebrado}>
                      <Icone nome="alerta" tamanho={17} />
                      <span className="corta" title={p}>
                        {baseName(p)}
                      </span>
                      <button type="button" onClick={() => alternarFavorito(p)}>
                        Tirar
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {acoes.elementos}
    </div>
  )
}
