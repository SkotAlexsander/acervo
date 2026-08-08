/**
 * Proteger um arquivo com senha — e abrir de volta.
 *
 * AES-GCM de 256 bits, com a chave derivada da senha por PBKDF2-SHA256.
 * Nada disso é escrito à mão: quem faz a conta é o `crypto.subtle`, que é
 * código nativo do sistema. Criptografia caseira é o erro mais caro que dá
 * pra cometer num app — aqui o trabalho é só **usar direito** o que já existe.
 *
 * As três decisões que sustentam o formato:
 *
 * 1. **GCM, não CBC.** GCM autentica: se um byte do arquivo for trocado, a
 *    abertura FALHA em vez de devolver lixo silencioso. É a diferença entre
 *    "seu arquivo está corrompido" e um documento com um parágrafo alterado.
 *
 * 2. **Em blocos de 1 MiB, cada um com seu IV.** Um arquivo de 80 MB num
 *    `encrypt` só travaria a tela e estouraria a memória do celular. Em
 *    blocos dá pra mostrar progresso e o pico de memória é previsível.
 *
 * 3. **O nome do arquivo vai DENTRO, no bloco 0.** Quem olha o `.acv` no
 *    gerenciador de arquivos não descobre que ali estava "exame-de-sangue.pdf".
 *    Guardar o nome no cabeçalho em claro seria vazar metade do segredo.
 *
 * O aviso que a tela é obrigada a dar, e que este comentário existe pra
 * justificar: **senha perdida = arquivo perdido.** Não há recuperação, não
 * há "esqueci minha senha", e isso não é limitação — é o que significa estar
 * criptografado. Um jeito de recuperar sem a senha seria uma porta dos fundos.
 */

const MAGIA = [0x41, 0x43, 0x45, 0x52, 0x56, 0x4f] // "ACERVO"
const VERSAO = 1
const ALGORITMO = 1 // 1 = AES-GCM-256 + PBKDF2-SHA256
const TAM_CABECALHO = 36
const BLOCO = 1024 * 1024 // 1 MiB de texto claro por bloco
const ITERACOES = 210000 // recomendação OWASP para PBKDF2-SHA256
const TAM_IV = 12 // 96 bits — o tamanho canônico do GCM
const TAM_TAG = 16 // a etiqueta de autenticação que o GCM anexa

export const EXT = 'acv'
/** Mesmo teto do .zip: o arquivo passa inteiro pela memória nos dois casos. */
export const LIMITE_BYTES = 150 * 1024 * 1024

/** O `crypto.subtle` só existe em contexto seguro (https ou localhost). */
export function temCripto() {
  return !!(typeof crypto !== 'undefined' && crypto.subtle && crypto.getRandomValues)
}

export function ehProtegido(item) {
  return !!item && !item.isDir && item.ext === EXT
}

export function podeProteger(item) {
  return !!item && !item.isDir && item.ext !== EXT
}

/* ── Cabeçalho ─────────────────────────────────────────────────────────── */

function montarCabecalho(salt, iteracoes, bloco) {
  const h = new Uint8Array(TAM_CABECALHO)
  h.set(MAGIA, 0)
  h[6] = VERSAO
  h[7] = ALGORITMO
  new DataView(h.buffer).setUint32(8, iteracoes, true)
  h.set(salt, 12)
  new DataView(h.buffer).setUint32(28, bloco, true)
  return h
}

function lerCabecalho(bytes) {
  if (!bytes || bytes.length < TAM_CABECALHO) {
    throw new Error('Arquivo pequeno demais pra ser um arquivo protegido.')
  }
  for (let i = 0; i < MAGIA.length; i++) {
    if (bytes[i] !== MAGIA[i]) {
      throw new Error('Este arquivo não foi protegido pelo Acervo — não sei abrir.')
    }
  }
  const versao = bytes[6]
  if (versao !== VERSAO) {
    throw new Error(`Este arquivo foi protegido por uma versão mais nova do app (formato ${versao}).`)
  }
  if (bytes[7] !== ALGORITMO) throw new Error('Algoritmo desconhecido neste arquivo.')
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const iteracoes = dv.getUint32(8, true)
  const salt = bytes.slice(12, 28)
  const bloco = dv.getUint32(28, true)
  // Um cabeçalho adulterado com números absurdos não deve virar alocação absurda.
  if (iteracoes < 1000 || iteracoes > 5000000) throw new Error('Cabeçalho inválido (iterações).')
  if (bloco < 1024 || bloco > 64 * 1024 * 1024) throw new Error('Cabeçalho inválido (bloco).')
  return { versao, iteracoes, salt, bloco, cabecalho: bytes.slice(0, TAM_CABECALHO) }
}

/* ── Chave ─────────────────────────────────────────────────────────────── */

async function derivarChave(senha, salt, iteracoes) {
  if (!temCripto()) {
    throw new Error('Este navegador não oferece criptografia. No celular funciona normalmente.')
  }
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(senha),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: iteracoes, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Dado associado de cada bloco: o cabeçalho inteiro + o número do bloco.
 *
 * Isso amarra cada bloco ao arquivo E à posição dele. Trocar dois blocos de
 * lugar, ou colar um bloco de outro arquivo protegido com a mesma senha,
 * passa a falhar na autenticação em vez de produzir um arquivo remontado.
 */
function aad(cabecalho, indice) {
  const a = new Uint8Array(cabecalho.length + 4)
  a.set(cabecalho, 0)
  new DataView(a.buffer).setUint32(cabecalho.length, indice, true)
  return a
}

/* ── Proteger ──────────────────────────────────────────────────────────── */

/**
 * @param {Uint8Array} bytes conteúdo original
 * @param {string} senha
 * @param {{nome?:string, mtime?:number, onProgresso?:(f:number,t:number,etapa:string)=>void}} [opts]
 * @returns {Promise<{bytes: Uint8Array, blocos: number}>}
 */
export async function proteger(bytes, senha, opts = {}) {
  if (!senha) throw new Error('Escolha uma senha.')
  if (bytes.length > LIMITE_BYTES) {
    throw new Error(`O arquivo tem mais de ${Math.round(LIMITE_BYTES / 1048576)} MB — grande demais pra proteger de uma vez.`)
  }
  const passo = opts.onProgresso || (() => {})

  const salt = crypto.getRandomValues(new Uint8Array(16))
  const cabecalho = montarCabecalho(salt, ITERACOES, BLOCO)

  passo(0, 1, 'preparando a chave…')
  const chave = await derivarChave(senha, salt, ITERACOES)

  const nBlocos = Math.max(1, Math.ceil(bytes.length / BLOCO))
  const meta = new TextEncoder().encode(
    JSON.stringify({ n: opts.nome || '', m: opts.mtime || 0, s: bytes.length, b: nBlocos })
  )

  const partes = [cabecalho]
  let total = cabecalho.length

  const gravarBloco = async (claro, indice) => {
    const iv = crypto.getRandomValues(new Uint8Array(TAM_IV))
    const cifrado = new Uint8Array(
      await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv, additionalData: aad(cabecalho, indice), tagLength: TAM_TAG * 8 },
        chave,
        claro
      )
    )
    const tamanho = new Uint8Array(4)
    new DataView(tamanho.buffer).setUint32(0, cifrado.length, true)
    partes.push(tamanho, iv, cifrado)
    total += 4 + TAM_IV + cifrado.length
  }

  await gravarBloco(meta, 0)

  for (let i = 0; i < nBlocos; i++) {
    passo(i, nBlocos, 'protegendo…')
    await gravarBloco(bytes.subarray(i * BLOCO, Math.min(bytes.length, (i + 1) * BLOCO)), i + 1)
    // Devolve o fio pro navegador: sem isto a tela congela e o Android
    // mostra o diálogo de "o app parou de responder".
    await new Promise((r) => setTimeout(r, 0))
  }

  const saida = new Uint8Array(total)
  let off = 0
  for (const p of partes) {
    saida.set(p, off)
    off += p.length
  }
  passo(nBlocos, nBlocos, 'pronto')
  return { bytes: saida, blocos: nBlocos }
}

/* ── Abrir ─────────────────────────────────────────────────────────────── */

/** Lê só o cabeçalho — usado pra dizer "isto é um arquivo protegido" sem senha. */
export function inspecionar(bytes) {
  const h = lerCabecalho(bytes)
  return { versao: h.versao, iteracoes: h.iteracoes, bloco: h.bloco }
}

/**
 * @returns {Promise<{bytes: Uint8Array, nome: string, mtime: number}>}
 * @throws  mensagem em português; senha errada e arquivo adulterado dão a
 *          MESMA falha de autenticação, e é por isso que a mensagem fala das duas.
 */
export async function abrir(bytes, senha, opts = {}) {
  const passo = opts.onProgresso || (() => {})
  const { iteracoes, salt, cabecalho } = lerCabecalho(bytes)

  passo(0, 1, 'preparando a chave…')
  const chave = await derivarChave(senha, salt, iteracoes)

  let off = TAM_CABECALHO
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  const lerBloco = async (indice) => {
    if (off + 4 + TAM_IV > bytes.length) throw new Error('Arquivo protegido incompleto.')
    const tam = dv.getUint32(off, true)
    off += 4
    if (tam < TAM_TAG || off + TAM_IV + tam > bytes.length) {
      throw new Error('Arquivo protegido incompleto ou corrompido.')
    }
    const iv = bytes.slice(off, off + TAM_IV)
    off += TAM_IV
    const cifrado = bytes.slice(off, off + tam)
    off += tam
    try {
      return new Uint8Array(
        await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv, additionalData: aad(cabecalho, indice), tagLength: TAM_TAG * 8 },
          chave,
          cifrado
        )
      )
    } catch {
      throw new Error(
        indice === 0
          ? 'Senha errada — ou o arquivo foi alterado depois de protegido.'
          : `O bloco ${indice} não confere: o arquivo foi alterado ou está corrompido.`
      )
    }
  }

  const metaBytes = await lerBloco(0)
  let meta
  try {
    meta = JSON.parse(new TextDecoder().decode(metaBytes))
  } catch {
    throw new Error('O cabeçalho interno do arquivo não pôde ser lido.')
  }

  const nBlocos = Number(meta.b) || 0
  if (nBlocos < 1 || nBlocos > 100000) throw new Error('Contagem de blocos inválida.')

  const pedacos = []
  let soma = 0
  for (let i = 0; i < nBlocos; i++) {
    passo(i, nBlocos, 'abrindo…')
    const p = await lerBloco(i + 1)
    pedacos.push(p)
    soma += p.length
    await new Promise((r) => setTimeout(r, 0))
  }

  // O tamanho gravado no bloco 0 é conferido contra o que saiu de fato:
  // é o que denuncia um arquivo cortado no fim, que a autenticação de bloco
  // sozinha não pegaria (blocos que faltam não têm como falhar).
  if (meta.s != null && soma !== Number(meta.s)) {
    throw new Error('O arquivo está incompleto — faltam pedaços do conteúdo original.')
  }

  const saida = new Uint8Array(soma)
  let o = 0
  for (const p of pedacos) {
    saida.set(p, o)
    o += p.length
  }
  passo(nBlocos, nBlocos, 'pronto')
  return { bytes: saida, nome: meta.n || '', mtime: Number(meta.m) || 0 }
}

/* ── Força da senha ────────────────────────────────────────────────────── */

const COMUNS = [
  '123456', '123456789', 'senha', 'password', 'qwerty', '12345678', '111111',
  'abc123', 'senha123', '1234567890', 'admin', 'brasil', 'flamengo', 'teste',
]

/**
 * Mede a senha e diz o que falta.
 *
 * Não é medidor de vaidade: como não existe recuperação, a tela precisa
 * conseguir DESACONSELHAR uma senha fraca com um motivo concreto.
 *
 * @returns {{nivel:0|1|2|3, rotulo:string, dica:string}}
 */
export function forcaDaSenha(senha) {
  const s = senha || ''
  if (!s) return { nivel: 0, rotulo: 'vazia', dica: 'Escolha uma senha.' }

  const minus = /[a-z]/.test(s)
  const maius = /[A-Z]/.test(s)
  const num = /[0-9]/.test(s)
  const simb = /[^A-Za-z0-9]/.test(s)
  const variedade = [minus, maius, num, simb].filter(Boolean).length

  if (COMUNS.includes(s.toLowerCase())) {
    return { nivel: 0, rotulo: 'muito fraca', dica: 'Esta é uma das senhas mais usadas do mundo.' }
  }
  if (/^(.)\1+$/.test(s)) {
    return { nivel: 0, rotulo: 'muito fraca', dica: 'É o mesmo caractere repetido.' }
  }
  if (s.length < 8) {
    return { nivel: 0, rotulo: 'muito fraca', dica: 'Menos de 8 caracteres se quebra rápido.' }
  }
  if (s.length >= 16 || (s.length >= 12 && variedade >= 3)) {
    return { nivel: 3, rotulo: 'forte', dica: 'Boa. Agora anote num lugar seguro.' }
  }
  if (s.length >= 12 || variedade >= 3) {
    return { nivel: 2, rotulo: 'razoável', dica: 'Ficaria melhor com mais caracteres.' }
  }
  return {
    nivel: 1,
    rotulo: 'fraca',
    dica: 'Uma frase de 4 palavras é mais forte e mais fácil de lembrar que "Ab1@x".',
  }
}
