# Writz Earn for savings circles

## Product behavior

Writz Earn is an optional setting on a new savings circle. The organizer proposes it; every member must explicitly accept from their own Stellar wallet before any contribution is allowed. If members do not reach consensus, an unstarted Earn circle can be cancelled without taking funds.

Standard circles continue using the configured Circle USDC SAC. Earn circles use Blend Testnet USDC, the underlying asset of the documented Writz DeFindex vault. Those are separate Testnet assets, so the creation form and circle details must identify the selected token clearly.

In an Earn circle, the Cuotia contract deposits each contribution into the Writz vault and records the resulting shares for the contributing member. At completion or cancellation, each member claims by redeeming only their own shares. The amount received can be less or more than that member's contributions, less vault fees, and can be delayed or fail if the vault or strategy cannot withdraw. The APY is a changing reference, never a promised circle return.

## Current implementation state (Testnet)

- `/savings/create` has an optional Writz Earn choice. The organizer's creation signature counts as their consent.
- Every other member must call `accept_earn` with their own wallet. The contract rejects contributions until all members have accepted.
- Earn contributions are transferred into the Cuotia contract and deposited into the fixed Writz Testnet vault. The contract records the minted shares per member.
- Completion or cancellation allows each member to redeem only their recorded shares. If an Earn circle is still unstarted and consensus is not reached, a member can cancel it.
- `/how-it-works#earn` explains the circle-level option and displays Writz's live APY reference. The panel does not make personal deposits.
- The Writz relayer is used only for the APY read. Soroban executes vault deposits and withdrawals through cross-contract calls from the Cuotia contract.
- Source is `contracts/cuotia-v3/`. The current local Testnet instance is v4 at `CAPUBTZD32WP65PEXKTO4QVATDM257YZG3QVWXDH7KMEY3KOABQGA5YW`; the separate Vercel Testnet instance is `CBTZXH7IRUDWANOE4C2DKRWAYWP6CDBYBHUTNN6BUFXQ6GQVTNB3FVWP`. Both start with empty storage and do not migrate v2/v3 circles.
- v4 explicitly authorizes the Blend token transfer performed inside DeFindex `deposit`, which was missing in v3. Build and deploy succeeded; the source builds with Stellar CLI 28.1.0 / Soroban SDK 28.0.0.

## Contract and asset details

- Vault: `CBMHGL7GGGHODEDDJ5H2LKJEFHJWBRSQUKOXMC4FKOFDZK5HBKW6PI2S`.
- Underlying Blend Testnet USDC token: `CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU`.
- Writz vault shares use the `wzUSDC` symbol. Shares belong to the Cuotia contract, with per-circle and per-member share accounting in Cuotia storage.
- The vault is upgradeable. The supplied deployment notes report a 1% vault performance fee, with DeFindex receiving a share of that fee; fees apply to yield, not principal. Recheck these facts on-chain before a public or mainnet release.
- The supplied Writz relayer's deposit/withdraw endpoints create XDR for a G-address wallet. They do not implement the group contract flow, so those endpoints are deliberately not used for circle funds.

## Local build and deployment

The contract requires Stellar CLI 25.2.0 or later to produce the Soroban contract spec. The local Testnet app now points to the v4 deployment documented in ignored `docs/despliegue-local.md`. Configure Vercel with its separate v4 instance ID and redeploy the web app. Do not point either app at v2 or v3.

The corrected contract is deployed to Testnet and configured in the local `.env.local`. This confirms compilation and deployment, not the complete wallet-driven flow. Deposit into the vault, share accounting, withdrawal, cancellation, liquidity failure, and multiple-circle isolation still require end-to-end Testnet validation with disposable wallets. This prototype is not for real funds.

## Testnet validation still required

1. Create both a standard circle and an Earn circle; confirm each stores the correct token and mode.
2. Verify a non-organizer must separately accept, and that no member can contribute before unanimous consent.
3. With at least two wallets, complete multiple rounds; verify each deposit mints and records shares for the correct member.
4. Complete the circle and redeem each member's shares. Compare claims with vault share valuation and confirm there is no cross-circle or cross-member claim.
5. Cancel an incomplete circle after its grace period and redeem only each member's own shares.
6. Cancel an unstarted Earn circle and verify no funds are trapped.
7. Exercise failed deposit, vault pause/strategy failure, low liquidity, rounding, and repeated claims. Confirm failures do not mark shares claimed or lose accounting.
8. Repeat with two simultaneous Earn circles to confirm the shared vault balance cannot make one circle claim another circle's value.

## Security and release limits

This Testnet flow has not been audited and the deployed Writz vault is upgradeable. Vault calls may fail or produce less value than principal. Mainnet remains out of scope until an independent review covers the Cuotia contract, DeFindex vault behavior, share allocation and rounding, cancellation, and delayed or failed withdrawals. Never describe the APY as guaranteed or promise principal recovery in Earn mode.

## References

- Writz relayer API and Testnet vault deployment details: provided in the local Writz documentation shared for this task.
- Stellar cross-contract invocation: [Stellar developer docs](https://developers.stellar.org/docs/build/guides/conventions/cross-contract).
- DeFindex Vault interface and source: [Vault contract interface](https://raw.githubusercontent.com/paltalabs/defindex/main/apps/contracts/vault/src/interface.rs), [Vault contract source](https://raw.githubusercontent.com/paltalabs/defindex/main/apps/contracts/vault/src/lib.rs).
- The vault supports `deposit(amounts_desired, amounts_min, from, invest)` and `withdraw(df_amount, min_amounts_out, from)`. Its `from` address is authorized by Soroban invocation context; this circle flow must still be confirmed against the deployed Testnet contract.
