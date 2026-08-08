import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'

const pacote = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig({
  plugins: [react()],
  // A versão vem do package.json e entra no bundle como constante.
  // Escrita à mão na tela de Ajustes, ela ficava velha em silêncio — e um
  // número de versão errado é pior que nenhum na hora de descobrir qual
  // APK está instalado no aparelho.
  define: { __VERSAO__: JSON.stringify(pacote.version) },
  // base relativa: obrigatório pro Capacitor, que serve os arquivos
  // de dentro do APK (file://) e não da raiz de um servidor.
  base: './',
  server: { host: true, port: 5173 },
  build: { outDir: 'dist', assetsDir: 'assets' },
})
