import { useEffect, useMemo, useState } from 'react'
import Folha from '../ui/Folha.jsx'
import Botao from '../ui/Botao.jsx'
import Icone from '../Icone.jsx'
import { Opcao, AnelProgresso } from './PecasOperacao.jsx'
import { useApp } from '../../state/AppContext.jsx'
import { alvosDe, converter } from '../../fs/converter.js'
import { avisarSeEscondido } from '../../fs/notificar.js'
import { baseName, parentOf, join, stripExt, formatBytes, validateName, uniqueName } from '../../fs/util.js'
import css from './Operacoes.module.css'

const ETIQUETA = {
  exato: { texto: 'sem perder nada', classe: 'fidExato' },
  perde: { texto: 'reencoda a imagem', classe: 'fidPerde' },
  reescreve: { texto: 'muda a formatação', classe: 'fidReescreve' },
}

/**
 * Transformar UM arquivo em outro formato.
 *
 * A diferença pra folha `Converter`: aquela pega VÁRIOS arquivos e produz um
 * só (um .zip, um PDF de 30 fotos). Esta pega um e pergunta "vira o quê?".
 * São gestos diferentes o bastante pra merecerem telas diferentes — juntar
 * as duas obrigaria a tela a explicar qual dos dois modos está ativo, que é
 * exatamente o tipo de pergunta que ninguém quer responder.
 *
 * O contrato desta tela: **só oferece o que funciona**. A lista vem de
 * `alvosDe()`, que consulta o que este aparelho sabe gravar de verdade. E
 * cada linha declara o preço — se é exato, se reencoda, se muda a formatação.
 */
export default function Transformar({ item, aoFechar, aoTerminar }) {
  const { provider, avisar, mudou, prefs } = useApp()
  const [alvo, setAlvo] = useState(null)
  const [nome, setNome] = useState('')
  const [estado, setEstado] = useState({ rodando: false, etapa: '' })
  const [erro, setErro] = useState(null)

  const alvos = useMemo(() => (item ? alvosDe(item) : []), [item])
  const destino = item ? parentOf(item.path) : '/'
  const escolhido = alvos.find((a) => a.id === alvo) || null

  useEffect(() => {
    if (!item) return
    setAlvo(null)
    setNome(stripExt(item.name))
    setErro(null)
    setEstado({ rodando: false, etapa: '' })
  }, [item])

  if (!item) return null

  const extensao = escolhido ? '.' + escolhido.ext : ''

  const executar = async () => {
    if (!escolhido) return
    const problema = validateName(nome.trim() + extensao)
    if (problema) {
      setErro(problema)
      return
    }
    setErro(null)
    setEstado({ rodando: true, etapa: 'lendo o arquivo…' })
    const comecou = Date.now()

    try {
      const bytes = await provider.readBytes(item.path)
      if (!bytes || !bytes.length) throw new Error('Não consegui ler o conteúdo deste arquivo.')

      const r = await converter({
        item,
        bytes,
        alvo: escolhido.id,
        onProgresso: (etapa) => setEstado({ rodando: true, etapa }),
      })

      setEstado({ rodando: true, etapa: 'gravando…' })
      const existentes = new Set((await provider.list(destino)).map((e) => e.name))
      const nomeFinal = uniqueName(nome.trim() + '.' + r.ext, existentes)
      await provider.writeBytes(join(destino, nomeFinal), r.bytes)

      mudou()
      avisar(`"${nomeFinal}" criado — ${r.resumo}.`, 'ok')
      // Só incomoda se a pessoa saiu do app esperando. Operação de 2 segundos
      // com o app na frente já teve a resposta dela: o aviso na tela.
      if (Date.now() - comecou > 3000) {
        avisarSeEscondido({
          titulo: 'Arquivo pronto',
          corpo: `${nomeFinal} — ${r.resumo}`,
          ligado: prefs.notificacoes,
        })
      }
      aoTerminar && aoTerminar()
      aoFechar()
    } catch (e) {
      setEstado({ rodando: false, etapa: '' })
      setErro((e && e.message) || 'Não deu certo.')
    }
  }

  return (
    <Folha
      aberta={!!item}
      aoFechar={estado.rodando ? undefined : aoFechar}
      titulo="Transformar em…"
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar} largura="total" disabled={estado.rodando}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            largura="total"
            disabled={!escolhido || estado.rodando || !nome.trim()}
            onClick={executar}
          >
            {estado.rodando ? 'Trabalhando…' : 'Transformar'}
          </Botao>
        </>
      }
    >
      <div className={css.resumo}>
        <span className={css.resumoIcone}>
          <Icone nome="transformar" tamanho={22} />
        </span>
        <span className={css.resumoTextos}>
          <strong className="corta">{item.name}</strong>
          <span className="num">
            {formatBytes(item.size)}
            {item.ext ? ` · .${item.ext}` : ''}
          </span>
        </span>
      </div>

      {!estado.rodando && (
        <div className={css.opcoes}>
          {alvos.map((a) => (
            <Opcao
              key={a.id}
              selo={a.ext.toUpperCase()}
              titulo={a.rotulo}
              descricao={a.descricao}
              etiqueta={ETIQUETA[a.fidelidade]}
              ativa={alvo === a.id}
              aoClicar={() => {
                setAlvo(a.id)
                setErro(null)
              }}
            />
          ))}
        </div>
      )}

      {escolhido && !estado.rodando && (
        <>
          <label className={css.campo} style={{ marginTop: 'var(--e-4)' }}>
            <span className={css.rotulo}>Nome do novo arquivo</span>
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
                aria-label="Nome do novo arquivo"
              />
              <span className={css.extensao}>{extensao}</span>
            </span>
          </label>

          <p className={css.destino}>
            <Icone nome="pasta" tamanho={14} />
            será criado em <strong>{destino === '/' ? 'Armazenamento' : baseName(destino)}</strong>,
            ao lado do original
          </p>

          <p className={css.nota}>
            <Icone nome="info" tamanho={14} />O arquivo original <strong>não é apagado</strong>.
            Você fica com os dois e apaga o que não quiser.
          </p>

          {provider && provider.conteudoReal === false && (
            <p className={css.notaDemo}>
              <Icone nome="monitor" tamanho={14} />
              <span>
                <strong>Na demonstração do PC</strong> os arquivos têm conteúdo de exemplo. A
                conversão roda de verdade, mas sobre esse conteúdo. No celular ela pega o
                arquivo real.
              </span>
            </p>
          )}
        </>
      )}

      {estado.rodando && (
        <AnelProgresso valor={estado.etapa === 'gravando…' ? 0.9 : 0.45} texto={estado.etapa} />
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
