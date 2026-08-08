import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'

// Fonte empacotada no projeto — nada de Google Fonts. Um app de arquivos
// precisa abrir sem internet, e no APK não existe rede garantida.
import '@fontsource-variable/inter'

import './styles/tokens.css'
import './styles/global.css'
import App from './App.jsx'

// HashRouter, não BrowserRouter: dentro do APK (e ao abrir o `dist/index.html`
// direto no navegador) não existe servidor pra responder por rota. Com hash,
// a navegação funciona nos dois casos sem configuração.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>
)
