# Ritual Predict Web

A Vercel-ready Next.js frontend for the Ritual Predict assignment contract.

## Local setup

```bash
cd web
pnpm install
copy .env.example .env.local
pnpm dev
```

For a testnet-down demo, leave the contract address as zero and set `NEXT_PUBLIC_DEMO_MODE=true`. For live mode, set `NEXT_PUBLIC_DEMO_MODE=false` and `NEXT_PUBLIC_RITUAL_PREDICT_ADDRESS` to the deployed `RitualPredict` contract address.

## Vercel

Import the GitHub fork, choose `web` as the project root, and set these environment variables:

- `NEXT_PUBLIC_DEMO_MODE=true` for a no-chain demo, or `false` for live mode`n- `NEXT_PUBLIC_RITUAL_PREDICT_ADDRESS`
- `NEXT_PUBLIC_RITUAL_RPC_URL` (optional, defaults to `https://rpc.ritualfoundation.org`)

No private key belongs in this frontend. Wallet actions are signed by the user's browser wallet.
