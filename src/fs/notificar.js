/**
 * Notificações do sistema.
 *
 * A pergunta que decidiu o que entra aqui: **um organizador de arquivos tem
 * o direito de te interromper?** Quase nunca. Notificação de app que não
 * precisa notificar é a razão pela qual as pessoas desligam notificação de
 * tudo. Então a regra é estreita e explícita:
 *
 *   · só avisa quando você NÃO está olhando o app (`document.hidden`);
 *   · só sobre coisa que você mandou fazer e foi embora esperar — compactar,
 *     gerar PDF, proteger com senha;
 *   · mais um aviso de armazenamento quase cheio, no máximo uma vez por dia;
 *   · e nada disso liga sozinho: o interruptor nos Ajustes vem DESLIGADO.
 *
 * Fora isso, o aviso certo é o de dentro da tela (o "toast"), que não
 * atravessa o celular inteiro pra falar de um zip de 3 segundos.
 *
 * Os dois mundos, atrás da mesma porta: no aparelho é o
 * `@capacitor/local-notifications`; no navegador do PC é a `Notification`
 * do próprio navegador. Quem chama não precisa saber onde está.
 */

import { ehAparelho } from './index.js'

const CANAL = 'acervo-trabalhos'
const CHAVE_ESPACO = 'acervo.avisoEspaco'

let plugin = null
let idSeq = 1

/**
 * Igual ao caso do plugin de permissão: `registerPlugin`/o módulo do
 * Capacitor devolve um objeto com armadilha de `.then`. Devolver embrulhado
 * (`{ p }`) é a regra da casa desde que o app travou na tela de abertura.
 */
async function obter() {
  if (!ehAparelho()) return { p: null }
  if (plugin) return { p: plugin }
  try {
    const mod = await import('@capacitor/local-notifications')
    plugin = mod.LocalNotifications
    return { p: plugin }
  } catch {
    return { p: null }
  }
}

/** Existe alguma forma de notificar aqui? */
export function suporta() {
  if (ehAparelho()) return true
  return typeof window !== 'undefined' && 'Notification' in window
}

/** @returns {Promise<'concedida'|'negada'|'perguntar'|'indisponivel'>} */
export async function estado() {
  if (!suporta()) return 'indisponivel'
  const { p } = await obter()
  if (p) {
    try {
      const r = await p.checkPermissions()
      return r.display === 'granted' ? 'concedida' : r.display === 'denied' ? 'negada' : 'perguntar'
    } catch {
      return 'indisponivel'
    }
  }
  const n = window.Notification.permission
  return n === 'granted' ? 'concedida' : n === 'denied' ? 'negada' : 'perguntar'
}

/** Pede a permissão. Devolve o estado resultante. */
export async function pedir() {
  if (!suporta()) return 'indisponivel'
  const { p } = await obter()
  if (p) {
    try {
      // Canal precisa existir ANTES da primeira notificação no Android 8+:
      // sem canal, o sistema descarta em silêncio e nada aparece.
      if (p.createChannel) {
        await p
          .createChannel({
            id: CANAL,
            name: 'Trabalhos do Acervo',
            description: 'Aviso quando um arquivo termina de ser preparado',
            importance: 3,
            visibility: 1,
          })
          .catch(() => {})
      }
      const r = await p.requestPermissions()
      return r.display === 'granted' ? 'concedida' : r.display === 'denied' ? 'negada' : 'perguntar'
    } catch {
      return 'indisponivel'
    }
  }
  try {
    const r = await window.Notification.requestPermission()
    return r === 'granted' ? 'concedida' : r === 'denied' ? 'negada' : 'perguntar'
  } catch {
    return 'indisponivel'
  }
}

/**
 * Manda a notificação. Silenciosa quando não pode: quem chama está no meio
 * de terminar um trabalho e não pode quebrar por causa de um aviso.
 * @returns {Promise<boolean>} entregou?
 */
export async function notificar({ titulo, corpo }) {
  try {
    if ((await estado()) !== 'concedida') return false
    const { p } = await obter()
    if (p) {
      await p.schedule({
        notifications: [
          {
            // O id precisa caber num int de 32 bits do Java — um Date.now()
            // inteiro estoura e o Android descarta a notificação sem erro.
            id: (idSeq++ % 100000) + 1,
            title: titulo,
            body: corpo,
            channelId: CANAL,
            smallIcon: 'ic_stat_acervo',
          },
        ],
      })
      return true
    }
    // eslint-disable-next-line no-new
    new window.Notification(titulo, { body: corpo, tag: 'acervo' })
    return true
  } catch {
    return false
  }
}

/**
 * Avisa só se o app NÃO estiver na frente.
 * É esta função que as telas chamam — a decisão de não incomodar mora aqui,
 * num lugar só, em vez de repetida em cada operação.
 */
export async function avisarSeEscondido({ titulo, corpo, ligado }) {
  if (!ligado) return false
  if (typeof document !== 'undefined' && !document.hidden) return false
  return notificar({ titulo, corpo })
}

/**
 * Armazenamento quase cheio. No máximo uma vez por dia — um aviso repetido
 * a cada abertura vira ruído e a pessoa desliga tudo.
 */
export async function avisarEspaco(info, ligado) {
  if (!ligado || !info || !info.total) return false
  const livre = info.free / info.total
  if (livre > 0.1) return false
  try {
    const ultimo = Number(localStorage.getItem(CHAVE_ESPACO) || 0)
    if (Date.now() - ultimo < 24 * 60 * 60 * 1000) return false
    localStorage.setItem(CHAVE_ESPACO, String(Date.now()))
  } catch {
    /* sem localStorage: avisa mesmo assim, é melhor que não avisar */
  }
  return notificar({
    titulo: 'Armazenamento quase cheio',
    corpo: `Restam ${(livre * 100).toFixed(0)}% do espaço. A tela de Limpeza mostra o que dá pra apagar.`,
  })
}
