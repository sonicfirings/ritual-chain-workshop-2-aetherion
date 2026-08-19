# Aetherion Ritual Predict

Aetherion Ritual Predict is my fork of `cozfuttu/ritual-chain-workshop-2`, extended into a self-resolving prediction market project with local verification and a Vercel-ready demo frontend.

The original workshop focuses on a prediction market that resolves itself on Ritual Chain. Users create YES/NO markets, bet native RITUAL, and rely on Ritual's Scheduler to trigger resolution after the betting window closes. The contract reads oracle data through Ritual's HTTP precompile, extracts the needed value with jq, compares it to the market rule, and lets winners claim payouts.

Because the Ritual testnet was unavailable during final submission, I focused on work that can still be reviewed: contract implementation, local tests, local build verification, and an interactive frontend demo.

## What I Built

- Implemented and tested the `RitualPredict` contract flow in `hardhat/contracts/RitualPredict.sol`.
- Added Solidity tests in `hardhat/test/RitualPredict.t.sol`.
- Added a Vercel-ready Next.js frontend in `web/`.
- Added demo mode so reviewers can interact with the prediction market while the chain is down.
- Built a compact market-board UI with multiple clickable prediction cards.
- Added focused fullscreen betting pages for each market.
- Added animated demo behavior: ticking block number, drifting odds, changing pools, and moving charts.
- Added `LOCAL_VERIFICATION.md` with the final checks that passed locally.

## Repository Map

```text
.
├── hardhat/
│   ├── contracts/RitualPredict.sol
│   ├── contracts/ritual/RitualChain.sol
│   ├── test/RitualPredict.t.sol
│   └── README.md
├── web/
│   ├── app/
│   ├── components/prediction-market.tsx
│   ├── lib/
│   └── README.md
└── LOCAL_VERIFICATION.md
```

## Contract Lifecycle

1. A user creates a market with a question, oracle URL, jq path, target value, comparator, betting duration, and resolution delay.
2. The contract converts human-readable durations into block numbers.
3. The market is scheduled for automatic resolution through Ritual Scheduler.
4. Users bet YES or NO with native RITUAL before the close block.
5. When the scheduled block arrives, the Scheduler calls the contract.
6. The contract selects a TEE executor, reads oracle data with the HTTP precompile, parses a value with jq, and compares it to the target.
7. The market becomes resolved if the oracle read succeeds, or invalid/refundable if resolution fails after retries.
8. Winners claim payouts through a pull-based claim function.

## Ritual Architecture

```text
User creates market
        |
        v
RitualPredict stores rule + schedules callback
        |
        v
Users bet YES / NO until close block
        |
        v
Ritual Scheduler calls onScheduledResolve()
        |
        v
TEE executor performs HTTP oracle read
        |
        v
jq precompile extracts a uint256 value
        |
        v
Contract compares observed value to target
        |
        v
Resolved market or refundable invalid market
```

## Local Verification

Final local checks completed:

```bash
cd hardhat
pnpm exec hardhat test
```

Result:

```text
8 passing (8 solidity)
```

```bash
cd web
pnpm run build
```

Result: Next.js production build passed.

The final verification record is also written in `LOCAL_VERIFICATION.md`.

## Frontend Demo

The frontend is inside `web/` and is ready for Vercel.

Demo mode exists because the Ritual testnet was unavailable. In demo mode, the app does not need a live contract address. It shows sample markets and lets reviewers interact with:

- market cards
- fullscreen betting pages
- simulated YES/NO bets
- animated odds
- moving sparklines
- block ticks
- local claim/refund actions

For Vercel, set the project root to:

```text
web
```

Use demo mode:

```text
NEXT_PUBLIC_DEMO_MODE=true
```

For live mode later:

```text
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_RITUAL_PREDICT_ADDRESS=<deployed RitualPredict contract>
NEXT_PUBLIC_RITUAL_RPC_URL=https://rpc.ritualfoundation.org
```

No private key is used in the frontend. Wallet actions are signed by the user's browser wallet.

## Notes

This fork keeps the default repository name expected by the workshop verification flow: `ritual-chain-workshop-2`.

The work is intentionally reviewable without live chain access. The contract tests prove the core behavior locally, and the frontend demo shows how the market would feel when used by participants.
