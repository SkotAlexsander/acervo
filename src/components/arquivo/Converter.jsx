import { useEffect, useMemo, useRef, useState } from 'react'
import Folha from '../ui/Folha.jsx'
import Botao from '../ui/Botao.jsx'
import Icone from '../Icone.jsx'
import { useApp } from '../../state/AppContext.jsx'
import { criarZip, LIMITE_ARQUIVOS, LIMITE_BYTES, temCompressaoNativa } from '../../fs/zip.js'
import { pdfDeImagens, pdfDeTexto, podeVirarPdf, LIMITE_PAGINAS } from '../../fs/pdf.js'
import {
  baseName, parentOf, join, stripExt, formatBytes, validateName, uniqueName,
} from '../../fs/util.js'
import css from './Operacoes.module.css'

/**
 * Compactar em .zip e gerar PDF.
 *
 * As duas operações têm a mesma forma — ler vários arquivos, produzir um só —
 * e por isso dividem esta folha: mesmo campo de nome, mesma barra de
 * progresso, mesmo destino, mesmo tratamento de falha parcial.
 *
 * O que elas têm de mais importante em comum é o que acontece quando dá
 * errado no meio: um arquivo ilegível no item 30 de 40 **não aborta** o
 * trabalho. Os outros 39 são entregues e as falhas aparecem nomeadas.
 */
export default function Converter({ modo, itens, aoFechar, aoTerminar }) {
  const { provider, avisar, mudou } = useApp()
  const [nome, setNome] = useState('')
  const [estado, setEstado] = useState({ rodando: false, feitos: 0, total: 0, etapa: '' })
  const [erro, setErro] = useState(null)
  const cancelado = useRef(false)

  const ehZip = modo === 'zip'
  const destino = itens.length ? parentOf(itens[0].path) : '/'

  // Um PDF só faz sentido de imagens OU de texto — misturar os dois exigiria
  // decidir a ordem e o layout de coisas incomparáveis.
  const especie = useMemo(() => {
    if (ehZip) return null
    const tipos = new Set(itens.map((i) => podeVirarPdf(i)).filter(Boolean))
    if (tipos.size === 1) return [...tipos][0]
    return tipos.size === 0 ? 'nenhum' : 'misto'
  }, [itens, ehZip])

  const bytesEntrada = itens.reduce((s, i) => s + (i.size || 0), 0)

  const impedimento = useMemo(() => {
    if (!itens.length) return 'Nenhum arquivo selecionado.'
    if (ehZip) {
      if (itens.length > LIMITE_ARQUIVOS) return `Máximo de ${LIMITE_ARQUIVOS} arquivos por .zip.`
      if (bytesEntrada > LIMITE_BYTES) {
        return `São ${formatBytes(bytesEntrada)} — o limite é ${formatBytes(LIMITE_BYTES, 0)} por .zip. Compacte em partes.`
      }
      return null
    }
    if (especie === 'nenhum') {
      return 'Nenhum destes vira PDF. Este app converte imagem (.jpg, .png…) e texto (.txt, .md…).'
    }
    if (especie === 'misto') {
      return 'Selecione só imagens OU só arquivos de texto — não dá pra misturar os dois num PDF.'
    }
    if (itens.length > LIMITE_PAGINAS) return `Máximo de ${LIMITE_PAGINAS} imagens por PDF.`
    return null
  }, [itens, ehZip, especie, bytesEntrada])

  // Nome sugerido: o do arquivo quando é um só, o da pasta quando são vários.
  useEffect(() => {
    if (!itens.length) return
    const sugerido =
      itens.length === 1 ? stripExt(itens[0].name) : baseName(destino) === '/' ? 'arquivos' : baseName(destino)
    setNome(sugerido)
    setErro(null)
    setEstado({ rodando: false, feitos: 0, total: 0, etapa: '' })
    cancelado.current = false
  }, [itens, destino])

  const extensao = ehZip ? '.zip' : '.pdf'

  const executar = async () => {
    const problema = validateName(nome + extensao)
    if (problema) {
      setErro(problema)
      return
    }
    cancelado.current = false
    setErro(null)
    setEstado({ rodando: true, feitos: 0, total: itens.length, etapa: 'lendo os arquivos…' })

    try {
      // 1. Ler o conteúdo. Falha aqui não derruba o lote.
      const lidos = []
      const falhasLeitura = []
      for (let i = 0; i < itens.length; i++) {
        if (cancelado.current) return
        setEstado({ rodando: true, feitos: i, total: itens.length, etapa: itens[i].name })
        try {
          const bytes = await provider.readBytes(itens[i].path)
          if (!bytes) falhasLeitura.push(`${itens[i].name}: sem conteúdo`)
          else lidos.push({ nome: itens[i].name, bytes, mtime: itens[i].mtime })
        } catch (e) {
          falhasLeitura.push(`${itens[i].name}: ${(e && e.message) || 'não deu pra ler'}`)
        }
        await new Promise((r) => setTimeout(r, 0))
      }
      if (!lidos.length) throw new Error('Não consegui ler nenhum dos arquivos.')

      // 2. Produzir.
      let saida
      let resumo
      if (ehZip) {
        setEstado({ rodando: true, feitos: 0, total: lidos.length, etapa: 'compactando…' })
        const nomesUsados = new Set()
        const entradas = lidos.map((l) => {
          // Arquivos de pastas diferentes podem ter o mesmo nome; dentro do
          // .zip isso viraria um sobrescrevendo o outro em silêncio.
          const n = uniqueName(l.nome, nomesUsados)
          nomesUsados.add(n)
          return { ...l, nome: n }
        })
        const r = await criarZip(entradas, (feitos, total, etapa) =>
          setEstado({ rodando: true, feitos, total, etapa })
        )
        saida = r.bytes
        const taxa = r.original ? 1 - r.bytes.length / r.original : 0
        resumo = r.comprimido
          ? `${lidos.length} ${lidos.length === 1 ? 'arquivo' : 'arquivos'} · ${formatBytes(r.bytes.length)} (${(taxa * 100).toFixed(0)}% menor)`
          : `${lidos.length} ${lidos.length === 1 ? 'arquivo' : 'arquivos'} · ${formatBytes(r.bytes.length)} (guardado sem comprimir)`
      } else if (especie === 'imagem') {
        setEstado({ rodando: true, feitos: 0, total: lidos.length, etapa: 'montando as páginas…' })
        const r = await pdfDeImagens(lidos, {
          onProgresso: (feitos, total, etapa) => setEstado({ rodando: true, feitos, total, etapa }),
        })
        saida = r.bytes
        falhasLeitura.push(...r.falhas)
        resumo = `${r.paginas} ${r.paginas === 1 ? 'página' : 'páginas'} · ${formatBytes(r.bytes.length)}`
      } else {
        setEstado({ rodando: true, feitos: 0, total: 1, etapa: 'montando as páginas…' })
        const decodificador = new TextDecoder('utf-8')
        const junto = lidos
          .map((l, i) => (lidos.length > 1 ? `${'═'.repeat(6)} ${l.nome} ${'═'.repeat(6)}\n\n` : '') + decodificador.decode(l.bytes) + (i < lidos.length - 1 ? '\n\n' : ''))
          .join('')
        const r = await pdfDeTexto(junto)
        saida = r.bytes
        resumo =
          `${r.paginas} ${r.paginas === 1 ? 'página' : 'páginas'} · ${formatBytes(r.bytes.length)}` +
          (r.truncado ? ' (texto cortado no limite)' : '')
      }

      if (cancelado.current) return

      // 3. Gravar ao lado dos originais, sem sobrescrever nada.
      setEstado({ rodando: true, feitos: itens.length, total: itens.length, etapa: 'gravando…' })
      const existentes = new Set((await provider.list(destino)).map((e) => e.name))
      const nomeFinal = uniqueName(nome.trim() + extensao, existentes)
      await provider.writeBytes(join(destino, nomeFinal), saida)

      mudou()
      avisar(`"${nomeFinal}" criado — ${resumo}.`, 'ok')
      if (falhasLeitura.length) {
        avisar(
          falhasLeitura.length === 1
            ? `1 arquivo ficou de fora: ${falhasLeitura[0]}`
            : `${falhasLeitura.length} arquivos ficaram de fora. Ex.: ${falhasLeitura[0]}`,
          'erro'
        )
      }
      aoTerminar && aoTerminar()
      aoFechar()
    } catch (e) {
      setEstado({ rodando: false, feitos: 0, total: 0, etapa: '' })
      setErro((e && e.message) || 'Não deu certo.')
    }
  }

  const cancelar = () => {
    cancelado.current = true
    setEstado({ rodando: false, feitos: 0, total: 0, etapa: '' })
    aoFechar()
  }

  const progresso = estado.total ? Math.min(1, estado.feitos / estado.total) : 0

  return (
    <Folha
      aberta={itens.length > 0}
      aoFechar={estado.rodando ? cancelar : aoFechar}
      titulo={ehZip ? 'Compactar em .zip' : 'Gerar PDF'}
      rodape={
        <>
          <Botao variante="fantasma" onClick={cancelar} largura="total">
            {estado.rodando ? 'Parar' : 'Cancelar'}
          </Botao>
          <Botao
            variante="primario"
            largura="total"
            disabled={!!impedimento || estado.rodando || !nome.trim()}
            onClick={executar}
          >
            {estado.rodando ? 'Trabalhando…' : ehZip ? 'Compactar' : 'Gerar'}
          </Botao>
        </>
      }
    >
      <div className={css.resumo}>
        <span className={css.resumoIcone}>
          <Icone nome={ehZip ? 'compactado' : 'documento'} tamanho={22} />
        </span>
        <span className={css.resumoTextos}>
          <strong>
            {itens.length} {itens.length === 1 ? 'arquivo' : 'arquivos'}
          </strong>
          <span className="num">
            {formatBytes(bytesEntrada)}
            {!ehZip && especie === 'imagem' && ` · ${itens.length} ${itens.length === 1 ? 'página' : 'páginas'}`}
          </span>
        </span>
      </div>

      {impedimento ? (
        <p className={css.impedimento}>
          <Icone nome="alerta" tamanho={16} />
          {impedimento}
        </p>
      ) : (
        <>
          <label className={css.campo}>
            <span className={css.rotulo}>Nome do arquivo</span>
            <span className={css.entradaCaixa}>
              <input
                className={css.entrada}
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value)
                  setErro(null)
                }}
                spellCheck={false}
                autoComplete="off"
                disabled={estado.rodando}
                aria-label="Nome do arquivo a criar"
              />
              <span className={css.extensao}>{extensao}</span>
            </span>
          </label>

          <p className={css.destino}>
            <Icone nome="pasta" tamanho={14} />
            será criado em <strong>{destino === '/' ? 'Armazenamento' : baseName(destino)}</strong>
          </p>

          {ehZip && !temCompressaoNativa() && (
            <p className={css.nota}>
              <Icone nome="info" tamanho={14} />
              Este navegador não sabe comprimir. O .zip vai sair válido e abre em
              qualquer lugar, mas **sem** encolher.
            </p>
          )}

          {!ehZip && especie === 'imagem' && (
            <p className={css.nota}>
              <Icone nome="info" tamanho={14} />
              Uma página por imagem, ajustada à folha A4 — em pé ou deitada conforme a
              foto. As imagens são reprocessadas pra caber no PDF, então o arquivo
              final não é idêntico ao original.
            </p>
          )}

          {provider && provider.conteudoReal === false && (
            <p className={css.notaDemo}>
              <Icone nome="monitor" tamanho={14} />
              <span>
                <strong>Na demonstração do PC</strong> os arquivos não têm conteúdo de
                verdade. O {ehZip ? '.zip' : 'PDF'} sai válido e abre normalmente, mas com
                conteúdo de exemplo. No celular ele leva o arquivo real.
              </span>
            </p>
          )}
        </>
      )}

      {estado.rodando && (
        <div className={css.progresso}>
          <div className={css.trilho}>
            <div className={css.preenchido} style={{ width: `${progresso * 100}%` }} />
          </div>
          <span className={`${css.etapa} corta`}>
            {estado.total ? `${estado.feitos}/${estado.total} · ` : ''}
            {estado.etapa}
          </span>
        </div>
      )}

      {erro && (
        <p className={css.erro} role="alert">
          <Icone nome="alerta" tamanho={16} />
          {erro}
        </p>
      )}
    </Folha>
  )
}
