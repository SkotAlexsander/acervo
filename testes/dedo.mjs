/**
 * Bancada de DEDO — alvos de toque, contraste e teclado.
 *
 * Um app de celular se usa com o polegar. Botão de 28px é onde o toque erra,
 * e "erra" num app de arquivos pode significar apagar o item errado.
 */
import { abrirChromium, BASE, exigirServidor } from './navegador.mjs'

const ROTAS = ['#/', '#/pastas', '#/pastas/DCIM/Camera', '#/categoria/image',
  '#/busca?q=relatorio', '#/limpeza', '#/espaco', '#/lixeira', '#/ajustes', '#/favoritos']

/*
  As folhas entram na medição pelo mesmo motivo que entraram na bancada de
  layout: é nelas que moram as caixas de marcar, o olho de mostrar a senha e
  as listas de opção — os controles mais fáceis de deixar pequenos, porque
  parecem "detalhe".
*/
const FOLHAS = [
  {
    nome: 'menu-do-arquivo',
    rota: '#/pastas',
    abrir: async (page) => {
      await page.locator('button[aria-label="Opções de leia-me.txt"]').click()
    },
  },
  {
    nome: 'transformar',
    rota: '#/pastas',
    abrir: async (page) => {
      await page.locator('button[aria-label="Opções de leia-me.txt"]').click()
      await page.waitForTimeout(500)
      await page.locator('text=Transformar em').first().click()
      await page.waitForTimeout(500)
      await page
        .locator('[role="dialog"]')
        .last()
        .locator('button[aria-pressed]', { hasText: 'PDF' })
        .first()
        .click()
    },
  },
  {
    nome: 'proteger-com-senha',
    rota: '#/pastas',
    abrir: async (page) => {
      await page.locator('button[aria-label="Opções de leia-me.txt"]').click()
      await page.waitForTimeout(500)
      await page.locator('text=Proteger com senha').first().click()
    },
  },
  {
    nome: 'mais-leve',
    rota: '#/pastas/DCIM/Camera',
    abrir: async (page) => {
      const rotulo = await page
        .locator('button[aria-label^="Arquivo IMG"]')
        .first()
        .getAttribute('aria-label')
      await page
        .locator(`button[aria-label="Opções de ${(rotulo || '').replace('Arquivo ', '')}"]`)
        .click()
      await page.waitForTimeout(500)
      await page.locator('text=Deixar mais leve').first().click()
      await page.waitForTimeout(3500)
    },
  },
]

const MIN = 40 // tolerância: alvo abaixo disso é difícil de acertar com o dedo

/**
 * Exceções DECIDIDAS, com o motivo escrito.
 *
 * Uma lista assim é perigosa: vira o lugar onde se varre problema pra debaixo do
 * tapete. Por isso são só duas entradas, cada uma com o porquê, e o relatório
 * continua listando as duas em separado em vez de escondê-las.
 */
const ACEITOS = [
  {
    classe: 'trilhaBotao',
    minAltura: 34,
    motivo:
      'Trilha de navegação: 36px. Subir pra 44 daria uma barra de 60px de puro ' +
      'enfeite no topo de toda pasta. É navegação densa e secundária — o botão ' +
      '"voltar" ao lado, esse sim, tem 44.',
  },
  {
    classe: 'fichaOrdem',
    minAltura: 34,
    motivo:
      'Mora na MESMA barra da trilha e acompanha a altura dela (36px). Fazer ' +
      'só ela crescer desalinharia a barra; fazer a barra inteira crescer custa ' +
      '8px de altura em toda pasta por um controle secundário.',
  },
  {
    classe: 'buscaLimpar',
    minAltura: 32,
    motivo:
      'O "x" de limpar mora DENTRO do campo de busca, que tem 44px e é o alvo ' +
      'principal. 34px é o tamanho que iOS e Android usam pro mesmo controle.',
  },
]

// `includes`, não `startsWith`: CSS Modules embaralha a classe pra
// `_trilhaBotao_1x2vl_281`, com prefixo e sufixo gerados.
const aceito = (p) =>
  ACEITOS.some((a) => String(p.classe || '').includes(a.classe) && p.h >= a.minAltura)

const problemas = []
const aceitos = []
await exigirServidor()
const { navegador } = await abrirChromium()
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'pt-BR' })
const page = await ctx.newPage()

const MEDIDOR = (min) => {
  const out = []
  for (const el of document.querySelectorAll(
    'button, a[href], [role="button"], [role="switch"], [role="radio"], [role="checkbox"], input'
  )) {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    const s = getComputedStyle(el)
    if (s.visibility === 'hidden' || s.opacity === '0') continue
    // Um alvo pequeno DENTRO de um alvo grande (o "x" da busca, por ex.)
    // não é problema: o dedo acerta o pai. `label` conta como pai clicável —
    // clicar no texto de um rótulo aciona o controle dele.
    const paiClicavel = el.parentElement?.closest('button, a[href], [role="button"], label')
    if (paiClicavel) continue
    if (r.height < min || r.width < min) {
      out.push({
        tag: el.tagName,
        classe: String(el.className || '').split(' ')[0].slice(0, 34),
        rotulo: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 26),
        w: Math.round(r.width),
        h: Math.round(r.height),
      })
    }
  }
  return out
}

const registrar = (onde, lista) => {
  for (const p of lista) {
    const linha = `${onde} → ${p.classe || p.tag} "${p.rotulo}" ${p.w}x${p.h}`
    if (aceito(p)) aceitos.push(linha)
    else problemas.push(linha)
  }
}

for (const rota of ROTAS) {
  await page.goto(BASE + rota, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  registrar(rota, await page.evaluate(MEDIDOR, MIN))
}

for (const folha of FOLHAS) {
  // Fecha o que ficou aberto do caso anterior ANTES de navegar.
  //
  // `goto` pra uma URL que só muda o `#` NÃO recarrega o documento — a folha
  // anterior continua montada e o véu dela engole todo clique seguinte. O
  // erro aparece como "o botão não é clicável", que aponta pro lugar errado.
  for (let i = 0; i < 4; i++) {
    if ((await page.locator('[role="dialog"]').count()) === 0) break
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
  }
  await page.goto(BASE + folha.rota, { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  await folha.abrir(page)
  await page.waitForTimeout(700)
  // Só o que está DENTRO da folha: o que está atrás dela já foi medido acima,
  // e contar duas vezes só faria o relatório mentir sobre o tamanho do problema.
  const dentro = await page.evaluate((min) => {
    const painel = document.querySelector('[role="dialog"]')
    if (!painel) return []
    const out = []
    for (const el of painel.querySelectorAll(
      'button, a[href], [role="button"], [role="switch"], [role="radio"], [role="checkbox"], input'
    )) {
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) continue
      const s = getComputedStyle(el)
      if (s.visibility === 'hidden' || s.opacity === '0') continue
      const pai = el.parentElement?.closest('button, a[href], [role="button"], label')
      if (pai && pai !== el) continue
      if (r.height < min || r.width < min) {
        out.push({
          tag: el.tagName,
          classe: String(el.className || '').split(' ')[0].slice(0, 34),
          rotulo: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 26),
          w: Math.round(r.width),
          h: Math.round(r.height),
        })
      }
    }
    return out
  }, MIN)
  registrar('folha:' + folha.nome, dentro)
}

// Navegação por teclado: dá pra chegar nos controles principais?
//
// Fecha a última folha ANTES de medir: o Tab dentro de uma folha aberta fica
// preso nela de propósito (é o comportamento certo de um modal), e o
// relatório sairia listando os botões da folha em vez dos da tela.
for (let i = 0; i < 4; i++) {
  if ((await page.locator('[role="dialog"]').count()) === 0) break
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
}
await page.goto(BASE + '#/pastas', { waitUntil: 'networkidle' })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(600)
const foco = []
for (let i = 0; i < 8; i++) {
  await page.keyboard.press('Tab')
  const info = await page.evaluate(() => {
    const a = document.activeElement
    if (!a) return 'nada'
    const anel = getComputedStyle(a).outlineWidth
    return `${a.tagName}:${(a.getAttribute('aria-label') || a.textContent || '').trim().slice(0, 26)} [anel ${anel}]`
  })
  foco.push(info)
}

if (aceitos.length) {
  console.log('=== ABAIXO DE ' + MIN + 'px, MAS DECIDIDOS ASSIM ===')
  ;[...new Set(aceitos)].forEach((a) => console.log(' ' + a))
  ACEITOS.forEach((a) => console.log(`   · ${a.classe}: ${a.motivo}`))
  console.log('')
}

console.log('=== ALVOS DE TOQUE ABAIXO DE ' + MIN + 'px ===')
if (!problemas.length) console.log('nenhum')
else [...new Set(problemas)].forEach((p) => console.log(' ' + p))

console.log('\n=== ORDEM DE FOCO (8 Tabs a partir de /pastas) ===')
foco.forEach((f, i) => console.log(` ${i + 1}. ${f}`))

console.log(`\n=== ${new Set(problemas).size} alvos pequenos ===`)
await navegador.close()
