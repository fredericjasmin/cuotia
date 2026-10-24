# Arquitectura

## Decisión principal

Cuotia es una aplicación **Next.js única**. La interfaz, las rutas HTTP y el código JavaScript que consulta Stellar viven en la raíz del repositorio, con un solo `package.json`. No hay aplicaciones separadas de frontend y backend ni un workspace npm. Esa aplicación se despliega como Next.js en Vercel y usa Node.js para sus rutas HTTP.

El estado de los círculos está pensado para vivir en Soroban. Eso permite que la misma dirección del contrato sirva a todas las personas que abran la app. La conexión a wallet solo reconoce una cuenta; cada operación que modifica el estado necesita una firma de esa cuenta.

```text
Persona ── navegador ── Next.js (raíz)
   │                         │
   │ conecta y firma         ├── Route Handlers: estado y referencia de APY Writz
   ▼                         └── cliente Stellar: leer/invocar contrato
Wallet Stellar                              │
                                            ▼
                                 Contrato Cuotia en Soroban
                                 ├── reglas y miembros
                                 ├── aportes periódicos por persona
                                 └── cancelación y reclamos individuales
```

## Directorios

- `app/`: páginas y Route Handlers de Next.js.
- `components/app-provider.jsx` y `site-shell.jsx`: sesión de wallet compartida y marco común de navegación.
- `components/home-page.jsx`, `savings-pages.jsx` e `information-pages.jsx`: pantallas agrupadas por responsabilidad.
- `lib/wallet-client.mjs`: conexión a wallets mediante Stellar Wallets Kit.
- `lib/cuotia-chain.mjs`: configuración y cliente de contrato; convierte montos, adapta datos on-chain y consulta un círculo por ID.
- `lib/writz-client.mjs`: consulta el APY del vault Writz; los depósitos y reclamos de círculos los ejecuta el contrato Soroban.
- `lib/*.test.mjs`: pruebas de funciones puras del cliente de contrato.
- `contracts/cuotia-v3/`: fuente del contrato Soroban de ahorros en Rust. No es un backend ni una segunda aplicación; compila a WebAssembly y se despliega por separado en Stellar.
- `docs/`: contexto y decisiones del proyecto.

## Despliegue en Vercel

En Vercel, importa el repositorio y deja la raíz del repositorio como **Root Directory** (valor predeterminado). Usa el framework Next.js, Node.js 24.x, `npm run build` y la salida predeterminada de Next.js (`.next`). El `package.json` de la raíz pertenece a la app; no hace falta un workspace, `vercel.json` ni un backend desplegado aparte.

Define en el proyecto de Vercel las variables de `.env.example`. La dirección del contrato y el ID del token son públicos y se exponen al navegador con `NEXT_PUBLIC_`; el mismo token se usa en todos los círculos. Deben ser identificadores válidos y verificados de Stellar Testnet. Si falta cualquiera, la aplicación se despliega pero mantiene deshabilitadas las funciones compartidas. Los cambios de variables requieren un nuevo despliegue.

El contrato se compila y despliega a Testnet por separado desde `contracts/cuotia-v3/`. Vercel despliega la aplicación web, no el contrato. La guía completa y los comandos están en [README.md](../README.md) y [contrato-cuotia.md](contrato-cuotia.md).

## Flujo de una persona

1. Conecta una wallet Stellar compatible. No hay usuario ni contraseña de Cuotia; la dirección pública es la identidad.
2. Cambia la wallet a Stellar Testnet. La aplicación comprueba el passphrase de la red.
3. Crea un círculo e indica las direcciones públicas de sus integrantes. La organizadora queda incluida como miembro.
4. Al crear, la organizadora puede proponer Earn. Cada integrante debe aceptarlo con su propia wallet antes de que se permita aportar.
5. En modo estándar se usa Circle USDC. En modo Earn se usa Blend Testnet USDC; el contrato deposita cada aporte en el vault y registra las shares de cada integrante.
6. Cada integrante firma su aporte. Al completar o cancelar, cada persona reclama; en modo Earn recibe el valor recuperado por sus shares, que puede variar.
7. Cuando todas las personas aportan, cualquiera puede abrir la siguiente ronda una vez cumplido el periodo.

Conectar una wallet **no** autoriza automáticamente transacciones. Las claves privadas permanecen en la wallet. No se debe pedir a nadie su frase secreta.

## Estado de disponibilidad

El código contempla lectura y escritura del contrato de ahorros en Testnet. `.env.local` configura la instancia local v4 `cuotia-v4-writz-auth`; Vercel debe usar su propia instancia compatible. Sin `NEXT_PUBLIC_CUOTIA_CONTRACT_ID` y `NEXT_PUBLIC_CUOTIA_TOKEN_ID`, la app deja visible que el servicio compartido no está configurado y no ofrece persistencia local alternativa.

La configuración local ya apunta a `cuotia-v4-writz-auth` mediante `.env.local`; Vercel tiene una instancia compatible v4 separada. Define su ID en Project Settings como `NEXT_PUBLIC_CUOTIA_CONTRACT_ID` y vuelve a desplegar la web para aplicar la variable. Las variables `NEXT_PUBLIC_` son direcciones públicas que el navegador necesita, nunca secretos. Los IDs se guardan en `docs/despliegue-local.md`, archivo ignorado por Git.

## Rutas HTTP actuales

| Ruta | Uso |
|---|---|
| `GET /api/status` | Devuelve estado general y si hay configuración del contrato |
| `GET /api/earn/apy` | Consulta el APY del vault Writz DeFindex Testnet |

## Rutas de la aplicación

La interfaz usa rutas de Next.js separadas por tarea. El encabezado, la navegación, la conexión de wallet y el pie de página se comparten desde el layout de `app/`.

| Ruta | Responsabilidad |
|---|---|
| `/` | Presentación de Cuotia y enlace a Earn; no muestra datos de círculos de ejemplo · pública |
| `/savings` | Public savings circles list · public |
| `/savings/[id]` | Circle status, contributions, and individual claims · public |
| `/savings/create` | Savings-circle creation; wallet signature required |
| `/circles` and `/circles/[id]` | Redirect to `/savings` |
| `/dashboard` | Savings circles associated with the connected wallet address |
| `/earn` | Redirects to the Earn section on `/how-it-works#earn` |
| `/how-it-works` | Wallet and savings-circle guide, with the circle-level Writz Earn explanation below · public |

La navegación principal muestra **Savings circles** y **How it works**. La guía explica Earn opcional a nivel de círculo; la selección está en la creación y la aceptación individual en los detalles del círculo. El contrato del círculo posee las shares Writz y las contabiliza por integrante. Las rutas públicas no necesitan wallet; aceptar, aportar, reclamar y otras escrituras requieren firma de la wallet correspondiente.

Los círculos se leen y escriben directamente contra Soroban desde el navegador para que la wallet firme la transacción. No existe API de círculos ni almacenamiento JSON local.

## Comandos

```sh
npm install
npm run dev       # servidor local, puerto 4173
npm run build
npm start         # servidor de producción, puerto 4173
npm test
```

El contrato se compila desde su carpeta con Cargo y Stellar CLI. Ver [contrato-cuotia.md](contrato-cuotia.md). La aplicación y el contrato son dos artefactos distintos, pero solo la aplicación web necesita Node/npm.

## Límites antes de uso público

- El contrato todavía debe compilarse, probarse en Testnet y desplegarse.
- Debe elegirse y verificar un contrato token testnet correcto para el flujo de ahorro. Es una configuración única de la plataforma y la comparten todos los círculos. El spike de Writz menciona USDC de Blend; no es automáticamente el USDC de Circle.
- El contrato v3 contiene el flujo opcional de círculo con aceptación unánime y llamadas al vault Writz. Requiere compilación con Stellar CLI 25.2.0 o posterior, despliegue de una instancia nueva y validación de depósito, reclamo y cancelación en Testnet antes de activar esa dirección en `.env.local` o Vercel.
- Cualquier integrante puede ejecutar un pago cuando todas las cuotas están registradas; esto evita depender de que la organizadora esté disponible.
- No hay proceso probado de recuperación de círculos archivados por TTL.
- Testnet, este contrato y la aplicación no están auditados; no usar fondos reales.
