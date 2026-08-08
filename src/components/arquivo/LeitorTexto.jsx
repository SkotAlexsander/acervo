import { useEffect, useState } from 'react'
import Folha from '../ui/Folha.jsx'
import Icone from '../Icone.jsx'
import { useApp } from '../../state/AppContext.jsx'
import { formatBytes } from '../../fs/util.js'
import css from './LeitorTexto.module.css'

/** Extensões que o leitor abre. O resto vai pro app do sistema. */
export const EXTENSOES_LEGIVEIS = [
  'txt', 'md', 'log', 'csv', 'json', 'xml', 'ini', 'conf', 'yml', 'yaml',
  'js', 'css', 'html', 'srt', 'vtt', 'vcf',
]

// 512 KB. Acima disso o WebView engasga só de montar o texto na tela, e o
// ganho de ler um log de 40 MB dentro do organizador é zero.
const LIMITE_BYTES = 512 * 1024

export function ehLegivel(item) {
  return !!item && !item.isDir && EXTENSOES_LEGIVEIS.includes(item.ext)
}

/**
 * Leitor de texto, só leitura.
 *
 * `readText` já existe no contrato dos dois providers — o mock e o aparelho —
 * então isto sai praticamente de graça. O que NÃO sai de graça é abrir um
 * arquivo grande demais: por isso há um teto, e ele é dito na cara em vez de
 * simplesmente travar o app.
 */
export default function LeitorTexto({ item, aoFechar }) {
  const { provider } = useApp()
  const [estado, setEstado] = useState({ texto: null, carregando: true, erro: null })

  useEffect(() => {
    if (!item || !provider) return
    if (item.size > LIMITE_BYTES) {
      setEstado({
        texto: null,
        carregando: false,
        erro: `Arquivo de ${formatBytes(item.size)} — o leitor abre até ${formatBytes(LIMITE_BYTES, 0)}. Use "Compartilhar" pra mandar pro app certo.`,
      })
      return
    }
    let vivo = true
    setEstado({ texto: null, carregando: true, erro: null })
    provider
      .readText(item.path)
      .then((t) => {
        if (!vivo) return
        if (t == null) {
          setEstado({
            texto: null,
            carregando: false,
            erro:
              'Não consegui ler o conteúdo. Na demonstração do PC os arquivos não têm conteúdo de verdade — só nome, tamanho e data.',
          })
        } else {
          setEstado({ texto: t, carregando: false, erro: null })
        }
      })
      .catch((e) =>
        vivo && setEstado({ texto: null, carregando: false, erro: (e && e.message) || 'Falhou.' })
      )
    return () => {
      vivo = false
    }
  }, [item, provider])

  if (!item) return null

  return (
    <Folha aberta={!!item} aoFechar={aoFechar} titulo={item.name} alturaMax="92%">
      {estado.carregando ? (
        <p className={css.aviso}>lendo…</p>
      ) : estado.erro ? (
        <p className={css.erro}>
          <Icone nome="info" tamanho={16} />
          {estado.erro}
        </p>
      ) : (
        <>
          <div className={css.barra}>
            <span className="num">
              {estado.texto.split('\n').length} linhas · {formatBytes(item.size)}
            </span>
            <span className={css.somenteLeitura}>
              <Icone nome="cadeado" tamanho={12} />
              só leitura
            </span>
          </div>
          <pre className={css.texto}>{estado.texto}</pre>
        </>
      )}
    </Folha>
  )
}
