/**
 * Bancada v2 — só overflow REAL.
 *
 * A v1 acusava as manchas do fundo decorativo. Elas passam da janela de
 * propósito e são recortadas pelo `overflow:hidden` do pai — nunca criam
 * barra de rolagem. Aqui a medição sobe a cadeia de ancestrais e ignora o
 * que está recortado; e mede a rolagem horizontal de VERDADE em cada
 * container rolável.
 */
import { abrirChromium, BASE, exigirServidor } from './navegador.mjs'


/*
  As medidas incluem CELULAR DEITADO e TABLET, não só retrato.

  Deitado é o caso que quebra na prática e ninguém testa: a altura despenca
  pra ~360px, e um app que só foi conferido em pé descobre ali que a folha de
  baixo cobre a tela inteira e o rodapé com os botões sai do campo de visão.
  O 280 é o Galaxy Fold fechado — a menor largura que ainda existe no mundo.
*/
const LARGURAS = [
  { nome: '280', w: 280, h: 653 },
  { nome: '320', w: 320, h: 568 },
  { nome: '360', w: 360, h: 740 },
  { nome: '390', w: 390, h: 844 },
  { nome: '412', w: 412, h: 915 },
  { nome: '768', w: 768, h: 1024 },
  { nome: '1440', w: 1440, h: 900 },
  { nome: 'deitado-740', w: 740, h: 360 },
  { nome: 'deitado-915', w: 915, h: 412 },
  { nome: 'tablet-deitado', w: 1024, h: 768 },
]

const ROTAS = [
  '#/', '#/pastas', '#/pastas/DCIM/Camera', '#/pastas/WhatsApp/Media/WhatsApp Images',
  '#/pastas/Documents', '#/categoria/image', '#/categoria/video', '#/busca?q=relatorio',
  '#/limpeza', '#/espaco', '#/lixeira', '#/ajustes', '#/favoritos',
]

/*
  As FOLHAS também precisam ser medidas.

  Uma bancada que só visita rotas nunca vê o menu de arquivo, a folha de
  transformar nem a de senha — que são justamente as telas com mais texto e
  mais botões lado a lado, o lugar onde 280px de largura estoura primeiro.
  Cada entrada abre a folha pela interface e devolve o controle pra medição.
*/
/*
  As folhas são medidas só onde a medida MUDA de resultado: nas duas larguras
  apertadas, nas duas telas deitadas (onde a altura é o problema) e no tablet.
  Abrir a folha em 1440px custa os mesmos 6 segundos e não pode achar nada que
  a de 280px não tenha achado antes — bancada lenta é bancada que não se roda.
*/
const TAMANHOS_DE_FOLHA = ['280', '320', 'deitado-740', 'deitado-915', '768']

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
      await page.locator(`button[aria-label="Opções de ${(rotulo || '').replace('Arquivo ', '')}"]`).click()
      await page.waitForTimeout(500)
      await page.locator('text=Deixar mais leve').first().click()
      // A folha calcula o resultado de verdade antes de desenhar a balança.
      await page.waitForTimeout(2500)
    },
  },
]

const achados = []
const erros = new Set()

const DETECTOR = `(() => {
  const out = []
  const docW = document.documentElement.clientWidth

  // 1. O documento rola pro lado? Isso é bug, sempre.
  if (document.documentElement.scrollWidth > docW + 1) {
    out.push({ tipo: 'DOC', alvo: 'documento', excesso: document.documentElement.scrollWidth - docW })
  }

  // 2. Container que rola pro lado sem ter sido feito pra isso.
  for (const el of document.querySelectorAll('div, nav, main, section, ul')) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const s = getComputedStyle(el)
      // overflow-x auto/scroll é intencional (trilha, fitas, filtros)
      if (s.overflowX === 'auto' || s.overflowX === 'scroll') continue
      // overflow hidden RECORTA: o conteúdo passa, mas nunca vira barra de
      // rolagem nem empurra nada. É o caso das manchas do fundo decorativo.
      if (s.overflowX === 'hidden' || s.overflowX === 'clip') continue
      out.push({
        tipo: 'ROLAGEM',
        alvo: (el.tagName + '.' + String(el.className || '').split(' ')[0]).slice(0, 55),
        excesso: el.scrollWidth - el.clientWidth,
      })
    }
  }

  // 3. Elemento visível estourando a direita SEM estar recortado por um pai.
  const recortado = (el) => {
    let p = el.parentElement
    while (p && p !== document.body) {
      const s = getComputedStyle(p)
      if (s.overflow !== 'visible' || s.overflowX !== 'visible') return true
      p = p.parentElement
    }
    return false
  }
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (r.right > docW + 1.5 && !recortado(el)) {
      out.push({
        tipo: 'ESTOURO',
        alvo: (el.tagName + '.' + String(el.className || '').split(' ')[0]).slice(0, 55),
        excesso: Math.round(r.right - docW),
      })
    }
  }

  // 4. Texto cortado sem reticências (nome comprido esmagando o layout).
  for (const el of document.querySelectorAll('span, p, h1, h2, h3')) {
    if (el.children.length) continue
    if (el.scrollWidth > el.clientWidth + 2) {
      const s = getComputedStyle(el)
      if (s.textOverflow === 'ellipsis' || s.webkitLineClamp !== 'none') continue
      out.push({
        tipo: 'TEXTO-CORTADO',
        alvo: (String(el.className || '').split(' ')[0] + ' :: ' + el.textContent.trim()).slice(0, 60),
        excesso: el.scrollWidth - el.clientWidth,
      })
    }
  }
  return out
})()`

await exigirServidor()
const { navegador } = await abrirChromium()

for (const tema of ['claro', 'escuro']) {
  for (const larg of LARGURAS) {
    const ctx = await navegador.newContext({
      viewport: { width: larg.w, height: larg.h },
      colorScheme: tema === 'escuro' ? 'dark' : 'light',
      locale: 'pt-BR',
    })
    const page = await ctx.newPage()
    page.on('console', (m) => m.type() === 'error' && erros.add(m.text().slice(0, 200)))
    page.on('pageerror', (e) => erros.add('PAGEERROR ' + e.message))

    for (const rota of ROTAS) {
      await page.goto(BASE + rota, { waitUntil: 'networkidle' })
      await page.waitForTimeout(420)
      const r = await page.evaluate(DETECTOR)
      for (const p of r) {
        achados.push(`${p.tipo} | ${tema} ${larg.nome}px | ${rota} | ${p.alvo} (+${p.excesso}px)`)
      }
    }

    // Tema escuro não muda geometria: medir folha nos dois dobraria o tempo
    // pra achar exatamente os mesmos pixels. O relatório já junta os temas.
    for (const folha of tema === 'claro' && TAMANHOS_DE_FOLHA.includes(larg.nome) ? FOLHAS : []) {
      // Fecha o que ficou aberto do caso anterior ANTES de navegar.
      //
      // `goto` pra uma URL que só muda o `#` NÃO recarrega o documento — a
      // folha anterior continua montada e o véu dela engole todo clique. O
      // sintoma é "o botão não é clicável", que aponta pro lugar errado: na
      // primeira vez, 15 folhas foram reportadas como "não abriu" e o defeito
      // era do roteiro, não do app.
      for (let i = 0; i < 4; i++) {
        if ((await page.locator('[role="dialog"]').count()) === 0) break
        await page.keyboard.press('Escape')
        await page.waitForTimeout(250)
      }
      await page.goto(BASE + folha.rota, { waitUntil: 'networkidle' })
      await page.waitForTimeout(700)
      try {
        await folha.abrir(page)
        await page.waitForTimeout(700)
      } catch (e) {
        // Não abriu? Isso é achado, não motivo pra pular em silêncio — uma
        // folha que não abre em 320px é exatamente o que a bancada procura.
        achados.push(
          `NAO-ABRIU | ${tema} ${larg.nome}px | folha:${folha.nome} | ${String(e.message).slice(0, 60)} (+0px)`
        )
        continue
      }
      const r = await page.evaluate(DETECTOR)
      for (const p of r) {
        achados.push(
          `${p.tipo} | ${tema} ${larg.nome}px | folha:${folha.nome} | ${p.alvo} (+${p.excesso}px)`
        )
      }
      // O rodapé com os botões precisa estar DENTRO da janela. Numa tela
      // deitada de 360px de altura é o primeiro a sair pra baixo, e a pessoa
      // fica sem como confirmar nem cancelar.
      const rodapeOk = await page.evaluate(() => {
        const painel = document.querySelector('[role="dialog"]')
        if (!painel) return true
        const botoes = [...painel.querySelectorAll('button')].filter(
          (b) => /confirmar|cancelar|transformar|proteger|abrir|gerar|compactar|deixar mais leve|gravar/i.test(b.textContent || '')
        )
        if (!botoes.length) return true
        const alt = window.innerHeight
        return botoes.some((b) => {
          const r = b.getBoundingClientRect()
          return r.bottom <= alt + 1 && r.top >= -1 && r.height > 0
        })
      })
      if (!rodapeOk) {
        achados.push(
          `BOTAO-FORA-DA-TELA | ${tema} ${larg.nome}px | folha:${folha.nome} | rodapé inalcançável (+0px)`
        )
      }
    }

    await ctx.close()
  }
}

const unicos = [...new Set(achados.map((a) => a.replace(/\| (claro|escuro) /, '| ')))]
console.log('=== ACHADOS DE LAYOUT ===')
if (!unicos.length) console.log('nenhum')
else unicos.forEach((a) => console.log(' ' + a))

console.log('\n=== ERROS DE CONSOLE ===')
if (!erros.size) console.log('nenhum')
else [...erros].forEach((e) => console.log(' ' + e))

console.log(`\n=== ${unicos.length} achados | ${erros.size} erros ===`)
await navegador.close()
