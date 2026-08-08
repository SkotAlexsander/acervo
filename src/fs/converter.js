/**
 * Transformar um arquivo em outro formato.
 *
 * A regra que organiza este arquivo: **só aparece na tela o que realmente
 * funciona**. Um conversor que oferece trinta formatos e falha em vinte é
 * pior que um que oferece seis e entrega os seis — a pessoa perde o arquivo
 * de vista e não sabe se a culpa foi dela.
 *
 * Por isso `alvosDe()` é a peça central: ela olha o arquivo, pergunta ao
 * navegador o que ele sabe gravar (o teste de 1×1 pixel em `imagem.js`) e
 * devolve só os destinos possíveis, cada um com o preço declarado — se
 * perde qualidade, se perde formatação, se é exato.
 *
 * O que este app NÃO converte, e por quê:
 *  · PDF → imagem/texto — exigiria um interpretador de PDF inteiro. Ler PDF
 *    é uma ordem de grandeza mais difícil que escrever um.
 *  · vídeo/áudio entre formatos — exigiria transcodificar; o navegador
 *    decodifica, mas não codifica vídeo de forma utilizável.
 *  · .docx/.xlsx — são .zip de XML; daria pra LER, mas escrever um que o
 *    Word aceite sem reclamar é outro projeto.
 * Nesses casos a tela diz isso em português, em vez de sumir com a opção.
 */

import { reencodar, ehImagem, formatosDeSaida, SAIDAS } from './imagem.js'
import { pdfDeImagens, pdfDeTexto, TEXTOS_ACEITOS } from './pdf.js'
import { criarZip } from './zip.js'
import { extOf, stripExt, formatBytes } from './util.js'

/* ────────────────────────────────────────────────────────────────────────
   CSV — leitura e escrita
   Escrito à mão porque a armadilha do CSV brasileiro é o separador: o Excel
   em português grava com PONTO E VÍRGULA, e um leitor que só entende vírgula
   devolve uma coluna gigante em vez de erro. Ninguém percebe até ser tarde.
   ──────────────────────────────────────────────────────────────────────── */

/** Adivinha o separador contando ocorrências FORA das aspas na primeira linha. */
export function farejarSeparador(texto) {
  const candidatos = [',', ';', '\t', '|']
  let melhor = ','
  let melhorContagem = 0
  for (const sep of candidatos) {
    let n = 0
    let aspas = false
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i]
      if (c === '"') aspas = !aspas
      else if (c === '\n' && !aspas) break
      else if (c === sep && !aspas) n++
    }
    if (n > melhorContagem) {
      melhorContagem = n
      melhor = sep
    }
  }
  return melhor
}

/**
 * Lê CSV no formato RFC 4180: campo entre aspas pode conter separador,
 * quebra de linha e aspas duplicadas (`""` = uma aspa literal).
 * @returns {string[][]} linhas de células
 */
export function lerCsv(texto, separador) {
  const sep = separador || farejarSeparador(texto)
  // BOM do Excel: se ficar, a primeira coluna se chama "﻿nome" e nada bate.
  const s = texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto
  const linhas = []
  let celula = ''
  let linha = []
  let aspas = false

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (aspas) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          celula += '"'
          i++
        } else aspas = false
      } else celula += c
      continue
    }
    if (c === '"') aspas = true
    else if (c === sep) {
      linha.push(celula)
      celula = ''
    } else if (c === '\n' || c === '\r') {
      // \r\n conta como UMA quebra.
      if (c === '\r' && s[i + 1] === '\n') i++
      linha.push(celula)
      linhas.push(linha)
      celula = ''
      linha = []
    } else celula += c
  }
  if (celula !== '' || linha.length) {
    linha.push(celula)
    linhas.push(linha)
  }
  // Linha final vazia (todo arquivo bem-formado termina em \n) não é dado.
  while (linhas.length && linhas[linhas.length - 1].every((c) => c === '')) linhas.pop()
  return linhas
}

/** Escreve CSV citando só o que precisa — arquivo mais limpo de ler. */
export function escreverCsv(linhas, separador = ',') {
  const precisaAspas = (v) =>
    v.includes(separador) || v.includes('"') || v.includes('\n') || v.includes('\r')
  return linhas
    .map((l) =>
      l
        .map((c) => {
          const v = c == null ? '' : String(c)
          return precisaAspas(v) ? `"${v.split('"').join('""')}"` : v
        })
        .join(separador)
    )
    .join('\r\n')
}

/** CSV → array de objetos, usando a primeira linha como cabeçalho. */
export function csvParaObjetos(texto) {
  const linhas = lerCsv(texto)
  if (!linhas.length) return []
  const cab = linhas[0].map((c, i) => (c.trim() ? c.trim() : `coluna${i + 1}`))
  return linhas.slice(1).map((l) => {
    const o = {}
    for (let i = 0; i < cab.length; i++) o[cab[i]] = l[i] ?? ''
    return o
  })
}

/**
 * JSON → linhas de CSV.
 * Aceita array de objetos (o caso normal), array de valores simples, e
 * objeto que embrulha um array numa propriedade só — que é como quase toda
 * API devolve lista ({"dados": [...]}).
 */
export function jsonParaLinhas(valor) {
  let lista = valor
  if (!Array.isArray(lista) && lista && typeof lista === 'object') {
    const arrays = Object.values(lista).filter(Array.isArray)
    if (arrays.length === 1) lista = arrays[0]
    else lista = [lista]
  }
  if (!Array.isArray(lista)) throw new Error('Este JSON não é uma lista — não vira tabela.')
  if (!lista.length) return [[]]

  const simples = lista.every((x) => x === null || typeof x !== 'object')
  if (simples) return [['valor'], ...lista.map((x) => [x == null ? '' : String(x)])]

  // União das chaves na ordem em que aparecem: registro que só o item 40 tem
  // vira coluna também, senão o dado some sem aviso.
  const colunas = []
  const vistas = new Set()
  for (const item of lista) {
    if (!item || typeof item !== 'object') continue
    for (const k of Object.keys(item)) {
      if (!vistas.has(k)) {
        vistas.add(k)
        colunas.push(k)
      }
    }
  }
  const celula = (v) => {
    if (v == null) return ''
    if (typeof v === 'object') return JSON.stringify(v)
    return String(v)
  }
  return [colunas, ...lista.map((item) => colunas.map((c) => celula(item && item[c])))]
}

/* ────────────────────────────────────────────────────────────────────────
   Markdown e HTML → texto puro
   ──────────────────────────────────────────────────────────────────────── */

/** Markdown → texto legível. Não é um interpretador; é uma limpeza honesta. */
export function markdownParaTexto(md) {
  return md
    .replace(/\r\n/g, '\n')
    // Bloco de código: mantém o conteúdo, joga fora as cercas.
    .replace(/```[^\n]*\n([\s\S]*?)```/g, (_, dentro) => dentro)
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '• ')
    .replace(/^\s{0,3}(\d+)\.\s+/gm, '$1. ')
    // Imagem antes de link: a sintaxe da imagem CONTÉM a do link.
    .replace(/!\[([^\]]*)\]\(([^)]*)\)/g, (_, alt) => (alt ? `[imagem: ${alt}]` : '[imagem]'))
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, texto, url) => `${texto} (${url})`)
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^\s{0,3}([-*_])\s*\1\s*\1[\s\1]*$/gm, '────────')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const ENTIDADES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  hellip: '…', aacute: 'á', agrave: 'à', atilde: 'ã', acirc: 'â', eacute: 'é', ecirc: 'ê',
  iacute: 'í', oacute: 'ó', otilde: 'õ', ocirc: 'ô', uacute: 'ú', ccedil: 'ç',
  Aacute: 'Á', Atilde: 'Ã', Eacute: 'É', Iacute: 'Í', Oacute: 'Ó', Otilde: 'Õ',
  Uacute: 'Ú', Ccedil: 'Ç',
}

/**
 * HTML → texto puro.
 *
 * Feito com expressão regular DE PROPÓSITO, sem `DOMParser`: assim a função
 * é pura, roda no teste de unidade em Node (milissegundos, sem navegador) e
 * não pode executar nada do que veio no arquivo.
 */
export function htmlParaTexto(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|h[1-6]|tr|ul|ol|blockquote|pre|table)>/gi, '\n\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<\/(li|td|th)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (todo, nome) => (nome in ENTIDADES ? ENTIDADES[nome] : todo))
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/* ────────────────────────────────────────────────────────────────────────
   O catálogo
   ──────────────────────────────────────────────────────────────────────── */

/** Tipos de texto que valem a pena converter entre si. */
const EH_TEXTO = (ext) => TEXTOS_ACEITOS.includes(ext)

/**
 * O que este arquivo pode virar.
 * @returns {{id:string, ext:string, rotulo:string, descricao:string,
 *            fidelidade:'exato'|'perde'|'reescreve'}[]}
 */
export function alvosDe(item) {
  if (!item || item.isDir) return []
  const ext = item.ext || extOf(item.name)
  const alvos = []
  const podeGravar = formatosDeSaida()

  if (ehImagem(item)) {
    for (const [id, def] of Object.entries(SAIDAS)) {
      if (!podeGravar[id]) continue
      if (id === ext || (id === 'jpg' && ext === 'jpeg')) continue
      alvos.push({
        id,
        ext: def.ext,
        rotulo: def.rotulo,
        descricao: def.perdas
          ? id === 'webp'
            ? 'Mesma imagem, arquivo bem menor — abre em qualquer celular atual'
            : 'O formato universal de foto; não guarda transparência'
          : 'Sem perda nenhuma de qualidade; guarda transparência',
        fidelidade: def.perdas ? 'perde' : 'exato',
      })
    }
    alvos.push({
      id: 'pdf',
      ext: 'pdf',
      rotulo: 'PDF',
      descricao: 'Uma página A4 com esta imagem, em pé ou deitada conforme a foto',
      fidelidade: 'perde',
    })
  }

  if (EH_TEXTO(ext)) {
    alvos.push({
      id: 'pdf',
      ext: 'pdf',
      rotulo: 'PDF',
      descricao: 'O texto paginado em A4, pronto pra imprimir ou mandar',
      fidelidade: 'reescreve',
    })
    if (ext === 'csv') {
      alvos.push({
        id: 'json',
        ext: 'json',
        rotulo: 'JSON',
        descricao: 'Cada linha da planilha vira um registro; a 1ª linha vira os nomes',
        fidelidade: 'exato',
      })
    }
    if (ext === 'json') {
      alvos.push({
        id: 'csv',
        ext: 'csv',
        rotulo: 'CSV (planilha)',
        descricao: 'Abre direto no Excel e no Google Planilhas',
        fidelidade: 'exato',
      })
      alvos.push({
        id: 'txt-json',
        ext: 'txt',
        rotulo: 'Texto organizado',
        descricao: 'O mesmo JSON, indentado e legível',
        fidelidade: 'exato',
      })
    }
    if (ext === 'md') {
      alvos.push({
        id: 'txt-md',
        ext: 'txt',
        rotulo: 'Texto puro',
        descricao: 'Tira as marcações (#, **, links) e deixa só o texto',
        fidelidade: 'reescreve',
      })
    }
    if (ext === 'html' || ext === 'htm') {
      alvos.push({
        id: 'txt-html',
        ext: 'txt',
        rotulo: 'Texto puro',
        descricao: 'Tira as etiquetas e deixa só o que se lê na página',
        fidelidade: 'reescreve',
      })
    }
  }

  // Compactar vale pra quase qualquer arquivo — é a resposta que sempre
  // existe. Menos pra um .zip: "transformar um .zip em .zip" é uma opção que
  // só serve pra fazer a pessoa perder tempo descobrindo que não serve.
  if (ext !== 'zip') {
    alvos.push({
      id: 'zip',
      ext: 'zip',
      rotulo: 'ZIP (compactado)',
      descricao: 'Guarda o arquivo inteiro, do jeitinho que está, ocupando menos',
      fidelidade: 'exato',
    })
  }

  return alvos
}

/**
 * Converte de fato.
 *
 * @param {{item:object, bytes:Uint8Array, alvo:string,
 *          qualidade?:number, onProgresso?:Function}} args
 * @returns {Promise<{bytes:Uint8Array, ext:string, resumo:string}>}
 */
export async function converter({ item, bytes, alvo, qualidade, onProgresso }) {
  if (!bytes || !bytes.length) throw new Error('O arquivo está vazio — não há o que converter.')
  const passo = (t) => onProgresso && onProgresso(t)
  const nome = item.name
  const original = bytes.length

  const comoTexto = () => new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  const paraBytes = (t) => new TextEncoder().encode(t)
  const encolheu = (saida) => {
    const d = 1 - saida / original
    if (Math.abs(d) < 0.005) return 'praticamente do mesmo tamanho'
    return d > 0 ? `${Math.round(d * 100)}% menor` : `${Math.round(-d * 100)}% maior`
  }

  switch (alvo) {
    case 'jpg':
    case 'png':
    case 'webp': {
      passo('reencodando a imagem…')
      const r = await reencodar(bytes, alvo, { qualidade: qualidade ?? 0.9 })
      return {
        bytes: r.bytes,
        ext: SAIDAS[alvo].ext,
        resumo: `${r.largura}×${r.altura} · ${formatBytes(r.bytes.length)} (${encolheu(r.bytes.length)})`,
      }
    }

    case 'pdf': {
      if (ehImagem(item)) {
        passo('montando a página…')
        const r = await pdfDeImagens([{ nome, bytes, mtime: item.mtime }])
        if (!r.paginas) throw new Error(r.falhas[0] || 'Não consegui montar o PDF.')
        return { bytes: r.bytes, ext: 'pdf', resumo: `1 página · ${formatBytes(r.bytes.length)}` }
      }
      passo('paginando o texto…')
      const r = await pdfDeTexto(comoTexto())
      return {
        bytes: r.bytes,
        ext: 'pdf',
        resumo:
          `${r.paginas} ${r.paginas === 1 ? 'página' : 'páginas'} · ${formatBytes(r.bytes.length)}` +
          (r.truncado ? ' (texto cortado no limite)' : ''),
      }
    }

    case 'json': {
      passo('lendo a planilha…')
      const objetos = csvParaObjetos(comoTexto())
      if (!objetos.length) throw new Error('A planilha não tem nenhuma linha de dados.')
      const saida = paraBytes(JSON.stringify(objetos, null, 2))
      return {
        bytes: saida,
        ext: 'json',
        resumo: `${objetos.length} ${objetos.length === 1 ? 'registro' : 'registros'} · ${Object.keys(objetos[0]).length} campos`,
      }
    }

    case 'csv': {
      passo('montando a tabela…')
      let dados
      try {
        dados = JSON.parse(comoTexto())
      } catch (e) {
        throw new Error('Este arquivo não é um JSON válido: ' + ((e && e.message) || ''))
      }
      const linhas = jsonParaLinhas(dados)
      // Ponto e vírgula: é o que o Excel em português abre em colunas sem
      // pedir importação. Vírgula obrigaria a pessoa a um assistente de 3 passos.
      const texto = escreverCsv(linhas, ';')
      // BOM: sem ele o Excel mostra "JoÃ£o" no lugar de "João".
      const saida = paraBytes('﻿' + texto)
      return {
        bytes: saida,
        ext: 'csv',
        resumo: `${Math.max(0, linhas.length - 1)} linhas · ${linhas[0].length} colunas`,
      }
    }

    case 'txt-json': {
      const dados = JSON.parse(comoTexto())
      const saida = paraBytes(JSON.stringify(dados, null, 2))
      return { bytes: saida, ext: 'txt', resumo: formatBytes(saida.length) }
    }

    case 'txt-md': {
      const t = markdownParaTexto(comoTexto())
      const saida = paraBytes(t)
      return {
        bytes: saida,
        ext: 'txt',
        resumo: `${t.split('\n').length} linhas · ${formatBytes(saida.length)}`,
      }
    }

    case 'txt-html': {
      const t = htmlParaTexto(comoTexto())
      if (!t.trim()) throw new Error('Não sobrou texto nenhum — a página é só código ou imagem.')
      const saida = paraBytes(t)
      return {
        bytes: saida,
        ext: 'txt',
        resumo: `${t.split('\n').length} linhas · ${formatBytes(saida.length)}`,
      }
    }

    case 'zip': {
      passo('compactando…')
      const r = await criarZip([{ nome, bytes, mtime: item.mtime }])
      return {
        bytes: r.bytes,
        ext: 'zip',
        resumo: r.comprimido
          ? `${formatBytes(r.bytes.length)} (${encolheu(r.bytes.length)})`
          : `${formatBytes(r.bytes.length)} (guardado sem comprimir)`,
      }
    }

    default:
      throw new Error(`Conversão desconhecida: ${alvo}`)
  }
}

/** Nome sugerido pro resultado: mesmo nome, extensão nova. */
export function nomeConvertido(item, alvo) {
  const def = alvosDe(item).find((a) => a.id === alvo)
  return stripExt(item.name) + '.' + (def ? def.ext : 'bin')
}
