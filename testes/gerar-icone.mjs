/**
 * Gera os ícones do app Android a partir do desenho do próprio projeto.
 *
 * O Capacitor cria o APK com um logo genérico dele. Este script desenha o selo
 * do Acervo (a pasta sobre o roxo da marca) num canvas e exporta os PNG em
 * todas as densidades que o Android pede — inclusive as camadas separadas do
 * ícone adaptativo, que é o formato que o Android 8+ usa pra recortar o ícone
 * na forma que cada fabricante escolheu (círculo, quadrado, gota…).
 *
 *   node testes/gerar-icone.mjs
 *
 * Não precisa do servidor de desenvolvimento — desenha numa página em branco.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { abrirChromium } from './navegador.mjs'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const RES = path.join(RAIZ, 'android', 'app', 'src', 'main', 'res')

// mipmap-<densidade> → tamanho do ícone legado (px)
const DENSIDADES = [
  ['mdpi', 48],
  ['hdpi', 72],
  ['xhdpi', 96],
  ['xxhdpi', 144],
  ['xxxhdpi', 192],
]

// A camada de frente do ícone adaptativo é 108dp, mas só os 72dp centrais
// aparecem sempre — o resto é margem que o sistema pode recortar.
const ADAPTATIVO = DENSIDADES.map(([d, tam]) => [d, Math.round((tam * 108) / 48)])

const DESENHO = `
(tamanho, camada) => {
  const c = document.createElement('canvas')
  c.width = tamanho
  c.height = tamanho
  const x = c.getContext('2d')
  const u = tamanho / 100 // tudo em "por cento do lado", pra escalar sozinho

  if (camada !== 'frente') {
    // Fundo: o roxo da marca, com um brilho no alto pra não ficar chapado.
    const g = x.createLinearGradient(0, 0, tamanho, tamanho)
    g.addColorStop(0, '#6f6ff0')
    g.addColorStop(1, '#4a4ac4')
    x.fillStyle = g
    x.fillRect(0, 0, tamanho, tamanho)
    const brilho = x.createRadialGradient(
      tamanho * 0.3, tamanho * 0.22, 0,
      tamanho * 0.3, tamanho * 0.22, tamanho * 0.7
    )
    brilho.addColorStop(0, 'rgba(255,255,255,.28)')
    brilho.addColorStop(1, 'rgba(255,255,255,0)')
    x.fillStyle = brilho
    x.fillRect(0, 0, tamanho, tamanho)
  }

  if (camada !== 'fundo') {
    // A pasta: o mesmo traço do ícone "pasta" do app, desenhado em escala.
    // No adaptativo o desenho ocupa a área central segura (66% do lado).
    const escala = camada === 'frente' ? 0.44 : 0.62
    const lado = tamanho * escala
    const ox = (tamanho - lado) / 2
    const oy = (tamanho - lado) / 2

    x.save()
    x.translate(ox, oy)
    x.scale(lado / 24, lado / 24)
    x.strokeStyle = '#ffffff'
    x.lineWidth = 1.9
    x.lineJoin = 'round'
    x.lineCap = 'round'
    x.beginPath()
    // path idêntico ao ícone 'pasta' de src/components/Icone.jsx
    x.moveTo(3, 7.5)
    x.bezierCurveTo(3, 6.67, 3.67, 6, 4.5, 6)
    x.lineTo(8.5, 6)
    x.lineTo(10.5, 8.5)
    x.lineTo(19.5, 8.5)
    x.bezierCurveTo(20.33, 8.5, 21, 9.17, 21, 10)
    x.lineTo(21, 18)
    x.bezierCurveTo(21, 18.83, 20.33, 19.5, 19.5, 19.5)
    x.lineTo(4.5, 19.5)
    x.bezierCurveTo(3.67, 19.5, 3, 18.83, 3, 18)
    x.closePath()
    x.stroke()
    x.restore()
  }

  return c.toDataURL('image/png')
}
`

const { navegador } = await abrirChromium()
const page = await (await navegador.newContext({ deviceScaleFactor: 1 })).newPage()
await page.setContent('<!doctype html><body style="margin:0">')
await page.evaluate(`window.__desenhar = ${DESENHO}`)

const gravar = async (destino, tamanho, camada) => {
  const dataUrl = await page.evaluate(
    ([t, c]) => window.__desenhar(t, c),
    [tamanho, camada]
  )
  const bytes = Buffer.from(dataUrl.split(',')[1], 'base64')
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  fs.writeFileSync(destino, bytes)
  return bytes.length
}

let total = 0
for (const [dens, tam] of DENSIDADES) {
  const dir = path.join(RES, `mipmap-${dens}`)
  total += await gravar(path.join(dir, 'ic_launcher.png'), tam, 'tudo')
  total += await gravar(path.join(dir, 'ic_launcher_round.png'), tam, 'tudo')
}
for (const [dens, tam] of ADAPTATIVO) {
  const dir = path.join(RES, `mipmap-${dens}`)
  total += await gravar(path.join(dir, 'ic_launcher_foreground.png'), tam, 'frente')
  total += await gravar(path.join(dir, 'ic_launcher_background.png'), tam, 'fundo')
}

// O XML do ícone adaptativo passa a apontar pras duas camadas em PNG.
const xml = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
`
for (const nome of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
  const destino = path.join(RES, 'mipmap-anydpi-v26', nome)
  fs.mkdirSync(path.dirname(destino), { recursive: true })
  fs.writeFileSync(destino, xml)
}

// A tela de abertura usa a mesma cor de fundo do ícone.
const cores = path.join(RES, 'values', 'colors.xml')
if (fs.existsSync(cores)) {
  let c = fs.readFileSync(cores, 'utf8')
  c = c.replace(/(<color name="colorPrimary">)[^<]*/, '$1#5B5BD6')
  c = c.replace(/(<color name="colorPrimaryDark">)[^<]*/, '$1#4A4AC4')
  c = c.replace(/(<color name="colorAccent">)[^<]*/, '$1#5B5BD6')
  fs.writeFileSync(cores, c)
}

console.log(`ícones gerados: ${(DENSIDADES.length * 2 + ADAPTATIVO.length * 2)} PNG, ${(total / 1024).toFixed(0)} KB no total`)
await navegador.close()
