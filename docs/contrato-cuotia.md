# Cuotia savings contract

The Soroban contract source is in `contracts/cuotia-v3/`. The application uses it for all circles. It stores a fixed contribution per member, frequency, number of rounds, and each member's paid and claimed totals.

## Circle lifecycle

- Members contribute the configured amount each round.
- Once every member contributes, anyone can open the next round after its scheduled period.
- If a round is still incomplete three days after its deadline, anyone can cancel the circle.
- Cancellation does not send refunds automatically. Each member claims their own recorded contributions in a wallet-signed transaction.
- When every round completes, each member claims their own total in a separate transaction.

The contract does not pay an organizer or a shared recipient. Monthly periods are modeled as 30 days. Writz Earn is an optional circle mode: every member must accept before contributions begin. Earn circles use Blend Testnet USDC, deposit through the DeFindex vault, and claim the value recovered by each member's recorded shares. The APY is not guaranteed; claims can be lower than principal or delayed by vault liquidity.

## Local development and Testnet

Compile from the repository root:

```powershell
Push-Location contracts/cuotia-v3
stellar contract build --optimize=false
Pop-Location
```

Deploy the generated Wasm to Stellar Testnet:

```powershell
stellar contract deploy --wasm contracts/cuotia-v3/target/wasm32v1-none/release/cuotia_contract_v3.wasm --source-account cuotia-dev --network testnet --optimize=false --alias cuotia-v3-dev
```

Configure the returned public contract ID in `.env.local` as `NEXT_PUBLIC_CUOTIA_CONTRACT_ID`. Also configure `NEXT_PUBLIC_CUOTIA_TOKEN_ID` with the Circle USDC Testnet Stellar Asset Contract and `NEXT_PUBLIC_SOROBAN_RPC_URL` with the Testnet RPC. The local deployment IDs are in `docs/despliegue-local.md`, which is ignored by Git.

Vercel runs the Next.js app; the Soroban contract is deployed separately. Do not add Stellar secret keys to `.env.local`, Git, or Vercel. Testnet tokens have no real value. The contract has not been audited; do not use real funds.
