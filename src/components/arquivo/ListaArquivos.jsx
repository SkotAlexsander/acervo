import { useEffect, useRef, useState } from 'react'
import { LinhaArquivo, LadrilhoArquivo } from './ItemArquivo.jsx'
import Botao from '../ui/Botao.jsx'
import { useApp } from '../../state/AppContext.jsx'
import tela from '../../screens/tela.module.css'

const LOTE = 80

/**
 * Lista de arquivos com paginação por rolagem.
 *
 * Uma categoria pode ter 400 imagens. Jogar as 400 no DOM de uma vez trava a
 * abertura da tela no celular; aqui entram 80 por vez, e o próximo lote carrega
 * sozinho quando a rolagem chega perto do fim. O botão manual fica como
 * garantia pra quando o IntersectionObserver não existir.
 */
export default function ListaArquivos({
  itens,
  visao,
  selecao,
  modoSelecao,
  aoAbrir,
  aoAlternarSelecao,
  aoPedirMenu,
  aoToqueLongo,
  segundaLinha,
  medirPastas,
}) {
  const { prefs } = useApp()
  const [mostrando, setMostrando] = useState(LOTE)
  const sentinelaRef = useRef(null)

  // Lista nova (mudou a busca, a ordem, a categoria) volta pro primeiro lote.
  useEffect(() => {
    setMostrando(LOTE)
  }, [itens])

  useEffect(() => {
    const el = sentinelaRef.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const obs = new IntersectionObserver(
      (entradas) => {
        if (entradas[0].isIntersecting) setMostrando((m) => Math.min(m + LOTE, itens.length))
      },
      { rootMargin: '400px' }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [itens.length, mostrando])

  const visiveis = itens.slice(0, mostrando)
  const faltam = itens.length - visiveis.length

  const Item = visao === 'grade' ? LadrilhoArquivo : LinhaArquivo

  return (
    <>
      <div className={visao === 'grade' ? tela.grade : tela.lista}>
        {visiveis.map((item) => (
          <Item
            key={item.path}
            item={item}
            selecionado={selecao.has(item.path)}
            modoSelecao={modoSelecao}
            favorito={prefs.favoritos.includes(item.path)}
            aoAbrir={aoAbrir}
            aoAlternarSelecao={aoAlternarSelecao}
            aoPedirMenu={aoPedirMenu}
            aoToqueLongo={aoToqueLongo}
            medirPastas={medirPastas}
            segundaLinha={segundaLinha ? segundaLinha(item) : undefined}
          />
        ))}
      </div>

      {faltam > 0 && (
        <div style={{ padding: 'var(--e-4)', display: 'grid', placeItems: 'center' }}>
          <div ref={sentinelaRef} aria-hidden="true" />
          <Botao
            variante="secundario"
            tamanho="sm"
            onClick={() => setMostrando((m) => Math.min(m + LOTE, itens.length))}
          >
            Mostrar mais {Math.min(LOTE, faltam)} de {faltam}
          </Botao>
        </div>
      )}
    </>
  )
}
