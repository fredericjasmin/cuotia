<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Cuotia: instrucciones del proyecto

Cuotia es ahorro grupal (natilleras, tandas, cajas de ahorro) sobre Stellar: un contrato Soroban guarda los aportes en USDC y cada miembro retira lo suyo. Una sola app Next.js en la raíz (web + API) y el contrato en `contracts/cuotia-v3/`. **Solo Stellar Testnet: no hacer nada en Mainnet.**

## Comandos

- `npm run dev:stash` / `build:stash` / `start:stash`: usan las variables de Stash (proyecto `cuotia`, entorno `local`). Sin Stash: `npm run dev` con un `.env.local`.
- `npm test`: tests de la app (`node --test`) y del contrato (`cargo test`). Correrlos antes de cada commit.
- `npm run spec`: regenera `lib/cuotia-spec.mjs` (la interfaz del contrato que usa la app) desde el `.wasm` compilado. Obligatorio después de cambiar el contrato.

## Contrato

- **Es actualizable. Nunca desplegar una instancia nueva para un cambio**: subir `CONTRACT_VERSION`, compilar, `stellar contract upload`, y en cada instancia `upgrade` + `migrate` con la identidad `cuotia-admin`. Procedimiento y reglas de compatibilidad: `docs/actualizaciones.md`.
- No agregar, quitar ni renombrar campos de los structs guardados (`Circle`, `AutoPayGrant`, `FeeConfig`) ni reordenar variantes de enums: datos nuevos van en claves nuevas de `DataKey`, o con conversión en `migrate`.
- Instancias (la dirección no cambia más): demo/Vercel `CBRXIA46AI5ZB3K57RLU7IGBWHLNZIJIULAC63HAJHHVIYYAIKYRKN53` (alias `cuotia-v6-demo`), local `CASO7R4JKPWCMG7WACWMSI5KAZDE62P2N34BGDJCF5Z3N5QU53UD35H2` (alias `cuotia-v6-local`). Admin `cuotia-admin`, tesorería `cuotia-treasury`.
- Comisiones fijadas al desplegar y copiadas en cada círculo: 1% del ahorro al completar, 15% del rendimiento de Writz, nada si se cancela. Se acumulan en el contrato y solo la tesorería las retira (`withdraw_fees`).
- Probar los cambios del contrato también en la red real (Testnet), no solo con `cargo test`: hay errores (por ejemplo de firmas entre simulación y envío) que los tests locales no detectan.
- Detalle: `docs/contrato-cuotia.md`, `docs/aporte-automatico.md`.

## Secretos

- Todo está en Stash, proyecto `cuotia`: entorno `local` (el `.env.local`) y `stellar-keys` (clave y dirección de cada identidad del Stellar CLI).
- Al crear una clave o variable nueva, subirla también a Stash por stdin (`... | stash secrets set NOMBRE -e <entorno>`), sin imprimirla.
- No usar `--secure-store` del Stellar CLI para claves que haya que respaldar: no se pueden exportar.
- Nunca commitear secretos ni `.env.local`.

## Aporte automático y tareas programadas

`/api/auto-pay` (protegido con el header `x-cron-key`) lo llama cron-job.org cada hora. No usar Vercel Cron ni schedulers en el proceso. La cuenta keeper solo paga comisiones: nunca custodia fondos.

## App

- Textos en `lib/i18n.mjs`: español por defecto, inglés y francés. Cada clave nueva va en los tres idiomas.
- Header responsive: los links, la red y el idioma pasan al menú cuando la barra completa no entra en una línea (lo mide `components/use-nav-collapse.jsx`; depende del idioma y de la billetera, no hay un ancho fijo) y siempre por debajo de 760 px; por debajo de 620 px, también la billetera. Los links salen de una sola lista en `site-shell.jsx` (`navigation`, `walletLinks`): no duplicarlos.
- Diseño: sin hovers que muevan o agranden elementos, sin eyebrows (etiquetas chicas arriba de los títulos), y el contenido alineado con los bordes del header y el footer (mismo contenedor `.app-shell`).

## Datos de la demo

Los círculos 1 a 6 del contrato demo son **datos de demostración** creados con cuentas propias (`cuotia-test-a/b`, `cuotia-demo-1` a `5`). No son usuarios ni tracción.
