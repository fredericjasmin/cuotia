# Cuotia

Cuotia helps groups organize community savings circles. The web app and its API use Next.js and Node.js; a Soroban smart contract stores shared circles on Stellar Testnet.

## Architecture

- The repository root contains the single Next.js app: the website, API routes, and Stellar JavaScript client.
- `contracts/cuotia-v3/` contains the new Soroban contract for savings circles, cancellations, individual claims, and unanimous optional Writz Earn. It requires a fresh Testnet deployment; configure `NEXT_PUBLIC_CUOTIA_CONTRACT_ID` with that new instance.
- `docs/` contains architecture, project planning, and integration notes.

The root `package.json` belongs to the Next.js app. There are no separate packages or npm workspaces.

## Run locally

Use Node.js 24, as declared in `package.json`. Run these commands from the repository root:

```sh
npm install
npm run dev
```

The local app runs at `http://localhost:4173`. Other available commands:

```sh
npm run build
npm test
npm start
```

`npm run dev` and `npm start` launch the web app and API through Next.js. There is no separate backend server.

## Deploy the app to Vercel

1. Import the repository into Vercel.
2. Keep **Root Directory** set to the repository root.
3. Select the Next.js framework, Node.js **24.x**, `npm run build`, and the default `.next` output.
4. Add the environment variables from [`.env.example`](.env.example). Set the deployed contract ID and one verified Stellar Testnet Soroban token ID shared by all circles.
5. Redeploy after changing any `NEXT_PUBLIC_` variables.

Vercel builds and hosts Next.js. The contract is compiled and deployed separately to Stellar Testnet; the app connects to it using its public ID. The website can deploy without the contract and token IDs, but shared-circle features remain disabled.

## Testnet status

The wallet signs each operation and keeps the private keys. The new circle contract must be deployed separately to Stellar Testnet; local deployment details are recorded in the ignored `docs/despliegue-local.md`. Standard circles use Circle USDC. A creator may instead propose Writz Earn, which requires every member's separate acceptance and uses Blend Testnet USDC; each person's eventual claim depends on the value recovered from their vault shares. This new contract flow needs end-to-end Testnet validation before it is configured in Vercel. See the [Writz Earn integration plan](docs/writz-integration-plan.md).

This is an unaudited Testnet prototype. Do not use real funds or share secret recovery phrases. See the [architecture](docs/arquitectura.md), [contract status](docs/contrato-cuotia.md), and [development/Testnet deployment guide](docs/despliegue-testnet-dev.md).
