import { useState } from 'react'
import Botao from '../ui/Botao.jsx'
import Folha, { AcaoFolha } from '../ui/Folha.jsx'
import { formatBytes } from '../../fs/util.js'
import { podeVirarPdf } from '../../fs/pdf.js'
import tela from '../../screens/tela.module.css'

/**
 * A barra que aparece quando há itens marcados.
 *
 * Componente único porque as três telas de lista (Pastas, Categoria, Busca)
 * precisam exatamente das mesmas ações — e antes cada uma tinha a sua cópia,
 * com conjuntos de botões que já estavam divergindo.
 *
 * As duas ações mais usadas (mover, excluir) ficam à mão; o resto vai pro "⋮".
 * Seis ícones lado a lado não cabem num celular de 320px sem virar mira de dardo.
 */
export default function BarraSelecao({
  selecionados,
  total,
  aoLimpar,
  aoMarcarTodos,
  acoes,
}) {
  const [maisAcoes, setMaisAcoes] = useState(false)
  const qtd = selecionados.length
  if (!qtd) return null

  const bytes = selecionados.reduce((s, i) => s + (i.size || 0), 0)
  const arquivos = selecionados.filter((i) => !i.isDir)
  const todosMarcados = total != null && qtd === total

  // Um PDF só sai de imagens OU de textos — misturar exigiria decidir a ordem
  // e o layout de coisas incomparáveis. A ação fica visível e desabilitada,
  // com o motivo escrito, em vez de sumir e deixar a dúvida.
  const paraPdf = arquivos.filter((i) => podeVirarPdf(i))
  const especies = new Set(paraPdf.map((i) => podeVirarPdf(i)))
  const mistura = especies.size > 1

  const fechar = () => setMaisAcoes(false)

  return (
    <>
      <div className={tela.barraSelecao}>
        <Botao variante="icone" icone="fechar" aria-label="Cancelar seleção" onClick={aoLimpar} />
        <span className={tela.barraSelecaoContagem}>
          {qtd} {qtd === 1 ? 'item' : 'itens'}
          {bytes > 0 && ` · ${formatBytes(bytes)}`}
        </span>

        {aoMarcarTodos && (
          <Botao
            variante="icone"
            icone="confereCirculo"
            aria-label={todosMarcados ? 'Desmarcar todos' : 'Marcar todos'}
            onClick={aoMarcarTodos}
          />
        )}
        <Botao
          variante="icone"
          icone="mover"
          aria-label="Mover selecionados"
          onClick={() => acoes.pedirTransferencia('mover', selecionados, aoLimpar)}
        />
        <Botao
          variante="icone"
          icone="lixeira"
          aria-label="Excluir selecionados"
          onClick={() => acoes.pedirExclusao(selecionados, aoLimpar)}
        />
        <Botao
          variante="icone"
          icone="maisOpcoes"
          aria-label="Mais ações para os selecionados"
          onClick={() => setMaisAcoes(true)}
        />
      </div>

      <Folha
        aberta={maisAcoes}
        aoFechar={fechar}
        titulo={`${qtd} ${qtd === 1 ? 'item selecionado' : 'itens selecionados'}`}
      >
        <AcaoFolha
          icone="copiar"
          aoClicar={() => {
            fechar()
            acoes.pedirTransferencia('copiar', selecionados, aoLimpar)
          }}
        >
          Copiar para…
        </AcaoFolha>
        <AcaoFolha
          icone="lapis"
          descricao={
            arquivos.length === 0
              ? 'Só funciona com arquivos — pastas não entram no lote'
              : `Renomeia ${arquivos.length} ${arquivos.length === 1 ? 'arquivo' : 'arquivos'} com um padrão`
          }
          desabilitado={arquivos.length === 0}
          aoClicar={() => {
            fechar()
            acoes.pedirRenomeEmLote(arquivos, aoLimpar)
          }}
        >
          Renomear em lote
        </AcaoFolha>
        <AcaoFolha
          icone="compactado"
          descricao={
            arquivos.length === 0
              ? 'Só arquivos entram no .zip — pastas ainda não'
              : `Junta ${arquivos.length} ${arquivos.length === 1 ? 'arquivo' : 'arquivos'} num .zip só`
          }
          desabilitado={arquivos.length === 0}
          aoClicar={() => {
            fechar()
            acoes.pedirConversao('zip', arquivos, aoLimpar)
          }}
        >
          Compactar em .zip
        </AcaoFolha>
        <AcaoFolha
          icone="documento"
          descricao={
            paraPdf.length === 0
              ? 'Nenhum destes vira PDF — só imagem e texto'
              : mistura
                ? 'Selecione só imagens OU só textos — não dá pra misturar'
                : `${paraPdf.length} ${paraPdf.length === 1 ? 'página' : 'páginas'} num PDF só`
          }
          desabilitado={paraPdf.length === 0 || mistura}
          aoClicar={() => {
            fechar()
            acoes.pedirConversao('pdf', paraPdf, aoLimpar)
          }}
        >
          Gerar PDF
        </AcaoFolha>
        <AcaoFolha
          icone="mover"
          aoClicar={() => {
            fechar()
            acoes.pedirTransferencia('mover', selecionados, aoLimpar)
          }}
        >
          Mover para…
        </AcaoFolha>
        <AcaoFolha
          icone="lixeira"
          perigo
          aoClicar={() => {
            fechar()
            acoes.pedirExclusao(selecionados, aoLimpar)
          }}
        >
          Excluir
        </AcaoFolha>
      </Folha>
    </>
  )
}
