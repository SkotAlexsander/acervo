import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icone from '../../components/Icone.jsx'
import BotaoVoltar from '../../components/ui/BotaoVoltar.jsx'
import { Progresso, Vazio } from '../../components/ui/Estados.jsx'
import { useApp } from '../../state/AppContext.jsx'
import { useVarredura } from '../../state/hooks.js'
import { kindOf, formatBytes, KINDS, KIND_ORDER } from '../../fs/util.js'
import { COR_POR_TIPO } from '../../components/Icone.jsx'
import tela from '../tela.module.css'
import css from './Espaco.module.css'

/**
 * "Onde foi o meu espaço?"
 *
 * A pergunta que faz alguém abrir um organizador de arquivos, e a que a lista
 * de pastas não responde — porque o sistema de arquivos não guarda o tamanho
 * de uma pasta.
 *
 * O truque de desempenho: NÃO desce a árvore de novo. A varredura já passou
 * por cada arquivo; aqui só se soma cada um na conta da pasta de primeiro
 * nível a que ele pertence. Custo: uma passada linear sobre uma lista que já
 * está na memória.
 */
export default function Espaco() {
  const navegar = useNavigate()
  const { prefs } = useApp()
  const varredura = useVarredura(true)
  const [aberta, setAberta] = useState(null)

  const ranking = useMemo(() => {
    const porPasta = new Map()
    for (const a of varredura.arquivos) {
      // '/DCIM/Camera/foto.jpg' → 'DCIM'. Arquivo na raiz vira '/'.
      const corte = a.path.indexOf('/', 1)
      const topo = corte === -1 ? '/' : a.path.slice(1, corte)
      let alvo = porPasta.get(topo)
      if (!alvo) {
        alvo = { nome: topo, bytes: 0, qtd: 0, tipos: {} }
        porPasta.set(topo, alvo)
      }
      alvo.bytes += a.size || 0
      alvo.qtd++
      const k = kindOf(a)
      alvo.tipos[k] = (alvo.tipos[k] || 0) + (a.size || 0)
    }
    return [...porPasta.values()].sort((x, y) => y.bytes - x.bytes)
  }, [varredura.arquivos])

  const total = ranking.reduce((s, r) => s + r.bytes, 0)
  const maior = ranking.length ? ranking[0].bytes : 1

  // Recolhe a pasta aberta quando a lista muda de baixo dos pés.
  useEffect(() => {
    if (aberta && !ranking.some((r) => r.nome === aberta)) setAberta(null)
  }, [ranking, aberta])

  return (
    <div className={tela.tela}>
      <header className={tela.cabecalho}>
        <BotaoVoltar aoClicar={() => navegar('/limpeza')} rotulo="Voltar à limpeza" />
        <div className={tela.cabecalhoTextos}>
          <h1 className={tela.titulo}>Onde foi meu espaço</h1>
          <span className={`${tela.subtitulo} num`}>
            {varredura.carregando && !varredura.pronto
              ? 'somando…'
              : `${formatBytes(total)} em ${ranking.length} pastas`}
          </span>
        </div>
      </header>

      <div className={tela.corpo}>
        {varredura.carregando && (
          <Progresso
            rotulo={
              varredura.doRascunho
                ? 'conferindo…'
                : varredura.progresso
                  ? `${varredura.progresso.toLocaleString('pt-BR')} lidos`
                  : 'lendo…'
            }
          />
        )}

        {ranking.length === 0 && !varredura.carregando ? (
          <Vazio icone="disco" titulo="Nada pra somar" texto="Nenhum arquivo foi encontrado." />
        ) : (
          <div className={css.lista}>
            {ranking.map((r) => {
              const fatia = total ? (r.bytes / total) * 100 : 0
              const escolhida = aberta === r.nome
              // Composição por tipo dentro da pasta — é o que diz se o peso
              // são fotos, vídeo ou backup.
              const tipos = KIND_ORDER.map((k) => ({ k, bytes: r.tipos[k] || 0 }))
                .filter((t) => t.bytes > 0)
                .sort((a, b) => b.bytes - a.bytes)

              return (
                <div key={r.nome} className={css.item}>
                  <button
                    type="button"
                    className={css.cabeca}
                    onClick={() => setAberta(escolhida ? null : r.nome)}
                    aria-expanded={escolhida}
                  >
                    <span className={css.textos}>
                      <span className={`${css.nome} corta`}>
                        {r.nome === '/' ? 'Solto na raiz' : r.nome}
                      </span>
                      <span className={`${css.meta} num`}>
                        {formatBytes(r.bytes)} · {r.qtd.toLocaleString('pt-BR')}{' '}
                        {r.qtd === 1 ? 'arquivo' : 'arquivos'}
                      </span>
                    </span>
                    <span className={`${css.porcento} num`}>{fatia.toFixed(fatia < 10 ? 1 : 0)}%</span>
                    <Icone
                      nome={escolhida ? 'cima' : 'baixo'}
                      tamanho={16}
                      className={css.seta}
                    />
                  </button>

                  {/* Barra proporcional à MAIOR pasta, não ao total: com o total,
                      tudo abaixo da primeira colocada vira um risco invisível. */}
                  <div className={css.trilho}>
                    <div className={css.preenchido} style={{ width: `${(r.bytes / maior) * 100}%` }}>
                      {tipos.map((t) => (
                        <span
                          key={t.k}
                          style={{
                            width: `${(t.bytes / r.bytes) * 100}%`,
                            background: COR_POR_TIPO[t.k],
                          }}
                        />
                      ))}
                    </div>
                  </div>

                  {escolhida && (
                    <div className={css.detalhe}>
                      {tipos.map((t) => (
                        <span key={t.k} className={css.legenda}>
                          <span
                            className={css.ponto}
                            style={{ background: COR_POR_TIPO[t.k] }}
                          />
                          {KINDS[t.k].label}
                          <b className="num">{formatBytes(t.bytes)}</b>
                        </span>
                      ))}
                      <button
                        type="button"
                        className={css.abrir}
                        onClick={() => navegar(`/pastas${r.nome === '/' ? '' : '/' + r.nome}`)}
                      >
                        <Icone nome="pasta" tamanho={14} />
                        Abrir a pasta
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <p className={css.nota}>
          <Icone nome="info" tamanho={14} />
          Só conta o que este app enxerga. Sistema, aplicativos instalados e{' '}
          <code>/Android/data</code> ficam de fora — e costumam ser vários GB.
          {!prefs.mostrarOcultos && ' Arquivos ocultos também não entram.'}
        </p>
      </div>
    </div>
  )
}
