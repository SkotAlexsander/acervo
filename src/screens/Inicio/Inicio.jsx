import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Icone, { ICONE_POR_TIPO, COR_POR_TIPO } from '../../components/Icone.jsx'
import { useApp } from '../../state/AppContext.jsx'
import { useArmazenamento, useVarredura, useLixeira } from '../../state/hooks.js'
import { resumoPorCategoria, acharDuplicados, acharGrandes } from '../../fs/scan.js'
import { KINDS, KIND_ORDER, formatBytes, baseName, parentOf } from '../../fs/util.js'
import tela from '../tela.module.css'
import css from './Inicio.module.css'

/** Atalhos que existem em quase todo Android. Some da tela o que não existir. */
const ATALHOS = [
  { path: '/DCIM/Camera', rotulo: 'Câmera', icone: 'imagem', cor: 'var(--c-imagem)' },
  { path: '/Download', rotulo: 'Downloads', icone: 'baixar', cor: 'var(--c-doc)' },
  { path: '/WhatsApp/Media/WhatsApp Images', rotulo: 'WhatsApp', icone: 'compartilhar', cor: 'var(--c-app)' },
  { path: '/Documents', rotulo: 'Documentos', icone: 'documento', cor: 'var(--c-video)' },
]

export default function Inicio() {
  const navegar = useNavigate()
  const { prefs, definirPref } = useApp()
  const armazenamento = useArmazenamento()
  const varredura = useVarredura(true)
  const lixeira = useLixeira()

  const categorias = useMemo(
    () => resumoPorCategoria(varredura.arquivos),
    [varredura.arquivos]
  )

  // O que a Limpeza acharia — calculado aqui só pra mostrar o número no card.
  const aLiberar = useMemo(() => {
    if (!varredura.pronto) return null
    const dup = acharDuplicados(varredura.arquivos).reduce((s, g) => s + g.recuperavel, 0)
    const grandes = acharGrandes(varredura.arquivos, prefs.limiteGrande)
    return {
      duplicados: dup,
      grandes: grandes.length,
      lixo: lixeira.itens.reduce((s, i) => s + (i.size || 0), 0),
    }
  }, [varredura.pronto, varredura.arquivos, prefs.limiteGrande, lixeira.itens])

  const totalArquivos = varredura.arquivos.length
  const proximoTema = prefs.tema === 'escuro' ? 'claro' : 'escuro'

  return (
    <div className={tela.tela}>
      <header className={tela.cabecalho}>
        <span className={css.marca}>
          <span className={css.marcaSelo}>
            <Icone nome="pasta" tamanho={17} />
          </span>
          <span className={css.marcaTextos}>
            <span className={css.marcaNome}>Acervo</span>
            <span className={css.marcaSub}>seu celular, organizado</span>
          </span>
        </span>
        <div className={tela.acoesCabecalho}>
          <button
            type="button"
            className={css.botaoTema}
            onClick={() => definirPref('tema', proximoTema)}
            aria-label={`Mudar para o tema ${proximoTema}`}
            title={`Tema ${proximoTema}`}
          >
            <Icone nome={prefs.tema === 'escuro' ? 'sol' : 'lua'} tamanho={19} />
          </button>
        </div>
      </header>

      <div className={tela.corpo}>
        {/* Busca — leva pra tela dedicada, com o teclado já aberto lá */}
        <div className={css.blocoBusca}>
          <button type="button" className={css.gatilhoBusca} onClick={() => navegar('/busca')}>
            <Icone nome="busca" tamanho={18} />
            <span>Buscar em {totalArquivos ? totalArquivos.toLocaleString('pt-BR') : ''} arquivos…</span>
          </button>
        </div>

        {/* Armazenamento */}
        <section className={tela.secao}>
          <div className={css.cartaoDisco}>
            <div className={css.discoTopo}>
              <span className={css.discoIcone}>
                <Icone nome="disco" tamanho={19} />
              </span>
              <div className={css.discoTextos}>
                <span className={css.discoRotulo}>Armazenamento</span>
                <span className={`${css.discoValor} num`}>
                  {armazenamento && armazenamento.total > 0
                    ? `${formatBytes(armazenamento.used)} de ${formatBytes(armazenamento.total, 0)}`
                    : formatBytes(varredura.arquivos.reduce((s, a) => s + (a.size || 0), 0))}
                </span>
              </div>
              {armazenamento && armazenamento.total > 0 && (
                <span className={`${css.discoPorcento} num`}>
                  {Math.round((armazenamento.used / armazenamento.total) * 100)}%
                </span>
              )}
            </div>

            {armazenamento && armazenamento.total > 0 && (
              <Barra info={armazenamento} categorias={categorias} />
            )}

            <div className={css.discoRodape}>
              {armazenamento && armazenamento.total > 0 && (
                <span className={`${css.discoLivre} num`}>
                  {formatBytes(armazenamento.free)} livres
                </span>
              )}
              <button type="button" className={css.discoAcao} onClick={() => navegar('/limpeza')}>
                <Icone nome="brilho" tamanho={15} />
                Liberar espaço
                {aLiberar && aLiberar.duplicados + aLiberar.lixo > 0 && (
                  <span className={`${css.discoSelo} num`}>
                    {formatBytes(aLiberar.duplicados + aLiberar.lixo)}
                  </span>
                )}
              </button>
            </div>
          </div>
        </section>

        {/* Categorias */}
        <section className={tela.secao}>
          <div className={tela.secaoCabecalho}>
            <h2 className={tela.secaoTitulo}>Por tipo</h2>
            {varredura.carregando && <span className={css.contando}>lendo…</span>}
          </div>
          {/* Só as 6 categorias "de verdade" entram na grade — 6 fecha 3×2 ou
              2×3 sem sobrar um ladrilho órfão em nenhuma largura. "Outros" é
              o balaio do resto e vira uma faixa larga logo abaixo. */}
          <div className={css.gradeCategorias}>
            {KIND_ORDER.filter((k) => k !== 'other').map((k) => {
              const dados = categorias[k] || { qtd: 0, bytes: 0 }
              return (
                <button
                  key={k}
                  type="button"
                  className={css.categoria}
                  onClick={() => navegar(`/categoria/${k}`)}
                  disabled={!dados.qtd}
                >
                  <span
                    className={css.categoriaIcone}
                    style={{
                      background: `linear-gradient(180deg, ${COR_POR_TIPO[k]}24, ${COR_POR_TIPO[k]}12)`,
                      color: COR_POR_TIPO[k],
                    }}
                  >
                    <Icone nome={ICONE_POR_TIPO[k]} tamanho={20} />
                  </span>
                  <span className={css.categoriaNome}>{KINDS[k].label}</span>
                  <span className={`${css.categoriaMeta} num`}>
                    {dados.qtd ? `${dados.qtd} · ${formatBytes(dados.bytes)}` : '—'}
                  </span>
                </button>
              )
            })}
          </div>

          {categorias.other && categorias.other.qtd > 0 && (
            <button
              type="button"
              className={css.categoriaLarga}
              onClick={() => navegar('/categoria/other')}
            >
              <span
                className={css.categoriaIcone}
                style={{
                  background: `linear-gradient(180deg, ${COR_POR_TIPO.other}24, ${COR_POR_TIPO.other}12)`,
                  color: COR_POR_TIPO.other,
                }}
              >
                <Icone nome={ICONE_POR_TIPO.other} tamanho={19} />
              </span>
              <span className={css.categoriaNome}>Outros</span>
              <span className={`${css.categoriaMeta} num`}>
                {categorias.other.qtd} · {formatBytes(categorias.other.bytes)}
              </span>
              <Icone nome="avancar" tamanho={16} className={css.categoriaSeta} />
            </button>
          )}
        </section>

        {/* Favoritos */}
        {prefs.favoritos.length > 0 && (
          <section className={tela.secao}>
            <div className={tela.secaoCabecalho}>
              <h2 className={tela.secaoTitulo}>Favoritos</h2>
              <button
                type="button"
                className={tela.secaoLink}
                onClick={() => navegar('/favoritos')}
              >
                Ver todos
              </button>
            </div>
            <div className={css.fita}>
              {prefs.favoritos.slice(0, 8).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={css.ficha}
                  onClick={() => navegar(`/pastas${parentOf(p) === '/' ? '' : parentOf(p)}`)}
                  title={p}
                >
                  <Icone nome="estrela" tamanho={13} preenchido cor="var(--alerta)" />
                  <span className="corta">{baseName(p)}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Atalhos */}
        <section className={tela.secao}>
          <div className={tela.secaoCabecalho}>
            <h2 className={tela.secaoTitulo}>Acesso rápido</h2>
            <button type="button" className={tela.secaoLink} onClick={() => navegar('/pastas')}>
              Todas as pastas
            </button>
          </div>
          <div className={css.gradeAtalhos}>
            {ATALHOS.map((a) => (
              <button
                key={a.path}
                type="button"
                className={css.atalho}
                onClick={() => navegar(`/pastas${a.path}`)}
              >
                <span className={css.atalhoIcone} style={{ color: a.cor }}>
                  <Icone nome={a.icone} tamanho={17} />
                </span>
                <span className="corta">{a.rotulo}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Recentes */}
        {prefs.recentes.length > 0 && (
          <section className={tela.secao}>
            <div className={tela.secaoCabecalho}>
              <h2 className={tela.secaoTitulo}>Visitadas há pouco</h2>
            </div>
            <div className={css.fita}>
              {prefs.recentes.slice(0, 8).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={css.ficha}
                  onClick={() => navegar(`/pastas${p}`)}
                  title={p}
                >
                  <Icone nome="relogio" tamanho={13} />
                  <span className="corta">{baseName(p)}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <p className={css.rodape}>
          {varredura.pronto
            ? `${totalArquivos.toLocaleString('pt-BR')} arquivos em ${varredura.pastas.length.toLocaleString('pt-BR')} pastas`
            : 'lendo o armazenamento…'}
        </p>
      </div>
    </div>
  )
}

/**
 * Barra de armazenamento segmentada por categoria.
 *
 * Uma barra única em cinza diz "está cheio". Esta diz DE QUÊ está cheio —
 * que é a informação que faz alguém agir.
 */
function Barra({ info, categorias }) {
  const total = info.total || 1
  const segmentos = KIND_ORDER.map((k) => ({
    k,
    bytes: (categorias[k] && categorias[k].bytes) || 0,
  })).filter((s) => s.bytes / total > 0.002)

  const somaVisivel = segmentos.reduce((s, x) => s + x.bytes, 0)
  const sistema = Math.max(0, info.used - somaVisivel)

  return (
    <div
      className={css.barra}
      role="img"
      aria-label={`${formatBytes(info.used)} usados de ${formatBytes(info.total)}`}
    >
      {sistema > 0 && (
        <span
          className={css.segmento}
          style={{ width: `${(sistema / total) * 100}%`, background: 'var(--texto-3)', opacity: 0.45 }}
          title={`Sistema e apps · ${formatBytes(sistema)}`}
        />
      )}
      {segmentos.map((s) => (
        <span
          key={s.k}
          className={css.segmento}
          style={{ width: `${(s.bytes / total) * 100}%`, background: COR_POR_TIPO[s.k] }}
          title={`${KINDS[s.k].label} · ${formatBytes(s.bytes)}`}
        />
      ))}
    </div>
  )
}
