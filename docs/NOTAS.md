# Estado de integraciones

## Stellar Testnet

- La app consulta e invoca el contrato Soroban directamente desde el navegador; cada escritura requiere la firma de la wallet.
- El contrato v3 necesita una nueva instancia: la dirección anterior no ofrece aceptación Earn ni llamadas al vault. Registra las direcciones v3 en `docs/despliegue-local.md`, archivo ignorado por Git.
- `NEXT_PUBLIC_CUOTIA_TOKEN_ID` es el token común para todos los círculos. Para Testnet se eligió Circle USDC SAC: `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`.
- La guía para compilar y desplegar está en `docs/despliegue-testnet-dev.md`; la versión v3 requiere Stellar CLI 25.2.0 o posterior.

## Writz Earn

- El APY de referencia se consulta al relayer Writz. En círculos Earn, el contrato deposita Blend Testnet USDC en el vault y registra shares por miembro; aceptación unánime bloquea aportes hasta que todas las wallets acepten.
- El valor de reclamo puede variar y la estrategia puede demorar o impedir retiros. Hace falta probar depósito, ciclo completo, cancelación y reclamos con varias wallets antes de usar el contrato nuevo.
- `WRITZ_RELAYER_URL` es opcional y solo cambia la URL del relayer usada por las rutas del servidor; por defecto se usa el endpoint testnet de Writz.

## Pendiente para habilitar la demo

1. En Vercel, configurar `NEXT_PUBLIC_CUOTIA_CONTRACT_ID` con el ID v4 de demo que aparece en `docs/despliegue-local.md`; confirmar token y RPC.
2. Volver a desplegar la web en Vercel para aplicar las variables `NEXT_PUBLIC_`.
3. Validar creación, aceptación, aportes al vault, cancelación y reclamos con varias wallets Testnet antes de la demo.
