# Levar o Acervo pro celular

O app já está pronto pra virar APK. O que falta é o **ambiente de build do Android**,
que é pesado e não tem como fugir: gerar APK exige o SDK do Android, e o SDK vem com
o Android Studio.

---

## O que você precisa instalar (uma vez)

| O quê | Tamanho | Onde |
|---|---|---|
| **Android Studio** | ~1,2 GB (baixa mais ~3 GB de SDK) | https://developer.android.com/studio |
| **JDK 21** | já vem embutido no Android Studio | — |

Na primeira abertura do Android Studio, aceite o assistente e deixe ele baixar o
**Android SDK Platform 35** e o **Android SDK Build-Tools**. É o que o Capacitor usa.

Confira depois, no PowerShell:

```powershell
$env:ANDROID_HOME    # deve apontar pra algo como C:\Users\<você>\AppData\Local\Android\Sdk
```

Se estiver vazio, defina:

```powershell
[Environment]::SetEnvironmentVariable('ANDROID_HOME', "$env:LOCALAPPDATA\Android\Sdk", 'User')
```

E **feche e reabra o terminal** — variável de ambiente nova não entra numa janela já aberta.

---

## Gerar o APK

Na pasta do projeto:

```powershell
npm install
npx cap add android      # cria a pasta android/ — só na primeira vez
npm run android:sync     # roda o build do Vite e copia tudo pro projeto Android
npm run android:open     # abre no Android Studio
```

No Android Studio: menu **Build → Build Bundle(s) / APK(s) → Build APK(s)**.

O arquivo sai em:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

Mande esse arquivo pro celular (cabo, Google Drive, Telegram pra si mesmo — tanto faz)
e toque nele pra instalar. O Android vai avisar que é de "fonte desconhecida" — é
esperado, é o seu app. Autorize.

> **APK de debug basta pra experimentar.** Pra usar de verdade, prefira o release:
> ele é 28% menor e não deixa o WebView aceitando conexão de depuração.

### O APK de release e a chave de assinatura

```bash
npm run android:release
# sai em android/app/build/outputs/apk/release/app-release.apk
```

A assinatura exige uma chave, e ela **não está no repositório** — nem a chave nem
as senhas. O que está é o modelo:

```bash
cp android/keystore.properties.exemplo android/keystore.properties
# edite e preencha
```

Se você ainda não tem uma chave, crie (o `keytool` vem junto com o Java):

```bash
keytool -genkey -v -keystore android/acervo.keystore -alias acervo \
        -keyalg RSA -keysize 2048 -validity 10000
```

Sem o `keystore.properties`, o `assembleDebug` continua funcionando normalmente e
o `assembleRelease` avisa em português em vez de falhar com uma mensagem do
Gradle que ninguém entende.

> **Guarde essa chave.** O Android recusa instalar uma atualização assinada por
> chave diferente da que está no aparelho. Perder a chave significa que a única
> forma de atualizar é desinstalar — perdendo os dados do app.

---

## A permissão que o app precisa — e por que

Desde o Android 11, um app **não enxerga o armazenamento inteiro** sem uma permissão
especial: `MANAGE_EXTERNAL_STORAGE` ("Acesso a todos os arquivos"). Sem ela o Acervo
abre e mostra uma memória vazia — parece bug, mas é o Android bloqueando.

### 1. Declarar a permissão

Depois do `npx cap add android`, edite
`android/app/src/main/AndroidManifest.xml` e acrescente, **dentro de `<manifest>` e
antes de `<application>`**:

```xml
<uses-permission android:name="android.permission.MANAGE_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" />
<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"
    android:maxSdkVersion="29" />

<!-- Notificação: do Android 13 em diante é pedida em tempo de execução.
     Declarar aqui só dá o DIREITO de perguntar; quem pergunta é o
     interruptor nos Ajustes do app, e ele vem desligado. -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

E na tag `<application ...>`, acrescente:

```xml
android:requestLegacyExternalStorage="true"
```

### 2. Conceder no aparelho

Instalado o APK, o Android **não** pergunta essa permissão sozinho — ela só se
concede pelas configurações:

**Ajustes → Aplicativos → Acervo → Permissões → Arquivos e mídia →
"Permitir acesso a todos os arquivos"**

Em alguns aparelhos o caminho é *Ajustes → Aplicativos → Acesso especial →
Acesso a todos os arquivos → Acervo*.

Se você abrir o app sem conceder, ele **não morre**: cai na demonstração e mostra
uma faixa amarela explicando exatamente isso. Foi construído assim de propósito —
tela branca sem explicação é o pior desfecho possível.

---

## Atualizar o app depois de mexer no código

```powershell
npm run android:sync
```

e gere o APK de novo no Android Studio. Instalar por cima mantém seus ajustes e
favoritos (ficam no armazenamento do app).

---

## Se der errado

| Sintoma | Causa quase sempre |
|---|---|
| App abre vazio, sem faixa de aviso | Permissão de "todos os arquivos" não concedida |
| Faixa amarela "O Android bloqueou o acesso" | Idem — vá nas configurações do app |
| `npx cap add android` reclama de JAVA_HOME | Rode `npm run android:open` primeiro; o Android Studio configura o Java |
| Gradle trava baixando dependência | Primeira build baixa ~500 MB. Deixe terminar |
| Tela branca no APK | Confira se `vite.config.js` tem `base: './'` — sem isso os arquivos não são achados dentro do APK |
| App não acha nada em `/Android/data` | É de propósito: a varredura pula essa pasta (milhares de arquivos de app, ilegíveis e intocáveis) |

---

## Existe caminho sem Android Studio?

**Não, pra um app que lê os arquivos do celular.** Vale registrar por quê, pra não
tentar de novo:

- **PWA (instalar pelo navegador)** — não funciona. A `File System Access API` do
  navegador não existe no Chrome do Android, e mesmo onde existe ela só enxerga
  pastas que o usuário escolhe uma a uma. Não dá pra listar o armazenamento.
- **Serviço de build na nuvem** (Ionic Appflow, EAS, GitHub Actions) — funciona, e é
  a alternativa real se você não quiser instalar 4 GB. Exige conta e configuração;
  o resultado é o mesmo APK.
- **Instalar direto pelo `adb`** — ainda precisa do SDK pra gerar o APK. Muda só a
  forma de transferir.
