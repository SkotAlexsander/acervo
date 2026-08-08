import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icone from '../../components/Icone.jsx'
import Botao from '../../components/ui/Botao.jsx'
import Folha from '../../components/ui/Folha.jsx'
import { Progresso, Vazio } from '../../components/ui/Estados.jsx'
import { LinhaArquivo } from '../../components/arquivo/ItemArquivo.jsx'
import useAcoesArquivo from '../../components/arquivo/useAcoesArquivo.jsx'
import { useApp } from '../../state/AppContext.jsx'
import { useVarredura, useLixeira } from '../../state/hooks.js'
import {
  acharDuplicados,
  acharGrandes,
  acharVazios,
  acharAntigos,
  acharPastasVazias,
} from '../../fs/scan.js'
import { formatBytes, formatDate, baseName, parentOf } from '../../fs/util.js'
import tela from '../tela.module.css'
import css from './Limpeza.module.css'

const UM_ANO = 365

/**
 * Limpeza — onde está o espaço que dá pra recuperar.
 *
 * Regra da tela, e ela não se negocia: NADA é apagado sem seleção explícita.
 * Um "limpar tudo" de um toque é como esses apps somem com a foto do
 * casamento de alguém. Aqui todo grupo já vem com uma sugestão marcada, e
 * a sugestão é sempre a conservadora — no caso de duplicado, mantém o mais
 * antigo (o original) e marca as cópias.
 */
export default function Limpeza() {
  const navegar = useNavigate()
  const { prefs, provider } = useApp()
  const varredura = useVarredura(true)
  const lixeira = useLixeira()
  const acoes = useAcoesArquivo()

  const [pastasVazias, setPastasVazias] = useState([])
  const [aberto, setAberto] = useState(null) // id do grupo aberto
  const [marcados, setMarcados] = useState(() => new Set())

  const duplicados = useMemo(
    () => (varredura.pronto ? acharDuplicados(varredura.arquivos) : []),
    [varredura.pronto, varredura.arquivos]
  )
  const grandes = useMemo(
    () => (varredura.pronto ? acharGrandes(varredura.arquivos, prefs.limiteGrande) : []),
    [varredura.pronto, varredura.arquivos, prefs.limiteGrande]
  )
  const vazios = useMemo(
    () => (varredura.pronto ? acharVazios(varredura.arquivos) : []),
    [varredura.pronto, varredura.arquivos]
  )
  const antigos = useMemo(
    () => (varredura.pronto ? acharAntigos(varredura.arquivos, UM_ANO) : []),
    [varredura.pronto, varredura.arquivos]
  )

  // Pastas vazias exigem uma chamada por pasta — só roda quando a varredura
  // terminou, pra não competir com ela.
  useEffect(() => {
    if (!varredura.pronto || !provider) return
    let vivo = true
    const sinal = { cancelado: false }
    acharPastasVazias(provider, varredura.pastas, sinal)
      .then((r) => vivo && setPastasVazias(r))
      .catch(() => vivo && setPastasVazias([]))
    return () => {
      vivo = false
      sinal.cancelado = true
    }
  }, [varredura.pronto, varredura.pastas, provider])

  const bytesLixeira = lixeira.itens.reduce((s, i) => s + (i.size || 0), 0)
  const bytesDuplicados = duplicados.reduce((s, g) => s + g.recuperavel, 0)
  const bytesGrandes = grandes.reduce((s, g) => s + g.size, 0)
  const bytesAntigos = antigos.reduce((s, a) => s + a.size, 0)

  // As cópias de duplicado, achatadas: cada grupo contribui com tudo menos o
  // mais antigo. É esta lista que vem pré-marcada.
  const copiasDuplicadas = useMemo(
    () => duplicados.flatMap((g) => g.itens.slice(1)),
    [duplicados]
  )

  const GRUPOS = [
    {
      id: 'duplicados',
      icone: 'duplicado',
      cor: 'var(--c-imagem)',
      titulo: 'Cópias repetidas',
      resumo: `${copiasDuplicadas.length} ${copiasDuplicadas.length === 1 ? 'cópia' : 'cópias'} em ${duplicados.length} ${duplicados.length === 1 ? 'grupo' : 'grupos'}`,
      bytes: bytesDuplicados,
      itens: copiasDuplicadas,
      preMarcar: true,
      nota: 'Mesmo nome e mesmo tamanho. Este app NÃO compara o conteúdo — confira antes de apagar. O mais antigo de cada grupo fica de fora.',
    },
    {
      id: 'grandes',
      icone: 'peso',
      cor: 'var(--c-video)',
      titulo: 'Arquivos grandes',
      resumo: `${grandes.length} acima de ${formatBytes(prefs.limiteGrande, 0)}`,
      bytes: bytesGrandes,
      itens: grandes,
      preMarcar: false,
      nota: 'Nada aqui é lixo por definição — são só os maiores. Olhe um por um.',
    },
    {
      id: 'antigos',
      icone: 'relogio',
      cor: 'var(--c-audio)',
      titulo: 'Parados há mais de um ano',
      resumo: `${antigos.length} ${antigos.length === 1 ? 'arquivo' : 'arquivos'}`,
      bytes: bytesAntigos,
      itens: antigos.slice(0, 300),
      preMarcar: false,
      nota: 'Sem alteração há mais de 12 meses. Documento importante costuma cair aqui — não é sinal de descarte.',
    },
    {
      id: 'vazios',
      icone: 'arquivo',
      cor: 'var(--c-outro)',
      titulo: 'Arquivos de 0 byte',
      resumo: `${vazios.length} ${vazios.length === 1 ? 'arquivo' : 'arquivos'}`,
      bytes: 0,
      itens: vazios,
      preMarcar: true,
      nota: 'Restos de download interrompido. Não ocupam espaço, mas sujam a lista.',
    },
    {
      id: 'pastasVazias',
      icone: 'pasta',
      cor: 'var(--c-pasta)',
      titulo: 'Pastas vazias',
      resumo: `${pastasVazias.length} ${pastasVazias.length === 1 ? 'pasta' : 'pastas'}`,
      bytes: 0,
      itens: pastasVazias,
      preMarcar: false,
      nota: 'Sobram quando você move arquivos. Algumas são criadas por apps e voltam sozinhas.',
    },
  ].filter((g) => g.itens.length > 0)

  const grupoAberto = GRUPOS.find((g) => g.id === aberto) || null

  const abrirGrupo = useCallback((grupo) => {
    setAberto(grupo.id)
    setMarcados(grupo.preMarcar ? new Set(grupo.itens.map((i) => i.path)) : new Set())
  }, [])

  const alternarMarca = (path) =>
    setMarcados((s) => {
      const n = new Set(s)
      if (n.has(path)) n.delete(path)
      else n.add(path)
      return n
    })

  const marcadosDoGrupo = grupoAberto
    ? grupoAberto.itens.filter((i) => marcados.has(i.path))
    : []
  const bytesMarcados = marcadosDoGrupo.reduce((s, i) => s + (i.size || 0), 0)

  const totalRecuperavel = bytesLixeira + bytesDuplicados

  return (
    <div className={tela.tela}>
      <header className={tela.cabecalho}>
        <div className={tela.cabecalhoTextos}>
          <h1 className={tela.titulo}>Limpeza</h1>
          <span className={tela.subtitulo}>
            {varredura.carregando ? 'analisando…' : 'o que dá pra recuperar'}
          </span>
        </div>
        <Botao
          variante="icone"
          icone="atualizar"
          aria-label="Analisar de novo"
          onClick={acoes.recarregar}
        />
      </header>

      <div className={tela.corpo}>
        {varredura.carregando && (
          <Progresso
            rotulo={varredura.progresso ? `${varredura.progresso.toLocaleString('pt-BR')} lidos` : 'lendo…'}
          />
        )}

        {/* Destaque */}
        <section className={tela.secao}>
          <div className={css.destaque}>
            <span className={css.destaqueRotulo}>Espaço recuperável com segurança</span>
            <span className={`${css.destaqueValor} num`}>{formatBytes(totalRecuperavel)}</span>
            <span className={css.destaqueNota}>
              lixeira + cópias repetidas — o resto da lista precisa da sua leitura
            </span>
          </div>
        </section>

        {/* Onde foi o espaço */}
        <section className={tela.secao}>
          <button type="button" className={css.grupo} onClick={() => navegar('/espaco')}>
            <span className={css.grupoIcone} style={{ color: 'var(--acento)' }}>
              <Icone nome="disco" tamanho={20} />
            </span>
            <span className={css.grupoTextos}>
              <span className={css.grupoTitulo}>Onde foi meu espaço</span>
              <span className={css.grupoResumo}>As pastas que mais ocupam, em ordem</span>
            </span>
            <Icone nome="avancar" tamanho={17} className={css.grupoSeta} />
          </button>
        </section>

        {/* Lixeira */}
        <section className={tela.secao}>
          <button type="button" className={css.grupo} onClick={() => navegar('/lixeira')}>
            <span className={css.grupoIcone} style={{ color: 'var(--perigo)' }}>
              <Icone nome="lixeira" tamanho={20} />
            </span>
            <span className={css.grupoTextos}>
              <span className={css.grupoTitulo}>Lixeira</span>
              <span className={css.grupoResumo}>
                {lixeira.itens.length === 0
                  ? 'vazia'
                  : `${lixeira.itens.length} ${lixeira.itens.length === 1 ? 'item' : 'itens'} guardados`}
              </span>
            </span>
            <span className={`${css.grupoBytes} num`}>{formatBytes(bytesLixeira)}</span>
            <Icone nome="avancar" tamanho={17} className={css.grupoSeta} />
          </button>
        </section>

        {/* Achados */}
        <section className={tela.secao}>
          <div className={tela.secaoCabecalho}>
            <h2 className={tela.secaoTitulo}>Achados</h2>
          </div>

          {!varredura.pronto ? (
            <div className={css.esperando}>Procurando pelo armazenamento…</div>
          ) : GRUPOS.length === 0 ? (
            <Vazio
              icone="confereCirculo"
              titulo="Nada a limpar"
              texto="Sem cópias repetidas, sem arquivo vazio, sem pasta órfã. Está arrumado."
            />
          ) : (
            <div className={css.grupos}>
              {GRUPOS.map((g) => (
                <button key={g.id} type="button" className={css.grupo} onClick={() => abrirGrupo(g)}>
                  <span className={css.grupoIcone} style={{ color: g.cor }}>
                    <Icone nome={g.icone} tamanho={20} />
                  </span>
                  <span className={css.grupoTextos}>
                    <span className={css.grupoTitulo}>{g.titulo}</span>
                    <span className={css.grupoResumo}>{g.resumo}</span>
                  </span>
                  {g.bytes > 0 && <span className={`${css.grupoBytes} num`}>{formatBytes(g.bytes)}</span>}
                  <Icone nome="avancar" tamanho={17} className={css.grupoSeta} />
                </button>
              ))}
            </div>
          )}
        </section>

        <p className={css.rodapeNota}>
          <Icone nome="info" tamanho={14} />
          Excluir aqui manda pra lixeira, não apaga. Só a lixeira apaga de vez.
        </p>
      </div>

      {/* Folha do grupo */}
      <Folha
        aberta={!!grupoAberto}
        aoFechar={() => setAberto(null)}
        titulo={grupoAberto?.titulo}
        rodape={
          grupoAberto && (
            <>
              <Botao
                variante="fantasma"
                onClick={() =>
                  setMarcados(
                    marcadosDoGrupo.length === grupoAberto.itens.length
                      ? new Set()
                      : new Set(grupoAberto.itens.map((i) => i.path))
                  )
                }
                largura="total"
              >
                {marcadosDoGrupo.length === grupoAberto.itens.length ? 'Desmarcar' : 'Marcar todos'}
              </Botao>
              <Botao
                variante="perigo"
                largura="total"
                disabled={marcadosDoGrupo.length === 0}
                onClick={() =>
                  acoes.pedirExclusao(marcadosDoGrupo, () => {
                    setAberto(null)
                    setMarcados(new Set())
                  })
                }
              >
                Excluir {marcadosDoGrupo.length || ''}
                {bytesMarcados > 0 ? ` · ${formatBytes(bytesMarcados)}` : ''}
              </Botao>
            </>
          )
        }
      >
        {grupoAberto && (
          <>
            <p className={css.notaGrupo}>
              <Icone nome="alerta" tamanho={14} />
              {grupoAberto.nota}
            </p>
            <div className={css.listaGrupo}>
              {grupoAberto.itens.slice(0, 200).map((item) => (
                <LinhaArquivo
                  key={item.path}
                  item={item}
                  selecionado={marcados.has(item.path)}
                  modoSelecao
                  aoAbrir={() => alternarMarca(item.path)}
                  aoAlternarSelecao={() => alternarMarca(item.path)}
                  segundaLinha={`${formatBytes(item.size)} · ${formatDate(item.mtime)} · em ${baseName(parentOf(item.path))}`}
                />
              ))}
              {grupoAberto.itens.length > 200 && (
                <p className={css.limite}>
                  Mostrando os 200 primeiros de {grupoAberto.itens.length}. Limpe estes e
                  analise de novo.
                </p>
              )}
            </div>
          </>
        )}
      </Folha>

      {acoes.elementos}
    </div>
  )
}
