import { useState } from 'react'
import Icone from '../Icone.jsx'
import { formatBytes } from '../../fs/util.js'
import css from './Operacoes.module.css'

/**
 * As peças que as folhas de operação (Transformar, Proteger, Mais Leve)
 * usam em comum. Ficam aqui pelo mesmo motivo do CSS compartilhado: a
 * terceira cópia de um componente é onde nasce a inconsistência.
 */

/** Linha de escolha — formato de destino, preset de qualidade, formato de saída. */
export function Opcao({ selo, titulo, descricao, etiqueta, ativa, aoClicar }) {
  return (
    <button
      type="button"
      className={`${css.opcao} ${ativa ? css.opcaoAtiva : ''}`}
      onClick={aoClicar}
      aria-pressed={ativa}
    >
      <span className={css.opcaoSelo}>{selo}</span>
      <span className={css.opcaoTextos}>
        <span className={css.opcaoTitulo}>{titulo}</span>
        {descricao && <span className={css.opcaoDescricao}>{descricao}</span>}
        {etiqueta && (
          <span className={`${css.fidelidade} ${css[etiqueta.classe]}`}>{etiqueta.texto}</span>
        )}
      </span>
      {ativa && (
        <span className={css.opcaoMarca}>
          <Icone nome="confereCirculo" tamanho={20} />
        </span>
      )}
    </button>
  )
}

/**
 * Antes → depois, em bytes.
 *
 * É a peça mais importante destas telas: sem o número dos dois lados, "deixar
 * mais leve" é uma promessa. Com ele, é um fato que a pessoa confere.
 */
export function Balanca({ antes, depois, dimensoes }) {
  const ganho = antes ? 1 - depois / antes : 0
  const melhorou = ganho > 0.005
  return (
    <div className={css.balanca}>
      <span className={css.balancaLado}>
        <span className={css.balancaRotulo}>agora</span>
        <span className={css.balancaValor}>{formatBytes(antes)}</span>
      </span>
      <span className={css.balancaSeta}>
        <Icone nome="avancar" tamanho={20} />
      </span>
      <span className={css.balancaLado}>
        <span className={css.balancaRotulo}>vai ficar</span>
        <span className={`${css.balancaValor} ${melhorou ? css.balancaGanho : css.balancaPerda}`}>
          {formatBytes(depois)}
        </span>
        <span className={css.balancaRotulo}>
          {melhorou
            ? `${Math.round(ganho * 100)}% menor`
            : ganho < -0.005
              ? `${Math.round(-ganho * 100)}% maior`
              : 'praticamente igual'}
          {dimensoes ? ` · ${dimensoes}` : ''}
        </span>
      </span>
    </div>
  )
}

/**
 * Anel de progresso.
 *
 * Uma barra fina some no meio da folha quando a operação demora; o anel
 * ocupa o centro e diz, sem ler nada, "está trabalhando, falta tanto".
 * Usado onde a espera é longa de verdade — proteger com senha deriva a
 * chave com 210 mil rodadas e leva um instante mesmo em aparelho bom.
 */
export function AnelProgresso({ valor, texto, tamanho = 92 }) {
  const raio = (tamanho - 10) / 2
  const volta = 2 * Math.PI * raio
  const v = Math.max(0, Math.min(1, valor || 0))
  return (
    <div className={css.anel}>
      <svg width={tamanho} height={tamanho} className={css.anelSvg} aria-hidden="true">
        <circle
          className={css.anelTrilho}
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={raio}
          fill="none"
          strokeWidth={6}
        />
        <circle
          className={css.anelValor}
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={raio}
          fill="none"
          strokeWidth={6}
          strokeDasharray={volta}
          strokeDashoffset={volta * (1 - v)}
        />
      </svg>
      {texto && (
        <p className={css.anelTexto} role="status">
          {texto}
        </p>
      )}
    </div>
  )
}

/**
 * Campo de senha com o olho de "mostrar".
 *
 * O olho não é enfeite: sem ele, digitar uma senha longa num teclado de
 * celular vira loteria — e aqui errar a senha na hora de PROTEGER significa
 * perder o arquivo, porque não existe recuperação.
 */
export function CampoSenha({ valor, aoMudar, rotulo, autoFoco, aoEnviar, desabilitado }) {
  const [visivel, setVisivel] = useState(false)
  return (
    <label className={css.campo}>
      <span className={css.rotulo}>{rotulo}</span>
      <span className={css.senhaCaixa}>
        <input
          className={css.senhaEntrada}
          type={visivel ? 'text' : 'password'}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && aoEnviar) {
              e.preventDefault()
              aoEnviar()
            }
          }}
          autoComplete="new-password"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          disabled={desabilitado}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus={autoFoco}
          aria-label={rotulo}
        />
        <button
          type="button"
          className={css.senhaOlho}
          onClick={() => setVisivel((v) => !v)}
          aria-label={visivel ? 'Esconder a senha' : 'Mostrar a senha'}
          tabIndex={-1}
        >
          <Icone nome={visivel ? 'olhoCortado' : 'olho'} tamanho={19} />
        </button>
      </span>
    </label>
  )
}

/**
 * Caixa de marcar.
 *
 * É um `<button role="checkbox">`, e não um `<input type="checkbox">` dentro
 * de um `<label>`. Dois motivos: o input nativo tem 20px de lado — abaixo do
 * alvo de dedo — e a linha inteira aqui tem 44px, então o botão faz a linha
 * TODA ser a área de toque. E o desenho acompanha o resto do app; a caixinha
 * do sistema aparece com a cor do Windows no PC e a do fabricante no celular.
 */
export function Marcador({ marcado, aoMudar, titulo, descricao }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={marcado}
      className={`${css.opcao} ${marcado ? css.opcaoAtiva : ''}`}
      onClick={() => aoMudar(!marcado)}
    >
      <span className={`${css.caixa} ${marcado ? css.caixaMarcada : ''}`} aria-hidden="true">
        {marcado && <Icone nome="confere" tamanho={15} />}
      </span>
      <span className={css.opcaoTextos}>
        <span className={css.opcaoTitulo}>{titulo}</span>
        {descricao && <span className={css.opcaoDescricao}>{descricao}</span>}
      </span>
    </button>
  )
}

/** As três barrinhas de força da senha. */
export function ForcaSenha({ forca }) {
  return (
    <div className={css.forca}>
      <span className={css.forcaBarras} aria-hidden="true">
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            className={`${css.forcaBarra} ${forca.nivel >= n ? css[`forcaN${forca.nivel}`] : ''}`}
          />
        ))}
      </span>
      <span className={css.forcaTexto}>
        Senha <strong>{forca.rotulo}</strong> — {forca.dica}
      </span>
    </div>
  )
}
