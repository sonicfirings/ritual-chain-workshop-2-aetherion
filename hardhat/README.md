# Ritual Predict — contracts

The `RitualPredict` market contract, its tests, and the deployment scripts.
Full architecture and the workshop runbook live in [../README.md](../README.md).

## Layout

```
contracts/
  RitualPredict.sol          the market: creation, betting, autonomous resolution, payouts
  ritual/RitualChain.sol     canonical Ritual addresses + system contract interfaces
test/
  RitualPredict.t.sol        Solidity unit tests with test-only Ritual system mocks
scripts/
  block-time.ts              measure the chain's current block time
  deploy.ts                  deploy + prepay execution fees
  fund.ts                    top up the prepaid execution balance
  status.ts                  live state of every market
  create-demo-market.ts      create the preset market from the CLI
  export-abi.ts              copy the compiled ABI into the frontend
```

## Commands

```bash
cp .env.example .env                            # RITUAL_PRIVATE_KEY, funded from the faucet

npx hardhat test                                # Solidity tests
npx hardhat test solidity                       # Solidity only
npx hardhat build                               # compile

npx hardhat run scripts/block-time.ts           # measure block time
npx hardhat run scripts/deploy.ts               # deploy to Ritual Chain
PREDICT_ADDRESS=0x... npx hardhat run scripts/status.ts
PREDICT_ADDRESS=0x... npx hardhat run scripts/fund.ts
```

Tests run entirely against mocks in `test/RitualPredict.t.sol`. `vm.etch` puts the mock runtime
code at the canonical Ritual addresses, so no network access or funded account is needed.
