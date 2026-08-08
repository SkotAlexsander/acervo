/** Preferências do usuário, gravadas no aparelho. Um lugar só, sem espalhar localStorage pelo app. */

const CHAVE = 'acervo.prefs.v1'

export const PADRAO = {
  tema: 'sistema', // 'sistema' | 'claro' | 'escuro'
  efeitos: true, // efeitos de fundo animados
  visao: 'lista', // 'lista' | 'grade'
  ordem: 'name', // name | size | date | kind
  ordemDesc: false,
  mostrarOcultos: false,
  // Somar o conteúdo de cada pasta custa uma descida na árvore por pasta.
  // Vem ligado porque é a informação que responde "onde foi meu espaço", e o
  // cálculo só acontece pra pasta que está na tela — mas fica desligável,
  // porque num aparelho lento com pasta de 10 mil arquivos ele pesa.
  medirPastas: true,
  // Notificação do sistema vem DESLIGADA e não se liga sozinha. Um
  // organizador de arquivos que interrompe o dia da pessoa por conta própria
  // é o motivo pelo qual se desliga notificação de tudo.
  notificacoes: false,
  favoritos: [], // caminhos fixados
  recentes: [], // pastas visitadas recentemente (máx. 12)
  limiteGrande: 100 * 1024 * 1024,
  primeiraVez: true,
}

export function ler() {
  try {
    const bruto = localStorage.getItem(CHAVE)
    if (!bruto) return { ...PADRAO }
    const dados = JSON.parse(bruto)
    // Mescla com o padrão: versão nova do app ganha campos novos sem
    // quebrar quem já tem preferências gravadas.
    return { ...PADRAO, ...(dados && typeof dados === 'object' ? dados : {}) }
  } catch {
    return { ...PADRAO }
  }
}

export function gravar(prefs) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(prefs))
  } catch {
    /* modo anônimo ou cota cheia: as preferências valem só nesta sessão */
  }
}

/**
 * Aplica o tema no documento.
 * `data-tema` é o que o CSS lê. Quando é 'sistema', o atributo sai e a
 * media query `prefers-color-scheme` volta a mandar.
 */
export function aplicarTema(tema) {
  const raiz = document.documentElement
  if (tema === 'claro' || tema === 'escuro') raiz.setAttribute('data-tema', tema)
  else raiz.removeAttribute('data-tema')
  raiz.style.colorScheme = tema === 'claro' ? 'light' : tema === 'escuro' ? 'dark' : 'light dark'
}

export function aplicarEfeitos(ligado) {
  document.documentElement.toggleAttribute('data-sem-efeitos', !ligado)
}
