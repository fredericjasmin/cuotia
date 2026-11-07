# Aporte automático

Cada miembro de un círculo puede activar, si quiere, que su aporte se cobre solo al inicio de cada ronda. Viene **apagado por defecto** y es una decisión individual: no se configura por círculo.

## Cómo funciona

1. **El miembro lo activa** con `set_auto_pay(id, member, true)`. Firma una sola vez. Dentro de esa misma llamada, el contrato pide al token USDC (SEP-41) un `approve` a favor de Cuotia por exactamente lo que ese miembro todavía debe en ese círculo: el aporte multiplicado por las rondas que faltan. Esa autorización se suma a la que ya haya dado en otros círculos.
2. **El cobro** lo hace `collect(id, member)`. Puede llamarlo cualquiera; en la práctica lo llama el job programado. El contrato usa `transfer_from` para tomar **un solo aporte de la ronda actual**, con las mismas reglas que un aporte manual:
   - la ronda tiene que estar abierta y dentro del período de gracia;
   - el miembro no tiene que haber pagado esa ronda;
   - en círculos con Writz Earn, todo el grupo tiene que haber aceptado.

   El miembro no firma el cobro.
3. **Desactivarlo** es `set_auto_pay(id, member, false)`: le resta a la autorización lo que faltaba de ese círculo. Si no queda nada, la deja en 0.
4. Quien no lo activa sigue pagando a mano con `contribute`. Quien lo activó también puede pagar a mano antes del cobro.

Eventos en la red:
- `auto_pay` (`id`, `member`, `enabled`): se activó o desactivó.
- `auto_paid` (`id`, `member`, `round`): se cobró un aporte automático. Reemplaza a `contrib` en ese caso.

Garantías:
- El contrato nunca cobra más de un aporte por ronda y por círculo.
- Solo cobra a quien activó el aporte automático, y únicamente mientras el círculo está activo.
- Si un miembro pagó a mano estando activado, le queda un aporte de autorización sin usar. El contrato no puede usarlo fuera de esas reglas, y se descuenta al desactivar.

## Job programado (`/api/auto-pay`)

`lib/auto-pay-keeper.mjs` recorre todos los círculos y, en cada uno:
- abre la siguiente ronda (`advance_round`) si todos pagaron y ya pasó la fecha;
- después llama `collect` para cada miembro con aporte automático que todavía no pagó.

La cuenta del job (`CUOTIA_KEEPER_SECRET`) **solo paga comisiones** y no guarda fondos de nadie. Si un cobro falla (sin saldo o sin trustline), se reintenta en la próxima ejecución.

Variables de entorno, solo de servidor:

| Variable | Qué es |
|---|---|
| `AUTO_PAY_CRON_KEY` | Clave larga y aleatoria; cron-job.org la manda en el header `x-cron-key` |
| `CUOTIA_KEEPER_SECRET` | Clave secreta de una cuenta de Testnet con XLM para comisiones |

Respuestas:
- `503` si falta configuración.
- `401` si la clave no coincide.
- `200` con un resumen: círculos revisados, rondas abiertas, cobros hechos y fallidos.

## Puesta en marcha

1. Compilar y probar:

   ```sh
   cd contracts/cuotia-v3
   cargo test
   stellar contract build
   ```

2. Desplegar una instancia nueva en Testnet. El struct `Circle` cambió, así que no hay migración desde v4.

   ```sh
   stellar contract deploy --wasm target/wasm32v1-none/release/cuotia_contract_v3.wasm --source <cuenta> --network testnet --alias cuotia-v5
   ```

   Anotar el ID en `docs/despliegue-local.md` y ponerlo en `NEXT_PUBLIC_CUOTIA_CONTRACT_ID`.

3. Crear la cuenta del job:

   ```sh
   stellar keys generate cuotia-keeper --network testnet --fund
   stellar keys show cuotia-keeper
   ```

   El segundo comando muestra el secreto, que va en `CUOTIA_KEEPER_SECRET`.

4. Definir `AUTO_PAY_CRON_KEY` con un valor aleatorio, por ejemplo `openssl rand -hex 32`.
5. En cron-job.org, crear un trabajo **cada hora**:
   - método `POST` a `https://<dominio>/api/auto-pay`;
   - header `x-cron-key: <AUTO_PAY_CRON_KEY>`.
