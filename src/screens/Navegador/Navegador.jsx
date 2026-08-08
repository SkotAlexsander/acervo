import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import Icone from '../../components/Icone.jsx'
import BotaoVoltar from '../../components/ui/BotaoVoltar.jsx'
import Botao from '../../components/ui/Botao.jsx'
import Folha, { AcaoFolha } from '../../components/ui/Folha.jsx'
import Dialogo from '../../components/ui/Dialogo.jsx'
import { Carregando, Erro, Vazio } from '../../components/ui/Estados.jsx'
import { LinhaArquivo, LadrilhoArquivo } from '../../components/arquivo/ItemArquivo.jsx'
import useAcoesArquivo from '../../components/arquivo/useAcoesArquivo.jsx'
import BarraSelecao from '../../components/arquivo/BarraSelecao.jsx'
import { useApp } from '../../state/AppContext.jsx'
import { useDiretorio } from '../../state/hooks.js'
import { usePuxarParaAtualizar } from '../../state/gestos.js'
import IndicadorPuxada from '../../components/ui/IndicadorPuxada.jsx'
import { crumbs, baseName, parentOf, normalize, SORTS, validateName } from '../../fs/util.js'
import tela from '../tela.module.css'
import css from './Navegador.module.css'

/**
 * O navegador de pastas.
 *
 * O caminho mora na URL (`/pastas/DCIM/Camera`), não no estado do componente.
 * É o que faz o botão "voltar" do Android funcionar de graça, e o que permite
 * qualquer tela do app mandar você direto pra uma pasta.
 */
export default function Navegador() {
  const navegar = useNavigate()
  const { pathname } = useLocation()
  const { prefs, definirPref, provider, executar, registrarVisita } = useApp()

  // '/pastas/DCIM/Camera' → '/DCIM/Camera'
  const caminho = useMemo(() => {
    const bruto = decodeURIComponent(pathname.replace(/^\/pastas/, '')) || '/'
    return normalize(bruto)
  }, [pathname])

  const { itens, carregando, erro } = useDiretorio(caminho)
  const acoes = useAcoesArquivo()

  const [selecao, setSelecao] = useState(() => new Set())
  const [menuOrdem, setMenuOrdem] = useState(false)
  const [menuPasta, setMenuPasta] = useState(false)
  const [criandoPasta, setCriandoPasta] = useState(false)
  const corpoRef = useRef(null)

  const modoSelecao = selecao.size > 0

  // Trocar de pasta zera a seleção e volta a rolagem pro topo.
  // Sem isso você entra numa pasta nova já com 3 itens marcados que nem vê.
  useEffect(() => {
    setSelecao(new Set())
    if (corpoRef.current) corpoRef.current.scrollTop = 0
    registrarVisita(caminho)
  }, [caminho, registrarVisita])

  // Item que sumiu (foi movido/apagado) não pode continuar selecionado.
  useEffect(() => {
    setSelecao((s) => {
      if (!s.size) return s
      const vivos = new Set(itens.map((i) => i.path))
      const filtrada = new Set([...s].filter((p) => vivos.has(p)))
      return filtrada.size === s.size ? s : filtrada
    })
  }, [itens])

  const trilha = useMemo(() => crumbs(caminho), [caminho])
  const irPara = useCallback((p) => navegar(`/pastas${p === '/' ? '' : p}`), [navegar])

  // Depende de `acoes.abrirDetalhes` (useCallback estável), não de `acoes`,
  // que muda de identidade a cada render. Com `acoes` aqui, `abrir` mudava
  // sempre e o `memo` das linhas não segurava nada.
  const abrirArquivo = acoes.abrirArquivo
  const abrir = useCallback(
    (item) => {
      if (item.isDir) irPara(item.path)
      else abrirArquivo(item)
    },
    [irPara, abrirArquivo]
  )

  const alternar = useCallback((item) => {
    setSelecao((s) => {
      const n = new Set(s)
      if (n.has(item.path)) n.delete(item.path)
      else n.add(item.path)
      return n
    })
  }, [])

  const selecionados = useMemo(
    () => itens.filter((i) => selecao.has(i.path)),
    [itens, selecao]
  )
  const limparSelecao = useCallback(() => setSelecao(new Set()), [])

  // Toque longo entra no modo de seleção já com o item marcado — é o gesto
  // que todo gerenciador de arquivos usa, e o primeiro que a mão tenta.
  const aoToqueLongo = useCallback(
    (item) => {
      setSelecao((s) => (s.has(item.path) ? s : new Set([...s, item.path])))
    },
    []
  )

  const puxar = usePuxarParaAtualizar(corpoRef, acoes.recarregar)

  const criarPasta = async (nome) => {
    setCriandoPasta(false)
    setMenuPasta(false)
    await executar(() => provider.mkdir(caminho, nome), `Pasta "${nome}" criada.`)
  }

  const naRaiz = caminho === '/'
  const favoritada = prefs.favoritos.includes(caminho)

  return (
    <div className={tela.tela}>
      {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
      <header className={tela.cabecalho}>
        {!naRaiz && (
          <BotaoVoltar aoClicar={() => irPara(parentOf(caminho))} rotulo="Voltar uma pasta" />
        )}
        <div className={tela.cabecalhoTextos}>
          <h1 className={tela.titulo}>{naRaiz ? 'Armazenamento' : baseName(caminho)}</h1>
          <span className={tela.subtitulo}>
            {carregando
              ? 'lendo…'
              : `${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`}
          </span>
        </div>
        <div className={tela.acoesCabecalho}>
          <Botao
            variante="icone"
            icone="busca"
            aria-label="Buscar"
            onClick={() => navegar(`/busca?em=${encodeURIComponent(caminho)}`)}
          />
          <Botao
            variante="icone"
            icone={prefs.visao === 'lista' ? 'grade' : 'lista'}
            aria-label={prefs.visao === 'lista' ? 'Ver em grade' : 'Ver em lista'}
            onClick={() => definirPref('visao', prefs.visao === 'lista' ? 'grade' : 'lista')}
          />
          <Botao
            variante="icone"
            icone="maisOpcoes"
            aria-label="Mais opções desta pasta"
            onClick={() => setMenuPasta(true)}
          />
        </div>
      </header>

      {/* ── Trilha + ordenação ────────────────────────────────────────── */}
      {/* A ficha de ordenação mora aqui, e não no cabeçalho, por dois motivos:
          o cabeçalho já tem quatro botões e estouraria num celular de 320px, e
          aqui ela MOSTRA a ordem em vigor — que antes era invisível, você só
          descobria abrindo o menu. */}
      <div className={css.barraContexto}>
        <nav className={tela.trilha} aria-label="Caminho da pasta">
          {trilha.map((c, i) => (
            <span key={c.path} className={tela.trilhaItem}>
              {i > 0 && <Icone nome="avancar" tamanho={12} className={tela.trilhaSeta} />}
              <button
                type="button"
                className={`${tela.trilhaBotao} ${i === trilha.length - 1 ? tela.trilhaAtual : ''}`}
                onClick={() => irPara(c.path)}
                aria-current={i === trilha.length - 1 ? 'location' : undefined}
              >
                {c.name}
              </button>
            </span>
          ))}
        </nav>
        <button
          type="button"
          className={css.fichaOrdem}
          onClick={() => setMenuOrdem(true)}
          aria-label={`Ordenar. Agora: ${SORTS[prefs.ordem].label}, ${prefs.ordemDesc ? 'decrescente' : 'crescente'}`}
        >
          <Icone nome="ordenar" tamanho={14} />
          <span>{SORTS[prefs.ordem].label}</span>
          <Icone nome={prefs.ordemDesc ? 'baixo' : 'cima'} tamanho={13} />
        </button>
      </div>

      {/* ── Barra de seleção ──────────────────────────────────────────── */}
      <BarraSelecao
        selecionados={selecionados}
        total={itens.length}
        aoLimpar={limparSelecao}
        aoMarcarTodos={() =>
          setSelecao(
            selecao.size === itens.length ? new Set() : new Set(itens.map((i) => i.path))
          )
        }
        acoes={acoes}
      />

      {/* ── Conteúdo ──────────────────────────────────────────────────── */}
      <div className={tela.corpo} ref={corpoRef}>
        <IndicadorPuxada {...puxar} />
        {erro ? (
          <Erro
            mensagem={erro}
            acao={<Botao icone="voltar" onClick={() => irPara('/')}>Voltar ao início</Botao>}
          />
        ) : carregando ? (
          <Carregando linhas={7} grade={prefs.visao === 'grade'} />
        ) : itens.length === 0 ? (
          <Vazio
            icone="pasta"
            titulo="Pasta vazia"
            texto="Nada aqui dentro. Você pode criar uma pasta ou trazer arquivos de outro lugar."
            acao={
              <Botao icone="pastaMais" onClick={() => setCriandoPasta(true)}>
                Criar pasta
              </Botao>
            }
          />
        ) : prefs.visao === 'grade' ? (
          <div className={tela.grade}>
            {itens.map((item) => (
              <LadrilhoArquivo
                key={item.path}
                item={item}
                selecionado={selecao.has(item.path)}
                modoSelecao={modoSelecao}
                favorito={prefs.favoritos.includes(item.path)}
                aoAbrir={abrir}
                aoAlternarSelecao={alternar}
                aoPedirMenu={acoes.abrirMenu}
                aoToqueLongo={aoToqueLongo}
              />
            ))}
          </div>
        ) : (
          <div className={tela.lista}>
            {itens.map((item) => (
              <LinhaArquivo
                key={item.path}
                item={item}
                selecionado={selecao.has(item.path)}
                modoSelecao={modoSelecao}
                favorito={prefs.favoritos.includes(item.path)}
                aoAbrir={abrir}
                aoAlternarSelecao={alternar}
                aoPedirMenu={acoes.abrirMenu}
                aoToqueLongo={aoToqueLongo}
                medirPastas={prefs.medirPastas}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Menu da pasta ─────────────────────────────────────────────── */}
      <Folha aberta={menuPasta} aoFechar={() => setMenuPasta(false)} titulo={baseName(caminho)}>
        <AcaoFolha
          icone="pastaMais"
          aoClicar={() => {
            // Fecha a folha ANTES de abrir o diálogo: dois modais empilhados
            // deixam o botão de baixo alcançável e o toque erra o alvo.
            setMenuPasta(false)
            setCriandoPasta(true)
          }}
        >
          Criar pasta aqui
        </AcaoFolha>
        <AcaoFolha
          icone="confereCirculo"
          desabilitado={itens.length === 0}
          aoClicar={() => {
            setSelecao(new Set(itens.map((i) => i.path)))
            setMenuPasta(false)
          }}
        >
          Selecionar itens
          <span />
        </AcaoFolha>
        <AcaoFolha
          icone="ordenar"
          descricao={`Agora: ${SORTS[prefs.ordem].label}${prefs.ordemDesc ? ' (maior primeiro)' : ''}`}
          aoClicar={() => {
            setMenuPasta(false)
            setMenuOrdem(true)
          }}
        >
          Ordenar por…
        </AcaoFolha>
        <AcaoFolha
          icone="estrela"
          descricao={naRaiz ? 'A raiz já está sempre acessível' : undefined}
          desabilitado={naRaiz}
          aoClicar={() => {
            acoes.favoritar({ path: caminho, name: baseName(caminho) })
            setMenuPasta(false)
          }}
        >
          {favoritada ? 'Tirar dos favoritos' : 'Favoritar esta pasta'}
        </AcaoFolha>
        <AcaoFolha
          icone={prefs.mostrarOcultos ? 'olhoCortado' : 'olho'}
          descricao="Arquivos e pastas que começam com ponto"
          aoClicar={() => {
            definirPref('mostrarOcultos', !prefs.mostrarOcultos)
            setMenuPasta(false)
          }}
        >
          {prefs.mostrarOcultos ? 'Esconder ocultos' : 'Mostrar ocultos'}
        </AcaoFolha>
        <AcaoFolha
          icone="atualizar"
          aoClicar={() => {
            acoes.recarregar()
            setMenuPasta(false)
          }}
        >
          Recarregar
        </AcaoFolha>
      </Folha>

      {/* ── Ordenação ─────────────────────────────────────────────────── */}
      <Folha aberta={menuOrdem} aoFechar={() => setMenuOrdem(false)} titulo="Ordenar por">
        {Object.values(SORTS).map((s) => (
          <button
            key={s.id}
            type="button"
            className={`${css.opcaoOrdem} ${prefs.ordem === s.id ? css.opcaoOrdemAtiva : ''}`}
            onClick={() => {
              // Tocar de novo na ordem já ativa inverte o sentido —
              // é o gesto que todo mundo tenta.
              if (prefs.ordem === s.id) definirPref('ordemDesc', !prefs.ordemDesc)
              else {
                definirPref('ordem', s.id)
                // Tamanho e data fazem mais sentido do maior/mais novo pro menor.
                definirPref('ordemDesc', s.id === 'size' || s.id === 'date')
              }
            }}
          >
            <span>{s.label}</span>
            {prefs.ordem === s.id && (
              <span className={css.opcaoOrdemSentido}>
                <Icone nome={prefs.ordemDesc ? 'baixo' : 'cima'} tamanho={16} />
                {prefs.ordemDesc ? 'maior primeiro' : 'menor primeiro'}
              </span>
            )}
          </button>
        ))}
      </Folha>

      <Dialogo
        aberto={criandoPasta}
        aoFechar={() => setCriandoPasta(false)}
        tipo="texto"
        titulo="Nome da nova pasta"
        mensagem={`Ela será criada em ${baseName(caminho)}.`}
        valorInicial="Nova pasta"
        rotuloConfirmar="Criar"
        validar={validateName}
        aoConfirmar={criarPasta}
      />

      {acoes.elementos}
    </div>
  )
}
