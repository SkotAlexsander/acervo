import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Icone, { COR_POR_TIPO, ICONE_POR_TIPO } from '../../components/Icone.jsx'
import BotaoVoltar from '../../components/ui/BotaoVoltar.jsx'
import Botao from '../../components/ui/Botao.jsx'
import Folha from '../../components/ui/Folha.jsx'
import { Carregando, Vazio } from '../../components/ui/Estados.jsx'
import ListaArquivos from '../../components/arquivo/ListaArquivos.jsx'
import useAcoesArquivo from '../../components/arquivo/useAcoesArquivo.jsx'
import BarraSelecao from '../../components/arquivo/BarraSelecao.jsx'
import { useApp } from '../../state/AppContext.jsx'
import { useVarredura } from '../../state/hooks.js'
import { filtrarPorCategoria } from '../../fs/scan.js'
import { KINDS, SORTS, sortEntries, formatBytes, parentOf, baseName } from '../../fs/util.js'
import tela from '../tela.module.css'
import css from './Categoria.module.css'

const TAMANHOS = [
  { bytes: 5 * 1024 * 1024, rotulo: '> 5 MB' },
  { bytes: 50 * 1024 * 1024, rotulo: '> 50 MB' },
  { bytes: 500 * 1024 * 1024, rotulo: '> 500 MB' },
]

const PERIODOS = [
  { dias: 7, rotulo: 'esta semana' },
  { dias: 30, rotulo: 'este mês' },
  { dias: 365, rotulo: 'este ano' },
]

/**
 * Todos os arquivos de um tipo, vindos da árvore inteira.
 *
 * Aqui o item não está "numa pasta" — ele veio de qualquer lugar. Por isso a
 * segunda linha mostra ONDE ele mora, não a data: sem isso você acha a foto e
 * não faz ideia de onde ela está.
 */
export default function Categoria() {
  const { tipo } = useParams()
  const navegar = useNavigate()
  const { prefs, definirPref } = useApp()
  const varredura = useVarredura(true)
  const acoes = useAcoesArquivo()

  const [selecao, setSelecao] = useState(() => new Set())
  const [menuOrdem, setMenuOrdem] = useState(false)

  const info = KINDS[tipo]

  // Filtros de recorte. Existem porque "todas as 273 imagens" não é uma lista
  // útil — "as imagens acima de 5 MB" e "o que chegou este mês" são.
  const [filtroTamanho, setFiltroTamanho] = useState(0)
  const [filtroDias, setFiltroDias] = useState(0)

  const todosDaCategoria = useMemo(
    () => (info ? filtrarPorCategoria(varredura.arquivos, tipo) : []),
    [varredura.arquivos, tipo, info]
  )

  const arquivos = useMemo(() => {
    let lista = todosDaCategoria
    if (filtroTamanho) lista = lista.filter((a) => (a.size || 0) >= filtroTamanho)
    if (filtroDias) {
      const corte = Date.now() - filtroDias * 86400000
      lista = lista.filter((a) => (a.mtime || 0) >= corte)
    }
    return sortEntries(lista, prefs.ordem, prefs.ordemDesc, false)
  }, [todosDaCategoria, filtroTamanho, filtroDias, prefs.ordem, prefs.ordemDesc])

  const filtrando = !!(filtroTamanho || filtroDias)

  const bytes = useMemo(() => arquivos.reduce((s, a) => s + (a.size || 0), 0), [arquivos])

  useEffect(() => {
    setSelecao(new Set())
  }, [tipo])

  const selecionados = useMemo(
    () => arquivos.filter((a) => selecao.has(a.path)),
    [arquivos, selecao]
  )

  const alternar = useCallback((item) => {
    setSelecao((s) => {
      const n = new Set(s)
      if (n.has(item.path)) n.delete(item.path)
      else n.add(item.path)
      return n
    })
  }, [])

  const limparSelecao = useCallback(() => setSelecao(new Set()), [])

  // Estável de propósito: passa direto pras linhas memoizadas.
  const abrirArquivo = acoes.abrirArquivo
  const abrir = useCallback(
    (item) => (selecao.size > 0 ? alternar(item) : abrirArquivo(item)),
    [selecao.size, alternar, abrirArquivo]
  )

  // Toque longo entra no modo de seleção com o item já marcado.
  const aoToqueLongo = useCallback((item) => {
    setSelecao((s) => (s.has(item.path) ? s : new Set([...s, item.path])))
  }, [])
  const modoSelecao = selecao.size > 0

  if (!info) {
    return (
      <div className={tela.tela}>
        <div className={tela.corpo}>
          <Vazio
            icone="alerta"
            titulo="Categoria desconhecida"
            texto={`"${tipo}" não é um tipo que este app conhece.`}
            acao={<Botao icone="casa" onClick={() => navegar('/')}>Voltar ao início</Botao>}
          />
        </div>
      </div>
    )
  }

  return (
    <div className={tela.tela}>
      <header className={tela.cabecalho}>
        <BotaoVoltar aoClicar={() => navegar('/')} rotulo="Voltar ao início" />
        <span
          className={css.selo}
          style={{
            background: `linear-gradient(180deg, ${COR_POR_TIPO[tipo]}24, ${COR_POR_TIPO[tipo]}12)`,
            color: COR_POR_TIPO[tipo],
          }}
        >
          <Icone nome={ICONE_POR_TIPO[tipo]} tamanho={18} />
        </span>
        <div className={tela.cabecalhoTextos}>
          <h1 className={tela.titulo}>{info.label}</h1>
          <span className={`${tela.subtitulo} num`}>
            {varredura.carregando
              ? 'procurando…'
              : filtrando
                ? `${arquivos.length.toLocaleString('pt-BR')} de ${todosDaCategoria.length.toLocaleString('pt-BR')} · ${formatBytes(bytes)}`
                : `${arquivos.length.toLocaleString('pt-BR')} · ${formatBytes(bytes)}`}
          </span>
        </div>
        <div className={tela.acoesCabecalho}>
          <Botao
            variante="icone"
            icone={prefs.visao === 'lista' ? 'grade' : 'lista'}
            aria-label={prefs.visao === 'lista' ? 'Ver em grade' : 'Ver em lista'}
            onClick={() => definirPref('visao', prefs.visao === 'lista' ? 'grade' : 'lista')}
          />
          <Botao
            variante="icone"
            icone="ordenar"
            aria-label="Ordenar"
            onClick={() => setMenuOrdem(true)}
          />
        </div>
      </header>

      {/* ── Recortes ──────────────────────────────────────────────────── */}
      {todosDaCategoria.length > 8 && (
        <div className={css.recortes}>
          {TAMANHOS.map((t) => (
            <button
              key={t.bytes}
              type="button"
              className={`${css.recorte} ${filtroTamanho === t.bytes ? css.recorteAtivo : ''}`}
              onClick={() => setFiltroTamanho(filtroTamanho === t.bytes ? 0 : t.bytes)}
            >
              {t.rotulo}
            </button>
          ))}
          <span className={css.recorteDivisor} aria-hidden="true" />
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              type="button"
              className={`${css.recorte} ${filtroDias === p.dias ? css.recorteAtivo : ''}`}
              onClick={() => setFiltroDias(filtroDias === p.dias ? 0 : p.dias)}
            >
              {p.rotulo}
            </button>
          ))}
        </div>
      )}

      <BarraSelecao
        selecionados={selecionados}
        total={arquivos.length}
        aoLimpar={limparSelecao}
        aoMarcarTodos={() =>
          setSelecao(
            selecao.size === arquivos.length ? new Set() : new Set(arquivos.map((a) => a.path))
          )
        }
        acoes={acoes}
      />

      <div className={tela.corpo}>
        {varredura.carregando && arquivos.length === 0 ? (
          <Carregando linhas={8} grade={prefs.visao === 'grade'} />
        ) : arquivos.length === 0 ? (
          filtrando ? (
            <Vazio
              icone="filtro"
              titulo="O recorte não deixou nada"
              texto={`Existem ${todosDaCategoria.length} ${info.label.toLowerCase()} aqui — nenhum deles cabe nesse filtro.`}
              acao={
                <Botao
                  onClick={() => {
                    setFiltroTamanho(0)
                    setFiltroDias(0)
                  }}
                >
                  Tirar os filtros
                </Botao>
              }
            />
          ) : (
            <Vazio
              icone={ICONE_POR_TIPO[tipo]}
              titulo={`Nenhum arquivo de ${info.label.toLowerCase()}`}
              texto="Nada deste tipo foi encontrado no armazenamento."
              acao={<Botao icone="casa" onClick={() => navegar('/')}>Voltar ao início</Botao>}
            />
          )
        ) : (
          <ListaArquivos
            itens={arquivos}
            visao={prefs.visao}
            selecao={selecao}
            modoSelecao={modoSelecao}
            aoAbrir={abrir}
            aoAlternarSelecao={alternar}
            aoPedirMenu={acoes.abrirMenu}
            aoToqueLongo={aoToqueLongo}
            segundaLinha={(item) =>
              `${formatBytes(item.size)} · em ${baseName(parentOf(item.path))}`
            }
          />
        )}
      </div>

      <Folha aberta={menuOrdem} aoFechar={() => setMenuOrdem(false)} titulo="Ordenar por">
        {Object.values(SORTS).map((s) => (
          <button
            key={s.id}
            type="button"
            className={`${css.opcaoOrdem} ${prefs.ordem === s.id ? css.opcaoOrdemAtiva : ''}`}
            onClick={() => {
              if (prefs.ordem === s.id) definirPref('ordemDesc', !prefs.ordemDesc)
              else {
                definirPref('ordem', s.id)
                definirPref('ordemDesc', s.id === 'size' || s.id === 'date')
              }
            }}
          >
            <span>{s.label}</span>
            {prefs.ordem === s.id && (
              <Icone nome={prefs.ordemDesc ? 'baixo' : 'cima'} tamanho={16} />
            )}
          </button>
        ))}
      </Folha>

      {acoes.elementos}
    </div>
  )
}
