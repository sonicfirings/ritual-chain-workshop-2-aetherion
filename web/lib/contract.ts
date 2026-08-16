import type { Address } from "viem";

export const RITUAL_PREDICT_ADDRESS = (process.env.NEXT_PUBLIC_RITUAL_PREDICT_ADDRESS ?? "0x0000000000000000000000000000000000000000") as Address;
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export const ritualPredictAbi = [
  { type: "function", name: "marketCount", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "blockTimeMs", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "executionBalance", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  {
    type: "function",
    name: "getMarkets",
    inputs: [],
    outputs: [{
      type: "tuple[]",
      components: [
        { name: "id", type: "uint256" },
        { name: "creator", type: "address" },
        { name: "question", type: "string" },
        { name: "oracleUrl", type: "string" },
        { name: "jsonPath", type: "string" },
        { name: "target", type: "uint256" },
        { name: "comparator", type: "uint8" },
        { name: "closeBlock", type: "uint64" },
        { name: "resolveBlock", type: "uint64" },
        { name: "scheduleId", type: "uint256" },
        { name: "totalYes", type: "uint256" },
        { name: "totalNo", type: "uint256" },
        { name: "state", type: "uint8" },
        { name: "outcome", type: "uint8" },
        { name: "attempts", type: "uint8" },
        { name: "observedValue", type: "uint256" },
        { name: "invalidReason", type: "string" }
      ]
    }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "stakesOf",
    inputs: [{ name: "marketId", type: "uint256" }, { name: "account", type: "address" }],
    outputs: [
      { name: "yes", type: "uint256" },
      { name: "no", type: "uint256" },
      { name: "alreadySettled", type: "bool" },
      { name: "claimable", type: "uint256" }
    ],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "createMarket",
    inputs: [{
      name: "p",
      type: "tuple",
      components: [
        { name: "question", type: "string" },
        { name: "oracleUrl", type: "string" },
        { name: "jsonPath", type: "string" },
        { name: "target", type: "uint256" },
        { name: "comparator", type: "uint8" },
        { name: "bettingSeconds", type: "uint256" },
        { name: "resolveDelaySeconds", type: "uint256" }
      ]
    }],
    outputs: [{ name: "marketId", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  { type: "function", name: "bet", inputs: [{ name: "marketId", type: "uint256" }, { name: "isYes", type: "bool" }], outputs: [], stateMutability: "payable" },
  { type: "function", name: "claimWinnings", inputs: [{ name: "marketId", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "claimRefund", inputs: [{ name: "marketId", type: "uint256" }], outputs: [], stateMutability: "nonpayable" },
  { type: "function", name: "fundExecution", inputs: [{ name: "lockDurationBlocks", type: "uint256" }], outputs: [], stateMutability: "payable" },
] as const;

export type Market = {
  id: bigint;
  creator: Address;
  question: string;
  oracleUrl: string;
  jsonPath: string;
  target: bigint;
  comparator: number;
  closeBlock: bigint;
  resolveBlock: bigint;
  scheduleId: bigint;
  totalYes: bigint;
  totalNo: bigint;
  state: number;
  outcome: number;
  attempts: number;
  observedValue: bigint;
  invalidReason: string;
};

export const stateLabel = ["Open", "Closed", "Resolving", "Resolved", "Invalid"] as const;
export const outcomeLabel = ["Unresolved", "YES", "NO"] as const;
export const comparatorLabel = [">", ">=", "<", "<="] as const;
