import { memo } from 'react'
import Icone, { ICONE_POR_TIPO, COR_POR_TIPO } from '../Icone.jsx'
import { kindOf, formatBytes, formatDate } from '../../fs/util.js'
import { useMiniatura, useTamanhoPasta } from '../../state/hooks.js'
import { useToqueLongo } from '../../state/gestos.js'
import css from './ItemArquivo.module.css'

/**
 * Selo do arquivo: miniatura quando é imagem, ícone colorido quando não é.
 *
 * A cor não é enfeite — é o que deixa você achar "o PDF" na lista sem ler
 * nome nenhum. Cada categoria tem a sua, e ela é a mesma em toda tela do app.
 */
function Selo({ item, tipo, tamanho = 44 }) {
  const ehVisual = tipo === 'image'
  const url = useMiniatura(item.path, ehVisual)
  const cor = COR_POR_TIPO[tipo]

  if (ehVisual && url) {
    return (
      <span className={css.selo} style={{ width: tamanho, height: tamanho }}>
        <img className={css.miniatura} src={url} alt="" loading="lazy" draggable={false} />
      </span>
    )
  }

  return (
    <span
      className={css.selo}
      style={{
        width: tamanho,
        height: tamanho,
        // A cor da categoria com pouca opacidade vira o fundo do selo.
        // `color-mix` seria mais limpo, mas não roda em WebView antigo do Android.
        background: `linear-gradient(180deg, ${cor}22, ${cor}14)`,
        color: cor,
      }}
    >
      <Icone nome={ICONE_POR_TIPO[tipo] || 'outro'} tamanho={Math.round(tamanho * 0.5)} />
    </span>
  )
}

/** Uma linha da lista. */
function LinhaBase({
  item,
  selecionado,
  modoSelecao,
  favorito,
  aoAbrir,
  aoAlternarSelecao,
  aoPedirMenu,
  aoToqueLongo,
  segundaLinha,
  medirPastas,
}) {
  const tipo = kindOf(item)
  const toque = useToqueLongo(aoToqueLongo ? () => aoToqueLongo(item) : null, !!aoToqueLongo)
  const [refMedida, medida] = useTamanhoPasta(item.path, item.isDir, !!medirPastas)

  const meta =
    segundaLinha !== undefined
      ? segundaLinha
      : item.isDir
        ? // Enquanto a soma não volta, mostra a data — nunca um espaço em branco
          // que depois "pula" quando o número chega.
          medida
          ? `${formatBytes(medida.bytes)} · ${medida.qtdArquivos} ${medida.qtdArquivos === 1 ? 'arquivo' : 'arquivos'}`
          : formatDate(item.mtime)
        : `${formatBytes(item.size)} · ${formatDate(item.mtime)}`

  return (
    <div className={`${css.linha} ${selecionado ? css.linhaSelecionada : ''}`} ref={refMedida}>
      <button
        type="button"
        className={css.alvo}
        onClick={() => {
          // O toque longo já resolveu a intenção; deixar o clique passar
          // abriria a pasta que você acabou de selecionar.
          if (toque.consumiuOClique()) return
          if (modoSelecao) aoAlternarSelecao(item)
          else aoAbrir(item)
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          aoPedirMenu && aoPedirMenu(item)
        }}
        {...toque.handlers}
        aria-label={`${item.isDir ? 'Pasta' : 'Arquivo'} ${item.name}`}
      >
        {modoSelecao ? (
          <span className={`${css.caixinha} ${selecionado ? css.caixinhaMarcada : ''}`}>
            {selecionado && <Icone nome="confere" tamanho={14} />}
          </span>
        ) : (
          <Selo item={item} tipo={tipo} />
        )}

        <span className={css.textos}>
          <span className={`${css.nome} corta`}>{item.name}</span>
          <span className={`${css.meta} num corta`}>{meta}</span>
        </span>

        {favorito && (
          <Icone
            nome="estrela"
            tamanho={14}
            preenchido
            className={css.estrela}
            cor="var(--alerta)"
          />
        )}
        {item.isDir && !modoSelecao && (
          <Icone nome="avancar" tamanho={17} className={css.seta} />
        )}
      </button>

      {!modoSelecao && aoPedirMenu && (
        <button
          type="button"
          className={css.menu}
          onClick={(e) => {
            e.stopPropagation()
            aoPedirMenu(item)
          }}
          aria-label={`Opções de ${item.name}`}
        >
          <Icone nome="maisOpcoes" tamanho={19} />
        </button>
      )}
    </div>
  )
}

/** Um ladrilho da grade. */
function LadrilhoBase({
  item,
  selecionado,
  modoSelecao,
  favorito,
  aoAbrir,
  aoAlternarSelecao,
  aoPedirMenu,
  aoToqueLongo,
}) {
  const tipo = kindOf(item)
  const toque = useToqueLongo(aoToqueLongo ? () => aoToqueLongo(item) : null, !!aoToqueLongo)
  return (
    <button
      type="button"
      className={`${css.ladrilho} ${selecionado ? css.ladrilhoSelecionado : ''}`}
      onClick={() => {
        if (toque.consumiuOClique()) return
        if (modoSelecao) aoAlternarSelecao(item)
        else aoAbrir(item)
      }}
      onContextMenu={(e) => {
        e.preventDefault()
        aoPedirMenu && aoPedirMenu(item)
      }}
      {...toque.handlers}
      aria-label={`${item.isDir ? 'Pasta' : 'Arquivo'} ${item.name}`}
    >
      <span className={css.ladrilhoTopo}>
        <Selo item={item} tipo={tipo} tamanho={54} />
        {modoSelecao && (
          <span className={`${css.caixinha} ${css.caixinhaFlutuante} ${selecionado ? css.caixinhaMarcada : ''}`}>
            {selecionado && <Icone nome="confere" tamanho={14} />}
          </span>
        )}
        {favorito && !modoSelecao && (
          <Icone
            nome="estrela"
            tamanho={13}
            preenchido
            className={css.estrelaLadrilho}
            cor="var(--alerta)"
          />
        )}
      </span>
      <span className={`${css.ladrilhoNome} corta-2`}>{item.name}</span>
      <span className={`${css.ladrilhoMeta} num`}>
        {item.isDir ? 'pasta' : formatBytes(item.size)}
      </span>
    </button>
  )
}

// memo: a lista pode ter centenas de itens. Sem isso, marcar UM arquivo
// redesenha todos os outros e a rolagem engasga no celular.
export const LinhaArquivo = memo(LinhaBase)
export const LadrilhoArquivo = memo(LadrilhoBase)
export { Selo }
