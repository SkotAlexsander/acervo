/**
 * Contrato do sistema de arquivos.
 *
 * O app inteiro fala com esta interface e nunca com o Android nem com o mock.
 * É o que permite ver tudo funcionando no PC hoje e apontar pros arquivos
 * reais do celular depois sem reescrever uma tela.
 *
 * @typedef {Object} FsEntry
 * @property {string}  path   Caminho absoluto com barra normal. Raiz = '/'.
 * @property {string}  name   Nome exibido (último segmento).
 * @property {boolean} isDir
 * @property {number}  size   Bytes. Pasta = 0 (o tamanho dela é calculado sob demanda).
 * @property {number}  mtime  Modificação, em epoch ms.
 * @property {string}  ext    Extensão minúscula sem ponto. Pasta = ''.
 *
 * @typedef {Object} StorageInfo
 * @property {number} total  Bytes totais do armazenamento.
 * @property {number} used   Bytes ocupados.
 * @property {number} free   Bytes livres.
 *
 * @typedef {Object} FsProvider
 * @property {string}   id            'mock' | 'device'
 * @property {string}   label         Nome legível da origem dos dados.
 * @property {boolean}  realFiles     true = mexe em arquivo de verdade.
 * @property {() => Promise<void>} init
 * @property {(path: string) => Promise<FsEntry[]>} list
 * @property {(path: string) => Promise<FsEntry|null>} stat
 * @property {(path: string, name: string) => Promise<string>} rename
 * @property {(paths: string[], destDir: string) => Promise<string[]>} move
 * @property {(paths: string[], destDir: string) => Promise<string[]>} copy
 * @property {(paths: string[]) => Promise<void>} remove
 * @property {(parent: string, name: string) => Promise<string>} mkdir
 * @property {(path: string) => Promise<string|null>} readText
 * @property {(path: string, text: string) => Promise<void>} writeText
 * @property {(path: string) => Promise<Uint8Array|null>} readBytes
 * @property {(path: string, bytes: Uint8Array) => Promise<void>} writeBytes
 * @property {boolean} conteudoReal
 *   true quando `readBytes` devolve o conteúdo de verdade do arquivo.
 *   No aparelho é sempre true. Na demonstração do PC é FALSE: os arquivos ali
 *   são só nome, tamanho e data — o mock materializa bytes plausíveis pra que
 *   compactar e gerar PDF sejam testáveis, mas quem usa precisa saber disso.
 * @property {(path: string) => Promise<string|null>} previewUrl
 * @property {() => Promise<StorageInfo>} storage
 */

export const EMPTY = {}
