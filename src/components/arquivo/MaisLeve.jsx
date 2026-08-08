import { useEffect, useRef, useState } from 'react'
import Folha from '../ui/Folha.jsx'
import Botao from '../ui/Botao.jsx'
import Icone from '../Icone.jsx'
import { Opcao, Balanca, Marcador } from './PecasOperacao.jsx'
import { useApp } from '../../state/AppContext.jsx'
import {
  PRESETS, rotaDe, formatosPara, otimizarImagem, comprimirSemPerda, avaliar, GANHO_MINIMO,
} from '../../fs/otimizar.js'
import { paraLixeira } from '../../fs/trash.js'
import { avisarSeEscondido } from '../../fs/notificar.js'
import { baseName, parentOf, join, stripExt, formatBytes, uniqueName } from '../../fs/util.js'
import css from './Operacoes.module.css'

/**
 * "Deixar mais leve."
 *
 * Duas rotas, escolhidas pelo tipo do arquivo, e a tela diz qual está usando:
 *
 *  · **foto** → reencoda com menos dados. Os pixels mudam; o olho não vê.
 *  · **resto** → guarda num `.zip`. Volta idêntico, byte por byte.
 *
 * A peça central é a `Balanca`: **o número do "depois" é real**, não
 * estimativa. A imagem é reencodada de verdade na memória a cada mudança de
 * ajuste, e só é gravada quando você aperta o botão. Custa uns décimos de
 * segundo e evita a única coisa que não dá pra desfazer aqui — descobrir
 * depois de gravar que não valeu a pena.
 *
 * E quando não vale a pena, a tela DIZ, em vez de deixar a pessoa
 * descobrir sozinha comparando os dois arquivos na lista.
 */
export default function MaisLeve({ item, aoFechar, aoTerminar }) {
  const { provider, avisar, mudou, prefs } = useApp()

  const [bytes, setBytes] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [preset, setPreset] = useState('equilibrado')
  const [formato, setFormato] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [calculando, setCalculando] = useState(false)
  const [substituir, setSubstituir] = useState(false)
  const [gravando, setGravando] = useState(false)
  const [erro, setErro] = useState(null)
  const previaUrl = useRef(null)
  const [previa, setPrevia] = useState(null)

  const rota = item ? rotaDe(item) : null
  const ehImagem = rota === 'imagem'
  const formatos = item && ehImagem ? formatosPara(item) : []

  // 1. Ler o arquivo uma vez só. Todo o resto acontece em cima destes bytes.
  useEffect(() => {
    if (!item) return undefined
    let vivo = true
    setBytes(null)
    setResultado(null)
    setPrevia(null)
    setErro(null)
    setSubstituir(false)
    setPreset('equilibrado')
    setFormato(null)
    ;(async () => {
      try {
        const b = await provider.readBytes(item.path)
        if (!vivo) return
        if (!b || !b.length) throw new Error('Não consegui ler o conteúdo deste arquivo.')
        setBytes(b)
        const a = await avaliar(item, b)
        if (vivo) setAviso(a.aviso)
      } catch (e) {
        if (vivo) setErro((e && e.message) || 'Não deu pra ler o arquivo.')
      }
    })()
    return () => {
      vivo = false
    }
  }, [item, provider])

  // Formato padrão: o primeiro da lista (manter o de origem quando dá).
  useEffect(() => {
    if (ehImagem && !formato && formatos.length) setFormato(formatos[0].id)
  }, [ehImagem, formato, formatos])

  // 2. Recalcular a cada ajuste — de verdade, não por estimativa.
  useEffect(() => {
    if (!bytes || !item) return undefined
    let vivo = true
    setCalculando(true)
    setErro(null)

    // Um respiro antes de calcular: trocar de preset três vezes seguidas não
    // deve disparar três reencodagens de uma foto de 12 megapixels.
    const t = setTimeout(async () => {
      try {
        let r
        if (ehImagem) {
          const p = PRESETS.find((x) => x.id === preset) || PRESETS[1]
          r = await otimizarImagem(bytes, {
            qualidade: p.qualidade,
            ladoMaximo: p.ladoMaximo,
            formato: formato || 'jpg',
          })
        } else {
          r = await comprimirSemPerda(item, bytes)
        }
        if (!vivo) return
        setResultado(r)
        if (ehImagem) {
          if (previaUrl.current) URL.revokeObjectURL(previaUrl.current)
          previaUrl.current = URL.createObjectURL(new Blob([r.bytes]))
          setPrevia(previaUrl.current)
        }
      } catch (e) {
        if (vivo) {
          setResultado(null)
          setErro((e && e.message) || 'Não deu pra calcular.')
        }
      } finally {
        if (vivo) setCalculando(false)
      }
    }, 180)

    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [bytes, item, ehImagem, preset, formato])

  // A prévia é um objeto na memória do navegador; sem revogar, ela fica lá
  // segurando a imagem inteira até a aba fechar.
  useEffect(
    () => () => {
      if (previaUrl.current) URL.revokeObjectURL(previaUrl.current)
      previaUrl.current = null
    },
    []
  )

  if (!item) return null

  const destino = parentOf(item.path)

  const gravar = async () => {
    if (!resultado) return
    setGravando(true)
    setErro(null)
    const comecou = Date.now()
    try {
      const existentes = new Set((await provider.list(destino)).map((e) => e.name))
      const base = stripExt(item.name)
      const desejado = substituir ? `${base}.${resultado.ext}` : `${base}-leve.${resultado.ext}`
      // Quando substitui e a extensão é a MESMA, o nome desejado é o nome do
      // original — que ainda está lá. Tirar o original do conjunto evita que
      // `uniqueName` invente "foto (2).jpg" e a substituição não substitua nada.
      if (substituir) existentes.delete(item.name)
      const nomeFinal = uniqueName(desejado, existentes)

      if (substituir) {
        // Lixeira primeiro, gravação depois: o caminho pode ser o mesmo do
        // original, e gravar antes apagaria o novo junto com o velho.
        const res = await paraLixeira(provider, [item.path])
        if (res.erros && res.erros.length) throw new Error(res.erros[0])
      }
      await provider.writeBytes(join(destino, nomeFinal), resultado.bytes)

      mudou()
      avisar(`"${nomeFinal}" — ${resultado.resumo}.`, 'ok')
      if (Date.now() - comecou > 3000) {
        avisarSeEscondido({
          titulo: 'Arquivo mais leve',
          corpo: `${nomeFinal} — ${resultado.resumo}`,
          ligado: prefs.notificacoes,
        })
      }
      aoTerminar && aoTerminar()
      aoFechar()
    } catch (e) {
      setErro((e && e.message) || 'Não deu certo ao gravar.')
    } finally {
      setGravando(false)
    }
  }

  const naoVale = resultado && !resultado.valeAPena

  return (
    <Folha
      aberta={!!item}
      aoFechar={gravando ? undefined : aoFechar}
      titulo="Deixar mais leve"
      rodape={
        <>
          <Botao variante="fantasma" onClick={aoFechar} largura="total" disabled={gravando}>
            Cancelar
          </Botao>
          <Botao
            variante="primario"
            largura="total"
            disabled={!resultado || calculando || gravando}
            onClick={gravar}
          >
            {gravando ? 'Gravando…' : naoVale ? 'Gravar assim mesmo' : 'Deixar mais leve'}
          </Botao>
        </>
      }
    >
      <div className={css.resumo}>
        <span className={css.resumoIcone}>
          <Icone nome="comprimir" tamanho={22} />
        </span>
        <span className={css.resumoTextos}>
          <strong className="corta">{item.name}</strong>
          <span className="num">
            {formatBytes(item.size)} ·{' '}
            {ehImagem ? 'reencoda a foto' : 'compacta sem perder nada'}
          </span>
        </span>
      </div>

      {ehImagem ? (
        <>
          <div className={css.opcoes}>
            {PRESETS.map((p) => (
              <Opcao
                key={p.id}
                selo={`${Math.round(p.qualidade * 100)}`}
                titulo={p.rotulo}
                descricao={p.descricao}
                ativa={preset === p.id}
                aoClicar={() => setPreset(p.id)}
              />
            ))}
          </div>

          {formatos.length > 1 && (
            <>
              <p className={css.rotulo} style={{ padding: 'var(--e-4) var(--e-1) var(--e-2)' }}>
                Formato de saída
              </p>
              <div className={css.opcoes}>
                {formatos.map((f) => (
                  <Opcao
                    key={f.id}
                    selo={f.id.toUpperCase()}
                    titulo={f.rotulo}
                    descricao={f.nota}
                    ativa={formato === f.id}
                    aoClicar={() => setFormato(f.id)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      ) : (
        <p className={css.nota}>
          <Icone nome="info" tamanho={14} />
          <span>
            Este tipo de arquivo não pode ser "reduzido" sem estragar. O que dá pra fazer sem
            perder nada é guardá-lo num <strong>.zip</strong> — ao extrair, volta exatamente
            igual, byte por byte.
          </span>
        </p>
      )}

      {calculando && (
        <p className={css.calculando}>
          <Icone nome="atualizar" tamanho={15} />
          calculando o tamanho real…
        </p>
      )}

      {resultado && !calculando && (
        <>
          <Balanca
            antes={item.size}
            depois={resultado.bytes.length}
            dimensoes={
              ehImagem && resultado.largura !== resultado.larguraOriginal
                ? `${resultado.largura}×${resultado.altura}`
                : null
            }
          />
          {previa && (
            <img
              className={css.miniatura}
              src={previa}
              alt="Prévia do resultado"
              loading="lazy"
            />
          )}
        </>
      )}

      {naoVale && !calculando && (
        <p className={css.impedimento}>
          <Icone nome="alerta" tamanho={16} />
          <span>
            {ehImagem
              ? `O ganho ficou abaixo de ${Math.round(GANHO_MINIMO * 100)}% — este arquivo já está bem comprimido. Tente "Máxima economia", ou deixe como está.`
              : `Não deu pra encolher — este tipo já vem comprimido de fábrica. Guardar no .zip aqui só serve pra juntar arquivos, não pra economizar espaço.`}
          </span>
        </p>
      )}

      {aviso && !calculando && (
        <p className={css.nota}>
          <Icone nome="info" tamanho={14} />
          {aviso}
        </p>
      )}

      {resultado && (
        <div style={{ marginTop: 'var(--e-3)', padding: '0 var(--e-1)' }}>
          <Marcador
            marcado={substituir}
            aoMudar={setSubstituir}
            titulo="Substituir o original"
            descricao={
              substituir
                ? 'O original vai pra lixeira — dá pra recuperar se você se arrepender.'
                : `Sem isto, fica um arquivo novo chamado "${stripExt(item.name)}-leve.${resultado.ext}" ao lado.`
            }
          />
        </div>
      )}

      <p className={css.destino}>
        <Icone nome="pasta" tamanho={14} />
        em <strong>{destino === '/' ? 'Armazenamento' : baseName(destino)}</strong>
      </p>

      {provider && provider.conteudoReal === false && (
        <p className={css.notaDemo}>
          <Icone nome="monitor" tamanho={14} />
          <span>
            <strong>Na demonstração do PC</strong> a foto é de exemplo, então o ganho mostrado é
            o ganho DELA. No celular a conta é feita sobre a sua foto de verdade.
          </span>
        </p>
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
