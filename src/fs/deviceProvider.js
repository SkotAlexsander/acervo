/**
 * Provider REAL — lê e escreve os arquivos do aparelho, via Capacitor.
 *
 * Só entra em cena quando o app roda dentro do APK. No navegador do PC ele
 * nem é carregado (ver index.js), então nada aqui quebra o preview.
 *
 * Escopo: `Directory.ExternalStorage`, que no Android é /storage/emulated/0 —
 * a "memória interna" que o usuário enxerga. Para ler a árvore inteira o app
 * precisa da permissão MANAGE_EXTERNAL_STORAGE (ver docs/android.md).
 */

import { Filesystem, Directory } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'
import { normalize, join, parentOf, baseName, extOf, uniqueName, isInside } from './util.js'

const RAIZ = Directory.ExternalStorage

/** O plugin quer caminho SEM a barra inicial; o app usa COM. Este é o tradutor. */
const paraPlugin = (p) => normalize(p).replace(/^\//, '')

function traduzirErro(e, contexto) {
  const msg = String((e && (e.message || e.errorMessage)) || e || '')
  if (/permission|denied|EACCES/i.test(msg)) {
    return new Error(
      'O Android bloqueou o acesso. Abra Ajustes → Aplicativos → Acervo → ' +
        'Permissões e ligue "Acesso a todos os arquivos".'
    )
  }
  if (/not exist|ENOENT|does not exist|File does not exist/i.test(msg)) {
    return new Error('Esse item não existe mais — ele pode ter sido apagado por outro app.')
  }
  if (/exists|EEXIST/i.test(msg)) return new Error('Já existe um item com esse nome nesta pasta.')
  if (/ENOTEMPTY|not empty/i.test(msg)) return new Error('A pasta não está vazia.')
  if (/ENOSPC|no space|storage.*full|insufficient/i.test(msg)) {
    return new Error(
      'O armazenamento está cheio. Libere espaço em Limpeza (a lixeira também ocupa) e tente de novo.'
    )
  }
  if (/EROFS|read-only/i.test(msg)) {
    return new Error('Essa pasta é somente leitura — o Android não deixa gravar nela.')
  }
  if (/EISDIR|is a directory/i.test(msg)) return new Error('Isso é uma pasta, não um arquivo.')
  if (/name too long|ENAMETOOLONG/i.test(msg)) return new Error('O nome ficou longo demais.')
  return new Error((contexto ? contexto + ': ' : '') + (msg || 'erro desconhecido'))
}

/**
 * base64 → bytes, e volta.
 *
 * `atob`/`btoa` não aceitam string gigante de uma vez em WebView (estouram a
 * pilha ao espalhar o argumento), por isso a ida é feita em fatias.
 */
function base64ParaBytes(b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function bytesParaBase64(bytes) {
  const FATIA = 0x8000
  let bin = ''
  for (let i = 0; i < bytes.length; i += FATIA) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + FATIA))
  }
  return btoa(bin)
}

function paraEntrada(item, dirPai) {
  const nome = item.name
  const isDir = item.type === 'directory'
  return {
    path: join(dirPai, nome),
    name: nome,
    isDir,
    size: isDir ? 0 : Number(item.size) || 0,
    mtime: Number(item.mtime) || 0,
    ext: isDir ? '' : extOf(nome),
    uri: item.uri || null,
  }
}

export const deviceProvider = {
  id: 'device',
  label: 'Armazenamento interno',
  realFiles: true,
  // Aqui `readBytes` devolve o arquivo de verdade — o oposto da demonstração.
  conteudoReal: true,

  async init() {
    // Confere logo de cara se dá pra ler a raiz. Falhar aqui, com mensagem
    // clara, é muito melhor do que o app abrir vazio e o usuário achar que
    // o celular não tem arquivo nenhum.
    try {
      await Filesystem.readdir({ path: '', directory: RAIZ })
    } catch (e) {
      throw traduzirErro(e, 'não consegui ler o armazenamento')
    }
  },

  async list(path) {
    try {
      const r = await Filesystem.readdir({ path: paraPlugin(path), directory: RAIZ })
      const dir = normalize(path)
      return (r.files || []).map((f) => paraEntrada(f, dir))
    } catch (e) {
      throw traduzirErro(e, 'não consegui abrir a pasta')
    }
  },

  async stat(path) {
    try {
      const s = await Filesystem.stat({ path: paraPlugin(path), directory: RAIZ })
      const p = normalize(path)
      const isDir = s.type === 'directory'
      return {
        path: p,
        name: baseName(p),
        isDir,
        size: isDir ? 0 : Number(s.size) || 0,
        mtime: Number(s.mtime) || 0,
        ext: isDir ? '' : extOf(baseName(p)),
        uri: s.uri || null,
      }
    } catch {
      return null
    }
  },

  async _nomesEm(dir) {
    try {
      const r = await Filesystem.readdir({ path: paraPlugin(dir), directory: RAIZ })
      return new Set((r.files || []).map((f) => f.name))
    } catch {
      return new Set()
    }
  },

  async rename(path, novoNome) {
    const p = normalize(path)
    const destino = join(parentOf(p), novoNome)
    if (destino === p) return p
    const usados = await this._nomesEm(parentOf(p))
    if (usados.has(novoNome)) throw new Error(`Já existe "${novoNome}" nesta pasta.`)
    try {
      await Filesystem.rename({
        from: paraPlugin(p),
        to: paraPlugin(destino),
        directory: RAIZ,
        toDirectory: RAIZ,
      })
      return destino
    } catch (e) {
      throw traduzirErro(e, 'não consegui renomear')
    }
  },

  async move(paths, destDir) {
    const destino = normalize(destDir)
    const usados = await this._nomesEm(destino)
    const finais = []
    for (const bruto of paths) {
      const p = normalize(bruto)
      if (parentOf(p) === destino) {
        finais.push(p)
        continue
      }
      if (isInside(destino, p)) throw new Error(`Não dá pra mover "${baseName(p)}" pra dentro dela mesma.`)
      const nome = uniqueName(baseName(p), usados)
      usados.add(nome)
      const alvo = join(destino, nome)
      try {
        await Filesystem.rename({
          from: paraPlugin(p),
          to: paraPlugin(alvo),
          directory: RAIZ,
          toDirectory: RAIZ,
        })
        finais.push(alvo)
      } catch (e) {
        throw traduzirErro(e, `não consegui mover "${baseName(p)}"`)
      }
    }
    return finais
  },

  async copy(paths, destDir) {
    const destino = normalize(destDir)
    const usados = await this._nomesEm(destino)
    const finais = []
    for (const bruto of paths) {
      const p = normalize(bruto)
      if (isInside(destino, p)) throw new Error(`Não dá pra copiar "${baseName(p)}" pra dentro dela mesma.`)
      const nome = uniqueName(baseName(p), usados)
      usados.add(nome)
      const alvo = join(destino, nome)
      try {
        await Filesystem.copy({
          from: paraPlugin(p),
          to: paraPlugin(alvo),
          directory: RAIZ,
          toDirectory: RAIZ,
        })
        finais.push(alvo)
      } catch (e) {
        throw traduzirErro(e, `não consegui copiar "${baseName(p)}"`)
      }
    }
    return finais
  },

  async remove(paths) {
    for (const bruto of paths) {
      const p = normalize(bruto)
      const info = await this.stat(p)
      if (!info) continue
      try {
        if (info.isDir) {
          await Filesystem.rmdir({ path: paraPlugin(p), directory: RAIZ, recursive: true })
        } else {
          await Filesystem.deleteFile({ path: paraPlugin(p), directory: RAIZ })
        }
      } catch (e) {
        throw traduzirErro(e, `não consegui apagar "${info.name}"`)
      }
    }
  },

  async mkdir(parent, nome) {
    const usados = await this._nomesEm(parent)
    const livre = uniqueName(nome, usados)
    const p = join(parent, livre)
    try {
      await Filesystem.mkdir({ path: paraPlugin(p), directory: RAIZ, recursive: true })
      return p
    } catch (e) {
      throw traduzirErro(e, 'não consegui criar a pasta')
    }
  },

  async readText(path) {
    try {
      const r = await Filesystem.readFile({
        path: paraPlugin(path),
        directory: RAIZ,
        encoding: 'utf8',
      })
      return typeof r.data === 'string' ? r.data : null
    } catch {
      return null
    }
  },

  async writeText(path, texto) {
    try {
      await Filesystem.writeFile({
        path: paraPlugin(path),
        directory: RAIZ,
        data: texto,
        encoding: 'utf8',
        recursive: true,
      })
    } catch (e) {
      throw traduzirErro(e, 'não consegui gravar o arquivo')
    }
  },

  /**
   * Lê os bytes crus do arquivo.
   *
   * O plugin devolve base64 (é o que atravessa a ponte JS↔Java). A conversão
   * é feita aqui, num lugar só, pra que o resto do app nunca precise saber
   * disso.
   */
  async readBytes(path) {
    try {
      const r = await Filesystem.readFile({ path: paraPlugin(path), directory: RAIZ })
      if (typeof r.data !== 'string') return null
      return base64ParaBytes(r.data)
    } catch (e) {
      throw traduzirErro(e, 'não consegui ler o arquivo')
    }
  },

  async writeBytes(path, bytes) {
    try {
      await Filesystem.writeFile({
        path: paraPlugin(path),
        directory: RAIZ,
        data: bytesParaBase64(bytes),
        recursive: true,
      })
    } catch (e) {
      throw traduzirErro(e, 'não consegui gravar o arquivo')
    }
  },

  async previewUrl(path) {
    try {
      const { uri } = await Filesystem.getUri({ path: paraPlugin(path), directory: RAIZ })
      // O WebView não abre file:// direto — o Capacitor traduz pro esquema dele.
      return Capacitor.convertFileSrc(uri)
    } catch {
      return null
    }
  },

  async storage() {
    // O plugin de arquivos não informa capacidade do aparelho. Em vez de
    // inventar um número, devolvo `total: 0` e a interface mostra só o que
    // realmente sei medir: o quanto os arquivos visíveis ocupam.
    return { total: 0, used: 0, free: 0, systemReserved: 0, visible: 0 }
  },
}
