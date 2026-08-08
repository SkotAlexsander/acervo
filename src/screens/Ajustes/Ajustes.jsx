import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icone from '../../components/Icone.jsx'
import Botao from '../../components/ui/Botao.jsx'
import Dialogo from '../../components/ui/Dialogo.jsx'
import { useApp } from '../../state/AppContext.jsx'
import { useVarredura } from '../../state/hooks.js'
import { ehAparelho } from '../../fs/index.js'
import * as sino from '../../fs/notificar.js'
import { formatBytes } from '../../fs/util.js'
import tela from '../tela.module.css'
import css from './Ajustes.module.css'

const TEMAS = [
  { id: 'sistema', rotulo: 'Sistema', icone: 'monitor' },
  { id: 'claro', rotulo: 'Claro', icone: 'sol' },
  { id: 'escuro', rotulo: 'Escuro', icone: 'lua' },
]

const LIMITES = [
  { bytes: 50 * 1024 * 1024, rotulo: '50 MB' },
  { bytes: 100 * 1024 * 1024, rotulo: '100 MB' },
  { bytes: 500 * 1024 * 1024, rotulo: '500 MB' },
  { bytes: 1024 * 1024 * 1024, rotulo: '1 GB' },
]

export default function Ajustes() {
  const navegar = useNavigate()
  const { prefs, definirPref, restaurarDemo, provider, avisar } = useApp()
  const varredura = useVarredura(true)
  const [confirmandoReset, setConfirmandoReset] = useState(false)
  const [permissaoAviso, setPermissaoAviso] = useState('perguntar')

  const nativo = ehAparelho()

  useEffect(() => {
    let vivo = true
    sino.estado().then((e) => vivo && setPermissaoAviso(e))
    return () => {
      vivo = false
    }
  }, [])

  /**
   * Ligar o interruptor PEDE a permissão do sistema antes de gravar a
   * preferência. Gravar "ligado" com a permissão negada seria um interruptor
   * que diz sim e não faz nada — o pior tipo de ajuste.
   */
  const alternarNotificacoes = async (querLigar) => {
    if (!querLigar) {
      definirPref('notificacoes', false)
      return
    }
    if (!sino.suporta()) {
      avisar('Este aparelho não tem notificação disponível pro app.', 'erro')
      return
    }
    const atual = await sino.estado()
    const resultado = atual === 'concedida' ? 'concedida' : await sino.pedir()
    setPermissaoAviso(resultado)
    if (resultado === 'concedida') {
      definirPref('notificacoes', true)
      avisar('Notificações ligadas.', 'ok')
    } else {
      definirPref('notificacoes', false)
      avisar(
        resultado === 'negada'
          ? 'O sistema está bloqueando as notificações do Acervo. Libere nos ajustes do celular.'
          : 'A permissão não foi concedida.',
        'erro'
      )
    }
  }

  return (
    <div className={tela.tela}>
      <header className={tela.cabecalho}>
        <div className={tela.cabecalhoTextos}>
          <h1 className={tela.titulo}>Ajustes</h1>
          <span className={tela.subtitulo}>aparência e comportamento</span>
        </div>
      </header>

      <div className={tela.corpo}>
        {/* ── Aparência ────────────────────────────────────────────────── */}
        <section className={tela.secao}>
          <div className={tela.secaoCabecalho}>
            <h2 className={tela.secaoTitulo}>Aparência</h2>
          </div>

          <div className={css.bloco}>
            <div className={css.linha}>
              <span className={css.linhaIcone}>
                <Icone nome="sol" tamanho={19} />
              </span>
              <span className={css.linhaTextos}>
                <span className={css.linhaTitulo}>Tema</span>
                <span className={css.linhaNota}>
                  “Sistema” acompanha o que o celular estiver usando
                </span>
              </span>
            </div>
            <div className={css.segmentado} role="radiogroup" aria-label="Tema">
              {TEMAS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={prefs.tema === t.id}
                  className={`${css.segmento} ${prefs.tema === t.id ? css.segmentoAtivo : ''}`}
                  onClick={() => definirPref('tema', t.id)}
                >
                  <Icone nome={t.icone} tamanho={17} />
                  {t.rotulo}
                </button>
              ))}
            </div>
          </div>

          <Interruptor
            icone="ondas"
            titulo="Efeitos de fundo"
            nota="As manchas coloridas que se movem atrás do app. Desligar economiza bateria."
            ligado={prefs.efeitos}
            aoMudar={(v) => definirPref('efeitos', v)}
          />

          <Interruptor
            icone="grade"
            titulo="Abrir pastas em grade"
            nota="Bom pra pasta cheia de foto. Lista mostra mais detalhe de cada arquivo."
            ligado={prefs.visao === 'grade'}
            aoMudar={(v) => definirPref('visao', v ? 'grade' : 'lista')}
          />
        </section>

        {/* ── Arquivos ─────────────────────────────────────────────────── */}
        <section className={tela.secao}>
          <div className={tela.secaoCabecalho}>
            <h2 className={tela.secaoTitulo}>Arquivos</h2>
          </div>

          <Interruptor
            icone="olho"
            titulo="Mostrar arquivos ocultos"
            nota="Itens que começam com ponto (.thumbnails, .trashed). Normalmente são de sistema."
            ligado={prefs.mostrarOcultos}
            aoMudar={(v) => definirPref('mostrarOcultos', v)}
          />

          <Interruptor
            icone="peso"
            titulo="Somar o conteúdo das pastas"
            nota="Mostra quanto cada pasta ocupa, na própria lista. Só calcula a pasta que está na tela — mas em aparelho lento pode pesar."
            ligado={prefs.medirPastas}
            aoMudar={(v) => definirPref('medirPastas', v)}
          />

          <div className={css.bloco}>
            <div className={css.linha}>
              <span className={css.linhaIcone}>
                <Icone nome="peso" tamanho={19} />
              </span>
              <span className={css.linhaTextos}>
                <span className={css.linhaTitulo}>“Arquivo grande” é acima de</span>
                <span className={css.linhaNota}>
                  Define o que aparece na Limpeza como arquivo grande
                </span>
              </span>
            </div>
            <div className={css.segmentado}>
              {LIMITES.map((l) => (
                <button
                  key={l.bytes}
                  type="button"
                  className={`${css.segmento} ${prefs.limiteGrande === l.bytes ? css.segmentoAtivo : ''}`}
                  onClick={() => definirPref('limiteGrande', l.bytes)}
                >
                  {l.rotulo}
                </button>
              ))}
            </div>
          </div>

          {prefs.favoritos.length > 0 && (
            <button type="button" className={css.acao} onClick={() => navegar('/favoritos')}>
              <span className={css.linhaIcone}>
                <Icone nome="estrela" tamanho={19} />
              </span>
              <span className={css.linhaTextos}>
                <span className={css.linhaTitulo}>Favoritos</span>
                <span className={css.linhaNota}>{prefs.favoritos.length} fixados</span>
              </span>
              <Icone nome="avancar" tamanho={17} className={css.acaoSeta} />
            </button>
          )}

          <button type="button" className={css.acao} onClick={() => navegar('/lixeira')}>
            <span className={css.linhaIcone}>
              <Icone nome="lixeira" tamanho={19} />
            </span>
            <span className={css.linhaTextos}>
              <span className={css.linhaTitulo}>Lixeira</span>
              <span className={css.linhaNota}>Onde ficam os itens excluídos</span>
            </span>
            <Icone nome="avancar" tamanho={17} className={css.acaoSeta} />
          </button>
        </section>

        {/* ── Avisos ───────────────────────────────────────────────────── */}
        <section className={tela.secao}>
          <div className={tela.secaoCabecalho}>
            <h2 className={tela.secaoTitulo}>Avisos</h2>
          </div>

          <Interruptor
            icone="sino"
            titulo="Notificar quando terminar"
            nota="Só avisa se você tiver saído do app enquanto ele preparava um arquivo (compactar, gerar PDF, proteger com senha) — e quando o armazenamento estiver quase cheio."
            ligado={prefs.notificacoes}
            aoMudar={alternarNotificacoes}
          />

          {permissaoAviso === 'negada' && (
            <p className={css.sobre}>
              O sistema está bloqueando as notificações deste app. Pra liberar:
              <strong> Ajustes do celular → Aplicativos → Acervo → Notificações</strong>.
            </p>
          )}

          {prefs.notificacoes && (
            <div className={css.blocoAcoes}>
              <Botao
                variante="secundario"
                tamanho="sm"
                icone="sino"
                onClick={async () => {
                  const foi = await sino.notificar({
                    titulo: 'Acervo',
                    corpo: 'É assim que um aviso vai aparecer.',
                  })
                  avisar(
                    foi
                      ? 'Aviso enviado — confira a barra de notificações.'
                      : 'Não consegui enviar. A permissão deve ter sido revogada.',
                    foi ? 'ok' : 'erro'
                  )
                }}
              >
                Enviar um aviso de teste
              </Botao>
            </div>
          )}
        </section>

        {/* ── Origem dos dados ─────────────────────────────────────────── */}
        <section className={tela.secao}>
          <div className={tela.secaoCabecalho}>
            <h2 className={tela.secaoTitulo}>Origem dos dados</h2>
          </div>

          <div className={`${css.bloco} ${nativo ? css.blocoOk : css.blocoDemo}`}>
            <div className={css.linha}>
              <span className={css.linhaIcone}>
                <Icone nome={nativo ? 'disco' : 'monitor'} tamanho={19} />
              </span>
              <span className={css.linhaTextos}>
                <span className={css.linhaTitulo}>
                  {provider ? provider.label : 'carregando…'}
                </span>
                <span className={css.linhaNota}>
                  {nativo
                    ? 'Você está mexendo nos arquivos de verdade do aparelho.'
                    : 'No PC o app usa uma memória de celular simulada. Nada no seu computador é lido nem alterado — o mesmo app, instalado no celular, passa a mexer nos arquivos reais.'}
                </span>
              </span>
            </div>

            {varredura.pronto && (
              <p className={`${css.estatistica} num`}>
                {varredura.arquivos.length.toLocaleString('pt-BR')} arquivos ·{' '}
                {varredura.pastas.length.toLocaleString('pt-BR')} pastas ·{' '}
                {formatBytes(varredura.arquivos.reduce((s, a) => s + (a.size || 0), 0))}
              </p>
            )}

            {!nativo && (
              <div className={css.blocoAcoes}>
                <Botao
                  variante="secundario"
                  tamanho="sm"
                  icone="atualizar"
                  onClick={() => setConfirmandoReset(true)}
                >
                  Restaurar a demonstração
                </Botao>
              </div>
            )}
          </div>
        </section>

        {/* ── Sobre ────────────────────────────────────────────────────── */}
        <section className={tela.secao}>
          <div className={tela.secaoCabecalho}>
            <h2 className={tela.secaoTitulo}>Sobre</h2>
          </div>
          <div className={css.bloco}>
            <p className={css.sobre}>
              <strong>Acervo</strong> — organizador de arquivos e pastas do celular.
              Uso pessoal, sem conta, sem nuvem, sem enviar nada pra lugar nenhum.
            </p>
            <p className={css.sobreVersao}>
              versão {typeof __VERSAO__ === 'string' ? __VERSAO__ : '—'}
            </p>
          </div>
        </section>
      </div>

      <Dialogo
        aberto={confirmandoReset}
        aoFechar={() => setConfirmandoReset(false)}
        titulo="Restaurar a demonstração?"
        mensagem="Tudo que você renomeou, moveu ou excluiu nesta simulação volta ao estado original. Seus ajustes e favoritos não mudam."
        rotuloConfirmar="Restaurar"
        aoConfirmar={async () => {
          setConfirmandoReset(false)
          try {
            await restaurarDemo()
          } catch (e) {
            avisar((e && e.message) || 'Não deu pra restaurar.', 'erro')
          }
        }}
      />
    </div>
  )
}

/** Linha com interruptor. */
function Interruptor({ icone, titulo, nota, ligado, aoMudar }) {
  return (
    <button
      type="button"
      className={css.bloco}
      role="switch"
      aria-checked={ligado}
      onClick={() => aoMudar(!ligado)}
    >
      <div className={css.linha}>
        <span className={css.linhaIcone}>
          <Icone nome={icone} tamanho={19} />
        </span>
        <span className={css.linhaTextos}>
          <span className={css.linhaTitulo}>{titulo}</span>
          {nota && <span className={css.linhaNota}>{nota}</span>}
        </span>
        <span className={`${css.chave} ${ligado ? css.chaveLigada : ''}`} aria-hidden="true">
          <span className={css.chaveBola} />
        </span>
      </div>
    </button>
  )
}
