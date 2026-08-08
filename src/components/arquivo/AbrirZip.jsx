import { useEffect, useMemo, useState } from 'react'
import Folha from '../ui/Folha.jsx'
import Botao from '../ui/Botao.jsx'
import Icone, { ICONE_POR_TIPO, COR_POR_TIPO } from '../Icone.jsx'
import SeletorPasta from './SeletorPasta.jsx'
import { useApp } from '../../state/AppContext.jsx'
import { lerIndiceZip, extrairEntrada, caminhoPerigoso } from '../../fs/zip.js'
import { kindOf, extOf, formatBytes, baseName, parentOf, join, stripExt, normalize } from '../../fs/util.js'
import css from './AbrirZip.module.css'

/**
 * Abrir um .zip: ver o que tem dentro e extrair.
 *
 * Ler o índice é barato — ele fica no fim do arquivo e não exige descomprimir
 * nada. Por isso a lista aparece na hora, e extrair é uma segunda decisão.
 *
 * **Zip Slip:** uma entrada chamada `../../../algo` faria a extração escrever
 * fora da pasta escolhida. É um ataque conhecido e antigo, e vale mesmo num
 * app pessoal — basta baixar um .zip de procedência ruim. Entradas assim são
 * recusadas e mostradas como recusadas, não silenciosamente renomeadas.
 */
export default function AbrirZip({ item, aoFechar }) {
  const { provider, avisar, mudou } = useApp()
  const [estado, setEstado] = useState({ carregando: true, entradas: [], erro: null })
  const [bytes, setBytes] = useState(null)
  const [escolhendoPasta, setEscolhendoPasta] = useState(false)
  const [extraindo, setExtraindo] = useState(null)

  useEffect(() => {
    if (!item || !provider) return
    let vivo = true
    setEstado({ carregando: true, entradas: [], erro: null })
    provider
      .readBytes(item.path)
      .then((b) => {
        if (!vivo) return
        if (!b) throw new Error('Não consegui ler o arquivo.')
        const entradas = lerIndiceZip(b)
        setBytes(b)
        setEstado({ carregando: false, entradas, erro: null })
      })
      .catch((e) => vivo && setEstado({ carregando: false, entradas: [], erro: (e && e.message) || 'Falhou.' }))
    return () => {
      vivo = false
    }
  }, [item, provider])

  const arquivos = useMemo(() => estado.entradas.filter((e) => !e.ehPasta), [estado.entradas])
  const perigosos = useMemo(() => arquivos.filter((e) => caminhoPerigoso(e.nome)), [arquivos])
  const seguros = useMemo(() => arquivos.filter((e) => !caminhoPerigoso(e.nome)), [arquivos])

  const totalDescompactado = arquivos.reduce((s, e) => s + e.tamanho, 0)
  const totalCompactado = arquivos.reduce((s, e) => s + e.comprimido, 0)
  const taxa = totalDescompactado ? 1 - totalCompactado / totalDescompactado : 0

  const extrairPara = async (pastaBase) => {
    setEscolhendoPasta(false)
    if (!bytes || !seguros.length) return

    // Tudo vai pra uma subpasta com o nome do .zip. Despejar 200 arquivos
    // direto na pasta atual é o comportamento que faz alguém odiar a função.
    const nomePasta = stripExt(item.name)
    let raiz
    try {
      raiz = await provider.mkdir(pastaBase, nomePasta)
    } catch (e) {
      avisar((e && e.message) || 'Não consegui criar a pasta de destino.', 'erro')
      return
    }

    const falhas = []
    let feitos = 0
    setExtraindo({ feitos: 0, total: seguros.length, nome: '' })

    for (const entrada of seguros) {
      setExtraindo({ feitos, total: seguros.length, nome: entrada.nome })
      try {
        const dados = await extrairEntrada(bytes, entrada)
        // O caminho de dentro do .zip é recriado como pasta de verdade.
        const alvo = normalize(join(raiz, entrada.nome.replace(/\\/g, '/')))
        const pai = parentOf(alvo)
        if (pai !== raiz) {
          const segs = pai.slice(raiz.length).split('/').filter(Boolean)
          let acc = raiz
          for (const seg of segs) {
            const existe = await provider.stat(join(acc, seg))
            acc = existe ? join(acc, seg) : await provider.mkdir(acc, seg)
          }
        }
        await provider.writeBytes(alvo, dados)
        feitos++
      } catch (e) {
        falhas.push(`${entrada.nome}: ${(e && e.message) || 'falhou'}`)
      }
      await new Promise((r) => setTimeout(r, 0))
    }

    setExtraindo(null)
    mudou()
    if (feitos) {
      avisar(
        `${feitos} ${feitos === 1 ? 'arquivo extraído' : 'arquivos extraídos'} para "${nomePasta}".`,
        'ok'
      )
    }
    if (falhas.length) {
      avisar(
        falhas.length === 1 ? falhas[0] : `${falhas.length} falharam. Ex.: ${falhas[0]}`,
        'erro'
      )
    }
    if (!feitos && !falhas.length) avisar('Nada foi extraído.', 'erro')
    aoFechar()
  }

  if (!item) return null

  return (
    <>
      <Folha
        aberta={!!item && !escolhendoPasta}
        aoFechar={extraindo ? undefined : aoFechar}
        titulo={item.name}
        alturaMax="88%"
        rodape={
          !estado.erro && (
            <>
              <Botao variante="fantasma" onClick={aoFechar} largura="total" disabled={!!extraindo}>
                Fechar
              </Botao>
              <Botao
                variante="primario"
                largura="total"
                disabled={!seguros.length || !!extraindo || estado.carregando}
                onClick={() => extrairPara(parentOf(item.path))}
              >
                {extraindo ? `${extraindo.feitos}/${extraindo.total}…` : `Extrair ${seguros.length}`}
              </Botao>
            </>
          )
        }
      >
        {estado.carregando ? (
          <p className={css.aviso}>abrindo o .zip…</p>
        ) : estado.erro ? (
          <p className={css.erro}>
            <Icone nome="alerta" tamanho={16} />
            {estado.erro}
          </p>
        ) : (
          <>
            <div className={css.resumo}>
              <span className={css.resumoItem}>
                <b className="num">{arquivos.length}</b>
                {arquivos.length === 1 ? 'arquivo' : 'arquivos'}
              </span>
              <span className={css.resumoItem}>
                <b className="num">{formatBytes(totalDescompactado)}</b>
                descompactado
              </span>
              {taxa > 0.02 && (
                <span className={css.resumoItem}>
                  <b className="num">{(taxa * 100).toFixed(0)}%</b>
                  menor no .zip
                </span>
              )}
            </div>

            {perigosos.length > 0 && (
              <p className={css.perigo}>
                <Icone nome="alerta" tamanho={16} />
                <span>
                  <strong>
                    {perigosos.length} {perigosos.length === 1 ? 'entrada recusada' : 'entradas recusadas'}
                  </strong>{' '}
                  — o caminho delas tenta sair da pasta de destino ({perigosos[0].nome}). Isso é
                  sinal de .zip malicioso; elas não serão extraídas.
                </span>
              </p>
            )}

            {!arquivos.length && (
              <p className={css.aviso}>Este .zip está vazio.</p>
            )}

            <ul className={css.lista}>
              {seguros.slice(0, 300).map((e, i) => {
                const tipo = kindOf({ isDir: false, ext: extOf(e.nome), name: e.nome })
                return (
                  <li key={e.nome + i} className={css.item}>
                    <span className={css.itemIcone} style={{ color: COR_POR_TIPO[tipo] }}>
                      <Icone nome={ICONE_POR_TIPO[tipo]} tamanho={17} />
                    </span>
                    <span className={css.itemTextos}>
                      <span className={`${css.itemNome} corta`}>{baseName('/' + e.nome)}</span>
                      {e.nome.includes('/') && (
                        <span className={`${css.itemCaminho} corta`}>
                          em {e.nome.slice(0, e.nome.lastIndexOf('/'))}
                        </span>
                      )}
                    </span>
                    <span className={`${css.itemTamanho} num`}>{formatBytes(e.tamanho)}</span>
                  </li>
                )
              })}
              {seguros.length > 300 && (
                <li className={css.limite}>
                  …e mais {seguros.length - 300}. Todos serão extraídos — a lista é que
                  para em 300.
                </li>
              )}
            </ul>

            {!extraindo && seguros.length > 0 && (
              <button type="button" className={css.outraPasta} onClick={() => setEscolhendoPasta(true)}>
                <Icone nome="mover" tamanho={17} />
                Extrair para outra pasta…
              </button>
            )}

            {extraindo && (
              <div className={css.progresso}>
                <div className={css.trilho}>
                  <div
                    className={css.preenchido}
                    style={{ width: `${(extraindo.feitos / Math.max(1, extraindo.total)) * 100}%` }}
                  />
                </div>
                <span className={`${css.etapa} corta`}>{extraindo.nome}</span>
              </div>
            )}
          </>
        )}
      </Folha>

      <SeletorPasta
        aberto={escolhendoPasta}
        aoFechar={() => setEscolhendoPasta(false)}
        origens={[]}
        titulo="Extrair para"
        aoEscolher={extrairPara}
      />
    </>
  )
}
