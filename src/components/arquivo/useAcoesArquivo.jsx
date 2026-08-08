import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Folha, { AcaoFolha } from '../ui/Folha.jsx'
import Dialogo from '../ui/Dialogo.jsx'
import SeletorPasta from './SeletorPasta.jsx'
import RenomearEmLote from './RenomearEmLote.jsx'
import PainelDetalhes from './PainelDetalhes.jsx'
import LeitorTexto, { ehLegivel } from './LeitorTexto.jsx'
import Converter from './Converter.jsx'
import Transformar from './Transformar.jsx'
import Proteger from './Proteger.jsx'
import MaisLeve from './MaisLeve.jsx'
import AbrirZip from './AbrirZip.jsx'
import { alvosDe } from '../../fs/converter.js'
import { ehProtegido, podeProteger } from '../../fs/cripto.js'
import { rotaDe } from '../../fs/otimizar.js'
import { useApp } from '../../state/AppContext.jsx'
import { paraLixeira, restaurar, listarLixeira } from '../../fs/trash.js'
import { stripExt, baseName, parentOf, validateName, formatBytes } from '../../fs/util.js'
import { ehAparelho } from '../../fs/index.js'

/**
 * A descrição da linha "Transformar em…": os formatos de verdade, não uma
 * promessa vaga. "PDF, WebP, JPG e +2" diz na hora se vale abrir.
 */
function resumoDeAlvos(item) {
  const lista = alvosDe(item).map((a) => a.rotulo.split(' ')[0])
  if (!lista.length) return ''
  const mostra = lista.slice(0, 3).join(', ')
  return lista.length > 3 ? `${mostra} e +${lista.length - 3}` : mostra
}

/**
 * A central de ações sobre arquivo — menu, renomear, mover, copiar, excluir,
 * favoritar, compartilhar, detalhes.
 *
 * Fica num hook só porque as MESMAS ações valem em quatro telas (Pastas,
 * Categoria, Busca, Favoritos). Duplicar isso seria garantir que uma delas
 * ficasse pra trás na primeira correção.
 *
 * Uso:
 *   const acoes = useAcoesArquivo()
 *   ...  <button onClick={() => acoes.abrirMenu(item)}>
 *   ...  {acoes.elementos}
 */
export default function useAcoesArquivo(opcoes) {
  const { irPara } = opcoes || {}
  const navegar = useNavigate()
  const { provider, executar, avisar, prefs, alternarFavorito, mudou } = useApp()

  const [menu, setMenu] = useState(null) // item do menu de contexto
  const [detalhes, setDetalhes] = useState(null)
  const [renomeando, setRenomeando] = useState(null)
  const [lote, setLote] = useState(null) // {itens, aoTerminar}
  const [lendo, setLendo] = useState(null) // arquivo de texto aberto no leitor
  const [convertendo, setConvertendo] = useState(null) // {modo:'zip'|'pdf', itens, aoTerminar}
  const [transformando, setTransformando] = useState(null) // um arquivo → outro formato
  const [protegendo, setProtegendo] = useState(null) // proteger com senha OU abrir .acv
  const [aliviando, setAliviando] = useState(null) // deixar mais leve
  const [zipAberto, setZipAberto] = useState(null)
  const [excluindo, setExcluindo] = useState(null) // {paths, nomes}
  const [transferindo, setTransferindo] = useState(null) // {modo, paths}

  const fecharMenu = useCallback(() => setMenu(null), [])

  // ── Favoritos ──────────────────────────────────────────────────────────────
  const favoritar = useCallback(
    (item) => {
      const era = prefs.favoritos.includes(item.path)
      alternarFavorito(item.path)
      avisar(era ? `"${item.name}" saiu dos favoritos.` : `"${item.name}" fixado nos favoritos.`, 'ok')
      fecharMenu()
    },
    [prefs.favoritos, alternarFavorito, avisar, fecharMenu]
  )

  // ── Renomear ───────────────────────────────────────────────────────────────
  const confirmarRenome = useCallback(
    async (novoNome) => {
      const item = renomeando
      setRenomeando(null)
      if (!item || novoNome === item.name) return
      const r = await executar(
        () => provider.rename(item.path, novoNome),
        `Renomeado para "${novoNome}".`
      )
      // Favorito guarda o caminho; sem atualizar, o item favoritado vira
      // um link quebrado assim que muda de nome.
      if (r.ok && prefs.favoritos.includes(item.path)) {
        alternarFavorito(item.path)
        alternarFavorito(r.resultado)
      }
    },
    [renomeando, provider, executar, prefs.favoritos, alternarFavorito]
  )

  // ── Mover / copiar ─────────────────────────────────────────────────────────
  const confirmarTransferencia = useCallback(
    async (destino) => {
      const t = transferindo
      setTransferindo(null)
      if (!t) return
      const qtd = t.paths.length
      const rotulo = qtd === 1 ? `"${baseName(t.paths[0])}"` : `${qtd} itens`

      if (t.modo === 'copiar') {
        const r = await executar(
          () => provider.copy(t.paths, destino),
          `${rotulo} ${qtd === 1 ? 'copiado' : 'copiados'} para ${baseName(destino)}.`
        )
        // Copiar não precisa de desfazer com o mesmo peso — o original está
        // intacto. Mas apagar a cópia errada com um toque poupa uma viagem.
        if (r.ok && Array.isArray(r.resultado) && r.resultado.length) {
          const copias = r.resultado
          avisar(`${rotulo} ${qtd === 1 ? 'copiado' : 'copiados'} para ${baseName(destino)}.`, 'ok', {
            rotulo: 'Desfazer',
            aoClicar: () =>
              executar(
                () => provider.remove(copias),
                qtd === 1 ? 'Cópia removida.' : 'Cópias removidas.'
              ),
          })
        }
        t.aoTerminar && t.aoTerminar()
        return
      }

      // Mover é a operação sem volta fácil: 40 fotos na pasta errada é bem
      // mais fácil de fazer sem querer do que 40 exclusões. Guardamos de onde
      // cada item saiu ANTES de mover, e o desfazer devolve um por um.
      const origens = t.paths.map((p) => ({ path: p, pai: parentOf(p) }))
      const r = await executar(() => provider.move(t.paths, destino), null)
      if (r.ok) {
        const finais = Array.isArray(r.resultado) ? r.resultado : []
        avisar(`${rotulo} ${qtd === 1 ? 'movido' : 'movidos'} para ${baseName(destino)}.`, 'ok', {
          rotulo: 'Desfazer',
          aoClicar: async () => {
            // Um por vez, porque cada item pode ter vindo de uma pasta diferente.
            await executar(async () => {
              for (let i = 0; i < finais.length; i++) {
                const volta = origens[i]
                if (volta) await provider.move([finais[i]], volta.pai)
              }
            }, qtd === 1 ? 'Item devolvido pro lugar.' : `${qtd} itens devolvidos pro lugar.`)
          },
        })
      }
      t.aoTerminar && t.aoTerminar()
    },
    [transferindo, provider, executar, avisar]
  )

  // ── Excluir (vai pra lixeira) ──────────────────────────────────────────────
  const confirmarExclusao = useCallback(async () => {
    const alvo = excluindo
    setExcluindo(null)
    if (!alvo) return

    const r = await executar(() => paraLixeira(provider, alvo.paths), null)
    if (!r.ok) return
    const { movidos, erros } = r.resultado

    if (erros.length) {
      avisar(erros[0], 'erro')
    }
    if (movidos > 0) {
      // Favoritos apontando pro que foi pra lixeira precisam sair da lista.
      for (const p of alvo.paths) {
        if (prefs.favoritos.includes(p)) alternarFavorito(p)
      }
      const texto =
        movidos === 1 ? `"${baseName(alvo.paths[0])}" foi pra lixeira.` : `${movidos} itens foram pra lixeira.`
      avisar(texto, 'ok', {
        rotulo: 'Desfazer',
        aoClicar: async () => {
          // Desfazer real: `listarLixeira` já devolve ordenado do mais recente
          // pro mais antigo, então os `movidos` primeiros são exatamente estes.
          const lista = await listarLixeira(provider)
          const recentes = lista.slice(0, movidos).map((i) => i.id)
          await executar(
            () => restaurar(provider, recentes),
            movidos === 1 ? 'Item devolvido pro lugar.' : `${movidos} itens devolvidos pro lugar.`
          )
        },
      })
    }
    alvo.aoTerminar && alvo.aoTerminar()
  }, [excluindo, provider, executar, avisar, prefs.favoritos, alternarFavorito])

  // ── Renomear em lote ───────────────────────────────────────────────────────
  const confirmarLote = useCallback(
    async (planos) => {
      const alvo = lote
      setLote(null)
      if (!alvo) return
      let feitos = 0
      const falhas = []
      await executar(async () => {
        // Um por vez, e coletando falha em vez de abortar: se o arquivo 7
        // sumiu, os outros 39 não têm culpa.
        for (const p of planos) {
          try {
            await provider.rename(p.path, p.para)
            feitos++
          } catch (e) {
            falhas.push(`${p.de}: ${(e && e.message) || 'falhou'}`)
          }
        }
      }, null)
      if (feitos) avisar(`${feitos} ${feitos === 1 ? 'item renomeado' : 'itens renomeados'}.`, 'ok')
      if (falhas.length) {
        avisar(
          falhas.length === 1 ? falhas[0] : `${falhas.length} não deram certo. Ex.: ${falhas[0]}`,
          'erro'
        )
      }
      alvo.aoTerminar && alvo.aoTerminar()
    },
    [lote, provider, executar, avisar]
  )

  const pedirRenomeEmLote = useCallback((itens, aoTerminar) => {
    setMenu(null)
    setLote({ itens: itens.filter((i) => !i.isDir), aoTerminar })
  }, [])

  // ── Compartilhar ───────────────────────────────────────────────────────────
  const compartilhar = useCallback(
    async (item) => {
      fecharMenu()
      if (ehAparelho()) {
        try {
          const { Share } = await import('@capacitor/share')
          const url = await provider.previewUrl(item.path)
          await Share.share({ title: item.name, url: url || undefined, dialogTitle: 'Compartilhar' })
          return
        } catch (e) {
          avisar((e && e.message) || 'O compartilhamento não abriu.', 'erro')
          return
        }
      }
      // No navegador não há "compartilhar com outro app" — mas há BAIXAR, e
      // isso é o que fecha o ciclo: um .zip ou um PDF gerado aqui você abre
      // no seu descompactador e no seu leitor de PDF de verdade.
      try {
        const bytes = await provider.readBytes(item.path)
        if (!bytes) throw new Error('sem conteúdo')
        const url = URL.createObjectURL(new Blob([bytes]))
        const a = document.createElement('a')
        a.href = url
        a.download = item.name
        document.body.appendChild(a)
        a.click()
        a.remove()
        // Segurar por um instante: revogar na hora cancela o download em
        // alguns navegadores antes de ele começar de fato.
        setTimeout(() => URL.revokeObjectURL(url), 30000)
        avisar(`"${item.name}" baixado pro computador.`, 'ok')
      } catch {
        try {
          await navigator.clipboard.writeText(item.path)
          avisar('Caminho copiado. Compartilhar entre apps só funciona no celular.', 'info')
        } catch {
          avisar('Compartilhar entre apps só funciona no celular.', 'info')
        }
      }
    },
    [provider, avisar, fecharMenu]
  )

  // ── API pública ────────────────────────────────────────────────────────────

  const abrirMenu = useCallback((item) => setMenu(item), [])

  /**
   * O que acontece ao tocar num arquivo.
   *
   * A regra é uma só: **tocar abre a coisa**, quando o app sabe abrir. Um
   * .zip mostra o conteúdo; um .txt mostra o texto; o que o app não sabe
   * abrir cai na ficha de detalhes, que é a resposta honesta pra "e agora?".
   *
   * Fica aqui, e não em cada tela, porque a regra vale nas quatro — espalhar
   * esse `if` era garantir que uma delas ficasse pra trás.
   */
  const abrirArquivo = useCallback((item) => {
    if (!item || item.isDir) return
    if (item.ext === 'zip') setZipAberto(item)
    // Tocar num arquivo protegido pede a senha na hora. Mandar pra ficha de
    // detalhes seria fazer a pessoa procurar no menu o que ela já pediu.
    else if (ehProtegido(item)) setProtegendo(item)
    else if (ehLegivel(item)) setLendo(item)
    else setDetalhes(item)
  }, [])
  const abrirDetalhes = useCallback((item) => {
    setMenu(null)
    setDetalhes(item)
  }, [])

  const pedirExclusao = useCallback((itens, aoTerminar) => {
    const lista = Array.isArray(itens) ? itens : [itens]
    setMenu(null)
    setExcluindo({
      paths: lista.map((i) => (typeof i === 'string' ? i : i.path)),
      nomes: lista.map((i) => (typeof i === 'string' ? baseName(i) : i.name)),
      bytes: lista.reduce((s, i) => s + (typeof i === 'string' ? 0 : i.size || 0), 0),
      aoTerminar,
    })
  }, [])

  const pedirTransferencia = useCallback((modo, itens, aoTerminar) => {
    const lista = Array.isArray(itens) ? itens : [itens]
    setMenu(null)
    setTransferindo({
      modo,
      paths: lista.map((i) => (typeof i === 'string' ? i : i.path)),
      aoTerminar,
    })
  }, [])

  const irParaPasta = useCallback(
    (item) => {
      setMenu(null)
      const destino = parentOf(item.path)
      if (irPara) irPara(destino)
      else navegar(`/pastas${destino === '/' ? '' : destino}`)
    },
    [irPara, navegar]
  )

  const ehFavorito = menu ? prefs.favoritos.includes(menu.path) : false

  const elementos = (
    <>
      <Folha aberta={!!menu} aoFechar={fecharMenu} titulo={menu?.name}>
        {menu && (
          <>
            {menu.ext === 'zip' && (
              <AcaoFolha
                icone="compactado"
                descricao="Ver o que tem dentro e extrair"
                aoClicar={() => {
                  setMenu(null)
                  setZipAberto(menu)
                }}
              >
                Abrir o .zip
              </AcaoFolha>
            )}
            {ehProtegido(menu) && (
              <AcaoFolha
                icone="chave"
                descricao="Pede a senha e devolve o arquivo original"
                aoClicar={() => {
                  setMenu(null)
                  setProtegendo(menu)
                }}
              >
                Abrir com a senha
              </AcaoFolha>
            )}
            {/* Uma linha só no lugar de "Gerar PDF" + "Compactar em .zip":
                a folha de transformar mostra TODOS os destinos possíveis
                deste arquivo, inclusive esses dois. Duas entradas pro mesmo
                gesto obrigavam a pessoa a adivinhar em qual delas estava o
                formato que ela queria. */}
            {!menu.isDir && alvosDe(menu).length > 0 && (
              <AcaoFolha
                icone="transformar"
                descricao={resumoDeAlvos(menu)}
                aoClicar={() => {
                  setMenu(null)
                  setTransformando(menu)
                }}
              >
                Transformar em…
              </AcaoFolha>
            )}
            {!menu.isDir && !ehProtegido(menu) && (
              <AcaoFolha
                icone="comprimir"
                descricao={
                  rotaDe(menu) === 'imagem'
                    ? 'Reencoda a foto: mesmo visual, arquivo bem menor'
                    : 'Guarda num .zip sem perder um bit'
                }
                aoClicar={() => {
                  setMenu(null)
                  setAliviando(menu)
                }}
              >
                Deixar mais leve
              </AcaoFolha>
            )}
            {podeProteger(menu) && !menu.isDir && (
              <AcaoFolha
                icone="cadeado"
                descricao="Criptografa com uma senha só sua"
                aoClicar={() => {
                  setMenu(null)
                  setProtegendo(menu)
                }}
              >
                Proteger com senha
              </AcaoFolha>
            )}
            {ehLegivel(menu) && (
              <AcaoFolha
                icone="documento"
                descricao={`Abre o conteúdo do .${menu.ext} aqui dentro, só pra ler`}
                aoClicar={() => {
                  setMenu(null)
                  setLendo(menu)
                }}
              >
                Ler o conteúdo
              </AcaoFolha>
            )}
            <AcaoFolha icone="info" aoClicar={() => abrirDetalhes(menu)}>
              Detalhes
            </AcaoFolha>
            <AcaoFolha icone="abrirFora" aoClicar={() => irParaPasta(menu)}>
              Abrir a pasta onde está
              <span />
            </AcaoFolha>
            <AcaoFolha
              icone="estrela"
              aoClicar={() => favoritar(menu)}
              descricao={ehFavorito ? 'Já está fixado no Início' : 'Fixa um atalho no Início'}
            >
              {ehFavorito ? 'Tirar dos favoritos' : 'Favoritar'}
            </AcaoFolha>
            <AcaoFolha icone="lapis" aoClicar={() => { setMenu(null); setRenomeando(menu) }}>
              Renomear
            </AcaoFolha>
            <AcaoFolha icone="mover" aoClicar={() => pedirTransferencia('mover', menu)}>
              Mover para…
            </AcaoFolha>
            <AcaoFolha icone="copiar" aoClicar={() => pedirTransferencia('copiar', menu)}>
              Copiar para…
            </AcaoFolha>
            <AcaoFolha
              icone="compartilhar"
              descricao={
                ehAparelho() ? undefined : 'Salva o arquivo no seu computador'
              }
              aoClicar={() => compartilhar(menu)}
            >
              {ehAparelho() ? 'Compartilhar' : 'Baixar pro computador'}
            </AcaoFolha>
            <AcaoFolha icone="lixeira" perigo aoClicar={() => pedirExclusao(menu)}>
              Excluir
            </AcaoFolha>
          </>
        )}
      </Folha>

      <PainelDetalhes
        item={detalhes}
        aoFechar={() => setDetalhes(null)}
        aoLer={(i) => {
          setDetalhes(null)
          setLendo(i)
        }}
      />

      <LeitorTexto item={lendo} aoFechar={() => setLendo(null)} />

      <AbrirZip item={zipAberto} aoFechar={() => setZipAberto(null)} />

      {convertendo && (
        <Converter
          modo={convertendo.modo}
          itens={convertendo.itens}
          aoFechar={() => setConvertendo(null)}
          aoTerminar={convertendo.aoTerminar}
        />
      )}

      <Transformar
        item={transformando}
        aoFechar={() => setTransformando(null)}
        aoTerminar={mudou}
      />

      <Proteger item={protegendo} aoFechar={() => setProtegendo(null)} aoTerminar={mudou} />

      <MaisLeve item={aliviando} aoFechar={() => setAliviando(null)} aoTerminar={mudou} />


      <Dialogo
        aberto={!!renomeando}
        aoFechar={() => setRenomeando(null)}
        tipo="texto"
        titulo="Renomear"
        valorInicial={renomeando?.name || ''}
        selecionarAte={renomeando ? stripExt(renomeando.name).length : 0}
        rotuloConfirmar="Salvar"
        validar={validateName}
        aoConfirmar={confirmarRenome}
      />

      <Dialogo
        aberto={!!excluindo}
        aoFechar={() => setExcluindo(null)}
        perigo
        titulo={
          excluindo?.paths.length === 1
            ? 'Excluir este item?'
            : `Excluir ${excluindo?.paths.length} itens?`
        }
        mensagem={
          excluindo?.paths.length === 1
            ? `"${excluindo.nomes[0]}" vai para a lixeira. Dá pra recuperar depois.`
            : `Eles vão para a lixeira${excluindo?.bytes ? ` (${formatBytes(excluindo.bytes)})` : ''}. Dá pra recuperar depois.`
        }
        detalhe={
          excluindo && excluindo.paths.length > 1
            ? excluindo.nomes.slice(0, 12).join('\n') +
              (excluindo.nomes.length > 12 ? `\n… e mais ${excluindo.nomes.length - 12}` : '')
            : null
        }
        rotuloConfirmar="Mandar pra lixeira"
        aoConfirmar={confirmarExclusao}
      />

      <SeletorPasta
        aberto={!!transferindo}
        aoFechar={() => setTransferindo(null)}
        origens={transferindo?.paths || []}
        titulo={transferindo?.modo === 'mover' ? 'Mover para' : 'Copiar para'}
        aoEscolher={confirmarTransferencia}
      />

      <RenomearEmLote
        aberto={!!lote && lote.itens.length > 0}
        aoFechar={() => setLote(null)}
        itens={lote?.itens || []}
        aoConfirmar={confirmarLote}
      />
    </>
  )

  // Sem `useMemo` aqui, de propósito.
  //
  // O objeto muda de identidade a cada render — e tem que mudar, porque
  // `elementos` é JSX reconstruído toda vez (senão as folhas abertas
  // congelariam no estado antigo). Envolver isso num `useMemo` que lista
  // `elementos` nas dependências não memoiza nada: é ornamento.
  //
  // O que realmente importa pro desempenho são as FUNÇÕES, e essas são
  // `useCallback` estáveis. Quem consome deve depender de `acoes.abrirDetalhes`,
  // nunca de `acoes` inteiro — é o que mantém a memoização das linhas de pé.
  return {
    abrirMenu,
    abrirDetalhes,
    pedirExclusao,
    pedirTransferencia,
    pedirRenomeEmLote,
    abrirLeitor: setLendo,
    abrirZip: setZipAberto,
    abrirArquivo,
    pedirConversao: (modo, itens, aoTerminar) => {
      setMenu(null)
      setConvertendo({ modo, itens: itens.filter((i) => !i.isDir), aoTerminar })
    },
    pedirTransformacao: (item) => {
      setMenu(null)
      setTransformando(item)
    },
    pedirProtecao: (item) => {
      setMenu(null)
      setProtegendo(item)
    },
    pedirAlivio: (item) => {
      setMenu(null)
      setAliviando(item)
    },
    favoritar,
    compartilhar,
    recarregar: mudou,
    elementos,
  }
}
