/**
 * Prepara o aparelho/emulador pra bancada: cria uma árvore de arquivos
 * plausível em /sdcard.
 *
 * O detalhe que importa: as imagens são **JPEG de verdade**, geradas no
 * Chromium. Na primeira tentativa foram bytes aleatórios com nome `.jpg`, e o
 * gerador de PDF recusou — corretamente, porque não eram imagens. Teste com
 * dado falso demais reprova o código certo.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { abrirChromium } from './navegador.mjs'

const ADB = process.env.ADB || 'A:\\Dev\\Android\\Sdk\\platform-tools\\adb.exe'
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8', windowsHide: true })

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'acervo-fotos-'))

// ─── Imagens de verdade ─────────────────────────────────────────────────────

const { navegador } = await abrirChromium()
const page = await (await navegador.newContext()).newPage()
await page.setContent('<!doctype html><body style="margin:0">')

const CORES = [
  ['#e5537a', '#7c5cff', 1200, 900],
  ['#1e88d6', '#0d9488', 900, 1200],
  ['#d97706', '#4d9a1f', 1600, 1200],
  ['#5b5bd6', '#e5537a', 1080, 1920],
]

for (let i = 0; i < CORES.length; i++) {
  const [a, b, l, alt] = CORES[i]
  const dataUrl = await page.evaluate(
    ([ca, cb, larg, altu, n]) => {
      const c = document.createElement('canvas')
      c.width = larg
      c.height = altu
      const x = c.getContext('2d')
      const g = x.createLinearGradient(0, 0, larg, altu)
      g.addColorStop(0, ca)
      g.addColorStop(1, cb)
      x.fillStyle = g
      x.fillRect(0, 0, larg, altu)
      x.fillStyle = 'rgba(255,255,255,.9)'
      x.font = `${Math.round(larg / 12)}px sans-serif`
      x.textAlign = 'center'
      x.fillText('FOTO ' + n, larg / 2, altu / 2)
      return c.toDataURL('image/jpeg', 0.85)
    },
    [a, b, l, alt, i + 1]
  )
  const arq = path.join(TMP, `IMG_2026080${i + 1}_120000.jpg`)
  fs.writeFileSync(arq, Buffer.from(dataUrl.split(',')[1], 'base64'))
}
await navegador.close()

// ─── Envia pro aparelho ─────────────────────────────────────────────────────

console.log('limpando e populando /sdcard…')
adb('shell', 'rm -rf /sdcard/DCIM/Camera /sdcard/DCIM/Screenshots /sdcard/.Acervo')
adb('shell', 'mkdir -p /sdcard/DCIM/Camera /sdcard/DCIM/Screenshots /sdcard/Download /sdcard/Documents /sdcard/Music /sdcard/Movies')

for (const f of fs.readdirSync(TMP)) {
  adb('push', path.join(TMP, f), `/sdcard/DCIM/Camera/${f}`)
}

// Um texto de verdade, pro leitor e pro PDF de texto.
const txt = path.join(TMP, 'leia-me.txt')
fs.writeFileSync(
  txt,
  'Acervo rodando no Android de verdade.\n' +
    'Acentuação: ção, ãõ, ê, ü — tem que sair inteira.\n' +
    'Linha 3.\n'
)
adb('push', txt, '/sdcard/Download/leia-me.txt')

// Arquivos "pesados" só pra ocupar espaço — conteúdo não importa aqui.
adb('shell', 'dd if=/dev/urandom of=/sdcard/Download/manual-do-usuario.pdf bs=1024 count=800 2>/dev/null')
adb('shell', 'dd if=/dev/urandom of=/sdcard/Download/instalador.apk bs=1024 count=15000 2>/dev/null')
adb('shell', 'dd if=/dev/urandom of=/sdcard/Music/musica-longa.mp3 bs=1024 count=4200 2>/dev/null')
adb('shell', 'dd if=/dev/urandom of=/sdcard/Movies/video-grande.mp4 bs=1024 count=120000 2>/dev/null')
adb('shell', 'dd if=/dev/urandom of=/sdcard/Documents/contrato.pdf bs=1024 count=350 2>/dev/null')
// Duplicado de propósito: mesmo nome e tamanho em pasta diferente.
adb('shell', 'cp /sdcard/Documents/contrato.pdf /sdcard/Download/contrato.pdf')

console.log(adb('shell', 'ls -l /sdcard/DCIM/Camera'))
fs.rmSync(TMP, { recursive: true, force: true })
console.log('aparelho preparado')
