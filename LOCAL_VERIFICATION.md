# Local Verification

Final local verification for the Ritual Predict fork while Ritual testnet deployment is unavailable.

Date: August 19, 2026

## Repository

- Fork URL: https://github.com/sonicfirings/ritual-chain-workshop-2
- Default branch: main
- Frontend root for Vercel: `web`

## Checks Run

```bash
cd hardhat
pnpm exec hardhat test
```

Result: 8 Solidity tests passing.

```bash
cd web
pnpm run build
```

Result: Next.js production build passed.

## Notes

The contract implementation, tests, Vercel-ready frontend, demo mode, animated market board, and focused betting pages are committed in this fork. Demo mode exists so the frontend remains reviewable even when the Ritual testnet is unavailable.
