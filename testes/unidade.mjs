/**
 * Testes de unidade — as funções puras de `fs/util.js` e `fs/scan.js`.
 *
 * As outras três bancadas sobem um Chromium e levam minutos. Esta roda em
 * milissegundos e não precisa nem do servidor. É onde uma regressão em
 * `sortEntries` ou `formatBytes` tem que aparecer — não numa captura de tela.
 *
 *   node testes/unidade.mjs
 */

import assert from 'node:assert/strict'
import {
  normalize, join, parentOf, baseName, crumbs, isInside, extOf, stripExt,
  kindOf, formatBytes, formatDate, sortEntries, fold, matches, uniqueName,
  validateName, KINDS,
} from '../src/fs/util.js'
import { acharDuplicados, acharGrandes, acharVazios, acharAntigos, buscar, resumoPorCategoria } from '../src/fs/scan.js'
import {
  farejarSeparador, lerCsv, escreverCsv, csvParaObjetos, jsonParaLinhas,
  markdownParaTexto, htmlParaTexto,
} from '../src/fs/converter.js'
import { destinoDeVoltar } from '../src/state/voltar.js'
import { proteger, abrir, forcaDaSenha, inspecionar } from '../src/fs/cripto.js'

let passaram = 0
const falhas = []

function teste(nome, fn) {
  try {
    fn()
    passaram++
  } catch (e) {
    falhas.push({ nome, erro: e.message.split('\n')[0] })
  }
}

/**
 * Versão assíncrona — a criptografia é toda `await`, e um `teste()` comum
 * daria "passou" antes de a promessa sequer resolver. Um teste que não pode
 * falhar é pior que teste nenhum; já custou caro uma vez neste projeto.
 */
const pendentes = []
function testeAsync(nome, fn) {
  pendentes.push(
    fn().then(
      () => {
        passaram++
      },
      (e) => {
        falhas.push({ nome, erro: String((e && e.message) || e).split('\n')[0] })
      }
    )
  )
}

const arq = (path, size = 100, mtime = 0) => {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const i = name.lastIndexOf('.')
  return { path, name, isDir: false, size, mtime, ext: i > 0 ? name.slice(i + 1).toLowerCase() : '' }
}
const dir = (path) => ({
  path,
  name: path.slice(path.lastIndexOf('/') + 1),
  isDir: true,
  size: 0,
  mtime: 0,
  ext: '',
})

// ─── Caminhos ────────────────────────────────────────────────────────────────

teste('normalize resolve barras e pontos', () => {
  assert.equal(normalize('/a//b/'), '/a/b')
  assert.equal(normalize('a/b'), '/a/b')
  assert.equal(normalize('\\a\\b'), '/a/b')
  assert.equal(normalize('/a/./b'), '/a/b')
  assert.equal(normalize('/a/b/../c'), '/a/c')
  assert.equal(normalize(''), '/')
  assert.equal(normalize('/'), '/')
})

teste('normalize não deixa subir acima da raiz', () => {
  // Um `..` a mais não pode virar caminho fora do armazenamento.
  assert.equal(normalize('/../../etc'), '/etc')
  assert.equal(normalize('/a/../../..'), '/')
})

teste('join monta caminho a partir de pedaços', () => {
  assert.equal(join('/a', 'b'), '/a/b')
  assert.equal(join('/', 'a'), '/a')
  assert.equal(join('/a/', '/b/'), '/a/b')
})

teste('parentOf sobe um nível e para na raiz', () => {
  assert.equal(parentOf('/a/b/c.txt'), '/a/b')
  assert.equal(parentOf('/a'), '/')
  assert.equal(parentOf('/'), '/')
})

teste('baseName devolve o último segmento', () => {
  assert.equal(baseName('/a/b/c.txt'), 'c.txt')
  assert.equal(baseName('/'), 'Armazenamento interno')
})

teste('crumbs monta a trilha inteira', () => {
  const c = crumbs('/DCIM/Camera')
  assert.deepEqual(c.map((x) => x.name), ['Início', 'DCIM', 'Camera'])
  assert.deepEqual(c.map((x) => x.path), ['/', '/DCIM', '/DCIM/Camera'])
  assert.equal(crumbs('/').length, 1)
})

teste('isInside protege contra mover pasta pra dentro de si', () => {
  assert.equal(isInside('/a/b', '/a'), true)
  assert.equal(isInside('/a', '/a'), true)
  assert.equal(isInside('/ab', '/a'), false, '"/ab" NÃO está dentro de "/a"')
  assert.equal(isInside('/qualquer', '/'), true)
})

teste('extOf e stripExt tratam arquivo sem extensão e oculto', () => {
  assert.equal(extOf('foto.JPG'), 'jpg')
  assert.equal(extOf('semponto'), '')
  assert.equal(extOf('.gitignore'), '', 'arquivo oculto não tem extensão')
  assert.equal(stripExt('foto.jpg'), 'foto')
  assert.equal(stripExt('a.b.c'), 'a.b')
})

// ─── Categorias ──────────────────────────────────────────────────────────────

teste('kindOf classifica pelos tipos conhecidos', () => {
  assert.equal(kindOf(arq('/a.jpg')), 'image')
  assert.equal(kindOf(arq('/a.MP4')), 'video')
  assert.equal(kindOf(arq('/a.opus')), 'audio')
  assert.equal(kindOf(arq('/a.pdf')), 'doc')
  assert.equal(kindOf(arq('/a.zip')), 'archive')
  assert.equal(kindOf(arq('/a.apk')), 'app')
  assert.equal(kindOf(arq('/a.xyz')), 'other')
  assert.equal(kindOf(dir('/pasta')), 'folder')
})

teste('nenhuma extensão está em duas categorias', () => {
  const vistas = new Map()
  for (const [id, k] of Object.entries(KINDS)) {
    for (const e of k.exts) {
      assert.equal(vistas.has(e), false, `".${e}" está em ${vistas.get(e)} e em ${id}`)
      vistas.set(e, id)
    }
  }
})

// ─── Formatação ──────────────────────────────────────────────────────────────

teste('formatBytes usa base 1024 e vírgula decimal', () => {
  assert.equal(formatBytes(0), '0 B')
  assert.equal(formatBytes(-5), '0 B')
  assert.equal(formatBytes(999), '999 B')
  assert.equal(formatBytes(1024), '1,0 KB')
  assert.equal(formatBytes(1024 * 1024), '1,0 MB')
  assert.equal(formatBytes(1536 * 1024), '1,5 MB')
  assert.equal(formatBytes(1024 ** 3), '1,0 GB')
})

teste('formatBytes não quebra com lixo na entrada', () => {
  assert.equal(formatBytes(null), '0 B')
  assert.equal(formatBytes(undefined), '0 B')
  assert.equal(formatBytes(NaN), '0 B')
  assert.equal(formatBytes(Infinity), '0 B')
})

teste('formatDate é curta e sem "de"', () => {
  const agora = new Date(2026, 7, 8, 12, 0, 0).getTime()
  const DIA = 86400000
  assert.equal(formatDate(agora - 30000, agora), 'agora')
  assert.equal(formatDate(agora - 2 * 3600000, agora), '10:00')
  assert.equal(formatDate(agora - DIA, agora), 'ontem')
  assert.equal(formatDate(new Date(2026, 4, 26, 10).getTime(), agora), '26 mai')
  assert.equal(formatDate(new Date(2025, 6, 6, 10).getTime(), agora), '06 jul 2025')
  assert.equal(formatDate(0, agora), '—')
})

// ─── Ordenação ───────────────────────────────────────────────────────────────

teste('sortEntries põe pasta antes de arquivo', () => {
  const r = sortEntries([arq('/b.txt'), dir('/a'), arq('/a.txt')], 'name', false)
  assert.equal(r[0].isDir, true)
})

teste('sortEntries por nome usa ordem natural (10 depois de 9)', () => {
  const r = sortEntries([arq('/f10.jpg'), arq('/f9.jpg'), arq('/f1.jpg')], 'name', false)
  assert.deepEqual(r.map((x) => x.name), ['f1.jpg', 'f9.jpg', 'f10.jpg'])
})

teste('sortEntries por nome ignora acento e caixa', () => {
  const r = sortEntries([arq('/Zebra.txt'), arq('/água.txt'), arq('/Banana.txt')], 'name', false)
  assert.deepEqual(r.map((x) => x.name), ['água.txt', 'Banana.txt', 'Zebra.txt'])
})

teste('sortEntries por tamanho respeita o sentido', () => {
  const lista = [arq('/a', 10), arq('/b', 300), arq('/c', 50)]
  assert.deepEqual(sortEntries(lista, 'size', false).map((x) => x.size), [10, 50, 300])
  assert.deepEqual(sortEntries(lista, 'size', true).map((x) => x.size), [300, 50, 10])
})

teste('sortEntries desempata pelo nome, sempre A→Z', () => {
  // Mesmo tamanho: a ordem não pode variar entre renderizações.
  const lista = [arq('/c.txt', 5), arq('/a.txt', 5), arq('/b.txt', 5)]
  const um = sortEntries(lista, 'size', true).map((x) => x.name)
  const dois = sortEntries(lista, 'size', true).map((x) => x.name)
  assert.deepEqual(um, ['a.txt', 'b.txt', 'c.txt'])
  assert.deepEqual(um, dois)
})

teste('sortEntries não muta o array recebido', () => {
  const lista = [arq('/b.txt'), arq('/a.txt')]
  const copia = [...lista]
  sortEntries(lista, 'name', false)
  assert.deepEqual(lista, copia)
})

// ─── Busca ───────────────────────────────────────────────────────────────────

teste('fold tira acento e caixa', () => {
  assert.equal(fold('Relatório Anual'), 'relatorio anual')
  assert.equal(fold('ÁÉÍÓÚÃÕÇ'), 'aeiouaoc')
})

teste('matches acha sem acento e sem caixa', () => {
  assert.equal(matches(arq('/Relatório.pdf'), 'relatorio'), true)
  assert.equal(matches(arq('/Relatório.pdf'), 'RELAT'), true)
  assert.equal(matches(arq('/Relatório.pdf'), 'xyz'), false)
  assert.equal(matches(arq('/qualquer'), ''), true, 'busca vazia casa com tudo')
})

teste('buscar ordena por relevância: exato, prefixo, contém', () => {
  const itens = [arq('/x/contrato-novo.pdf'), arq('/y/meu contrato.pdf'), arq('/z/contrato.pdf')]
  const r = buscar(itens, 'contrato')
  assert.equal(r[0].name, 'contrato.pdf', 'exato primeiro')
  assert.equal(r[1].name, 'contrato-novo.pdf', 'prefixo depois')
  assert.equal(r[2].name, 'meu contrato.pdf', 'contém por último')
})

teste('buscar com termo vazio não devolve nada', () => {
  assert.deepEqual(buscar([arq('/a.txt')], ''), [])
  assert.deepEqual(buscar([arq('/a.txt')], '   '), [])
})

teste('buscar respeita o limite', () => {
  const itens = Array.from({ length: 50 }, (_, i) => arq(`/f${i}.txt`))
  assert.equal(buscar(itens, 'f').length, 50)
  assert.equal(buscar(itens, 'f', 10).length, 10)
})

// ─── Nomes ───────────────────────────────────────────────────────────────────

teste('uniqueName renumera preservando a extensão', () => {
  const usados = new Set(['foto.jpg'])
  assert.equal(uniqueName('foto.jpg', usados), 'foto (2).jpg')
  assert.equal(uniqueName('livre.jpg', usados), 'livre.jpg')
  usados.add('foto (2).jpg')
  assert.equal(uniqueName('foto.jpg', usados), 'foto (3).jpg')
})

teste('uniqueName funciona sem extensão', () => {
  assert.equal(uniqueName('pasta', new Set(['pasta'])), 'pasta (2)')
})

teste('validateName barra o que o Android recusa', () => {
  assert.equal(validateName('normal.txt'), null)
  assert.notEqual(validateName(''), null)
  assert.notEqual(validateName('   '), null)
  assert.notEqual(validateName('.'), null)
  assert.notEqual(validateName('..'), null)
  assert.notEqual(validateName('a/b'), null)
  assert.notEqual(validateName('a:b'), null)
  assert.notEqual(validateName('a?b'), null)
  assert.notEqual(validateName('x'.repeat(300)), null)
})

// ─── Achados da limpeza ──────────────────────────────────────────────────────

teste('acharDuplicados agrupa por nome+tamanho, não por caminho', () => {
  const r = acharDuplicados([
    arq('/a/foto.jpg', 1000, 10),
    arq('/b/foto.jpg', 1000, 20),
    arq('/c/foto.jpg', 999, 30), // tamanho diferente: não é cópia
  ])
  assert.equal(r.length, 1)
  assert.equal(r[0].itens.length, 2)
  assert.equal(r[0].recuperavel, 1000, 'recupera o tamanho de UMA cópia')
})

teste('acharDuplicados mantém o mais antigo como original', () => {
  const r = acharDuplicados([
    arq('/novo/x.pdf', 500, 900),
    arq('/velho/x.pdf', 500, 100),
    arq('/meio/x.pdf', 500, 500),
  ])
  assert.equal(r[0].itens[0].path, '/velho/x.pdf')
  assert.equal(r[0].recuperavel, 1000, 'duas cópias além do original')
})

teste('acharDuplicados ignora arquivo de 0 byte', () => {
  // Senão TODO arquivo vazio viraria "cópia" de todo outro com o mesmo nome.
  assert.equal(acharDuplicados([arq('/a/x.txt', 0), arq('/b/x.txt', 0)]).length, 0)
})

teste('acharDuplicados casa nome com acento diferente de caixa', () => {
  const r = acharDuplicados([arq('/a/Relatório.pdf', 10), arq('/b/relatório.pdf', 10)])
  assert.equal(r.length, 1)
})

teste('acharGrandes usa o limite como piso inclusivo', () => {
  const lista = [arq('/a', 100), arq('/b', 101), arq('/c', 99)]
  const r = acharGrandes(lista, 100)
  assert.deepEqual(r.map((x) => x.size), [101, 100], 'ordenado do maior pro menor')
})

teste('acharVazios pega só o que tem 0 byte', () => {
  assert.equal(acharVazios([arq('/a', 0), arq('/b', 1)]).length, 1)
})

teste('acharAntigos ignora arquivo vazio e ordena do mais velho', () => {
  const agora = 1_000_000_000_000
  const DIA = 86400000
  const r = acharAntigos(
    [
      arq('/recente', 10, agora - 10 * DIA),
      arq('/velho', 10, agora - 500 * DIA),
      arq('/maisvelho', 10, agora - 900 * DIA),
      arq('/vazio', 0, agora - 900 * DIA),
    ],
    365,
    agora
  )
  assert.deepEqual(r.map((x) => x.name), ['maisvelho', 'velho'])
})

teste('resumoPorCategoria soma quantidade e bytes', () => {
  const r = resumoPorCategoria([arq('/a.jpg', 10), arq('/b.jpg', 20), arq('/c.pdf', 5)])
  assert.equal(r.image.qtd, 2)
  assert.equal(r.image.bytes, 30)
  assert.equal(r.doc.qtd, 1)
})

// ─── Conversão: CSV ──────────────────────────────────────────────────────────

teste('farejarSeparador acha o ponto e vírgula do Excel brasileiro', () => {
  assert.equal(farejarSeparador('nome;idade;cidade\nAna;30;Recife'), ';')
  assert.equal(farejarSeparador('nome,idade\nAna,30'), ',')
})

teste('farejarSeparador ignora separador dentro de aspas', () => {
  // A vírgula aparece 3x, mas 2 estão presas dentro do campo com aspas.
  assert.equal(farejarSeparador('"Silva, Ana";30;Recife\n'), ';')
})

teste('lerCsv respeita aspas, separador e quebra de linha dentro do campo', () => {
  const linhas = lerCsv('nome,obs\n"Ana","mora em Recife, PE"\n"Bia","linha 1\nlinha 2"\n')
  assert.equal(linhas.length, 3)
  assert.equal(linhas[1][1], 'mora em Recife, PE')
  assert.equal(linhas[2][1], 'linha 1\nlinha 2')
})

teste('lerCsv entende aspas duplicadas como uma aspa literal', () => {
  assert.equal(lerCsv('a\n"ele disse ""oi"""')[1][0], 'ele disse "oi"')
})

teste('lerCsv trata CRLF como UMA quebra', () => {
  assert.equal(lerCsv('a,b\r\n1,2\r\n').length, 2)
})

teste('lerCsv tira o BOM do Excel', () => {
  assert.equal(lerCsv('﻿nome,idade\nAna,30')[0][0], 'nome')
})

teste('escreverCsv só cita o campo que precisa', () => {
  assert.equal(escreverCsv([['a', 'b,c'], ['d"e', 'f']], ','), 'a,"b,c"\r\n"d""e",f')
})

teste('csv → objetos → csv sobrevive à ida e volta', () => {
  const objetos = csvParaObjetos('nome;nota\n"Silva; Ana";9,5\nBia;8')
  assert.equal(objetos.length, 2)
  assert.equal(objetos[0].nome, 'Silva; Ana')
  assert.equal(objetos[0].nota, '9,5')
})

teste('csvParaObjetos nomeia coluna sem cabeçalho em vez de perder o dado', () => {
  const o = csvParaObjetos('nome,,idade\nAna,x,30')
  assert.equal(o[0].coluna2, 'x')
})

teste('jsonParaLinhas junta as chaves de TODOS os registros', () => {
  const l = jsonParaLinhas([{ a: 1 }, { b: 2 }, { a: 3, c: 4 }])
  assert.deepEqual(l[0], ['a', 'b', 'c'])
  assert.deepEqual(l[3], ['3', '', '4'])
})

teste('jsonParaLinhas desembrulha {dados:[...]}, como as APIs devolvem', () => {
  const l = jsonParaLinhas({ dados: [{ x: 1 }, { x: 2 }] })
  assert.deepEqual(l, [['x'], ['1'], ['2']])
})

teste('jsonParaLinhas aceita lista de valores simples', () => {
  assert.deepEqual(jsonParaLinhas(['a', 'b']), [['valor'], ['a'], ['b']])
})

teste('jsonParaLinhas recusa o que não é lista, com mensagem', () => {
  assert.throws(() => jsonParaLinhas(42), /não é uma lista/)
})

// ─── Conversão: Markdown e HTML ──────────────────────────────────────────────

teste('markdownParaTexto tira marcação e mantém o texto', () => {
  const t = markdownParaTexto('# Título\n\n**forte** e *fraco*\n\n- item\n\n[link](http://x.com)')
  assert.ok(!t.includes('#'))
  assert.ok(!t.includes('**'))
  assert.ok(t.includes('forte e fraco'))
  assert.ok(t.includes('• item'))
  assert.ok(t.includes('link (http://x.com)'))
})

teste('markdownParaTexto trata imagem antes de link (a sintaxe contém a outra)', () => {
  assert.equal(markdownParaTexto('![gato](g.png)'), '[imagem: gato]')
})

teste('htmlParaTexto joga fora script e style, não só as etiquetas', () => {
  const t = htmlParaTexto('<p>oi</p><script>roubar()</script><style>p{}</style>')
  assert.equal(t, 'oi')
})

teste('htmlParaTexto converte <br> em quebra e decodifica entidade', () => {
  assert.equal(htmlParaTexto('a<br>b&nbsp;c &amp; d &ccedil;'), 'a\nb c & d ç')
})

teste('htmlParaTexto decodifica entidade numérica', () => {
  assert.equal(htmlParaTexto('&#65;&#x42;'), 'AB')
})

// ─── Voltar ──────────────────────────────────────────────────────────────────

teste('destinoDeVoltar sobe uma pasta de cada vez', () => {
  assert.equal(destinoDeVoltar('/pastas/Documents/Fotos'), '/pastas/Documents')
  assert.equal(destinoDeVoltar('/pastas/Documents'), '/pastas')
})

teste('destinoDeVoltar sai do navegador de pastas pro Início', () => {
  assert.equal(destinoDeVoltar('/pastas'), '/')
  assert.equal(destinoDeVoltar('/pastas/'), '/')
})

teste('destinoDeVoltar leva qualquer outra tela pro Início', () => {
  assert.equal(destinoDeVoltar('/limpeza'), '/')
  assert.equal(destinoDeVoltar('/categoria/image'), '/')
})

teste('destinoDeVoltar devolve null no Início — é onde se pergunta se sai', () => {
  assert.equal(destinoDeVoltar('/'), null)
})

// ─── Criptografia ────────────────────────────────────────────────────────────

const texto = (s) => new TextEncoder().encode(s)
const deTexto = (b) => new TextDecoder().decode(b)

testeAsync('proteger → abrir devolve o conteúdo idêntico', async () => {
  const claro = texto('contrato de aluguel — R$ 1.200,00 — açaí e coração')
  const { bytes } = await proteger(claro, 'uma senha bem longa', { nome: 'contrato.txt', mtime: 42 })
  const r = await abrir(bytes, 'uma senha bem longa')
  assert.equal(deTexto(r.bytes), deTexto(claro))
  assert.equal(r.nome, 'contrato.txt')
  assert.equal(r.mtime, 42)
})

testeAsync('o arquivo protegido NÃO contém o conteúdo original em claro', async () => {
  const { bytes } = await proteger(texto('SENHA DO BANCO 1234'), 'abcdefgh', { nome: 'segredo.txt' })
  const cru = Buffer.from(bytes).toString('latin1')
  assert.ok(!cru.includes('SENHA DO BANCO'), 'o conteúdo vazou em claro')
  assert.ok(!cru.includes('segredo.txt'), 'o NOME do arquivo vazou em claro')
})

testeAsync('senha errada falha com mensagem, não com lixo', async () => {
  const { bytes } = await proteger(texto('oi'), 'senha-certa-123')
  const r = await abrir(bytes, 'senha-errada-123').then(
    () => ({ lancou: false, msg: '' }),
    (e) => ({ lancou: true, msg: e.message })
  )
  assert.ok(r.lancou, 'abriu com a senha errada')
  assert.match(r.msg, /Senha errada/i)
})

testeAsync('um byte trocado no meio é DETECTADO (é pra isso que serve o GCM)', async () => {
  const { bytes } = await proteger(texto('x'.repeat(5000)), 'senha-longa-o-bastante')
  const adulterado = bytes.slice()
  adulterado[adulterado.length - 40] ^= 0xff
  const r = await abrir(adulterado, 'senha-longa-o-bastante').then(
    () => ({ lancou: false, msg: '' }),
    (e) => ({ lancou: true, msg: e.message })
  )
  assert.ok(r.lancou, 'aceitou um arquivo adulterado')
})

testeAsync('adulterar o CABEÇALHO também é detectado', async () => {
  const { bytes } = await proteger(texto('oi'), 'senha-longa-o-bastante')
  const adulterado = bytes.slice()
  adulterado[13] ^= 0x01 // um byte do salt
  const r = await abrir(adulterado, 'senha-longa-o-bastante').then(
    () => ({ lancou: false }),
    () => ({ lancou: true })
  )
  assert.ok(r.lancou, 'aceitou um cabeçalho adulterado')
})

testeAsync('arquivo cortado no fim não vira conteúdo pela metade', async () => {
  const { bytes } = await proteger(texto('y'.repeat(200000)), 'senha-longa-o-bastante')
  const r = await abrir(bytes.slice(0, bytes.length - 500), 'senha-longa-o-bastante').then(
    () => ({ lancou: false }),
    () => ({ lancou: true })
  )
  assert.ok(r.lancou, 'devolveu conteúdo de um arquivo truncado')
})

testeAsync('arquivo que não é do Acervo dá a mensagem certa', async () => {
  const r = await abrir(texto('não sou um arquivo protegido, sou um txt qualquer'), 'x').then(
    () => ({ lancou: false, msg: '' }),
    (e) => ({ lancou: true, msg: e.message })
  )
  assert.ok(r.lancou)
  assert.match(r.msg, /não foi protegido pelo Acervo/i)
})

testeAsync('conteúdo maior que um bloco (1 MiB) volta inteiro', async () => {
  // 2,5 blocos: pega o caso do último bloco parcial, que é onde erro de
  // índice costuma se esconder.
  const grande = new Uint8Array(Math.floor(2.5 * 1024 * 1024))
  for (let i = 0; i < grande.length; i++) grande[i] = i % 251
  const { bytes, blocos } = await proteger(grande, 'senha-longa-o-bastante')
  assert.equal(blocos, 3)
  const r = await abrir(bytes, 'senha-longa-o-bastante')
  assert.equal(r.bytes.length, grande.length)
  assert.equal(r.bytes[grande.length - 1], grande[grande.length - 1])
  assert.equal(r.bytes[1048576], grande[1048576])
})

testeAsync('inspecionar lê o cabeçalho sem precisar da senha', async () => {
  const { bytes } = await proteger(texto('oi'), 'senha-longa-o-bastante')
  const info = inspecionar(bytes)
  assert.equal(info.versao, 1)
  assert.ok(info.iteracoes >= 200000)
})

/*
  VALIDAÇÃO CRUZADA da criptografia.

  Testar `abrir(proteger(x))` só prova consistência interna: um formato
  escrito errado e lido errado do mesmo jeito passaria — foi por isso que o
  .zip é conferido contra o PowerShell do Windows.

  Aqui a contraprova é decifrar o arquivo com o `node:crypto` clássico
  (`pbkdf2Sync` + `createDecipheriv`), que é uma implementação DIFERENTE da
  `crypto.subtle` usada pelo app. Se as duas chegam no mesmo texto, o
  formato é AES-GCM/PBKDF2 de verdade — e não um dialeto que só o Acervo lê.
*/
testeAsync('o .acv é AES-GCM padrão: outra biblioteca decifra o mesmo conteúdo', async () => {
  const { pbkdf2Sync, createDecipheriv } = await import('node:crypto')
  const segredo = 'declaração de imposto 2026 — não perder'
  const senha = 'a senha do arquivo protegido'
  const { bytes } = await proteger(texto(segredo), senha, { nome: 'ir2026.pdf' })

  const buf = Buffer.from(bytes)
  const cabecalho = buf.subarray(0, 36)
  const iteracoes = cabecalho.readUInt32LE(8)
  const salt = cabecalho.subarray(12, 28)
  const chave = pbkdf2Sync(Buffer.from(senha, 'utf8'), salt, iteracoes, 32, 'sha256')

  const lerBloco = (off, indice) => {
    const tam = buf.readUInt32LE(off)
    const iv = buf.subarray(off + 4, off + 16)
    const corpo = buf.subarray(off + 16, off + 16 + tam)
    const tag = corpo.subarray(corpo.length - 16)
    const dados = corpo.subarray(0, corpo.length - 16)
    const aadBuf = Buffer.alloc(40)
    cabecalho.copy(aadBuf, 0)
    aadBuf.writeUInt32LE(indice, 36)
    const d = createDecipheriv('aes-256-gcm', chave, iv)
    d.setAAD(aadBuf)
    d.setAuthTag(tag)
    return { claro: Buffer.concat([d.update(dados), d.final()]), fim: off + 16 + tam }
  }

  const b0 = lerBloco(36, 0)
  const meta = JSON.parse(b0.claro.toString('utf8'))
  assert.equal(meta.n, 'ir2026.pdf')
  const b1 = lerBloco(b0.fim, 1)
  assert.equal(b1.claro.toString('utf8'), segredo)
})

teste('forcaDaSenha reprova as senhas que precisam ser reprovadas', () => {
  assert.equal(forcaDaSenha('123456').nivel, 0)
  assert.equal(forcaDaSenha('aaaaaaaaaa').nivel, 0)
  assert.equal(forcaDaSenha('curta1').nivel, 0)
  assert.ok(forcaDaSenha('cavalo bateria grampo correto').nivel >= 3)
  assert.ok(forcaDaSenha('Senha@2026xyz').nivel >= 2)
})

// ─── Relatório ───────────────────────────────────────────────────────────────

await Promise.all(pendentes)

console.log(`\n=== ${passaram}/${passaram + falhas.length} testes de unidade passaram ===`)
if (falhas.length) {
  console.log('\nFALHAS:')
  for (const f of falhas) console.log(`  X ${f.nome}\n    ${f.erro}`)
  process.exit(1)
}
