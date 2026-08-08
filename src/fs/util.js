/** Utilitários puros de caminho, tipo e formatação. Sem I/O, sem React. */

// ─── Caminhos ────────────────────────────────────────────────────────────────
// Regra única: caminho sempre começa com '/', nunca termina com '/' (exceto a raiz).

export function normalize(path) {
  if (!path || path === '/') return '/'
  const parts = String(path)
    .replace(/\\/g, '/')
    .split('/')
    .filter((p) => p && p !== '.')
  const out = []
  for (const p of parts) {
    if (p === '..') out.pop()
    else out.push(p)
  }
  return '/' + out.join('/')
}

export function join(...segments) {
  return normalize(segments.filter(Boolean).join('/'))
}

export function parentOf(path) {
  const p = normalize(path)
  if (p === '/') return '/'
  const i = p.lastIndexOf('/')
  return i <= 0 ? '/' : p.slice(0, i)
}

export function baseName(path) {
  const p = normalize(path)
  if (p === '/') return 'Armazenamento interno'
  return p.slice(p.lastIndexOf('/') + 1)
}

/** Segmentos para a trilha de navegação: [{name, path}, ...] incluindo a raiz. */
export function crumbs(path) {
  const p = normalize(path)
  const out = [{ name: 'Início', path: '/' }]
  if (p === '/') return out
  let acc = ''
  for (const seg of p.split('/').filter(Boolean)) {
    acc += '/' + seg
    out.push({ name: seg, path: acc })
  }
  return out
}

/** true se `child` está dentro de `dir` (ou é o próprio). Evita mover pasta pra dentro de si. */
export function isInside(child, dir) {
  const c = normalize(child)
  const d = normalize(dir)
  if (d === '/') return true
  return c === d || c.startsWith(d + '/')
}

export function extOf(name) {
  const i = String(name).lastIndexOf('.')
  if (i <= 0) return ''
  return String(name).slice(i + 1).toLowerCase()
}

export function stripExt(name) {
  const i = String(name).lastIndexOf('.')
  return i <= 0 ? String(name) : String(name).slice(0, i)
}

// ─── Categorias ──────────────────────────────────────────────────────────────

export const KINDS = {
  image: {
    id: 'image',
    label: 'Imagens',
    exts: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp', 'svg', 'avif'],
  },
  video: {
    id: 'video',
    label: 'Vídeos',
    exts: ['mp4', 'mkv', 'avi', 'mov', '3gp', 'webm', 'm4v'],
  },
  audio: {
    id: 'audio',
    label: 'Áudio',
    exts: ['mp3', 'm4a', 'wav', 'ogg', 'opus', 'flac', 'aac', 'amr'],
  },
  doc: {
    id: 'doc',
    label: 'Documentos',
    exts: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'rtf', 'csv', 'odt'],
  },
  archive: {
    id: 'archive',
    label: 'Compactados',
    exts: ['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'],
  },
  app: { id: 'app', label: 'Aplicativos', exts: ['apk', 'xapk', 'aab'] },
  other: { id: 'other', label: 'Outros', exts: [] },
}

export const KIND_ORDER = ['image', 'video', 'audio', 'doc', 'archive', 'app', 'other']

const EXT_TO_KIND = (() => {
  const map = {}
  for (const k of KIND_ORDER) for (const e of KINDS[k].exts) map[e] = k
  return map
})()

/** Categoria de uma entrada. Pasta é 'folder' — não entra em nenhuma categoria de arquivo. */
export function kindOf(entry) {
  if (entry.isDir) return 'folder'
  return EXT_TO_KIND[entry.ext || extOf(entry.name)] || 'other'
}

// ─── Formatação ──────────────────────────────────────────────────────────────

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']

/** 1 GB = 1024 MB (padrão do Android). Sempre com vírgula decimal, pt-BR. */
export function formatBytes(bytes, decimals) {
  const n = Number(bytes)
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), UNITS.length - 1)
  const value = n / Math.pow(1024, i)
  const d = decimals != null ? decimals : i === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 1
  return (
    value.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) +
    ' ' +
    UNITS[i]
  )
}

const DIA_MS = 86400000

// Montados à mão porque o `toLocaleDateString` pt-BR devolve "06 de jul. de 2025"
// — comprido demais pra segunda linha de uma lista, e com ponto que não cabe.
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Data curta e humana: "agora", "14:32", "ontem", "12 mar", "12 mar 2024". */
export function formatDate(ms, now) {
  const t = Number(ms)
  if (!Number.isFinite(t) || t <= 0) return '—'
  const ref = now || Date.now()
  const d = new Date(t)
  const diff = ref - t
  if (diff < 60000 && diff >= 0) return 'agora'

  const hoje = new Date(ref)
  const meiaNoite = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime()
  if (t >= meiaNoite) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }
  if (t >= meiaNoite - DIA_MS) return 'ontem'

  const dia = String(d.getDate()).padStart(2, '0')
  const mes = MESES[d.getMonth()]
  const mesmoAno = d.getFullYear() === hoje.getFullYear()
  return mesmoAno ? `${dia} ${mes}` : `${dia} ${mes} ${d.getFullYear()}`
}

/** Data completa, pro painel de detalhes. */
export function formatDateFull(ms) {
  const t = Number(ms)
  if (!Number.isFinite(t) || t <= 0) return '—'
  return new Date(t).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Ordenação ───────────────────────────────────────────────────────────────

export const SORTS = {
  name: { id: 'name', label: 'Nome' },
  size: { id: 'size', label: 'Tamanho' },
  date: { id: 'date', label: 'Data' },
  kind: { id: 'kind', label: 'Tipo' },
}

const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' })

/**
 * Ordena uma lista de entradas. Pastas sempre vêm antes de arquivos
 * (é o que todo gerenciador faz e o que a mão espera).
 * Não muta o array recebido.
 */
export function sortEntries(entries, sort, desc, foldersFirst) {
  const first = foldersFirst !== false
  const dir = desc ? -1 : 1
  return [...entries].sort((a, b) => {
    if (first && a.isDir !== b.isDir) return a.isDir ? -1 : 1
    let r
    if (sort === 'size') r = (a.size || 0) - (b.size || 0)
    else if (sort === 'date') r = (a.mtime || 0) - (b.mtime || 0)
    else if (sort === 'kind') r = collator.compare(a.ext || '', b.ext || '')
    else r = collator.compare(a.name, b.name)
    if (r !== 0) return r * dir
    // Empate (mesmo tamanho, mesma data, mesma extensão): desempata pelo nome,
    // sempre A→Z. Sem isso a ordem de itens empatados muda a cada re-render.
    return collator.compare(a.name, b.name)
  })
}

// ─── Busca ───────────────────────────────────────────────────────────────────

// Faixa Unicode dos sinais diacríticos combinantes (U+0300–U+036F).
// Montada por código de propósito: escrita como caractere literal, ela fica
// invisível no editor e qualquer "arrumada" acidental quebra a busca em silêncio.
const DIACRITICOS = new RegExp(
  '[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']',
  'g'
)

/** Tira acento e caixa: "Relatório" acha "relatorio". */
export function fold(s) {
  return String(s).normalize('NFD').replace(DIACRITICOS, '').toLowerCase()
}

export function matches(entry, query) {
  if (!query) return true
  const q = fold(query).trim()
  if (!q) return true
  return fold(entry.name).includes(q)
}

/** Nome livre em um diretório: "foto.jpg" → "foto (2).jpg" se já existir. */
export function uniqueName(name, taken) {
  if (!taken.has(name)) return name
  const base = stripExt(name)
  const e = extOf(name)
  const suffix = e ? '.' + e : ''
  for (let i = 2; i < 10000; i++) {
    const candidate = `${base} (${i})${suffix}`
    if (!taken.has(candidate)) return candidate
  }
  return `${base} (${Date.now()})${suffix}`
}

/** Nome de arquivo/pasta inválido no Android/Windows. Devolve o erro em português ou null. */
export function validateName(name) {
  const n = String(name || '').trim()
  if (!n) return 'O nome não pode ficar vazio.'
  if (n === '.' || n === '..') return 'Esse nome é reservado pelo sistema.'
  if (/[/\\:*?"<>|]/.test(n)) return 'Não pode usar  /  \\  :  *  ?  "  <  >  |'
  if (n.length > 200) return 'Nome longo demais (máximo 200 caracteres).'
  return null
}
