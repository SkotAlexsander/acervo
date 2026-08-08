/**
 * Escolhe com QUEM o app conversa: os arquivos de verdade do celular, ou a
 * demonstração que roda no navegador do PC.
 *
 * Esta é a única linha do projeto que sabe da diferença. Nenhuma tela importa
 * `mockProvider` ou `deviceProvider` — todas importam daqui.
 */

import { mockProvider } from './mockProvider.js'

let atual = null

/** true quando o código está rodando dentro do APK (Android), não no navegador. */
export function ehAparelho() {
  const cap = typeof window !== 'undefined' ? window.Capacitor : null
  return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform())
}

/**
 * Devolve o provider pronto pra uso.
 * No aparelho, tenta o real; se o Android negar a permissão, cai na
 * demonstração com um aviso — o app abre e explica, em vez de morrer na tela branca.
 */
// Uma linha por etapa do arranque, no console. Num app instalado à mão não há
// como depurar de outro jeito: se a tela de abertura travar, é isto que diz onde.
const passo = (texto) => console.log('[acervo] arranque:', texto)

export async function obterProvider() {
  if (atual) return atual

  if (ehAparelho()) {
    passo('aparelho detectado, carregando o provider real')
    try {
      const { deviceProvider } = await import('./deviceProvider.js')
      passo('provider real carregado, lendo a raiz')
      await deviceProvider.init()
      passo('raiz lida — pronto')
      atual = { provider: deviceProvider, aviso: null }
      return atual
    } catch (e) {
      passo('provider real falhou (' + ((e && e.message) || e) + '), caindo na demonstração')
      await mockProvider.init()
      atual = {
        provider: mockProvider,
        aviso:
          (e && e.message) ||
          'Não consegui acessar os arquivos do aparelho. Mostrando a demonstração.',
      }
      return atual
    }
  }

  passo('navegador — usando a demonstração')
  await mockProvider.init()
  atual = {
    provider: mockProvider,
    aviso: null,
  }
  passo('demonstração pronta')
  return atual
}

/** Usado pelo botão "restaurar demonstração" nos Ajustes. */
export async function resetarDemonstracao() {
  if (atual && atual.provider.reset) await atual.provider.reset()
}

export { mockProvider }
