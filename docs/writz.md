# Writz Protocol

> **Lock Bitcoin. Borrow dollars.** Pides USDC en Stellar con tu Bitcoin como garantía, sin venderlo, sin puentes, sin custodio y sin tokens envueltos.

- Sitio: [writz.xyz](https://writz.xyz) · App testnet: [testnet.writz.xyz](https://testnet.writz.xyz)
- Docs: [docs.writz.xyz](https://docs.writz.xyz) · Índice para IA: [llms.txt](https://docs.writz.xyz/llms.txt)
- GitHub: [WritzProtocol/writz](https://github.com/WritzProtocol/writz) (Apache 2.0)
- X: [@WritzProtocol](https://x.com/WritzProtocol) · Discord: [discord.gg/zDa4xRN9Xe](https://discord.gg/zDa4xRN9Xe)
- Protocolo hecho en Costa Rica.

> ⚠️ **Solo testnet.** No está en mainnet (objetivo: Q2 a Q3 2027) y **no está auditado**. No usar fondos reales.

---

## Qué es, en simple

Writz deja que Stellar "se entere" de lo que pasó en Bitcoin. Un contrato Soroban puede comprobar que una transacción de Bitcoin está dentro de la cadena, y un prestatario puede bloquear BTC nativo en Bitcoin y recibir USDC en Stellar contra eso.

- **Sin custodio:** un script de Bitcoin guarda el BTC, no una empresa.
- **Sin token envuelto:** el BTC nunca sale de Bitcoin, no hay puente.
- **Salida de emergencia:** si Writz desaparece, recuperas tu BTC tú solo cuando vence el timelock.

---

## Cómo funciona (4 pasos)

1. **Bloquear BTC en Bitcoin.** Tu BTC va a una dirección con script (P2WSH) que solo se libera con tu llave y la de Writz juntas.
2. **Probarlo en Stellar.** Un relayer lleva la prueba del depósito a Stellar, donde un contrato la verifica contra los headers de bloques de Bitcoin. La prueba cruza, las monedas no.
3. **Pedir dólares.** Hasta ~2/3 del valor de tu BTC en USDC (66.7%), directo a tu wallet de Stellar.
4. **Pagar y desbloquear.** Pagas el préstamo + interés, Writz co-firma la liberación y tu BTC vuelve a tu wallet.

### Parámetros clave

| Parámetro | Valor |
|---|---|
| Préstamo máximo | 66.7% del valor del BTC |
| Liquidación | Si el colateral cae bajo 120% del préstamo |
| Depósito mínimo | 100,000 sats (0.001 BTC) |
| Confirmaciones requeridas | 6 (≈ 1 hora en Signet, a veces más) |
| Tasa de interés | Variable según utilización (óptimo 75%) |
| Comisión del protocolo | 15% del spread de interés |
| Liquidación | Se salda la deuda en Stellar; **no se mueve BTC al liquidador** |

Ejemplo de la landing (BTC a $100,000): bloqueas 0.5 BTC → pides 33,333 USDC → liquidación bajo $80,000.

---

## Qué está LIVE en testnet (lo que puedes usar)

| Primitiva | Qué te da | Cómo acceder |
|---|---|---|
| **Verificación de pagos Bitcoin** (`bitcoin-spv`) | Light client de headers de Bitcoin en Stellar. `verify_transaction` confirma que una tx está en un bloque con N confirmaciones y devuelve `txid`, `block_hash`, `block_height`, `confirmations`. Solo lectura, sin permisos, llamable desde cualquier contrato Soroban | Contract ID en `contracts/deployments/testnet.md` del repo |
| **API de pruebas SPV** | `GET https://api.testnet.writz.xyz/spv-proof/:txid?confirmations=N` devuelve la tx cruda, su Merkle proof y `sorobanArgs` listos para `verify_transaction` | [api.testnet.writz.xyz](https://api.testnet.writz.xyz) |
| **Crédito USDC con BTC** (`writz-lend`) | `deposit`, `borrow`, `repay`; prestamistas con `supply_usdc` y `withdraw_supply`. Lectura: `get_position`, `get_health_ratio_bp`, `get_borrow_rate_bp`, `get_supply_rate_bp`, `get_protocol_state` | [Writz Lend](https://docs.writz.xyz/products/writz-lend.md) |
| **Script de bloqueo** (`@writz/bitcoin-script`) | TypeScript: construye el redeem script, la dirección y los gastos de liberación y emergencia | Carpeta `bitcoin-script/` del repo (no está en npm) |
| **Parseo de tx Bitcoin** (`spv-types`) | Rust `no_std`: `btc_parser::find_p2wsh_output` (valor en sats de la primera salida que coincide con el script esperado), `key_proof` (firma BIP-137) | `contracts/contracts/spv-types/` |
| **Rendimiento en USDC (Earn)** | Vault DeFindex de Writz que presta USDC en Blend. `POST /defindex/deposit` y `/withdraw` devuelven tx sin firmar; `GET /defindex/apy` y `/position` para leer | [Earn](https://docs.writz.xyz/products/earn.md) |

### Contratos en testnet (de la landing)

| Contrato | Función | ID |
|---|---|---|
| bitcoin-spv | Verifica transacciones Bitcoin en Stellar | `CAHHY4S4WCIFU4LBSKBI3IP6A4QYR2COV6EACDEBXGPJFDWBJWGOMCLP` |
| zk-verifier | Verifica pruebas zero-knowledge | `CB5XAP6MF2GVVFATFTVCKVEXUODWWRQP4B3QFDMRTM55REP7N2YMXEUD` |
| commitment-tree | Árbol de compromisos (privacidad) | `CAQBLCAPGXXCZTJDAJLY7E4PTJYGR6CY4YWH4JSJKFXYIHW3GANP6RFM` |
| writz-lend | Ejecuta los préstamos | `CA3T7T2S7HV27BXO7OLIHSMGAMQ37BMOOUHQLTBGUQVL4B6Y2CDJPHHX` |
| Earn vault | Guarda los depósitos de Earn | `CBMHGL7GGGHODEDDJ5H2LKJEFHJWBRSQUKOXMC4FKOFDZK5HBKW6PI2S` |

> Confirmar siempre contra `contracts/deployments/testnet.md`, que es el registro vigente.

---

## Cosas que hay que saber antes de empezar

- **El lado Bitcoin es Signet**, no testnet clásico. Se consiguen monedas en cualquier faucet público de Signet. Una tx que no esté en Signet no verifica.
- **Las confirmaciones tardan.** 6 confirmaciones ≈ 1 hora o más. **Haz las transacciones Bitcoin el día 1**, no una hora antes del deadline. Para el demo puedes pedir menos confirmaciones, pero dilo en el pitch.
- **`verify_transaction` no recuerda.** Prueba que la tx está en la cadena, pero no la marca como usada. Si tu contrato paga contra un pago BTC, **guarda el `txid` y recházalo la segunda vez**.
- **No lee salidas.** Hay que parsear `raw_tx` para validar monto y destinatario (usar `spv-types` desde Rust).
- **Un depósito en Writz Lend es una tx Bitcoin real:** necesita Signet BTC enviado a la dirección que deriva `@writz/bitcoin-script`, 6 confirmaciones, la prueba de la API SPV y una firma BIP-137 de la llave Bitcoin del depositante (referencia: `signDeposit` en `scripts/deploy/e2e_local.mjs`).
- **USDC de testnet:** el de Circle (issuer `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`). Agrega el trustline en tu wallet y cambia XLM de testnet por USDC, o usa el faucet de Circle. El vault de Earn en testnet usa un token de prueba de Blend.
- **Wallets:** Xverse (Bitcoin) y Freighter / Stellar Wallets Kit (Stellar).

## Lo que NO está disponible todavía

| No disponible | Estado |
|---|---|
| Writz lending en mainnet | Solo testnet; mainnet Q2-Q3 2027 |
| **Privacidad de posiciones** | Edición de privacidad aparte y opcional, en diseño. **No es parte del protocolo actual** ni objetivo de integración |
| SDK en npm o crates.io | No publicado; usar `@writz/bitcoin-script` y `spv-types` desde el repo |
| Liquidador que reciba BTC | No funciona así hoy: la liquidación salda la deuda en Stellar y no mueve BTC |
| Proof of Reserves, Dark Swap, BTC Savings | Ideas en los docs, no construidas |
| Enviar headers de Bitcoin tú mismo | En testnet solo el relayer de Writz sube headers de Signet |

> 📝 La página "Technical Architecture Overview" de los docs es un borrador histórico (v0.1) y habla de privacidad de posiciones como si ya existiera. Para lo que está vivo, la fuente de verdad es "What to build on Writz" y el código del repo.

---

## Bounties de Writz en el Ideatón

| Premio | Monto |
|---|---|
| 🥇 Mejor integración con Writz | 100 USDC |
| 🥈 Segunda mejor integración | 50 USDC |

- Abiertos a **ambos tracks** y compatibles con los premios principales.
- Sirve cualquier idea de la lista de abajo, o una propia.
- Writz los otorga y entrega directamente.
- Criterio de los docs para "listarte" como proyecto construido sobre Writz: tu demo debe **depender** de una primitiva (no solo un link), con repo público, README que explique cuál usas y cómo, y los IDs de contrato o hashes de transacción que lo demuestren.

---

## Ideas propuestas por Writz (con puntaje)

| # | Idea | Primitiva | Stellar fit | Fin de semana | Negocio |
|---|---|---|---|---|---|
| 1 | Escrow P2P de Bitcoin por USDC | Verificación de pagos | Alto | Alto | Alto |
| 2 | Paga con Bitcoin, contabilidad en Stellar | Verificación de pagos | Alto | Alto | Medio |
| 3 | Pedir prestado en vez de vender: remesas con respaldo en BTC | Crédito USDC | Alto | Medio | Alto |
| 4 | Planilla desde una tesorería en Bitcoin | Crédito USDC | Alto | Medio | Alto |
| 5 | Guardián de posición (alertas de liquidación) | Crédito USDC (lectura) | Alto | Alto | Medio |
| 6 | Línea de crédito en BTC para agentes de IA | Crédito USDC | Alto | Medio | Medio |
| 7 | Verificación de pagos Bitcoin como herramienta para agentes (MCP) | Verificación de pagos | Medio | Alto | Medio |
| 8 | **Círculos de ahorro (tandas) que generan rendimiento mientras esperan** | Earn | Alto | Alto | Medio |

### Detalle de cada idea

**1. Escrow P2P de Bitcoin por USDC**
- *Problema:* en LatAm se cambia BTC por dólares entre personas; alguien siempre tiene que enviar primero y confiar.
- *Cómo:* el vendedor de USDC bloquea USDC en un escrow Soroban; el comprador paga BTC; el escrow llama `verify_transaction`, parsea salidas y libera el USDC solo cuando el BTC llegó con suficientes confirmaciones.
- *Alcance 48h:* contrato escrow (crear oferta, bloquear USDC, reclamar con prueba SPV, reembolso tras deadline) + llamada a `bitcoin-spv` + `spv-types` + set de `txid` usados + página web. Un trade completo en testnet.
- *Extra:* dirección inversa, fills parciales, reputación por dirección, anchor SEP-24.

**2. Paga con Bitcoin, contabilidad en Stellar**
- *Problema:* negocios turísticos en Costa Rica (hostales, surf, tours) deben aceptar Bitcoin, pero verificar pagos y conciliar es manual.
- *Cómo:* cada factura es un registro en Stellar; se marca pagada cuando `verify_transaction` prueba el pago BTC; el recibo queda on-chain.
- *Alcance 48h:* página de factura (monto, dirección BTC, expiración), contrato que marca pagada y rechaza `txid` repetido, dashboard de facturas pagadas. Demo con un pago Signet.
- *Extra:* valor fiat fijado con el oráculo Reflector, pago en USDC vía anchor, flujo QR.

**3. Remesas con respaldo en BTC**
- *Problema:* quien tiene BTC y manda remesas tiene que vender su Bitcoin.
- *Cómo:* pide USDC en Writz Lend contra BTC bloqueado y lo envía por Stellar al destinatario o a un anchor.
- *Alcance 48h:* app mobile-first: mostrar posición, cuánto se puede pedir seguro, pedir, enviar USDC, calendario de pago. Usar el [anchor de prueba de Stellar](https://testanchor.stellar.org) (SEP-24). Crear el depósito BTC el día 1.

**4. Planilla desde tesorería en Bitcoin**
- *Cómo:* el día de pago la empresa pide USDC contra su BTC y paga a todos en una sola transacción Stellar.
- *Alcance 48h:* dashboard (colateral, deuda, salud con `get_health_ratio_bp`, tasa con `get_borrow_rate_bp`), lista de pagados y acción "correr planilla" con guarda que rechaza si la salud baja de un umbral.

**5. Guardián de posición**
- *Cómo:* bot de Telegram/WhatsApp que registra una posición por `txid`, consulta su salud, alerta en umbrales y muestra el precio BTC de liquidación; incluye link para pagar.
- *Alcance 48h:* usar `get_position` y `get_health_ratio_bp` + feed de Reflector.

**6. Línea de crédito en BTC para agentes de IA**
- *Cómo:* el dueño mantiene una posición en Writz Lend; la wallet Stellar del agente se recarga con USDC prestado bajo límites del dueño; el agente paga APIs (ej. x402 en Stellar).

**7. Verificación de pagos BTC como herramienta para agentes**
- *Cómo:* servidor MCP con herramienta `verify_bitcoin_payment` que responde desde `verify_transaction` en Stellar y no desde un explorador.

**8. Círculos de ahorro que ganan mientras esperan** ⭐
- *Problema:* en las tandas el dinero del bote está parado y el organizador necesita confianza.
- *Cómo:* entre pagos, el USDC del grupo vive en el vault de Earn y gana rendimiento; el relayer arma las transacciones de depósito y retiro para que la wallet del grupo las firme.
- *Alcance 48h:* contrato Soroban de un círculo (miembros, aporte, orden de rotación, pago) que deposita aportes en Earn y retira el bote del miembro al que le toca + página simple para miembros. Usar los endpoints de Earn en testnet.
- *Extra:* multas por atraso, invitaciones por teléfono, un grupo donde los miembros aportan pidiendo prestado contra su BTC en Writz Lend.

---

## Checklist para el bounty

- [ ] Elegir qué primitiva de Writz usar (Earn, verificación SPV o Lend)
- [ ] Conseguir wallets: Xverse (Signet) y Freighter (Stellar testnet)
- [ ] Agregar trustline de USDC de Circle (testnet) y fondear
- [ ] Si se usa SPV o Lend: hacer la tx Bitcoin en Signet **el día 1**
- [ ] Guardar los `txid` usados para no aceptarlos dos veces
- [ ] Repo público con README que explique la integración
- [ ] Anotar contract IDs y hashes de transacción como evidencia
- [ ] Mencionar en el pitch cualquier simplificación (ej. menos confirmaciones)
- [ ] Preguntar dudas en el Discord de Writz

---

## Páginas de los docs para leer a fondo

- [What to build on Writz](https://docs.writz.xyz/developers/request-for-startups.md)
- [Quick Start](https://docs.writz.xyz/developers/quick-start.md)
- [Testnet Runbook](https://docs.writz.xyz/developers/runbook.md)
- [Contract Reference](https://docs.writz.xyz/developers/contract-reference.md)
- [Bitcoin SPV SDK](https://docs.writz.xyz/developers/spv-sdk.md)
- [Earn](https://docs.writz.xyz/products/earn.md)
- [Writz Lend](https://docs.writz.xyz/products/writz-lend.md)
- [Security Model](https://docs.writz.xyz/security/security-model.md)
