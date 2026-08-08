import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Icone from '../../components/Icone.jsx'
import BotaoVoltar from '../../components/ui/BotaoVoltar.jsx'
import Botao from '../../components/ui/Botao.jsx'
import { Progresso, Vazio } from '../../components/ui/Estados.jsx'
import ListaArquivos from '../../components/arquivo/ListaArquivos.jsx'
import useAcoesArquivo from '../../components/arquivo/useAcoesArquivo.jsx'
import BarraSelecao from '../../components/arquivo/BarraSelecao.jsx'
import { useApp } from '../../state/AppContext.jsx'
import { useVarredura, useVarreduraDe, useAtraso } from '../../state/hooks.js'
import { buscar } from '../../fs/scan.js'
import { KINDS, KIND_ORDER, kindOf, formatBytes, parentOf, baseName, normalize } from '../../fs/util.js'
import tela from '../tela.module.css'
import css from './Busca.module.css'

/**
 * Busca por nome, em todo o armazenamento ou dentro de uma pasta.
 *
 * Duas decisões que mudam a sensação de uso:
 *  · o termo passa por `fold()` — digitar "relatorio" acha "Relatório".
 *  · a digitação tem 200ms de folga antes de filtrar; sem isso, cada tecla
 *    varre 800 arquivos e o campo engasga.
 */
export default function Busca() {
  const navegar = useNavigate()
  const [params, setParams] = useSearchParams()
  const { prefs } = useApp()
  const acoes = useAcoesArquivo()

  const escopo = params.get('em') ? normalize(params.get('em')) : '/'
  const escopoRestrito = escopo !== '/'

  const [texto, setTexto] = useState(params.get('q') || '')
  const [filtro, setFiltro] = useState('todos')
  const [selecao, setSelecao] = useState(() => new Set())
  const entradaRef = useRef(null)

  const termo = useAtraso(texto, 200)

  const global = useVarredura(!escopoRestrito)
  const local = useVarreduraDe(escopo, escopoRestrito)
  const fonte = escopoRestrito ? local : global

  // Abriu a tela → teclado na mão. Delay curto pro Android não engolir o foco
  // enquanto a transição de rota ainda está acontecendo.
  useEffect(() => {
    const t = setTimeout(() => entradaRef.current?.focus(), 120)
    return () => clearTimeout(t)
  }, [])

  // Guarda o termo na URL: voltar pra busca traz o que você tinha digitado.
  useEffect(() => {
    const atual = params.get('q') || ''
    if (atual === termo) return
    const novo = new URLSearchParams(params)
    if (termo) novo.set('q', termo)
    else novo.delete('q')
    setParams(novo, { replace: true })
    // `params`/`setParams` mudam de identidade a cada render do router;
    // incluí-los aqui criaria laço infinito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termo])

  const todos = useMemo(
    () => [...fonte.pastas, ...fonte.arquivos],
    [fonte.pastas, fonte.arquivos]
  )

  const resultados = useMemo(() => {
    if (!termo.trim()) return []
    const achados = buscar(todos, termo)
    if (filtro === 'todos') return achados
    if (filtro === 'folder') return achados.filter((i) => i.isDir)
    return achados.filter((i) => !i.isDir && kindOf(i) === filtro)
  }, [todos, termo, filtro])

  // Contagem por tipo do que foi achado — alimenta as fichas de filtro.
  const porTipo = useMemo(() => {
    if (!termo.trim()) return {}
    const achados = buscar(todos, termo)
    const out = { folder: 0 }
    for (const i of achados) {
      const k = i.isDir ? 'folder' : kindOf(i)
      out[k] = (out[k] || 0) + 1
    }
    return out
  }, [todos, termo])

  const alternar = useCallback((item) => {
    setSelecao((s) => {
      const n = new Set(s)
      if (n.has(item.path)) n.delete(item.path)
      else n.add(item.path)
      return n
    })
  }, [])

  const limparSelecao = useCallback(() => setSelecao(new Set()), [])

  // Toque longo entra no modo de seleção com o item já marcado.
  const aoToqueLongo = useCallback((item) => {
    setSelecao((s) => (s.has(item.path) ? s : new Set([...s, item.path])))
  }, [])
  const modoSelecao = selecao.size > 0
  const selecionados = useMemo(
    () => resultados.filter((r) => selecao.has(r.path)),
    [resultados, selecao]
  )

  const abrirArquivo = acoes.abrirArquivo
  const abrir = useCallback(
    (item) => {
      if (modoSelecao) return alternar(item)
      if (item.isDir) navegar(`/pastas${item.path}`)
      else abrirArquivo(item)
    },
    [modoSelecao, alternar, navegar, abrirArquivo]
  )

  const filtrosDisponiveis = useMemo(
    () =>
      ['folder', ...KIND_ORDER].filter((k) => porTipo[k] > 0),
    [porTipo]
  )

  return (
    <div className={tela.tela}>
      <header className={tela.cabecalho}>
        <BotaoVoltar aoClicar={() => navegar(-1)} rotulo="Voltar" />
        <div className={tela.busca}>
          <Icone nome="busca" tamanho={18} />
          <input
            ref={entradaRef}
            className={tela.buscaEntrada}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={escopoRestrito ? `Buscar em ${baseName(escopo)}…` : 'Buscar arquivo ou pasta…'}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Termo da busca"
          />
          {texto && (
            <button
              type="button"
              className={tela.buscaLimpar}
              onClick={() => {
                setTexto('')
                entradaRef.current?.focus()
              }}
              aria-label="Limpar busca"
            >
              <Icone nome="fechar" tamanho={14} />
            </button>
          )}
        </div>
      </header>

      {escopoRestrito && (
        <div className={css.escopo}>
          <Icone nome="pasta" tamanho={14} />
          <span className="corta">Só dentro de {escopo}</span>
          <button type="button" onClick={() => setParams({ q: termo })}>
            buscar em tudo
          </button>
        </div>
      )}

      {filtrosDisponiveis.length > 1 && (
        <div className={css.filtros}>
          <button
            type="button"
            className={`${css.filtro} ${filtro === 'todos' ? css.filtroAtivo : ''}`}
            onClick={() => setFiltro('todos')}
          >
            Tudo <span className="num">{resultados.length && filtro === 'todos' ? resultados.length : Object.values(porTipo).reduce((a, b) => a + b, 0)}</span>
          </button>
          {filtrosDisponiveis.map((k) => (
            <button
              key={k}
              type="button"
              className={`${css.filtro} ${filtro === k ? css.filtroAtivo : ''}`}
              onClick={() => setFiltro(k)}
            >
              {k === 'folder' ? 'Pastas' : KINDS[k].label} <span className="num">{porTipo[k]}</span>
            </button>
          ))}
        </div>
      )}

      <BarraSelecao
        selecionados={selecionados}
        total={resultados.length}
        aoLimpar={limparSelecao}
        aoMarcarTodos={() =>
          setSelecao(
            selecao.size === resultados.length
              ? new Set()
              : new Set(resultados.map((r) => r.path))
          )
        }
        acoes={acoes}
      />

      <div className={tela.corpo}>
        {fonte.carregando && (
          <Progresso
            rotulo={fonte.progresso ? `${fonte.progresso.toLocaleString('pt-BR')} lidos` : 'lendo…'}
          />
        )}

        {!termo.trim() ? (
          <Vazio
            icone="busca"
            titulo="Digite pra procurar"
            texto={
              escopoRestrito
                ? `A busca vai olhar tudo que está dentro de ${baseName(escopo)}.`
                : 'A busca olha o armazenamento inteiro. Acentos não importam: "relatorio" acha "Relatório".'
            }
          />
        ) : resultados.length === 0 && !fonte.carregando ? (
          <Vazio
            icone="busca"
            titulo={`Nada com "${termo}"`}
            texto={
              filtro !== 'todos'
                ? 'Tente tirar o filtro de tipo — pode haver resultado de outra categoria.'
                : 'Confira a escrita, ou tente só um pedaço do nome.'
            }
            acao={
              filtro !== 'todos' ? (
                <Botao onClick={() => setFiltro('todos')}>Mostrar todos os tipos</Botao>
              ) : null
            }
          />
        ) : (
          <>
            <p className={css.contagem}>
              {resultados.length.toLocaleString('pt-BR')}{' '}
              {resultados.length === 1 ? 'resultado' : 'resultados'}
            </p>
            <ListaArquivos
              itens={resultados}
              visao={prefs.visao}
              selecao={selecao}
              modoSelecao={modoSelecao}
              aoAbrir={abrir}
              aoAlternarSelecao={alternar}
              aoPedirMenu={acoes.abrirMenu}
            aoToqueLongo={aoToqueLongo}
              segundaLinha={(item) =>
                item.isDir
                  ? `pasta · em ${baseName(parentOf(item.path))}`
                  : `${formatBytes(item.size)} · em ${baseName(parentOf(item.path))}`
              }
            />
          </>
        )}
      </div>

      {acoes.elementos}
    </div>
  )
}
