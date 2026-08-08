import { useMemo, useState } from 'react'
import Folha from '../ui/Folha.jsx'
import Botao from '../ui/Botao.jsx'
import Icone from '../Icone.jsx'
import { Carregando, Vazio } from '../ui/Estados.jsx'
import { useDiretorio } from '../../state/hooks.js'
import { crumbs, baseName, isInside, normalize, validateName } from '../../fs/util.js'
import { useApp } from '../../state/AppContext.jsx'
import Dialogo from '../ui/Dialogo.jsx'
import css from './SeletorPasta.module.css'

/**
 * Escolher a pasta de destino de um mover/copiar.
 *
 * Navega de verdade (não é uma lista chapada), e desabilita os destinos
 * inválidos EM VEZ de escondê-los: ver "DCIM" apagado com o motivo é melhor
 * do que ela sumir e você achar que o app perdeu a pasta.
 */
export default function SeletorPasta({ aberto, aoFechar, aoEscolher, origens, titulo }) {
  const [pasta, setPasta] = useState('/')
  const [criando, setCriando] = useState(false)
  const { provider, executar } = useApp()
  const { itens, carregando } = useDiretorio(pasta)

  const pastas = useMemo(() => itens.filter((i) => i.isDir), [itens])
  const trilha = useMemo(() => crumbs(pasta), [pasta])

  // Destino inválido: a própria pasta que está sendo movida, ou algo dentro dela.
  const conjuntoOrigens = useMemo(() => new Set((origens || []).map(normalize)), [origens])
  const paisDasOrigens = useMemo(
    () => new Set((origens || []).map((p) => normalize(p).replace(/\/[^/]+$/, '') || '/')),
    [origens]
  )

  const motivoBloqueio = (caminho) => {
    for (const o of conjuntoOrigens) {
      if (caminho === o) return 'É a própria pasta'
      if (isInside(caminho, o)) return 'Está dentro dela'
    }
    return null
  }

  const destinoAtualBloqueado = motivoBloqueio(pasta)
  const jaEstaAqui = paisDasOrigens.size === 1 && paisDasOrigens.has(pasta)

  const criarPasta = async (nome) => {
    setCriando(false)
    await executar(() => provider.mkdir(pasta, nome), `Pasta "${nome}" criada.`)
  }

  return (
    <>
      <Folha
        aberta={aberto}
        aoFechar={aoFechar}
        titulo={titulo || 'Escolher pasta'}
        rodape={
          <>
            <Botao variante="fantasma" onClick={aoFechar} largura="total">
              Cancelar
            </Botao>
            <Botao
              variante="primario"
              largura="total"
              disabled={!!destinoAtualBloqueado || jaEstaAqui}
              onClick={() => aoEscolher(pasta)}
            >
              {jaEstaAqui ? 'Já está aqui' : destinoAtualBloqueado || `Colocar em ${baseName(pasta)}`}
            </Botao>
          </>
        }
      >
        <div className={css.trilha}>
          {trilha.map((c, i) => (
            <span key={c.path} className={css.trilhaItem}>
              {i > 0 && <Icone nome="avancar" tamanho={13} className={css.trilhaSeta} />}
              <button
                type="button"
                className={`${css.trilhaBotao} ${i === trilha.length - 1 ? css.trilhaAtual : ''}`}
                onClick={() => setPasta(c.path)}
              >
                {c.name}
              </button>
            </span>
          ))}
        </div>

        <button type="button" className={css.novaPasta} onClick={() => setCriando(true)}>
          <span className={css.novaPastaIcone}>
            <Icone nome="pastaMais" tamanho={19} />
          </span>
          Criar pasta aqui
        </button>

        {carregando ? (
          <Carregando linhas={4} />
        ) : pastas.length === 0 ? (
          <Vazio
            icone="pasta"
            titulo="Sem subpastas"
            texto="Você pode soltar os itens aqui mesmo ou criar uma pasta nova."
          />
        ) : (
          <ul className={css.lista}>
            {pastas.map((p) => {
              const bloqueio = motivoBloqueio(p.path)
              return (
                <li key={p.path}>
                  <button
                    type="button"
                    className={css.item}
                    onClick={() => setPasta(p.path)}
                    disabled={!!bloqueio}
                  >
                    <span className={css.itemIcone}>
                      <Icone nome="pasta" tamanho={19} />
                    </span>
                    <span className={`${css.itemNome} corta`}>{p.name}</span>
                    {bloqueio ? (
                      <span className={css.itemBloqueio}>{bloqueio}</span>
                    ) : (
                      <Icone nome="avancar" tamanho={16} className={css.itemSeta} />
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Folha>

      <Dialogo
        aberto={criando}
        aoFechar={() => setCriando(false)}
        tipo="texto"
        titulo="Nome da nova pasta"
        mensagem={`Ela será criada em ${baseName(pasta)}.`}
        valorInicial="Nova pasta"
        rotuloConfirmar="Criar"
        validar={validateName}
        aoConfirmar={criarPasta}
      />
    </>
  )
}
