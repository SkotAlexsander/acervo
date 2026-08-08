import { useEffect, useState } from 'react'
import Folha from '../ui/Folha.jsx'
import Botao from '../ui/Botao.jsx'
import Icone from '../Icone.jsx'
import { CampoSenha, ForcaSenha, AnelProgresso, Marcador } from './PecasOperacao.jsx'
import { useApp } from '../../state/AppContext.jsx'
import { proteger, abrir, forcaDaSenha, ehProtegido, temCripto, EXT, LIMITE_BYTES } from '../../fs/cripto.js'
import { paraLixeira } from '../../fs/trash.js'
import { avisarSeEscondido } from '../../fs/notificar.js'
import { baseName, parentOf, join, stripExt, formatBytes, uniqueName } from '../../fs/util.js'
import css from './Operacoes.module.css'

/**
 * Proteger com senha, e abrir de volta.
 *
 * As duas metades moram na mesma folha porque são a mesma conversa vista de
 * dois lados, e porque separá-las criaria a pergunta "qual das duas eu abro?"
 * — o arquivo já responde isso: `.acv` abre, qualquer outro protege.
 *
 * O que esta tela é obrigada a fazer, e faz:
 *
 *  · **Pedir a senha duas vezes ao proteger.** Um erro de digitação aqui
 *    não dá erro nenhum — dá um arquivo que ninguém mais abre, nunca.
 *  · **Dizer isso em letras grandes, antes.** Não existe "esqueci minha
 *    senha". Um app que deixasse recuperar sem a senha estaria mentindo
 *    sobre estar criptografado.
 *  · **Não apagar o original por conta própria.** Se apagar, é porque foi
 *    marcado — e mesmo assim vai pra LIXEIRA, com volta.
 */
export default function Proteger({ item, aoFechar, aoTerminar }) {
  const { provider, avisar, mudou, prefs } = useApp()
  const abrindo = ehProtegido(item)

  const [senha, setSenha] = useState('')
  const [confirma, setConfirma] = useState('')
  const [apagarOriginal, setApagarOriginal] = useState(false)
  const [estado, setEstado] = useState({ rodando: false, feitos: 0, total: 0, etapa: '' })
  const [erro, setErro] = useState(null)

  useEffect(() => {
    setSenha('')
    setConfirma('')
    setApagarOriginal(false)
    setErro(null)
    setEstado({ rodando: false, feitos: 0, total: 0, etapa: '' })
  }, [item])

  if (!item) return null

  const forca = forcaDaSenha(senha)
  const grandeDemais = item.size > LIMITE_BYTES
  const semCripto = !temCripto()

  const impedimento = semCripto
    ? 'Este navegador não oferece criptografia. Abra pelo celular — lá funciona.'
    : grandeDemais
      ? `O arquivo tem ${formatBytes(item.size)}. O limite é ${formatBytes(LIMITE_BYTES, 0)} de uma vez, porque ele passa inteiro pela memória.`
      : null

  const podeIr = abrindo
    ? senha.length > 0
    : senha.length >= 4 && senha === confirma && forca.nivel >= 1

  const progresso = estado.total ? Math.min(1, estado.feitos / estado.total) : 0

  const executar = async () => {
    setErro(null)
    setEstado({ rodando: true, feitos: 0, total: 1, etapa: 'lendo o arquivo…' })
    const destino = parentOf(item.path)
    const comecou = Date.now()

    try {
      const bytes = await provider.readBytes(item.path)
      if (!bytes || !bytes.length) throw new Error('Não consegui ler o conteúdo deste arquivo.')

      const onProgresso = (feitos, total, etapa) => setEstado({ rodando: true, feitos, total, etapa })

      if (abrindo) {
        const r = await abrir(bytes, senha, { onProgresso })
        setEstado({ rodando: true, feitos: 1, total: 1, etapa: 'gravando…' })
        const existentes = new Set((await provider.list(destino)).map((e) => e.name))
        // O nome original vem de dentro do arquivo. Se por algum motivo não
        // vier, o nome do `.acv` sem a extensão é o palpite honesto.
        const sugerido = r.nome || stripExt(item.name) || 'arquivo-aberto'
        const nomeFinal = uniqueName(sugerido, existentes)
        await provider.writeBytes(join(destino, nomeFinal), r.bytes)

        mudou()
        avisar(`"${nomeFinal}" aberto — ${formatBytes(r.bytes.length)}.`, 'ok')
        if (Date.now() - comecou > 3000) {
          avisarSeEscondido({
            titulo: 'Arquivo aberto',
            corpo: `${nomeFinal} está pronto na pasta.`,
            ligado: prefs.notificacoes,
          })
        }
      } else {
        const r = await proteger(bytes, senha, {
          nome: item.name,
          mtime: item.mtime,
          onProgresso,
        })
        setEstado({ rodando: true, feitos: 1, total: 1, etapa: 'gravando…' })
        const existentes = new Set((await provider.list(destino)).map((e) => e.name))
        const nomeFinal = uniqueName(`${item.name}.${EXT}`, existentes)
        await provider.writeBytes(join(destino, nomeFinal), r.bytes)

        if (apagarOriginal) {
          // Lixeira, nunca exclusão definitiva: se a senha foi digitada
          // errada nas duas caixas iguais, o original ainda tem volta.
          const res = await paraLixeira(provider, [item.path])
          if (res.erros && res.erros.length) avisar(res.erros[0], 'erro')
        }

        mudou()
        avisar(
          `"${nomeFinal}" protegido — ${formatBytes(r.bytes.length)}.` +
            (apagarOriginal ? ' O original foi pra lixeira.' : ''),
          'ok'
        )
        if (Date.now() - comecou > 3000) {
          avisarSeEscondido({
            titulo: 'Arquivo protegido',
            corpo: `${nomeFinal} — só abre com a sua senha.`,
            ligado: prefs.notificacoes,
          })
        }
      }

      aoTerminar && aoTerminar()
      aoFechar()
    } catch (e) {
      setEstado({ rodando: false, feitos: 0, total: 0, etapa: '' })
      setErro((e && e.message) || 'Não deu certo.')
    }
  }

  return (
    <Folha
      aberta={!!item}
      aoFechar={estado.rodando ? undefined : aoFechar}
      titulo={abrindo ? 'Abrir arquivo protegido' : 'Proteger com senha'}
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar} largura="total" disabled={estado.rodando}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            largura="total"
            disabled={!podeIr || estado.rodando || !!impedimento}
            onClick={executar}
          >
            {estado.rodando ? 'Trabalhando…' : abrindo ? 'Abrir' : 'Proteger'}
          </Botao>
        </>
      }
    >
      <div className={css.resumo}>
        <span className={css.resumoIcone}>
          <Icone nome={abrindo ? 'chave' : 'cadeado'} tamanho={22} />
        </span>
        <span className={css.resumoTextos}>
          <strong className="corta">{item.name}</strong>
          <span className="num">{formatBytes(item.size)}</span>
        </span>
      </div>

      {impedimento ? (
        <p className={css.impedimento}>
          <Icone nome="alerta" tamanho={16} />
          {impedimento}
        </p>
      ) : estado.rodando ? (
        <AnelProgresso
          valor={progresso}
          texto={`${estado.etapa}${estado.total > 1 ? ` ${estado.feitos}/${estado.total}` : ''}`}
        />
      ) : (
        <>
          <CampoSenha
            valor={senha}
            aoMudar={(v) => {
              setSenha(v)
              setErro(null)
            }}
            rotulo={abrindo ? 'Senha do arquivo' : 'Senha'}
            autoFoco
            aoEnviar={podeIr ? executar : undefined}
          />

          {!abrindo && (
            <>
              <ForcaSenha forca={forca} />
              <div style={{ marginTop: 'var(--e-3)' }}>
                <CampoSenha
                  valor={confirma}
                  aoMudar={(v) => {
                    setConfirma(v)
                    setErro(null)
                  }}
                  rotulo="Repita a senha"
                  aoEnviar={podeIr ? executar : undefined}
                />
              </div>
              {confirma && senha !== confirma && (
                <p className={css.impedimento}>
                  <Icone nome="alerta" tamanho={16} />
                  As duas senhas estão diferentes.
                </p>
              )}

              <p className={css.impedimento} style={{ marginTop: 'var(--e-4)' }}>
                <Icone nome="alerta" tamanho={16} />
                <span>
                  <strong>Se você esquecer esta senha, o arquivo se perde.</strong> Não existe
                  recuperação — é isso que significa estar criptografado. Anote num lugar seguro
                  antes de continuar.
                </span>
              </p>

              <div style={{ marginTop: 'var(--e-3)', padding: '0 var(--e-1)' }}>
                <Marcador
                  marcado={apagarOriginal}
                  aoMudar={setApagarOriginal}
                  titulo="Mandar o original pra lixeira"
                  descricao="Sem isto, o arquivo desprotegido continua na pasta ao lado do protegido — e aí proteger não protegeu nada. Vai pra lixeira, dá pra recuperar."
                />
              </div>

              <p className={css.nota}>
                <Icone nome="info" tamanho={14} />
                <span>
                  Fica um arquivo <strong>.{EXT}</strong> ao lado deste. Ele só abre por aqui, com
                  a senha — nenhum outro aplicativo lê esse formato.
                </span>
              </p>
            </>
          )}

          {abrindo && (
            <p className={css.nota}>
              <Icone nome="info" tamanho={14} />
              <span>
                O conteúdo volta com o nome original, ao lado deste arquivo. O
                <strong> .{EXT}</strong> continua onde está.
              </span>
            </p>
          )}
        </>
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
