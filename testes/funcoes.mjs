/**
 * Bancada FUNCIONAL — clica no app de verdade e confere o resultado.
 *
 * Layout bonito não prova que renomear funciona. Aqui cada caso executa a
 * ação pela interface (como o dedo faria) e verifica o efeito no estado.
 */
import { abrirChromium, BASE, exigirServidor } from './navegador.mjs'

const casos = []
const erros = new Set()

function ok(nome, passou, detalhe) {
  casos.push({ nome, passou, detalhe })
  console.log(`${passou ? '  OK  ' : '  X   '} ${nome}${detalhe ? ' — ' + detalhe : ''}`)
}

await exigirServidor()
const { navegador } = await abrirChromium()
const ctx = await navegador.newContext({
  viewport: { width: 412, height: 900 },
  locale: 'pt-BR',
})
const page = await ctx.newPage()
page.on('console', (m) => m.type() === 'error' && erros.add(m.text().slice(0, 220)))
page.on('pageerror', (e) => erros.add('PAGEERROR ' + e.message))

const ir = async (hash) => {
  // Fecha folha/diálogo que tenha ficado aberto do caso anterior.
  //
  // Trocar só o hash NÃO recarrega o documento — a folha continua montada, e
  // o véu dela engole todo clique da seção seguinte. Foi assim que o caso de
  // toque longo falhou parecendo bug do app, quando era resíduo do teste.
  for (let i = 0; i < 3; i++) {
    if ((await page.locator('[role="dialog"]').count()) === 0) break
    await page.keyboard.press('Escape')
    await page.waitForTimeout(220)
  }
  await page.goto(BASE + hash, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
}

// Zera o estado pra a bancada partir sempre do mesmo lugar.
await page.goto(BASE)
await page.evaluate(() => {
  localStorage.clear()
})

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— NAVEGAÇÃO —')

await ir('#/')
ok('Início abre', (await page.getByRole('heading', { name: 'Acervo' }).count()) > 0 ||
  (await page.locator('text=Acervo').count()) > 0)

await ir('#/pastas')
const qtdRaiz = await page.locator('button[aria-label^="Pasta "]').count()
ok('Raiz lista as pastas', qtdRaiz >= 10, `${qtdRaiz} pastas`)

// Entrar numa pasta pelo clique
await page.locator('button[aria-label="Pasta DCIM"]').first().click()
await page.waitForTimeout(500)
ok('Clique entra na pasta', page.url().includes('/pastas/DCIM'), page.url().split('#')[1])

// Trilha volta
await page.locator('nav[aria-label="Caminho da pasta"] button', { hasText: 'Início' }).first().click()
await page.waitForTimeout(400)
ok('Trilha volta pra raiz', page.url().endsWith('#/pastas'), page.url().split('#')[1])

// Voltar do navegador do browser (equivale ao botão voltar do Android)
await ir('#/pastas/DCIM/Camera')
await page.goBack()
await page.waitForTimeout(400)
ok('Voltar do navegador funciona', !page.url().includes('Camera'))

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— CRIAR PASTA —')

await ir('#/pastas/Documents')
await page.locator('button[aria-label="Mais opções desta pasta"]').click()
await page.waitForTimeout(400)
await page.locator('text=Criar pasta aqui').click()
await page.waitForTimeout(400)
const campo = page.locator('input[aria-label="Nome da nova pasta"]')
await campo.fill('Teste Bancada')
await page.locator('button', { hasText: 'Criar' }).last().click()
await page.waitForTimeout(700)
ok(
  'Pasta criada aparece na lista',
  (await page.locator('button[aria-label="Pasta Teste Bancada"]').count()) === 1
)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— RENOMEAR —')

await page.locator('button[aria-label="Opções de Teste Bancada"]').click()
await page.waitForTimeout(400)
await page.locator('text=Renomear').click()
await page.waitForTimeout(400)
await page.locator('input[aria-label="Renomear"]').fill('Renomeada OK')
await page.locator('button', { hasText: 'Salvar' }).click()
await page.waitForTimeout(700)
ok(
  'Renomear muda o nome na lista',
  (await page.locator('button[aria-label="Pasta Renomeada OK"]').count()) === 1 &&
    (await page.locator('button[aria-label="Pasta Teste Bancada"]').count()) === 0
)

// Nome inválido é barrado
await page.locator('button[aria-label="Opções de Renomeada OK"]').click()
await page.waitForTimeout(400)
await page.locator('text=Renomear').click()
await page.waitForTimeout(400)
await page.locator('input[aria-label="Renomear"]').fill('nome/invalido')
await page.locator('button', { hasText: 'Salvar' }).click()
await page.waitForTimeout(400)
const temErro = await page.locator('[role="alert"]').count()
ok('Nome com barra é recusado com mensagem', temErro > 0)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— EXCLUIR E LIXEIRA —')

await ir('#/pastas/Documents')
await page.locator('button[aria-label="Opções de Renomeada OK"]').click()
await page.waitForTimeout(400)
await page.locator('text=Excluir').click()
await page.waitForTimeout(400)
await page.locator('button', { hasText: 'Mandar pra lixeira' }).click()
await page.waitForTimeout(900)
ok(
  'Item excluído sai da pasta',
  (await page.locator('button[aria-label="Pasta Renomeada OK"]').count()) === 0
)

await ir('#/lixeira')
const naLixeira = await page.locator('text=Renomeada OK').count()
ok('Item aparece na lixeira', naLixeira > 0)

const mostraOrigem = await page.locator('text=/volta para .*Documents/').count()
ok('Lixeira mostra de onde o item veio', mostraOrigem > 0)

// Restaurar
await page.locator('text=Renomeada OK').first().click()
await page.waitForTimeout(400)
await page.locator('button', { hasText: /^Restaurar$/ }).click()
await page.waitForTimeout(1000)
await ir('#/pastas/Documents')
ok(
  'Restaurar devolve pro lugar de origem',
  (await page.locator('button[aria-label="Pasta Renomeada OK"]').count()) === 1
)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— MOVER —')

// A folha é modal: o véu bloqueia clique no que está atrás. Por isso todo
// seletor daqui pra frente é escopado ao [role=dialog] — senão o Playwright
// acha o botão homônimo da trilha, que está coberto, e trava.
const folha = () => page.locator('[role="dialog"]').last()

await page.locator('button[aria-label="Opções de Renomeada OK"]').click()
await page.waitForTimeout(400)
await page.locator('text=Mover para').click()
await page.waitForTimeout(600)
await folha().locator('button', { hasText: 'Download' }).first().click()
await page.waitForTimeout(600)
await folha().locator('button', { hasText: /Colocar em/ }).click()
await page.waitForTimeout(1000)
await ir('#/pastas/Download')
ok(
  'Mover leva o item pra pasta escolhida',
  (await page.locator('button[aria-label="Pasta Renomeada OK"]').count()) === 1
)

// Destino inválido: mover uma pasta pra dentro dela mesma
await page.locator('button[aria-label="Opções de Renomeada OK"]').click()
await page.waitForTimeout(400)
await page.locator('text=Mover para').click()
await page.waitForTimeout(600)
await folha().locator('button', { hasText: 'Download' }).first().click()
await page.waitForTimeout(700)
const bloqueado = await folha().locator('text=É a própria pasta').count()
const jaEstaAqui = await folha().locator('button', { hasText: 'Já está aqui' }).count()
ok(
  'Seletor bloqueia destino inválido',
  bloqueado > 0 || jaEstaAqui > 0,
  `bloqueio=${bloqueado} jaAqui=${jaEstaAqui}`
)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— SELEÇÃO MÚLTIPLA —')

await ir('#/pastas/Backups')
await page.locator('button[aria-label="Mais opções desta pasta"]').click()
await page.waitForTimeout(400)
await page.locator('text=Selecionar itens').click()
await page.waitForTimeout(600)
const contagem = await page.locator('text=/\\d+ itens/').first().textContent()
ok('Selecionar todos marca a pasta inteira', /3 itens/.test(contagem || ''), contagem)

// Desmarcar um
await page.locator('button[aria-label^="Arquivo backup-2025"]').first().click()
await page.waitForTimeout(400)
const contagem2 = await page.locator('[class*=barraSelecaoContagem]').first().textContent()
ok('Desmarcar um baixa a contagem', /2 itens/.test(contagem2 || ''), contagem2)

// Cancelar
await page.locator('button[aria-label="Cancelar seleção"]').click()
await page.waitForTimeout(400)
ok('Cancelar sai do modo seleção', (await page.locator('[class*=barraSelecao]').count()) === 0)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— BUSCA —')

await ir('#/busca')
await page.locator('input[aria-label="Termo da busca"]').fill('relatorio')
await page.waitForTimeout(900)
const nResultados = await page.locator('button[aria-label^="Arquivo "]').count()
ok('Busca sem acento acha nome com acento', nResultados > 0, `${nResultados} resultados`)

await page.locator('input[aria-label="Termo da busca"]').fill('IMG_2025')
await page.waitForTimeout(900)
const nImg = await page.locator('button[aria-label^="Arquivo "]').count()
ok('Busca por prefixo devolve resultado', nImg > 0, `${nImg} resultados`)

// Filtro por tipo — "WA" cruza imagem, video, audio e documento do WhatsApp.
// (Com um tipo só a barra some de propósito: filtro de uma opção é ruído.)
await page.locator('input[aria-label="Termo da busca"]').fill('WA')
await page.waitForTimeout(1000)
const temFiltro = await page.locator('[class*=filtro]', { hasText: 'Imagens' }).count()
// Conta pela linha "N resultados", não pelos itens no DOM: a lista pagina em
// 80 e contar o DOM mediria a paginacao, nao o filtro.
const lerTotal = async () => {
  const t = await page.locator('[class*=contagem]').first().textContent()
  return parseInt((t || '').replace(/\D/g, ''), 10) || 0
}
const totalAntes = await lerTotal()
ok('Filtros por tipo aparecem na busca', temFiltro > 0, `${totalAntes} resultados`)

await page.locator('[class*=filtro]', { hasText: 'Imagens' }).first().click()
await page.waitForTimeout(700)
const totalDepois = await lerTotal()
const soImagens = await page.evaluate(() =>
  [...document.querySelectorAll('button[aria-label^="Arquivo "]')]
    .every((b) => /\.(jpg|jpeg|png|webp|gif|heic)$/i.test(b.getAttribute('aria-label')))
)
ok('Filtro de tipo reduz a lista', totalDepois > 0 && totalDepois < totalAntes,
  `${totalAntes} -> ${totalDepois}`)
ok('Filtro de imagens devolve só imagens', soImagens)

await page.locator('input[aria-label="Termo da busca"]').fill('zzzznaoexistezzz')
await page.waitForTimeout(900)
ok('Busca sem resultado mostra estado vazio', (await page.locator('text=/Nada com/').count()) > 0)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— FAVORITOS —')

await ir('#/pastas/Music')
await page.locator('button[aria-label="Mais opções desta pasta"]').click()
await page.waitForTimeout(400)
await page.locator('text=Favoritar esta pasta').click()
await page.waitForTimeout(700)
await ir('#/favoritos')
ok('Pasta favoritada aparece nos favoritos', (await page.locator('text=Music').count()) > 0)

await ir('#/')
ok('Favorito aparece no Início', (await page.locator('text=Favoritos').count()) > 0)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— TEMA —')

await ir('#/ajustes')
await page.locator('button[role="radio"]', { hasText: 'Escuro' }).click()
await page.waitForTimeout(500)
const attrEscuro = await page.evaluate(() => document.documentElement.getAttribute('data-tema'))
const corEscura = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--superficie').trim()
)
ok('Tema escuro aplica o atributo e as cores', attrEscuro === 'escuro' && corEscura === '#141824',
  `${attrEscuro} / ${corEscura}`)

await page.locator('button[role="radio"]', { hasText: 'Claro' }).click()
await page.waitForTimeout(500)
const corClara = await page.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--superficie').trim()
)
ok('Tema claro aplica as cores claras', corClara === '#ffffff', corClara)

// Tema persiste ao recarregar
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(700)
const aposReload = await page.evaluate(() => document.documentElement.getAttribute('data-tema'))
ok('Tema sobrevive ao recarregar', aposReload === 'claro', String(aposReload))

// Efeitos de fundo
await ir('#/ajustes')
await page.locator('[role="switch"]', { hasText: 'Efeitos de fundo' }).click()
await page.waitForTimeout(500)
const semEfeitos = await page.evaluate(() => document.documentElement.hasAttribute('data-sem-efeitos'))
ok('Desligar efeitos marca o documento', semEfeitos === true)
await page.locator('[role="switch"]', { hasText: 'Efeitos de fundo' }).click()
await page.waitForTimeout(400)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— PERSISTÊNCIA —')

await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(800)
await ir('#/pastas/Download')
ok(
  'Alteração de arquivo sobrevive ao recarregar',
  (await page.locator('button[aria-label="Pasta Renomeada OK"]').count()) === 1
)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— LIMPEZA —')

await ir('#/limpeza')
await page.waitForTimeout(1800)
const cartaoDup = page.locator('button', { hasText: /^Cópias repetidas/ }).first()
ok('Limpeza acha as cópias plantadas', (await cartaoDup.count()) > 0)

await cartaoDup.click()
await page.waitForTimeout(900)
const botaoExcluir = await page
  .locator('[role="dialog"]')
  .last()
  .locator('button', { hasText: /^Excluir \d/ })
  .first()
  .textContent()
ok('Cópias já vêm pré-marcadas com o total', /Excluir \d/.test(botaoExcluir || ''), botaoExcluir)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

const temPastasVazias = await page.locator('text=Pastas vazias').count()
ok('Limpeza acha pasta vazia', temPastasVazias > 0)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— DETALHES —')

// A regra de toque: abre a COISA quando o app sabe abrir; cai nos detalhes
// quando não sabe. Os dois caminhos são cobertos.
await ir('#/pastas/Download')
await page.locator('button[aria-label$=".apk"]').first().click()
await page.waitForTimeout(700)
ok(
  'Tocar num arquivo que o app não abre mostra os detalhes',
  (await page.locator('text=Modificado').count()) > 0
)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

await ir('#/pastas')
await page.locator('button[aria-label="Arquivo leia-me.txt"]').click()
await page.waitForTimeout(900)
ok(
  'Tocar num arquivo de texto abre o texto, não a ficha',
  (await page.locator('pre').count()) > 0
)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

await ir('#/pastas')
await page.locator('button[aria-label="Opções de DCIM"]').click()
await page.waitForTimeout(400)
await page.locator('text=Detalhes').click()
await page.waitForTimeout(2500)
// Escopado ao diálogo: a ficha de ordenação da trilha ("Nome") também casa
// com [class*=ficha] e vem antes no documento.
const textoFicha = await page
  .locator('[role="dialog"]')
  .last()
  .locator('dl')
  .first()
  .textContent()
ok('Detalhes de pasta calculam tamanho e conteúdo',
  /arquivos/.test(textoFicha || '') && !/calculando/.test(textoFicha || ''),
  (textoFicha || '').slice(0, 90))

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— TOQUE LONGO —')

await ir('#/pastas/Backups')
const alvoLongo = page.locator('button[aria-label^="Arquivo backup-2025"]').first()
const caixa = await alvoLongo.boundingBox()
await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2)
await page.mouse.down()
await page.waitForTimeout(700) // acima dos 420ms que o gesto exige
await page.mouse.up()
await page.waitForTimeout(500)
ok(
  'Toque longo entra no modo de seleção',
  (await page.locator('[class*=barraSelecao]').count()) > 0
)
ok(
  'Toque longo já deixa o item marcado',
  /1 item/.test((await page.locator('[class*=barraSelecaoContagem]').first().textContent()) || '')
)
// Soltar o dedo depois do toque longo NÃO pode abrir o item.
ok('Toque longo não dispara o clique', page.url().includes('/pastas/Backups'))
await page.locator('button[aria-label="Cancelar seleção"]').click()
await page.waitForTimeout(400)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— ORDENAÇÃO VISÍVEL —')

await ir('#/pastas/Backups')
const fichaOrdem = page.locator('button[aria-label^="Ordenar. Agora"]').first()
ok('Ficha de ordenação aparece na trilha', (await fichaOrdem.count()) === 1)
const rotuloAntes = (await fichaOrdem.textContent()) || ''
await fichaOrdem.click()
await page.waitForTimeout(500)
await page.locator('[role="dialog"]').last().locator('button', { hasText: 'Tamanho' }).click()
await page.waitForTimeout(500)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
const rotuloDepois = (await fichaOrdem.textContent()) || ''
ok(
  'Trocar a ordem muda o que a ficha mostra',
  rotuloAntes.includes('Nome') && rotuloDepois.includes('Tamanho'),
  rotuloAntes.trim() + ' -> ' + rotuloDepois.trim()
)
const primeiroPorTamanho = await page
  .locator('button[aria-label^="Arquivo "]')
  .first()
  .getAttribute('aria-label')
ok(
  'Ordem por tamanho põe o maior primeiro',
  /2026-07-01/.test(primeiroPorTamanho || ''),
  primeiroPorTamanho
)
// Volta pro padrão, pra não contaminar os casos seguintes.
await fichaOrdem.click()
await page.waitForTimeout(400)
await page.locator('[role="dialog"]').last().locator('button', { hasText: 'Nome' }).click()
await page.waitForTimeout(400)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— TAMANHO DE PASTA NA LISTA —')

await ir('#/pastas')
await page.waitForTimeout(3000) // a soma roda em fila, 3 por vez
const linhaDCIM = await page.locator('button[aria-label="Pasta DCIM"]').first().textContent()
ok(
  'Pasta mostra quanto ocupa, direto na lista',
  /(MB|GB|KB)/.test(linhaDCIM || '') && /arquivos/.test(linhaDCIM || ''),
  (linhaDCIM || '').replace(/\s+/g, ' ').slice(0, 60)
)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— DESFAZER NO MOVER —')

await ir('#/pastas/Recordings')
const antesDoMover = await page.locator('button[aria-label^="Arquivo "]').count()
await page.locator('button[aria-label^="Opções de "]').first().click()
await page.waitForTimeout(400)
await page.locator('text=Mover para').click()
await page.waitForTimeout(600)
await page.locator('[role="dialog"]').last().locator('button', { hasText: 'Backups' }).first().click()
await page.waitForTimeout(600)
await page.locator('[role="dialog"]').last().locator('button', { hasText: /Colocar em/ }).click()
await page.waitForTimeout(1200)
const depoisDoMover = await page.locator('button[aria-label^="Arquivo "]').count()
ok(
  'Mover tira o item da pasta',
  depoisDoMover === antesDoMover - 1,
  antesDoMover + ' -> ' + depoisDoMover
)

const temDesfazer = await page.locator('button', { hasText: 'Desfazer' }).count()
ok('Mover oferece Desfazer no aviso', temDesfazer > 0)
await page.locator('button', { hasText: 'Desfazer' }).first().click()
await page.waitForTimeout(1600)
const depoisDoDesfazer = await page.locator('button[aria-label^="Arquivo "]').count()
ok(
  'Desfazer devolve o item pra pasta de origem',
  depoisDoDesfazer === antesDoMover,
  depoisDoMover + ' -> ' + depoisDoDesfazer
)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— RENOMEAR EM LOTE —')

await ir('#/pastas/Backups')
await page.locator('button[aria-label="Mais opções desta pasta"]').click()
await page.waitForTimeout(400)
await page.locator('text=Selecionar itens').click()
await page.waitForTimeout(500)
await page.locator('button[aria-label="Mais ações para os selecionados"]').click()
await page.waitForTimeout(500)
await page.locator('text=Renomear em lote').click()
await page.waitForTimeout(700)
const folhaLote = page.locator('[role="dialog"]').last()
ok('Renomear em lote mostra a prévia', (await folhaLote.locator('text=Como vai ficar').count()) > 0)
await folhaLote.locator('input').first().fill('Backup Mensal')
await page.waitForTimeout(500)
const previa = (await folhaLote.textContent()) || ''
ok('A prévia reflete o padrão digitado', previa.includes('Backup Mensal 01.zip'))
await folhaLote.locator('button', { hasText: /^Renomear \d/ }).click()
await page.waitForTimeout(1800)
const renomeados = await page.locator('button[aria-label^="Arquivo Backup Mensal"]').count()
ok('Renomear em lote renomeia todos', renomeados === 3, renomeados + ' de 3')

// Nome-base vazio é barrado ANTES de tocar em arquivo.
await page.locator('button[aria-label="Mais opções desta pasta"]').click()
await page.waitForTimeout(400)
await page.locator('text=Selecionar itens').click()
await page.waitForTimeout(500)
await page.locator('button[aria-label="Mais ações para os selecionados"]').click()
await page.waitForTimeout(500)
await page.locator('text=Renomear em lote').click()
await page.waitForTimeout(700)
const folha2 = page.locator('[role="dialog"]').last()
await folha2.locator('input').first().fill('   ')
await page.waitForTimeout(500)
const botaoBloqueado = await folha2.locator('button:disabled', { hasText: /^Renomear \d/ }).count()
ok('Nome-base vazio bloqueia o lote', botaoBloqueado > 0)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— FILTROS DA CATEGORIA —')

await ir('#/categoria/image')
await page.waitForTimeout(2200)
const totalImagens = ((await page.locator('header span').nth(1).textContent()) || '').trim()
await page.locator('button', { hasText: '> 5 MB' }).click()
await page.waitForTimeout(900)
const filtrado = ((await page.locator('header span').nth(1).textContent()) || '').trim()
ok('Filtro de tamanho recorta a lista', filtrado.includes(' de '), totalImagens + ' -> ' + filtrado)
await page.locator('button', { hasText: '> 500 MB' }).click()
await page.waitForTimeout(900)
ok(
  'Recorte sem resultado explica que é o filtro',
  (await page.locator('text=O recorte não deixou nada').count()) > 0
)
await page.locator('button', { hasText: 'Tirar os filtros' }).click()
await page.waitForTimeout(900)
ok(
  'Tirar os filtros devolve a lista inteira',
  (await page.locator('button[aria-label^="Arquivo "]').count()) > 0
)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— ONDE FOI MEU ESPAÇO —')

await ir('#/espaco')
await page.waitForTimeout(2500)
const linhasEspaco = await page.locator('button[aria-expanded]').count()
ok('Ranking lista as pastas de primeiro nível', linhasEspaco >= 5, linhasEspaco + ' pastas')
const primeira = ((await page.locator('button[aria-expanded]').first().textContent()) || '').replace(
  /\s+/g,
  ' '
)
ok(
  'A maior vem primeiro, com tamanho e porcentagem',
  primeira.includes('%') && /(GB|MB)/.test(primeira),
  primeira.slice(0, 60)
)
await page.locator('button[aria-expanded]').first().click()
await page.waitForTimeout(600)
ok(
  'Abrir uma pasta mostra a composição por tipo',
  (await page.locator('button', { hasText: 'Abrir a pasta' }).count()) > 0
)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— LEITOR DE TEXTO —')

await ir('#/pastas')
await page.locator('button[aria-label="Opções de leia-me.txt"]').click()
await page.waitForTimeout(600)
ok('Arquivo de texto oferece "Ler o conteúdo"', (await page.locator('text=Ler o conteúdo').count()) > 0)
await page.locator('text=Ler o conteúdo').first().click()
await page.waitForTimeout(1000)
const conteudo = (await page.locator('pre').first().textContent()) || ''
ok('O leitor mostra o conteúdo de verdade', conteudo.includes('SIMULADA'), conteudo.slice(0, 40))
ok('O leitor avisa que é só leitura', (await page.locator('text=só leitura').count()) > 0)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

await ir('#/pastas/Backups')
await page.locator('button[aria-label^="Opções de "]').first().click()
await page.waitForTimeout(600)
ok(
  'Arquivo não-texto NÃO oferece o leitor',
  (await page.locator('text=Ler o conteúdo').count()) === 0
)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— COMPACTAR EM .ZIP (pela interface) —')

await ir('#/pastas/Documents/Pessoal')
await page.locator('button[aria-label="Mais opções desta pasta"]').click()
await page.waitForTimeout(400)
await page.locator('text=Selecionar itens').click()
await page.waitForTimeout(500)
await page.locator('button[aria-label="Mais ações para os selecionados"]').click()
await page.waitForTimeout(500)
await page.locator('text=Compactar em .zip').click()
await page.waitForTimeout(700)

const folhaZip = page.locator('[role="dialog"]').last()
ok('A folha de compactar avisa que a demonstração não tem conteúdo real',
  (await folhaZip.locator('text=Na demonstração do PC').count()) > 0)
await folhaZip.locator('input[aria-label="Nome do arquivo a criar"]').fill('Pacote Teste')
await page.waitForTimeout(300)
await folhaZip.locator('button', { hasText: 'Compactar' }).click()
await page.waitForTimeout(6000)

const zipCriado = await page.locator('button[aria-label="Arquivo Pacote Teste.zip"]').count()
ok('O .zip aparece na pasta depois de compactar', zipCriado === 1)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— ABRIR E EXTRAIR O .ZIP —')

await page.locator('button[aria-label="Arquivo Pacote Teste.zip"]').click()
await page.waitForTimeout(1500)
const folhaAbrir = page.locator('[role="dialog"]').last()
const textoZip = (await folhaAbrir.textContent()) || ''
ok('Tocar no .zip abre o conteúdo dele, não os detalhes',
  textoZip.includes('descompactado'), textoZip.replace(/\s+/g, ' ').slice(0, 70))
ok('A lista de dentro do .zip mostra os arquivos',
  (await folhaAbrir.locator('text=receita do bolo da vó.txt').count()) > 0)

await folhaAbrir.locator('button', { hasText: /^Extrair \d/ }).click()
await page.waitForTimeout(4000)
await ir('#/pastas/Documents/Pessoal')
ok('Extrair cria uma pasta com o nome do .zip',
  (await page.locator('button[aria-label="Pasta Pacote Teste"]').count()) === 1)

await page.locator('button[aria-label="Pasta Pacote Teste"]').click()
await page.waitForTimeout(900)
const extraidos = await page.locator('button[aria-label^="Arquivo "]').count()
ok('Os arquivos foram extraídos de verdade', extraidos > 0, `${extraidos} arquivos`)

// O conteúdo tem que ter voltado igual: o leia-me extraído deve abrir no leitor.
const temTxt = await page.locator('button[aria-label*=".txt"]').count()
if (temTxt) {
  await page.locator('button[aria-label*=".txt"]').first().click()
  await page.waitForTimeout(900)
  const lido = (await page.locator('pre').first().textContent()) || ''
  ok('O texto extraído do .zip abre e tem conteúdo', lido.length > 20, lido.slice(0, 40))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— GERAR PDF DE IMAGENS —')

await ir('#/pastas/DCIM/Screenshots')
await page.locator('button[aria-label="Mais opções desta pasta"]').click()
await page.waitForTimeout(400)
await page.locator('text=Ordenar por').click()
await page.waitForTimeout(500)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// Seleciona só 3 imagens (gerar 28 páginas levaria minutos na bancada).
for (let i = 0; i < 3; i++) {
  const linha = page.locator('button[aria-label^="Arquivo Screenshot"]').nth(i)
  if (i === 0) {
    const cx = await linha.boundingBox()
    await page.mouse.move(cx.x + cx.width / 2, cx.y + cx.height / 2)
    await page.mouse.down()
    await page.waitForTimeout(650)
    await page.mouse.up()
    await page.waitForTimeout(500)
  } else {
    await linha.click()
    await page.waitForTimeout(300)
  }
}
ok('Três imagens selecionadas',
  /3 itens/.test((await page.locator('[class*=barraSelecaoContagem]').first().textContent()) || ''))

await page.locator('button[aria-label="Mais ações para os selecionados"]').click()
await page.waitForTimeout(500)
await page.locator('text=Gerar PDF').click()
await page.waitForTimeout(700)
const folhaPdf = page.locator('[role="dialog"]').last()
ok('A folha do PDF anuncia o número de páginas',
  ((await folhaPdf.textContent()) || '').includes('3 páginas'))
await folhaPdf.locator('input[aria-label="Nome do arquivo a criar"]').fill('Prints Juntos')
await page.waitForTimeout(300)
await folhaPdf.locator('button', { hasText: /^Gerar$/ }).click()
await page.waitForTimeout(9000)

const pdfCriado = await page.locator('button[aria-label="Arquivo Prints Juntos.pdf"]').count()
ok('O PDF aparece na pasta', pdfCriado === 1)

const infoPdf = (await page.locator('button[aria-label="Arquivo Prints Juntos.pdf"]').textContent()) || ''
ok('O PDF tem tamanho de verdade (não é arquivo vazio)',
  /(KB|MB)/.test(infoPdf), infoPdf.replace(/\s+/g, ' ').slice(0, 50))

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— TRANSFORMAR UM ARQUIVO (texto vira PDF) —')

/** Clica numa opção da folha de transformar/otimizar pelo texto do título. */
const escolher = async (texto) => {
  await folha().locator('button[aria-pressed]', { hasText: texto }).first().click()
  await page.waitForTimeout(350)
}

await ir('#/pastas')
await page.locator('button[aria-label="Opções de leia-me.txt"]').click()
await page.waitForTimeout(600)
ok('O menu de um arquivo oferece "Transformar em…"',
  (await page.locator('text=Transformar em').count()) > 0)

// A descrição da linha lista os formatos de verdade, não uma promessa vaga.
const descricaoTransformar =
  (await page.locator('button', { hasText: 'Transformar em' }).first().textContent()) || ''
ok('A linha já diz em QUE dá pra transformar',
  /PDF/.test(descricaoTransformar), descricaoTransformar.replace(/\s+/g, ' ').slice(0, 60))

await page.locator('text=Transformar em').first().click()
await page.waitForTimeout(700)
const opcoesTxt = (await folha().textContent()) || ''
ok('A folha oferece PDF e ZIP pra um .txt', /PDF/.test(opcoesTxt) && /ZIP/.test(opcoesTxt))
ok('Cada destino declara o preço (exato / reencoda / reformata)',
  /sem perder nada|muda a formatação/.test(opcoesTxt))

await escolher('PDF')
await folha().locator('input[aria-label="Nome do novo arquivo"]').fill('Leia-me impresso')
await page.waitForTimeout(250)
ok('A extensão de destino aparece ao lado do nome',
  ((await folha().textContent()) || '').includes('.pdf'))
await folha().locator('button', { hasText: /^Transformar$/ }).click()
await page.waitForTimeout(5000)
ok('PDF de texto é criado',
  (await page.locator('button[aria-label="Arquivo Leia-me impresso.pdf"]').count()) === 1)

const infoPdfTxt =
  (await page.locator('button[aria-label="Arquivo Leia-me impresso.pdf"]').textContent()) || ''
ok('E não é arquivo vazio', /(KB|MB)/.test(infoPdfTxt), infoPdfTxt.replace(/\s+/g, ' ').slice(0, 40))

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— TRANSFORMAR: a planilha vira JSON —')

await ir('#/pastas/Documents')
await page.locator('button[aria-label="Opções de gastos-do-mes.csv"]').click()
await page.waitForTimeout(600)
await page.locator('text=Transformar em').first().click()
await page.waitForTimeout(700)
ok('Um .csv oferece JSON', ((await folha().textContent()) || '').includes('JSON'))
await escolher('JSON')
await folha().locator('button', { hasText: /^Transformar$/ }).click()
await page.waitForTimeout(3000)
ok('O JSON é criado a partir do CSV',
  (await page.locator('button[aria-label="Arquivo gastos-do-mes.json"]').count()) === 1)

// A prova de que a conversão ACERTOU: abre o JSON e confere o conteúdo —
// separador ";" entendido, campo com vírgula entre aspas preservado.
await page.locator('button[aria-label="Arquivo gastos-do-mes.json"]').click()
await page.waitForTimeout(1500)
const jsonGerado = (await folha().textContent()) || ''
ok('O JSON tem os campos da planilha (o separador ";" foi entendido)',
  /"categoria"/.test(jsonGerado) && /"valor"/.test(jsonGerado))
ok('Campo com vírgula dentro das aspas ficou inteiro',
  /Pão, leite e café/.test(jsonGerado))
await page.keyboard.press('Escape')
await page.waitForTimeout(500)

// E o caminho de volta: JSON embrulhado em {contatos:[…]} vira planilha.
await page.locator('button[aria-label="Opções de contatos-exportados.json"]').click()
await page.waitForTimeout(600)
await page.locator('text=Transformar em').first().click()
await page.waitForTimeout(700)
ok('Um .json oferece CSV (planilha)', ((await folha().textContent()) || '').includes('CSV'))
await escolher('CSV')
await folha().locator('button', { hasText: /^Transformar$/ }).click()
await page.waitForTimeout(3000)
ok('A planilha é criada a partir do JSON embrulhado',
  (await page.locator('button[aria-label="Arquivo contatos-exportados.csv"]').count()) === 1)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— TRANSFORMAR: o que NÃO tem pra onde ir —')

await ir('#/pastas/Backups')
await page.locator('button[aria-label^="Opções de "]').first().click()
await page.waitForTimeout(600)
const menuZip = (await folha().textContent()) || ''
ok('Um .zip não oferece "Transformar em…" (viraria .zip de novo)',
  !/Transformar em/.test(menuZip))
ok('Um .zip oferece "Abrir o .zip"', /Abrir o \.zip/.test(menuZip))
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// Misturar imagem com texto num PDF em lote tem que ser recusado, com motivo.
await ir('#/pastas/Download')
await page.locator('button[aria-label="Mais opções desta pasta"]').click()
await page.waitForTimeout(400)
await page.locator('text=Selecionar itens').click()
await page.waitForTimeout(700)
await page.locator('button[aria-label="Mais ações para os selecionados"]').click()
await page.waitForTimeout(700)
const acaoPdf = page.locator('[role="dialog"]').last().locator('button', { hasText: 'Gerar PDF' })
const desabilitada = await acaoPdf.isDisabled().catch(() => false)
const motivo = (await acaoPdf.textContent()) || ''
ok('Misturar imagem com texto desabilita o PDF e diz por quê',
  desabilitada && /misturar/i.test(motivo),
  motivo.replace(/\s+/g, ' ').slice(0, 70))
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— PROTEGER COM SENHA E ABRIR DE VOLTA —')

const SENHA = 'bolo de fuba da vovo 2026'

await ir('#/pastas/Documents/Pessoal')
await page.locator('button[aria-label="Opções de receita do bolo da vó.txt"]').click()
await page.waitForTimeout(600)
ok('O menu oferece "Proteger com senha"', (await page.locator('text=Proteger com senha').count()) > 0)
await page.locator('text=Proteger com senha').first().click()
await page.waitForTimeout(700)

ok('A tela avisa que senha perdida = arquivo perdido',
  /se você esquecer esta senha/i.test((await folha().textContent()) || ''))

const botaoProteger = folha().locator('button', { hasText: /^Proteger$/ })

// Senha curta: o botão continua travado.
await folha().locator('input[aria-label="Senha"]').fill('123')
await page.waitForTimeout(350)
ok('Senha curta não libera o botão', await botaoProteger.isDisabled())

// Senhas diferentes: também trava, e diz por quê.
await folha().locator('input[aria-label="Senha"]').fill(SENHA)
await folha().locator('input[aria-label="Repita a senha"]').fill(SENHA + '7')
await page.waitForTimeout(400)
ok('Senhas diferentes travam o botão e avisam',
  (await botaoProteger.isDisabled()) && /diferentes/i.test((await folha().textContent()) || ''))

await folha().locator('input[aria-label="Repita a senha"]').fill(SENHA)
await page.waitForTimeout(400)
ok('A força da senha é avaliada na tela',
  /senha\s+forte/i.test(((await folha().textContent()) || '').replace(/\s+/g, ' ')))
ok('Com as duas senhas iguais, o botão libera', !(await botaoProteger.isDisabled()))

await botaoProteger.click()
await page.waitForTimeout(8000)
const protegido = 'receita do bolo da vó.txt.acv'
ok('O arquivo protegido aparece na pasta',
  (await page.locator('button[aria-label="Arquivo ' + protegido + '"]').count()) === 1)
ok('E o original continua lá (não some sem avisar)',
  (await page.locator('button[aria-label="Arquivo receita do bolo da vó.txt"]').count()) === 1)

// Tocar no .acv pede a senha na hora.
await page.locator('button[aria-label="Arquivo ' + protegido + '"]').click()
await page.waitForTimeout(1200)
ok('Tocar no arquivo protegido pede a senha',
  /Abrir arquivo protegido/i.test((await folha().textContent()) || ''))

// Senha errada: erro claro, e nada é gravado.
await folha().locator('input[aria-label="Senha do arquivo"]').fill('senha que nao e a certa')
await page.waitForTimeout(300)
await folha().locator('button', { hasText: /^Abrir$/ }).click()
await page.waitForTimeout(6000)
ok('Senha errada dá erro em português, não lixo',
  /senha errada/i.test((await folha().textContent()) || ''))

// Senha certa: o conteúdo volta com o nome original.
await folha().locator('input[aria-label="Senha do arquivo"]').fill(SENHA)
await page.waitForTimeout(300)
await folha().locator('button', { hasText: /^Abrir$/ }).click()
await page.waitForTimeout(8000)
ok('Com a senha certa, o arquivo volta com o nome original',
  (await page.locator('button[aria-label="Arquivo receita do bolo da vó (2).txt"]').count()) === 1)

// E o conteúdo é o mesmo de antes — a prova final da ida e volta.
await page.locator('button[aria-label="Arquivo receita do bolo da vó (2).txt"]').click()
await page.waitForTimeout(1500)
ok('E o conteúdo é EXATAMENTE o original',
  /se abrir o forno antes dos 30/i.test((await folha().textContent()) || ''))
await page.keyboard.press('Escape')
await page.waitForTimeout(500)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— DEIXAR MAIS LEVE —')

await ir('#/pastas/DCIM/Camera')
const rotuloFoto = await page
  .locator('button[aria-label^="Arquivo IMG"]')
  .first()
  .getAttribute('aria-label')
const nomeFoto = (rotuloFoto || '').replace('Arquivo ', '')
await page.locator('button[aria-label="Opções de ' + nomeFoto + '"]').click()
await page.waitForTimeout(600)
ok('Uma foto oferece "Deixar mais leve"', (await page.locator('text=Deixar mais leve').count()) > 0)
await page.locator('text=Deixar mais leve').first().click()
await page.waitForTimeout(5000)

const textoLeve = ((await folha().textContent()) || '').replace(/\s+/g, ' ')
ok('A tela mostra "agora" e "vai ficar" com números de verdade',
  /agora/i.test(textoLeve) && /vai ficar/i.test(textoLeve) && /(KB|MB)/.test(textoLeve),
  textoLeve.slice(0, 80))
ok('Existem os três níveis de qualidade',
  /Qualidade alta/.test(textoLeve) && /Equilibrado/.test(textoLeve) && /Máxima economia/.test(textoLeve))
ok('A prévia do resultado é exibida',
  (await folha().locator('img[alt="Prévia do resultado"]').count()) === 1)

await folha().locator('button', { hasText: /Deixar mais leve|Gravar assim mesmo/ }).last().click()
await page.waitForTimeout(5000)
const semExt = nomeFoto.replace(/\.[^.]+$/, '')
const leveCriado = await page.locator('button[aria-label^="Arquivo ' + semExt + '-leve."]').count()
ok('O arquivo mais leve é criado ao lado do original', leveCriado === 1, semExt + '-leve.*')
ok('E o original continua intacto',
  (await page.locator('button[aria-label="Arquivo ' + nomeFoto + '"]').count()) === 1)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— A VERSÃO NA TELA É A VERSÃO DE VERDADE —')

// A versão vinha escrita à mão no JSX e envelhecia em silêncio. Agora vem do
// package.json por `define` do Vite — que em desenvolvimento vira um global e
// no build vira texto. São dois caminhos diferentes, então vale conferir.
await ir('#/ajustes')
const textoSobre = ((await page.locator('[class*=sobreVersao]').first().textContent()) || '').trim()
ok(
  'A tela Sobre mostra um número de versão, não um traço',
  /vers[ãa]o\s+\d+\.\d+\.\d+/i.test(textoSobre),
  textoSobre
)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n— VOLTAR EM CAMADAS —')

// 1. Com uma folha aberta, o "voltar" tem que fechar A FOLHA, não navegar.
await ir('#/pastas/Documents/Pessoal')
await page.locator('button[aria-label^="Opções de "]').first().click()
await page.waitForTimeout(600)
await page.keyboard.press('Escape')
await page.waitForTimeout(600)
ok('Fechar a folha não muda de tela',
  page.url().includes('/pastas/Documents/Pessoal') &&
    (await page.locator('[role="dialog"]').count()) === 0)

// 2. Deslizar da borda esquerda sobe UM nível de pasta.
const caixaItem = await page.locator('button[aria-label^="Arquivo "]').first().boundingBox()
const yGesto = caixaItem ? caixaItem.y : 400
await page.mouse.move(4, yGesto)
await page.mouse.down()
await page.mouse.move(40, yGesto, { steps: 4 })
await page.waitForTimeout(150)
const dicaVisivel = await page.locator('[class*=dicaVoltar]').count()
await page.mouse.move(150, yGesto, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(800)
ok('A dica do gesto aparece enquanto o dedo puxa', dicaVisivel === 1)
ok('Deslizar da borda sobe uma pasta',
  page.url().endsWith('/pastas/Documents'), page.url().split('#')[1])

// 3. Rolagem vertical NÃO pode ser confundida com o gesto de voltar.
await ir('#/pastas/DCIM/Camera')
await page.mouse.move(6, 300)
await page.mouse.down()
await page.mouse.move(14, 180, { steps: 6 })
await page.mouse.up()
await page.waitForTimeout(700)
ok('Arrastar pra cima na borda NÃO volta (é rolagem)',
  page.url().includes('/DCIM/Camera'), page.url().split('#')[1])

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=== ERROS DE CONSOLE ===')
if (!erros.size) console.log('nenhum')
else [...erros].forEach((e) => console.log(' ' + e))

const falhas = casos.filter((c) => !c.passou)
console.log(`\n=== ${casos.length - falhas.length}/${casos.length} casos passaram | ${erros.size} erros de console ===`)
if (falhas.length) {
  console.log('FALHAS:')
  falhas.forEach((f) => console.log('  - ' + f.nome + (f.detalhe ? ' :: ' + f.detalhe : '')))
}

await navegador.close()
process.exit(falhas.length || erros.size ? 1 : 0)
