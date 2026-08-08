/**
 * Conjunto de ícones do app — SVG inline, desenhado aqui.
 *
 * Por que não uma biblioteca: um app de arquivos usa ~35 ícones. Uma
 * dependência traria centenas, mais peso no APK e uma família visual que não é
 * a nossa. Aqui todos têm a MESMA espessura de traço (1.6) e o mesmo
 * arredondamento — é isso que faz um conjunto parecer um conjunto.
 */

const TRACOS = {
  // Navegação
  voltar: 'M15 18l-6-6 6-6',
  avancar: 'M9 6l6 6-6 6',
  cima: 'M18 15l-6-6-6 6',
  baixo: 'M6 9l6 6 6-6',
  casa: 'M3 10.5 12 3l9 7.5M5.5 9v11h13V9',
  fechar: 'M18 6 6 18M6 6l12 12',

  // Arquivos e pastas
  pasta: 'M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h9A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z',
  pastaMais:
    'M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h9A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z M12 11.5v5M9.5 14h5',
  arquivo: 'M14 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V7.5zM14 3v4.5h4.5',
  imagem:
    'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5z M4 16l4.2-4a1.5 1.5 0 0 1 2 0L16 17M14.5 13.5l1.3-1.2a1.5 1.5 0 0 1 2 0L20 14.4',
  imagemPonto: 'M9.5 9.2a1.15 1.15 0 1 1-2.3 0 1.15 1.15 0 0 1 2.3 0',
  video: 'M3.5 7.5A1.5 1.5 0 0 1 5 6h8a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 13 18H5a1.5 1.5 0 0 1-1.5-1.5zM14.5 10.5l4.4-2.6a.6.6 0 0 1 .9.5v7.2a.6.6 0 0 1-.9.5l-4.4-2.6z',
  musica: 'M9 18V6.8a1 1 0 0 1 .8-1l8-1.6a1 1 0 0 1 1.2 1V16 M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0 M19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0 M9 10.2l10-2',
  documento:
    'M14 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V7.5zM14 3v4.5h4.5M8.5 13h7M8.5 16.5h5',
  compactado:
    'M14 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V7.5zM14 3v4.5h4.5M11 4v1.5M12.5 5.5V7M11 7v1.5M12.5 8.5V10M11 10v1.5M12.5 11.5V13h-2v2.5h3V13',
  aplicativo:
    'M12 2.8 20.5 7v10L12 21.2 3.5 17V7zM3.7 7.1 12 11.6l8.3-4.5M12 11.6V21',
  outro: 'M14 3H7a1.5 1.5 0 0 0-1.5 1.5v15A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5V7.5zM14 3v4.5h4.5M9 15.5h6',

  // Ações
  busca: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l4.5 4.5',
  mais: 'M12 5v14M5 12h14',
  menos: 'M5 12h14',
  // Os três pontos são desenhados como círculos preenchidos no render, não
  // como traço: ponto feito de `h.01` sai com 1,6px e some na tela do celular.
  maisOpcoes: '',
  lapis: 'M16.5 3.9a2.1 2.1 0 0 1 3 3L8.4 18l-4 1 1-4z',
  lixeira: 'M4.5 6.5h15M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5M6.5 6.5l.8 12A1.5 1.5 0 0 0 8.8 20h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12M10.5 10.5v5.5M13.5 10.5v5.5',
  copiar: 'M9 9.5A1.5 1.5 0 0 1 10.5 8h8A1.5 1.5 0 0 1 20 9.5v10a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 9 19.5zM15.5 8V4.5A1.5 1.5 0 0 0 14 3H5.5A1.5 1.5 0 0 0 4 4.5V15a1.5 1.5 0 0 0 1.5 1.5H9',
  mover: 'M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h9A1.5 1.5 0 0 1 21 10v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18z M9 14h7M13.5 11.5 16 14l-2.5 2.5',
  colar: 'M8.5 4.5H7A1.5 1.5 0 0 0 5.5 6v13A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5V6A1.5 1.5 0 0 0 17 4.5h-1.5M9 3.5h6v3H9z',
  compartilhar: 'M17 8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM7 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM17 20.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM9.2 10.8l5.6-2.9M9.2 13.2l5.6 2.9',
  estrela: 'M12 3.6l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.6l-5.1 2.7 1-5.7-4.1-4 5.7-.8z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 7.8h.01',
  alerta: 'M12 3.8 21 19.5H3zM12 10v3.8M12 16.6h.01',
  confere: 'M4.5 12.5 9.5 17.5 19.5 6.5',
  confereCirculo: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.2l2.8 2.8L16 9.6',
  desfazer: 'M4 9h10.5a5 5 0 0 1 0 10H8M4 9l4-4M4 9l4 4',
  atualizar: 'M20 12a8 8 0 1 1-2.5-5.8M20 3.5V9h-5.5',

  // Visão e ordenação
  lista: 'M4 6.5h1M4 12h1M4 17.5h1M8.5 6.5H20M8.5 12H20M8.5 17.5H20',
  grade: 'M4 4.5h6.5V11H4zM13.5 4.5H20V11h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z',
  ordenar: 'M7 4.5v15M7 4.5 4 8M7 4.5 10 8M17 19.5v-15M17 19.5 14 16M17 19.5 20 16',
  filtro: 'M3.5 5.5h17l-6.5 7.5v5.5l-4 2v-7.5z',

  // Sistema
  ajustes: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM9 14.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  disco: 'M3.5 12.5h17M3.5 12.5 6 5.2A1.5 1.5 0 0 1 7.4 4h9.2a1.5 1.5 0 0 1 1.4 1.2l2.5 7.3v5A1.5 1.5 0 0 1 19 20H5a1.5 1.5 0 0 1-1.5-1.5zM7 16.5h.01M10.5 16.5h.01',
  // Brilho, não vassoura: a vassoura só fica legível acima de ~28px, e a
  // barra de abas usa 21px. Três brilhos leem "limpar" na hora, em qualquer tamanho.
  brilho:
    'M10 3.2l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5zM17.8 13.4l.8 2.1 2.1.8-2.1.8-.8 2.1-.8-2.1-2.1-.8 2.1-.8zM6 15.4l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z',
  ondas: 'M3 8.5c3-4.5 6-4.5 9 0s6 4.5 9 0M3 15.5c3-4.5 6-4.5 9 0s6 4.5 9 0',
  baixar: 'M12 3.5v11M7.8 10.6 12 14.8l4.2-4.2M4.5 19.5h15',
  sol: 'M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4',
  lua: 'M20 14.2A8.5 8.5 0 0 1 9.8 4 8.5 8.5 0 1 0 20 14.2z',
  monitor: 'M3.5 5.5h17v11h-17zM8.5 20.5h7M12 16.5v4',
  olho: 'M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6zM12 14.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2z',
  olhoCortado: 'M4 4l16 16M9.9 5.2A9.6 9.6 0 0 1 12 5c6 0 9.5 6 9.5 6a15 15 0 0 1-3 3.6M6.4 7.4A15 15 0 0 0 2.5 11S6 17 12 17c1 0 1.9-.2 2.7-.4M10.2 10.3a2.6 2.6 0 0 0 3.5 3.5',
  relogio: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7.5V12l3 2',
  duplicado: 'M4 8.5A1.5 1.5 0 0 1 5.5 7h7A1.5 1.5 0 0 1 14 8.5v10A1.5 1.5 0 0 1 12.5 20h-7A1.5 1.5 0 0 1 4 18.5zM8 7V5.5A1.5 1.5 0 0 1 9.5 4h9A1.5 1.5 0 0 1 20 5.5v10a1.5 1.5 0 0 1-1.5 1.5H17',
  peso: 'M7.4 8.6h9.2l1.6 11.3a1.1 1.1 0 0 1-1.1 1.3H6.9a1.1 1.1 0 0 1-1.1-1.3zM9.6 8.6V7.1a2.4 2.4 0 0 1 4.8 0v1.5',
  restaurar: 'M4 9h10.5a5 5 0 0 1 0 10H8M4 9l4-4M4 9l4 4',
  abrirFora: 'M14 4.5h5.5V10M19 5l-7.5 7.5M17.5 14v4.5A1.5 1.5 0 0 1 16 20H5.5A1.5 1.5 0 0 1 4 18.5V8a1.5 1.5 0 0 1 1.5-1.5H10',
  cadeado: 'M6.5 10.5h11a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8.5 10.5V7.5a3.5 3.5 0 1 1 7 0v3',
  // Cadeado ABERTO: o arco sai pra direita e não fecha. A diferença precisa
  // ser visível a 20px — por isso o arco sobe mais, além de abrir.
  cadeadoAberto:
    'M6.5 10.5h11a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8.5 10.5V7a3.5 3.5 0 0 1 6.9-.8',
  // Duas setas em sentido oposto = "vira outra coisa".
  transformar: 'M4 8.5h13M13.5 5 17 8.5 13.5 12M20 15.5H7M10.5 12 7 15.5 10.5 19',
  // Setas se encontrando = "fica menor". Lê melhor que uma pena em 20px.
  comprimir: 'M12 3v5.5M9.2 5.7 12 8.5l2.8-2.8M12 21v-5.5M9.2 18.3 12 15.5l2.8 2.8M4 12h16',
  sino: 'M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9zM13.7 19a2 2 0 0 1-3.4 0',
  chave: 'M15.5 4a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zM12.4 11.6 4 20M7 17l2 2M9.5 14.5l2 2',
}

/** Ícones que precisam de preenchimento além do traço. */
const PREENCHIDOS = { estrela: true }

export default function Icone({ nome, tamanho, cor, preenchido, className, style, ...resto }) {
  const d = TRACOS[nome]
  if (d === undefined) return null
  const s = tamanho || 22
  const encher = preenchido && PREENCHIDOS[nome]
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke={cor || 'currentColor'}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={style}
      {...resto}
    >
      {d && <path d={d} fill={encher ? cor || 'currentColor' : 'none'} />}
      {nome === 'imagem' && <path d={TRACOS.imagemPonto} fill="currentColor" stroke="none" />}
      {nome === 'maisOpcoes' && (
        <g fill="currentColor" stroke="none">
          <circle cx="12" cy="5.6" r="1.65" />
          <circle cx="12" cy="12" r="1.65" />
          <circle cx="12" cy="18.4" r="1.65" />
        </g>
      )}
    </svg>
  )
}

/** Mapa categoria → ícone. Uma pasta é sempre pasta; arquivo segue o tipo. */
export const ICONE_POR_TIPO = {
  folder: 'pasta',
  image: 'imagem',
  video: 'video',
  audio: 'musica',
  doc: 'documento',
  archive: 'compactado',
  app: 'aplicativo',
  other: 'outro',
}

/** Mapa categoria → token de cor. */
export const COR_POR_TIPO = {
  folder: 'var(--c-pasta)',
  image: 'var(--c-imagem)',
  video: 'var(--c-video)',
  audio: 'var(--c-audio)',
  doc: 'var(--c-doc)',
  archive: 'var(--c-arquivo-zip)',
  app: 'var(--c-app)',
  other: 'var(--c-outro)',
}
