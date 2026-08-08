/**
 * A permissão de "Acesso a todos os arquivos" do Android.
 *
 * Desde o Android 11 ela não se pede por diálogo — só se PODE levar o usuário
 * à tela de configurações e conferir depois. O lado nativo disso está em
 * `android/app/src/main/java/br/pessoal/acervo/AcessoArquivos.java`.
 *
 * No navegador do PC nada disso existe, e a função devolve "concedida" — a
 * demonstração não depende de permissão nenhuma.
 */

import { ehAparelho } from './index.js'

let plugin = null

/**
 * Devolve o plugin DENTRO de um objeto — e isso não é frescura.
 *
 * `registerPlugin` devolve um **Proxy** que transforma qualquer acesso a
 * propriedade numa chamada nativa. Devolver esse proxy direto de uma função
 * `async` faz o próprio JavaScript sondar `.then` nele pra saber se é uma
 * promessa — o proxy interpreta isso como "chame o método then() no Android",
 * que não existe, e a promessa rejeita com:
 *
 *     "AcessoArquivos.then()" is not implemented on android
 *
 * O app ficava preso na tela de abertura por causa disso, e o erro só aparece
 * no aparelho: no navegador o plugin nem é criado. Embrulhar num objeto comum
 * resolve — o `await` sonda o `.then` do objeto, não o do proxy.
 */
async function obterPlugin() {
  if (plugin) return { p: plugin }
  if (!ehAparelho()) return { p: null }
  try {
    const { registerPlugin } = await import('@capacitor/core')
    plugin = registerPlugin('AcessoArquivos')
    return { p: plugin }
  } catch {
    return { p: null }
  }
}

/**
 * @returns {Promise<{concedida: boolean, precisaConfiguracoes: boolean, versaoAndroid: number}>}
 */
export async function verificarPermissao() {
  const { p } = await obterPlugin()
  if (!p) return { concedida: true, precisaConfiguracoes: false, versaoAndroid: 0 }
  try {
    return await p.verificar()
  } catch {
    // Plugin ausente (build antigo): não trava o app — deixa tentar ler e
    // falhar com a mensagem do provider, que já é clara.
    return { concedida: true, precisaConfiguracoes: false, versaoAndroid: 0 }
  }
}

/** Abre a tela de configurações onde a permissão é concedida. */
export async function abrirConfiguracoesDePermissao() {
  const { p } = await obterPlugin()
  if (!p) return { aberto: false, concedida: true }
  try {
    return await p.abrirConfiguracoes()
  } catch (e) {
    return { aberto: false, concedida: false, erro: (e && e.message) || 'falhou' }
  }
}
