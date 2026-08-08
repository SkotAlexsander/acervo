import { useCallback, useEffect, useState } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import Fundo from './components/Fundo/Fundo.jsx'
import BarraAbas from './components/BarraAbas/BarraAbas.jsx'
import Avisos from './components/ui/Avisos.jsx'
import Icone from './components/Icone.jsx'
import { AppProvider, useApp } from './state/AppContext.jsx'
import { ehAparelho } from './fs/index.js'
import { verificarPermissao } from './fs/permissao.js'
import { useVoltarDoAparelho, useDeslizarParaVoltar, destinoDeVoltar } from './state/voltar.js'
import { avisarEspaco } from './fs/notificar.js'
import Permissao from './screens/Permissao/Permissao.jsx'

import Inicio from './screens/Inicio/Inicio.jsx'
import Navegador from './screens/Navegador/Navegador.jsx'
import Categoria from './screens/Categoria/Categoria.jsx'
import Busca from './screens/Busca/Busca.jsx'
import Limpeza from './screens/Limpeza/Limpeza.jsx'
import Espaco from './screens/Espaco/Espaco.jsx'
import Lixeira from './screens/Lixeira/Lixeira.jsx'
import Favoritos from './screens/Favoritos/Favoritos.jsx'
import Ajustes from './screens/Ajustes/Ajustes.jsx'

import css from './App.module.css'

/** Telas que ocupam a moldura inteira — a barra de abas some nelas. */
const SEM_ABAS = ['/busca', '/lixeira', '/favoritos', '/espaco']

function Casca() {
  const { pronto, erroInicial, avisoProvider, dispensarAvisoProvider, avisar, provider, prefs } =
    useApp()
  const { pathname } = useLocation()
  const navegar = useNavigate()

  // No celular, antes de tudo: o Android já liberou o armazenamento?
  // `null` = ainda perguntando. No navegador a resposta é sempre `true`.
  const [temPermissao, setTemPermissao] = useState(null)
  useEffect(() => {
    let vivo = true
    verificarPermissao()
      .then((r) => vivo && setTemPermissao(r.concedida))
      .catch(() => vivo && setTemPermissao(true))
    return () => {
      vivo = false
    }
  }, [])

  // ── Voltar ────────────────────────────────────────────────────────────────
  // O botão físico do Android e o deslizar da borda esquerda passam os dois
  // pela MESMA regra (`state/voltar.js`): fecha o que está aberto, depois
  // sobe uma pasta, depois volta pro início, e só então pergunta se sai.
  const sair = useCallback(
    async (confirmado) => {
      if (!confirmado) {
        avisar('Toque em voltar de novo pra sair do Acervo.', 'info')
        return
      }
      try {
        const { App: AppNativo } = await import('@capacitor/app')
        await AppNativo.exitApp()
      } catch {
        /* no navegador não há como fechar a aba, e tudo bem */
      }
    },
    [avisar]
  )
  useVoltarDoAparelho({ pathname, navegar, aoSair: sair })

  // Elemento em ESTADO, não em ref: a área de conteúdo só existe depois da
  // tela de carregamento, e um `useRef` não avisa ninguém quando ela aparece.
  const [areaGesto, setAreaGesto] = useState(null)
  const [puxadaVoltar, setPuxadaVoltar] = useState(0)
  useDeslizarParaVoltar(
    areaGesto,
    () => {
      const destino = destinoDeVoltar(pathname)
      if (destino) navegar(destino)
    },
    !!destinoDeVoltar(pathname),
    setPuxadaVoltar
  )

  // Armazenamento quase cheio: um aviso do sistema, no máximo uma vez por dia,
  // e só se a pessoa ligou as notificações.
  useEffect(() => {
    if (!provider || !prefs.notificacoes) return
    let vivo = true
    provider
      .storage()
      .then((info) => vivo && avisarEspaco(info, true))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [provider, prefs.notificacoes])

  const mostrarAbas = !SEM_ABAS.some((p) => pathname.startsWith(p))

  if (erroInicial) {
    return (
      <div className={css.arranque}>
        <span className={css.arranqueMarca} style={{ background: 'var(--perigo)' }}>
          <Icone nome="alerta" tamanho={26} />
        </span>
        <p className={css.arranqueTexto}>{erroInicial}</p>
      </div>
    )
  }

  // A tela de permissão vem ANTES da de carregamento: não faz sentido esperar
  // o armazenamento abrir quando o sistema ainda não deixou ler nada.
  if (temPermissao === false) {
    return <Permissao aoLiberar={() => window.location.reload()} />
  }

  if (!pronto || temPermissao === null) {
    return (
      <div className={css.arranque}>
        <span className={css.arranqueMarca}>
          <Icone nome="pasta" tamanho={26} />
        </span>
        <p className={css.arranqueTexto}>abrindo o armazenamento…</p>
      </div>
    )
  }

  return (
    <>
      {avisoProvider && (
        <div className={css.faixaAviso} role="alert">
          <Icone nome="alerta" tamanho={17} className={css.faixaAvisoIcone} />
          <span style={{ flex: 1 }}>{avisoProvider}</span>
          <button
            type="button"
            className={css.faixaAvisoFechar}
            onClick={dispensarAvisoProvider}
            aria-label="Dispensar"
          >
            <Icone nome="fechar" tamanho={15} />
          </button>
        </div>
      )}

      {/* A dica do gesto de voltar: uma meia-lua que cresce conforme o dedo
          puxa da borda. Sem retorno visual, o gesto vira adivinhação — a
          pessoa não sabe se puxou o suficiente antes de soltar. */}
      {puxadaVoltar > 0 && (
        <div
          className={css.dicaVoltar}
          style={{
            opacity: Math.min(1, puxadaVoltar / 70),
            transform: `translateY(-50%) translateX(${Math.min(28, puxadaVoltar * 0.4) - 28}px)`,
          }}
          aria-hidden="true"
        >
          <Icone nome="voltar" tamanho={22} />
        </div>
      )}

      {/*
        A chave é a PRIMEIRA parte da rota, não a rota inteira.

        Com a rota inteira, andar de `Documentos` pra `Documentos/Fotos`
        remontaria a tela e a animação de entrada dispararia a cada pasta
        aberta — vira pisca-pisca. Com o primeiro segmento, a animação toca
        na troca de TELA (Início → Pastas → Limpeza), que é o momento em que
        ela informa alguma coisa.
      */}
      <div className={css.conteudo} ref={setAreaGesto}>
        <div key={'/' + pathname.split('/')[1]} className={css.transicao}>
          <Routes>
            <Route path="/" element={<Inicio />} />
            <Route path="/pastas/*" element={<Navegador />} />
            <Route path="/pastas" element={<Navegador />} />
            <Route path="/categoria/:tipo" element={<Categoria />} />
            <Route path="/busca" element={<Busca />} />
            <Route path="/limpeza" element={<Limpeza />} />
            <Route path="/espaco" element={<Espaco />} />
            <Route path="/lixeira" element={<Lixeira />} />
            <Route path="/favoritos" element={<Favoritos />} />
            <Route path="/ajustes" element={<Ajustes />} />
            {/* Rota desconhecida volta pro início em vez de mostrar tela branca. */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </div>

      {mostrarAbas && <BarraAbas />}
      <Avisos />
    </>
  )
}

export default function App() {
  // Marca o documento quando está rodando dentro do APK: o CSS usa isso pra
  // tirar a moldura de celular (que só faz sentido na pré-visualização do PC).
  useEffect(() => {
    if (ehAparelho()) document.documentElement.setAttribute('data-nativo', '')
  }, [])

  return (
    <AppProvider>
      <Fundo />
      <div className={css.palco}>
        <span className={css.etiqueta}>
          <span className={css.etiquetaPonto} />
          pré-visualização — é assim que fica no celular
        </span>
        <div className={css.moldura}>
          <Casca />
        </div>
      </div>
    </AppProvider>
  )
}
