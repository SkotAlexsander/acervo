/**
 * Acha o Playwright, onde quer que ele esteja.
 *
 * O projeto não depende de Playwright em `package.json` de propósito — quem só
 * quer rodar o app não precisa baixar um Chromium de 130 MB. As bancadas
 * procuram uma instalação existente e, se não achar, dizem o que fazer.
 */

const CANDIDATOS = [
  'playwright', // instalado no próprio projeto
  'playwright-core',
]

export async function abrirChromium(opcoes) {
  let ultimo = null
  for (const modulo of CANDIDATOS) {
    try {
      const { chromium } = await import(modulo)
      return { chromium, navegador: await chromium.launch(opcoes || {}) }
    } catch (e) {
      ultimo = e
    }
  }
  console.error(
    '\nPlaywright não encontrado. Instale com:\n' +
      '  npm i -D playwright && npx playwright install chromium\n'
  )
  throw ultimo || new Error('playwright ausente')
}

export const BASE = process.env.ACERVO_URL || 'http://localhost:5173/'

/** Confere se o servidor de desenvolvimento está no ar antes de começar. */
export async function exigirServidor() {
  try {
    const r = await fetch(BASE, { method: 'GET' })
    if (!r.ok) throw new Error('status ' + r.status)
  } catch {
    console.error(
      `\nO app não respondeu em ${BASE}.\n` +
        'Rode `npm run dev` numa outra janela antes de testar.\n'
    )
    process.exit(2)
  }
}
