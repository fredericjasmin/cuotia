# Aporte automático

Cada miembro de un círculo puede activar, si quiere, que su aporte se cobre solo al inicio de cada ronda. Viene **apagado por defecto** y es una decisión individual: no se configura por círculo.

## Cómo funciona

1. **El miembro lo activa** con `set_auto_pay(id, member, true)` y firma una sola vez. El contrato lleva, por miembro y por token, un `AutoPayGrant`:
   - `committed`: lo que todavía falta aportar en todos los círculos donde ese miembro tiene el aporte automático activado;
   - `expires_ledger`: el ledger en que vence la autorización.

   Dentro de la misma llamada, el contrato deja el `approve` del token (SEP-41) a favor de Cuotia **exactamente** en `committed`, con el vencimiento más largo que permite la red.
2. **El cobro** lo hace `collect(id, member)`. Puede llamarlo cualquiera; en la práctica lo llama el job programado. El contrato usa `transfer_from` para tomar **un solo aporte de la ronda actual**, con las mismas reglas que un aporte manual:
   - la ronda tiene que estar abierta y dentro del período de gracia;
   - el miembro no tiene que haber pagado esa ronda;
   - en círculos con Writz Earn, todo el grupo tiene que haber aceptado.

   El miembro no firma el cobro, y `committed` baja en el mismo monto.
3. **Si el miembro paga a mano** teniendo el automático activado, `committed` y la autorización bajan un aporte. No queda autorización de más.
4. **Desactivarlo** es `set_auto_pay(id, member, false)`: le resta a `committed` lo que faltaba de ese círculo y vuelve a ajustar la autorización (si llega a 0, la revoca). También se puede desactivar con el círculo **terminado o cancelado**, para limpiar lo que quedaba.
5. **Renovar** es volver a llamar `set_auto_pay(id, member, true)` con el automático ya activado: extiende el vencimiento sin cambiar el monto. La app muestra la fecha aproximada de vencimiento (con `auto_pay_grant(member, token)`) y avisa 30 días antes o cuando ya venció.

Eventos en la red:
- `auto_pay` (`id`, `member`, `enabled`): se activó, desactivó o renovó.
- `auto_paid` (`id`, `member`, `round`): se cobró un aporte automático. Reemplaza a `contrib` en ese caso.

Garantías:
- El contrato no tiene función de upgrade, así que nadie puede cambiar estas reglas.
- Nunca cobra más de un aporte por ronda y por círculo.
- Solo cobra a quien activó el aporte automático, y únicamente mientras el círculo está activo.
- La autorización total nunca supera lo que el miembro todavía debe en sus círculos con aporte automático.

## Job programado (`/api/auto-pay`)

`lib/auto-pay-keeper.mjs` recorre todos los círculos y, en cada uno:
- abre la siguiente ronda (`advance_round`) si todos pagaron y ya pasó la fecha;
- después llama `collect` para cada miembro con aporte automático que todavía no pagó.

La cuenta del job (`CUOTIA_KEEPER_SECRET`) **solo paga comisiones** y no guarda fondos de nadie. Antes de enviar cada transacción la simula, que es gratis. Solo envía y cuenta en el tope lo que va a salir bien: un cobro que fallaría (sin saldo, sin trustline o con la autorización vencida) no gasta comisión y se reintenta en la próxima ejecución.

Límites por ejecución:
- 25 transacciones enviadas;
- 300 simulaciones;
- 25 segundos, por debajo del tiempo de espera de 30 s de cron-job.org (y del límite de 60 s de Vercel).

Además, cada ejecución arranca desde un círculo al azar y solo toca círculos con los USDC de la app donde alguien activó el aporte automático.

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
5. En cron-job.org, crear un trabajo **cada hora** (`0 * * * *`, tiempo de espera 30 s):
   - método `POST` a `https://<dominio>/api/auto-pay`;
   - header `x-cron-key: <AUTO_PAY_CRON_KEY>`.
