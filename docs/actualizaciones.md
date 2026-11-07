# Actualizar el contrato sin perder círculos

Desde la v6, el contrato de Cuotia se puede actualizar: se reemplaza su código y se mantienen la misma dirección y todos los círculos, aportes, permisos de aporte automático y comisiones acumuladas. La app no cambia de configuración (`NEXT_PUBLIC_CUOTIA_CONTRACT_ID` sigue igual).

Antes de la v6, cada versión era un contrato nuevo y vacío.

## Quién puede actualizar

Solo la cuenta **admin**, fijada al desplegar (`--admin`). Se consulta con `admin` y se transfiere con `set_admin`, que necesita la firma del admin actual y la del nuevo (así un error de tipeo no deja el contrato sin dueño). En Testnet el admin es la identidad `cuotia-testnet-deploy`.

Las comisiones (`claim_fee_bps`, `yield_fee_bps`) quedan guardadas en cada círculo al crearlo. Una actualización no las cambia para los círculos existentes, salvo que el código nuevo lo haga a propósito.

## Pasos

1. Subir `CONTRACT_VERSION` en `contracts/cuotia-v3/src/lib.rs` (por ejemplo, de 6 a 7).
2. Si la versión cambia la forma de algo guardado, escribir la conversión en `migrate` (ver reglas abajo).
3. Correr los tests: `npm test`.
4. Probarlo primero en una instancia descartable de Testnet: desplegar la versión actual, crear un círculo, actualizar y verificar que el círculo sigue y se puede aportar y retirar.
5. Compilar y subir el código nuevo:

   ```powershell
   Push-Location contracts/cuotia-v3
   stellar contract build --optimize=false
   Pop-Location
   stellar contract upload --wasm contracts/cuotia-v3/target/wasm32v1-none/release/cuotia_contract_v3.wasm --source-account cuotia-testnet-deploy --network testnet
   ```

   Devuelve el hash del código (64 caracteres hex).

6. Instalarlo y migrar, en este orden, en cada instancia (local y demo):

   ```powershell
   stellar contract invoke --id cuotia-v6-demo --source-account cuotia-testnet-deploy --network testnet -- upgrade --new_wasm_hash <HASH>
   stellar contract invoke --id cuotia-v6-demo --source-account cuotia-testnet-deploy --network testnet -- migrate
   stellar contract invoke --id cuotia-v6-demo --source-account cuotia-testnet-deploy --network testnet -- version
   ```

   `migrate` falla con el error 29 (`VersionNotNewer`) si ya se corrió o si `CONTRACT_VERSION` no se subió. Así no puede correr dos veces.

7. Si la app usa funciones nuevas, desplegar la app después de actualizar el contrato.

## Reglas para no romper los datos guardados

Los círculos guardados se leen con la estructura del código nuevo. Si no coinciden, ese círculo no se puede leer.

- **No agregar, quitar ni renombrar campos de `Circle`, `AutoPayGrant` o `FeeConfig`** sin migrar los datos guardados. Para un dato nuevo, guardarlo en una clave nueva de `DataKey`, por ejemplo `CircleExtra(u32)`, y tratar su ausencia como valor por defecto.
- **No cambiar el orden ni el significado de las variantes de `DataKey`, `CircleStatus` ni `CircleError`.** Solo agregar variantes al final.
- Las conversiones que sí hagan falta van en `migrate` con `if from_version < N { ... }`. Si hay muchos círculos, la conversión tiene que poder hacerse por partes (los límites de cada transacción son finitos).
- Las funciones públicas que usa la app (`create_circle`, `contribute`, `claim`, etc.) mantienen sus argumentos. Si cambian, la versión vieja de la app falla hasta que se despliegue la nueva.

## Testnet y Mainnet

El mecanismo es el mismo en las dos redes. Diferencias:

- **Testnet se reinicia cada tanto** (lo decide la Stellar Development Foundation) y borra todos los contratos y datos. Ninguna actualización protege de eso.
- **Antes de Mainnet**, el admin no puede ser una sola clave: pasarlo con `set_admin` a una cuenta multifirma (por ejemplo 2 de 3) y agregar un plazo de espera público antes de instalar cada versión, para que quien no esté de acuerdo pueda retirar su ahorro. Más adelante se puede renunciar al admin y dejar el contrato fijo.
