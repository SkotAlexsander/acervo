import { useEffect, useState } from 'react'
import Folha from '../ui/Folha.jsx'
import Botao from '../ui/Botao.jsx'
import Icone, { COR_POR_TIPO } from '../Icone.jsx'
import { Selo } from './ItemArquivo.jsx'
import { ehLegivel } from './LeitorTexto.jsx'
import { useApp } from '../../state/AppContext.jsx'
import { tamanhoDaPasta } from '../../fs/scan.js'
import { kindOf, formatBytes, formatDateFull, parentOf, KINDS } from '../../fs/util.js'
import { useMiniatura } from '../../state/hooks.js'
import css from './PainelDetalhes.module.css'

const NOME_TIPO = {
  folder: 'Pasta',
  image: 'Imagem',
  video: 'Vídeo',
  audio: 'Áudio',
  doc: 'Documento',
  archive: 'Arquivo compactado',
  app: 'Aplicativo',
  other: 'Arquivo',
}

/**
 * Ficha do arquivo ou da pasta.
 *
 * Para pasta, o tamanho é CALCULADO descendo a árvore — o sistema de arquivos
 * não guarda esse número. Como pode demorar em pasta grande, começa mostrando
 * "calculando…" em vez de travar a folha esperando o resultado.
 */
export default function PainelDetalhes({ item, aoFechar, aoLer }) {
  const { provider } = useApp()
  const [pasta, setPasta] = useState(null)
  const tipo = item ? kindOf(item) : 'other'
  const urlPreview = useMiniatura(item?.path, tipo === 'image')

  useEffect(() => {
    if (!item || !item.isDir || !provider) {
      setPasta(null)
      return
    }
    let vivo = true
    const sinal = { cancelado: false }
    setPasta({ calculando: true })
    tamanhoDaPasta(provider, item.path, sinal)
      .then((r) => vivo && setPasta({ ...r, calculando: false }))
      .catch(() => vivo && setPasta(null))
    return () => {
      vivo = false
      sinal.cancelado = true
    }
  }, [item, provider])

  if (!item) return null

  const linhas = [
    { rotulo: 'Tipo', valor: NOME_TIPO[tipo] + (item.ext ? ` · .${item.ext}` : '') },
    {
      rotulo: 'Tamanho',
      valor: item.isDir
        ? pasta?.calculando
          ? 'calculando…'
          : pasta
            ? formatBytes(pasta.bytes)
            : '—'
        : formatBytes(item.size, item.size < 1024 ? 0 : 2),
    },
  ]

  if (item.isDir && pasta && !pasta.calculando) {
    linhas.push({
      rotulo: 'Conteúdo',
      valor: `${pasta.qtdArquivos} ${pasta.qtdArquivos === 1 ? 'arquivo' : 'arquivos'}, ${pasta.qtdPastas} ${pasta.qtdPastas === 1 ? 'pasta' : 'pastas'}`,
    })
  }

  linhas.push(
    { rotulo: 'Modificado', valor: formatDateFull(item.mtime) },
    { rotulo: 'Onde está', valor: parentOf(item.path), quebrar: true }
  )

  if (!item.isDir && item.size > 0) {
    linhas.push({ rotulo: 'Bytes', valor: item.size.toLocaleString('pt-BR') })
  }

  return (
    <Folha aberta={!!item} aoFechar={aoFechar} titulo="Detalhes">
      <div className={css.topo}>
        {tipo === 'image' && urlPreview ? (
          <div className={css.previa}>
            <img src={urlPreview} alt={item.name} />
          </div>
        ) : (
          <div className={css.previaIcone} style={{ color: COR_POR_TIPO[tipo] }}>
            <Selo item={item} tipo={tipo} tamanho={72} />
          </div>
        )}
        <h3 className={css.nome}>{item.name}</h3>
        <span className={css.etiquetaTipo} style={{ color: COR_POR_TIPO[tipo] }}>
          <Icone nome="info" tamanho={13} />
          {NOME_TIPO[tipo]}
        </span>
      </div>

      <dl className={css.ficha}>
        {linhas.map((l) => (
          <div key={l.rotulo} className={css.fichaLinha}>
            <dt className={css.fichaRotulo}>{l.rotulo}</dt>
            <dd className={`${css.fichaValor} num ${l.quebrar ? css.fichaValorQuebra : ''}`}>
              {l.valor}
            </dd>
          </div>
        ))}
      </dl>

      {aoLer && ehLegivel(item) && (
        <div className={css.rodapeAcao}>
          <Botao icone="documento" largura="total" onClick={() => aoLer(item)}>
            Ler o conteúdo
          </Botao>
        </div>
      )}

      {!ehLegivel(item) && tipo === 'other' && item.ext && !KINDS.other.exts.includes(item.ext) && (
        <p className={css.rodapeNota}>
          Este app não abre arquivos <strong>.{item.ext}</strong> — ele organiza. No celular,
          use “Compartilhar” pra mandar pro aplicativo certo.
        </p>
      )}
    </Folha>
  )
}
