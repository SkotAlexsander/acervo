/**
 * Árvore de arquivos simulada — a "memória do celular" que você vê no PC.
 *
 * Duas regras que fazem ela prestar:
 *  1. É gerada por SEMENTE FIXA. Recarregar a página dá exatamente a mesma
 *     árvore. Sem isso, "achei 6 duplicados" viraria um número diferente a
 *     cada F5 e não daria pra testar nada.
 *  2. Tem sujeira PLANTADA de propósito — duplicados de verdade, arquivos
 *     gigantes, pasta vazia, print antigo. É o material que a tela de
 *     Limpeza precisa ter pra provar que funciona.
 */

// ─── Aleatório determinístico (mulberry32) ───────────────────────────────────

function rng(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const R = rng(20260808)
const rand = () => R()
const int = (min, max) => Math.floor(min + rand() * (max - min + 1))
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const chance = (p) => rand() < p

const KB = 1024
const MB = 1024 * KB
const GB = 1024 * MB

// Data-base fixa (08/08/2026 12:00) para o "há quanto tempo" não mudar sozinho.
export const AGORA = new Date(2026, 7, 8, 12, 0, 0).getTime()
const DIA = 86400000

/** Data aleatória entre `minDias` e `maxDias` atrás. */
const diasAtras = (minDias, maxDias) =>
  AGORA - int(minDias, maxDias) * DIA - int(0, 86399) * 1000

// ─── Vocabulário para nomes que parecem reais ────────────────────────────────

const ASSUNTOS = [
  'Relatório', 'Contrato', 'Orçamento', 'Proposta', 'Nota fiscal', 'Recibo',
  'Currículo', 'Planilha de gastos', 'Comprovante', 'Boleto', 'Declaração',
  'Anotações', 'Lista de compras', 'Roteiro', 'Ata de reunião',
]
const COMPLEMENTOS = [
  'final', 'v2', 'revisado', 'rascunho', 'assinado', 'agosto', 'julho',
  '2026', '2025', 'atualizado', 'ok', 'copia',
]
const MUSICAS = [
  'Águas de Março', 'Construção', 'Chega de Saudade', 'Detalhes', 'Preciso me Encontrar',
  'O Bêbado e a Equilibrista', 'Alegria Alegria', 'Trem das Onze', 'Malandragem',
  'Sampa', 'Eu Sei que Vou Te Amar', 'Carinhoso', 'Aquarela', 'Ovelha Negra',
]
const ARTISTAS = ['Elis Regina', 'Chico Buarque', 'Cartola', 'Tim Maia', 'Gal Costa', 'Jorge Ben']

const pad = (n, w) => String(n).padStart(w || 2, '0')

function dataCompacta(ms) {
  const d = new Date(ms)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
}
function horaCompacta(ms) {
  const d = new Date(ms)
  return `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

// ─── Fábricas de arquivo por tipo ────────────────────────────────────────────

function foto(mtime, prefixo) {
  return {
    name: `${prefixo || 'IMG'}_${dataCompacta(mtime)}_${horaCompacta(mtime)}.jpg`,
    size: int(900 * KB, 6 * MB),
    mtime,
  }
}
function video(mtime) {
  return {
    name: `VID_${dataCompacta(mtime)}_${horaCompacta(mtime)}.mp4`,
    size: int(8 * MB, 380 * MB),
    mtime,
  }
}
function print(mtime) {
  const d = new Date(mtime)
  return {
    name: `Screenshot_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(
      d.getHours()
    )}-${pad(d.getMinutes())}-${pad(d.getSeconds())}.png`,
    size: int(180 * KB, 2 * MB),
    mtime,
  }
}
function doc(mtime, ext) {
  const e = ext || pick(['pdf', 'docx', 'xlsx', 'txt'])
  const nome = chance(0.5)
    ? `${pick(ASSUNTOS)} ${pick(COMPLEMENTOS)}`
    : `${pick(ASSUNTOS)} - ${pick(COMPLEMENTOS)}`
  const tamanhos = { pdf: [120 * KB, 14 * MB], docx: [30 * KB, 3 * MB], xlsx: [18 * KB, 2 * MB], txt: [200, 40 * KB] }
  const [min, max] = tamanhos[e] || [50 * KB, 2 * MB]
  return { name: `${nome}.${e}`, size: int(min, max), mtime }
}
function musica(mtime) {
  return {
    name: `${pick(ARTISTAS)} - ${pick(MUSICAS)}.mp3`,
    size: int(3 * MB, 11 * MB),
    mtime,
  }
}
function audioZap(mtime) {
  const d = new Date(mtime)
  return {
    name: `PTT-${dataCompacta(mtime)}-WA${pad(int(0, 99), 4)}.opus`,
    size: int(40 * KB, 1.2 * MB),
    mtime: d.getTime(),
  }
}
function fotoZap(mtime) {
  return {
    name: `IMG-${dataCompacta(mtime)}-WA${pad(int(0, 99), 4)}.jpg`,
    size: int(60 * KB, 2.4 * MB),
    mtime,
  }
}
function videoZap(mtime) {
  return {
    name: `VID-${dataCompacta(mtime)}-WA${pad(int(0, 99), 4)}.mp4`,
    size: int(2 * MB, 60 * MB),
    mtime,
  }
}

/** Gera `n` arquivos com a fábrica dada, dentro de uma janela de dias. */
function lote(n, fabrica, minDias, maxDias, arg) {
  const out = []
  for (let i = 0; i < n; i++) out.push(fabrica(diasAtras(minDias, maxDias), arg))
  return out
}

// ─── A árvore ────────────────────────────────────────────────────────────────
// Formato de entrada: { 'NomeDaPasta': { ...filhos }, ... } e arquivos como
// { name, size, mtime } dentro de uma chave especial `_arquivos: []`.

export function construirArvore() {
  const arvore = {
    DCIM: {
      Camera: { _arquivos: [...lote(64, foto, 0, 400), ...lote(16, video, 0, 400)] },
      Screenshots: { _arquivos: lote(28, print, 0, 500) },
      Facebook: { _arquivos: lote(6, foto, 200, 900, 'FB_IMG') },
    },
    Download: {
      _arquivos: [
        ...lote(14, doc, 0, 300),
        { name: 'nota-fiscal-energia-julho.pdf', size: 340 * KB, mtime: diasAtras(20, 40) },
        { name: 'manual-do-usuario.pdf', size: 6 * MB, mtime: diasAtras(80, 200) },
        { name: 'backup-contatos.vcf', size: 240 * KB, mtime: diasAtras(100, 300) },
        { name: 'planilha-orcamento-casa.xlsx', size: 1.4 * MB, mtime: diasAtras(5, 30) },
        { name: 'apresentacao-projeto.pptx', size: 18 * MB, mtime: diasAtras(40, 90) },
        { name: 'musica-baixada.mp3', size: 8.2 * MB, mtime: diasAtras(60, 200) },
        { name: 'instalador-app-antigo.apk', size: 74 * MB, mtime: diasAtras(180, 400) },
        { name: 'jogo-offline.apk', size: 156 * MB, mtime: diasAtras(220, 500) },
        { name: 'fotos-viagem.zip', size: 512 * MB, mtime: diasAtras(150, 300) },
        { name: 'documentos-escaneados.rar', size: 88 * MB, mtime: diasAtras(90, 200) },
        { name: 'curso-completo-aula-01.mp4', size: 1.2 * GB, mtime: diasAtras(200, 400) },
      ],
    },
    Documents: {
      // Uma planilha e um JSON de VERDADE (conteúdo em `TEXTOS`, logo abaixo).
      // Sem eles, a conversão CSV ↔ JSON existia no código e não tinha como
      // ser exercitada na demonstração do PC — feature invisível é feature
      // que ninguém testa e ninguém descobre.
      _arquivos: [
        { name: 'gastos-do-mes.csv', size: 380, mtime: diasAtras(2, 20) },
        { name: 'contatos-exportados.json', size: 420, mtime: diasAtras(10, 60) },
      ],
      Trabalho: { _arquivos: lote(18, doc, 0, 400) },
      Pessoal: {
        _arquivos: [
          ...lote(9, doc, 0, 600),
          { name: 'senhas-nao-abrir.txt', size: 1.1 * KB, mtime: diasAtras(300, 700) },
          { name: 'receita do bolo da vó.txt', size: 2.4 * KB, mtime: diasAtras(400, 900) },
        ],
      },
      Escaneados: { _arquivos: lote(7, doc, 30, 500, 'pdf') },
    },
    Pictures: {
      Wallpapers: { _arquivos: lote(11, foto, 60, 800, 'WALL') },
      Instagram: { _arquivos: lote(19, foto, 10, 400, 'IG') },
      Salvos: { _arquivos: lote(13, foto, 5, 300, 'SAVE') },
    },
    Music: {
      _arquivos: lote(31, musica, 100, 1200),
      Podcasts: { _arquivos: lote(6, (m) => ({ name: `Episódio ${int(1, 220)}.mp3`, size: int(28 * MB, 90 * MB), mtime: m }), 10, 300) },
    },
    Movies: {
      _arquivos: [
        ...lote(4, video, 100, 600),
        { name: 'documentario-natureza-4k.mkv', size: 2.8 * GB, mtime: diasAtras(300, 700) },
      ],
    },
    WhatsApp: {
      Media: {
        'WhatsApp Images': {
          _arquivos: lote(74, fotoZap, 0, 500),
          Sent: { _arquivos: lote(21, fotoZap, 0, 400) },
        },
        'WhatsApp Video': { _arquivos: lote(23, videoZap, 0, 500) },
        'WhatsApp Audio': { _arquivos: lote(41, audioZap, 0, 300) },
        'WhatsApp Documents': { _arquivos: lote(12, doc, 0, 400) },
        'WhatsApp Stickers': { _arquivos: lote(17, (m) => ({ name: `STK-${dataCompacta(m)}-WA${pad(int(0, 99), 4)}.webp`, size: int(20 * KB, 90 * KB), mtime: m }), 0, 300) },
        'WhatsApp Voice Notes': { _arquivos: lote(9, audioZap, 0, 120) },
      },
      Databases: {
        _arquivos: lote(7, (m) => ({ name: `msgstore-${dataCompacta(m)}.1.db.crypt14`, size: int(40 * MB, 180 * MB), mtime: m }), 1, 14),
      },
    },
    Telegram: {
      'Telegram Images': { _arquivos: lote(16, foto, 0, 300, 'photo') },
      'Telegram Documents': { _arquivos: lote(8, doc, 0, 300) },
    },
    Recordings: {
      _arquivos: lote(12, (m) => ({ name: `Gravação ${dataCompacta(m)} ${pad(new Date(m).getHours())}h${pad(new Date(m).getMinutes())}.m4a`, size: int(600 * KB, 40 * MB), mtime: m }), 0, 400),
    },
    Backups: {
      _arquivos: [
        { name: 'backup-2025-12-31.zip', size: 780 * MB, mtime: diasAtras(220, 230) },
        { name: 'backup-2026-03-15.zip', size: 840 * MB, mtime: diasAtras(145, 150) },
        { name: 'backup-2026-07-01.zip', size: 910 * MB, mtime: diasAtras(38, 40) },
      ],
    },
    Android: {
      data: { _arquivos: [] },
      obb: { _arquivos: [] },
    },
    Ringtones: { _arquivos: lote(5, (m) => ({ name: `Toque ${int(1, 20)}.ogg`, size: int(200 * KB, 900 * KB), mtime: m }), 300, 900) },
    'Pasta vazia': { _arquivos: [] },
    _arquivos: [
      { name: 'leia-me.txt', size: 820, mtime: diasAtras(500, 900) },
    ],
  }

  plantarSujeira(arvore)
  return arvore
}

/**
 * Sujeira plantada de propósito — é o que a tela de Limpeza vai encontrar.
 * Se isso não existisse, a tela pareceria funcionar só porque estaria vazia.
 */
function plantarSujeira(arvore) {
  // Duplicados de verdade: MESMO nome e MESMO tamanho em pastas diferentes.
  // É assim que duplicata acontece na vida real — você baixa de novo, ou o
  // WhatsApp salva a foto que você já tinha na galeria.
  const duplicados = [
    { name: 'IMG-20260612-WA0031.jpg', size: 1_842_176, mtime: diasAtras(55, 58) },
    { name: 'contrato-assinado.pdf', size: 486_912, mtime: diasAtras(70, 74) },
    { name: 'comprovante-pix.pdf', size: 128_004, mtime: diasAtras(12, 15) },
    { name: 'Elis Regina - Águas de Março.mp3', size: 7_340_032, mtime: diasAtras(200, 260) },
  ]
  const destinos = [
    ['Download'],
    ['DCIM', 'Camera'],
    ['WhatsApp', 'Media', 'WhatsApp Images'],
    ['Documents', 'Pessoal'],
    ['Pictures', 'Salvos'],
  ]
  duplicados.forEach((arq, i) => {
    const a = destinos[i % destinos.length]
    const b = destinos[(i + 2) % destinos.length]
    empurrar(arvore, a, { ...arq })
    empurrar(arvore, b, { ...arq, mtime: arq.mtime + DIA * int(1, 30) })
    if (i === 0) empurrar(arvore, destinos[(i + 4) % destinos.length], { ...arq, mtime: arq.mtime + DIA * 40 })
  })

  // Arquivos vazios (0 byte) — restos de download interrompido.
  empurrar(arvore, ['Download'], { name: 'download-interrompido.pdf.part', size: 0, mtime: diasAtras(30, 60) })
  empurrar(arvore, ['DCIM', 'Camera'], { name: 'IMG_20260101_000000.jpg', size: 0, mtime: diasAtras(210, 215) })
}

function empurrar(arvore, caminho, arquivo) {
  let no = arvore
  for (const seg of caminho) {
    if (!no[seg]) no[seg] = { _arquivos: [] }
    no = no[seg]
  }
  if (!no._arquivos) no._arquivos = []
  no._arquivos.push(arquivo)
}

/** Espaço total simulado do aparelho. */
export const CAPACIDADE = 128 * GB

/**
 * Conteúdo de verdade pra alguns arquivos de texto.
 *
 * Na demonstração os arquivos são só nome, tamanho e data — não têm bytes.
 * Estes três têm, pra que o leitor de texto seja testável no PC em vez de
 * mostrar "não consegui ler" em tudo e parecer quebrado.
 */
export const TEXTOS = {
  '/leia-me.txt': `Acervo — demonstração

Você está vendo uma memória de celular SIMULADA, dentro do navegador do PC.
Nada do seu computador é lido ou alterado.

Renomear, mover, copiar, excluir e criar pasta funcionam de verdade aqui, e
ficam gravados: recarregar a página mantém o que você fez.

Pra voltar tudo ao estado original:
  Ajustes -> Restaurar a demonstração

Instalado no celular, este mesmo aplicativo passa a mexer nos arquivos reais
do aparelho. Nenhuma tela muda — só a camada que lê o disco.
`,
  '/Documents/Pessoal/receita do bolo da vó.txt': `BOLO DE FUBÁ DA VÓ

3 ovos
2 xícaras de fubá
1 xícara de açúcar
1 xícara de leite
1/2 xícara de óleo
1 colher de sopa de fermento
1 pitada de sal
erva-doce a gosto

Bate tudo no liquidificador, menos o fermento.
O fermento entra por último, mexido com colher.

Forno 180 graus, 40 minutos.

Ela dizia: "se abrir o forno antes dos 30, o bolo sente."
`,
  // Planilha com as três armadilhas do CSV brasileiro de propósito:
  // separador PONTO E VÍRGULA, campo com vírgula preso entre aspas, e
  // decimal com vírgula. Se a conversão pra JSON sair certa aqui, sai certa
  // na planilha que o Excel em português exporta.
  '/Documents/gastos-do-mes.csv': `data;categoria;descricao;valor
01/07;Mercado;"Pão, leite e café";87,40
03/07;Transporte;Combustível;210,00
07/07;Casa;Conta de luz;186,55
12/07;Saúde;Farmácia;64,90
19/07;Lazer;"Cinema, dois ingressos";78,00
25/07;Mercado;Feira da semana;142,30
`,

  // JSON no formato que quase toda exportação usa: um objeto que embrulha a
  // lista numa propriedade. É o caso que `jsonParaLinhas` precisa desembrulhar.
  '/Documents/contatos-exportados.json': `{
  "exportado_em": "2026-07-30",
  "contatos": [
    { "nome": "Ana Beatriz", "telefone": "(81) 99999-1010", "cidade": "Recife" },
    { "nome": "Carlos Andrade", "telefone": "(11) 98888-2020", "cidade": "São Paulo" },
    { "nome": "Divina Souza", "telefone": "(62) 97777-3030", "cidade": "Goiânia", "aniversario": "12/03" },
    { "nome": "Eduardo Lima", "telefone": "(21) 96666-4040", "cidade": "Niterói" }
  ]
}
`,

  '/Documents/Pessoal/senhas-nao-abrir.txt': `Se você abriu este arquivo procurando senha, boa notícia: não tem nenhuma.

Guardar senha em .txt no celular é entregar tudo pra qualquer aplicativo que
consiga ler o armazenamento — e são muitos. Use um gerenciador de senhas.

Este arquivo existe na demonstração só pra lembrar disso.
`,
}
