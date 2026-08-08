/**
 * Deixar um arquivo mais leve.
 *
 * "Sem danificar" quer dizer duas coisas diferentes, e o app não pode
 * fingir que é uma só:
 *
 *  · **Sem perda nenhuma** (`comprimirSemPerda`) — o arquivo é guardado
 *    dentro de um `.zip`. Ao extrair, volta byte por byte igual ao que era.
 *    Serve pra qualquer tipo. O preço é que ele passa a viver dentro do zip.
 *
 *  · **Sem perda VISÍVEL** (`otimizarImagem`) — só pra foto. A imagem é
 *    reencodada com menos dados; os pixels mudam, o olho não percebe, e o
 *    arquivo costuma cair pra um terço. O original continua onde estava.
 *
 * Chamar o segundo de "sem danificar" seria mentira técnica; chamar de
 * "danifica" seria mentira prática. A tela mostra os dois números — antes e
 * depois — e deixa a pessoa decidir com o dado na mão.
 *
 * O que este arquivo se recusa a fazer: dizer que encolheu quando não
 * encolheu. Um JPEG já bem comprimido reencodado com "qualidade 92" sai
 * MAIOR que o original. Nesse caso a resposta certa é "não vale a pena" —
 * e é o que `avaliar()` devolve.
 */

import { reencodar, ehImagem, formatosDeSaida, SAIDAS, dimensoes } from './imagem.js'
import { criarZip } from './zip.js'
import { formatBytes } from './util.js'

/**
 * Tipos que já nascem comprimidos. Enfiar num .zip não economiza nada —
 * às vezes até cresce, por causa do cabeçalho do próprio zip.
 */
export const JA_COMPRIMIDOS = [
  'jpg', 'jpeg', 'png', 'webp', 'avif', 'heic', 'heif', 'gif',
  'mp3', 'aac', 'm4a', 'ogg', 'opus', 'flac',
  'mp4', 'mkv', 'mov', 'webm', 'avi', 'm4v',
  'zip', 'rar', '7z', 'gz', 'bz2', 'xz', 'apk', 'jar', 'docx', 'xlsx', 'pptx', 'odt',
]

/** Ganho mínimo pra valer a pena mexer. Abaixo disso, a resposta honesta é "deixa quieto". */
export const GANHO_MINIMO = 0.05

export const PRESETS = [
  {
    id: 'alta',
    rotulo: 'Qualidade alta',
    qualidade: 0.92,
    ladoMaximo: 0,
    descricao: 'Mantém o tamanho em pixels. Diferença invisível no zoom normal.',
  },
  {
    id: 'equilibrado',
    rotulo: 'Equilibrado',
    qualidade: 0.82,
    ladoMaximo: 2560,
    descricao: 'O padrão. Continua ótima pra ver, imprimir em A4 e guardar.',
  },
  {
    id: 'economia',
    rotulo: 'Máxima economia',
    qualidade: 0.7,
    ladoMaximo: 1600,
    descricao: 'Pra mandar por mensagem. Perde detalhe se você ampliar muito.',
  },
]

/** Qual dos dois caminhos serve pra este arquivo. */
export function rotaDe(item) {
  if (!item || item.isDir) return null
  return ehImagem(item) ? 'imagem' : 'semperda'
}

/** Os formatos de saída oferecidos pra uma imagem, com o de origem primeiro. */
export function formatosPara(item) {
  const podeGravar = formatosDeSaida()
  const orig = item.ext === 'jpeg' ? 'jpg' : item.ext
  const lista = []
  if (SAIDAS[orig] && podeGravar[orig]) {
    lista.push({ id: orig, rotulo: `Manter ${SAIDAS[orig].rotulo}`, nota: 'abre em qualquer lugar' })
  }
  if (podeGravar.webp && orig !== 'webp') {
    lista.push({ id: 'webp', rotulo: 'WebP', nota: 'costuma ficar bem menor' })
  }
  if (podeGravar.jpg && orig !== 'jpg') {
    lista.push({ id: 'jpg', rotulo: 'JPG', nota: 'o mais compatível de todos' })
  }
  // Nenhum formato de saída conhecido (ex.: .gif, que o canvas não escreve):
  // WebP e JPG cobrem o caso, e um deles sempre existe.
  return lista.length ? lista : [{ id: 'jpg', rotulo: 'JPG', nota: 'o mais compatível de todos' }]
}

/**
 * Reencoda a imagem e devolve o resultado JUNTO com o veredito.
 *
 * @returns {Promise<{bytes:Uint8Array, ext:string, largura:number, altura:number,
 *                    larguraOriginal:number, alturaOriginal:number,
 *                    ganho:number, valeAPena:boolean, resumo:string}>}
 */
export async function otimizarImagem(bytes, { qualidade, ladoMaximo, formato } = {}) {
  const original = bytes.length
  const r = await reencodar(bytes, formato || 'jpg', { qualidade, ladoMaximo })
  const ganho = 1 - r.bytes.length / original
  const redimensionou = r.largura !== r.larguraOriginal || r.altura !== r.alturaOriginal
  return {
    ...r,
    ext: SAIDAS[formato || 'jpg'].ext,
    ganho,
    valeAPena: ganho >= GANHO_MINIMO,
    resumo:
      `${formatBytes(original)} → ${formatBytes(r.bytes.length)}` +
      (ganho > 0 ? ` (${Math.round(ganho * 100)}% menor)` : ` (${Math.round(-ganho * 100)}% MAIOR)`) +
      (redimensionou ? ` · ${r.larguraOriginal}×${r.alturaOriginal} → ${r.largura}×${r.altura}` : ''),
  }
}

/**
 * Guarda o arquivo num `.zip`, sem perder um bit.
 * @returns {Promise<{bytes:Uint8Array, ext:'zip', ganho:number, valeAPena:boolean, resumo:string}>}
 */
export async function comprimirSemPerda(item, bytes, onProgresso) {
  const original = bytes.length
  const r = await criarZip([{ nome: item.name, bytes, mtime: item.mtime }], onProgresso)
  const ganho = 1 - r.bytes.length / original
  return {
    bytes: r.bytes,
    ext: 'zip',
    ganho,
    valeAPena: ganho >= GANHO_MINIMO,
    resumo: r.comprimido
      ? `${formatBytes(original)} → ${formatBytes(r.bytes.length)} (${ganho > 0 ? Math.round(ganho * 100) + '% menor' : 'sem ganho'})`
      : `${formatBytes(r.bytes.length)} — este aparelho não sabe comprimir, o .zip saiu só empacotando`,
  }
}

/**
 * O que dizer ANTES de a pessoa apertar qualquer coisa.
 * Um aviso na entrada evita a decepção na saída.
 */
export async function avaliar(item, bytes) {
  const rota = rotaDe(item)
  if (rota === 'imagem') {
    let dim = null
    try {
      dim = await dimensoes(bytes)
    } catch {
      /* imagem que o aparelho não abre: a tela do erro cuida disso */
    }
    return {
      rota,
      dimensoes: dim,
      aviso:
        dim && Math.max(dim.largura, dim.altura) <= 800
          ? 'Esta imagem já é pequena — o ganho tende a ser pouco.'
          : null,
    }
  }
  const ext = item.ext || ''
  return {
    rota,
    dimensoes: null,
    aviso: JA_COMPRIMIDOS.includes(ext)
      ? `Arquivo .${ext} já vem comprimido de fábrica. O .zip provavelmente não vai encolher nada.`
      : null,
  }
}
