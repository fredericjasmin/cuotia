# Cuotia Testnet deployment

Cuotia has one active circle model: savings circles. The local Next.js app and the deployed app can use separate Soroban contract instances, but both connect to Stellar Testnet.

## What runs locally

`npm run dev` starts the website and API on your computer. Contract calls go to the Testnet RPC; there is no local Stellar network in this setup. Rust and Stellar CLI compile and deploy the contract separately from the web app.

## Token

The prototype uses Circle USDC on Stellar Testnet through its Stellar Asset Contract (SAC):

```text
CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
```

The SAC ID can be checked with Stellar CLI:

```powershell
stellar contract id asset --asset "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5" --network testnet
```

Use the [Circle Testnet faucet](https://faucet.circle.com/) for USDC and XLM. Each wallet needs a USDC trustline and XLM for fees and reserves.

## Requirements and deployer identities

Install Rust/Cargo, the Soroban Wasm target, and Stellar CLI. Then configure Testnet:

```powershell
rustup target add wasm32v1-none
stellar network use testnet
stellar keys generate cuotia-dev --network testnet --secure-store --fund
```

For a separate Vercel instance, create a second deployer identity, such as `cuotia-demo`. Keep deployer keys in Windows Secure Store; never place them in the repository or Vercel.

## Build and deploy

```powershell
Push-Location contracts/cuotia-v3
stellar contract build --optimize=false
Pop-Location
stellar contract deploy --wasm contracts/cuotia-v3/target/wasm32v1-none/release/cuotia_contract_v3.wasm --source-account cuotia-dev --network testnet --optimize=false --alias cuotia-v3-dev
```

Save the returned public contract ID in the ignored local file `docs/despliegue-local.md`. A new deployment starts with empty contract storage; it does not migrate circles from another instance.

## Configure the local app

Set these values in `.env.local` using the development contract ID:

```dotenv
NEXT_PUBLIC_CUOTIA_CONTRACT_ID=<DEVELOPMENT_CONTRACT_ID>
NEXT_PUBLIC_CUOTIA_TOKEN_ID=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
NEXT_PUBLIC_SOROBAN_RPC_URL=https://soroban-testnet.stellar.org
```

Restart `npm run dev` after changing any `NEXT_PUBLIC_` variable. The app uses the connected member's wallet for signatures; deployer identities are not needed for normal use.

## Configure Vercel

Set the same variables in Vercel, using the separate demo contract ID. Redeploy the app after changing public variables. Do not configure a contract until its full creation, contribution, cancellation, and claim flow has been checked with multiple Testnet wallets.

The deployed contract cannot be removed by deleting local source files. Existing Testnet state remains on Stellar; a new deployment is a different contract with independent storage.
