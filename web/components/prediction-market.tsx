"use client";

import { useMemo, useState, type ReactNode } from "react";
import { encodeFunctionData, formatEther, parseEther, type Address } from "viem";
import { useAccount, useBlockNumber, useConnect, useReadContract, useSendTransaction, useSwitchChain } from "wagmi";
import { Activity, ArrowLeft, BadgeDollarSign, CalendarClock, Check, Landmark, Link as LinkIcon, Loader2, LockKeyhole, Plus, RefreshCw, Rocket, Star, Trophy, Wallet } from "lucide-react";
import { ritualChain } from "@/lib/chain";
import { comparatorLabel, Market, outcomeLabel, ritualPredictAbi, RITUAL_PREDICT_ADDRESS, stateLabel, ZERO_ADDRESS } from "@/lib/contract";

type FormState = {
  question: string;
  oracleUrl: string;
  jsonPath: string;
  target: string;
  comparator: string;
  bettingSeconds: string;
  resolveDelaySeconds: string;
};

type DemoStake = { yes: bigint; no: bigint; claimable: bigint; settled: boolean };
type ActiveTab = "markets" | "create";

const DEMO_BLOCK = 38199500n;
const DEMO_CREATOR = "0x290a4Eb81A83418B312fb92e65fF10845818D94b" as Address;

const defaultForm: FormState = {
  question: "Will ETH/USD be at least 4000 when this market resolves?",
  oracleUrl: "https://api.example.com/eth-usd",
  jsonPath: ".price",
  target: "4000",
  comparator: "1",
  bettingSeconds: "300",
  resolveDelaySeconds: "120",
};

const initialDemoMarkets: Market[] = [
  makeDemoMarket(9n, "Will ETH/USD close above 4,000 this week?", ".price", 4000n, 1, "18.42", "11.08", 0, 720n, 1320n),
  makeDemoMarket(8n, "BTC Up or Down 15m", ".direction", 1n, 1, "0.53", "16.84", 0, 96n, 160n),
  makeDemoMarket(7n, "Will SOL/USD stay above 180 by market close?", ".price", 180n, 1, "14.20", "3.10", 0, 620n, 1180n),
  makeDemoMarket(6n, "Will the AI sector index finish green today?", ".changeBps", 0n, 0, "9.75", "6.42", 0, 420n, 860n),
  makeDemoMarket(5n, "Will BTC dominance print at least 58?", ".dominance", 58n, 1, "6.30", "9.90", 3, -1800n, -900n, 2, 57n),
  makeDemoMarket(4n, "Will a new market exceed 25 RITUAL volume?", ".volume", 25n, 1, "12.60", "1.25", 0, 360n, 760n),
  makeDemoMarket(3n, "Will Ritual Scheduler resolve within all retry windows?", ".healthyPercent", 95n, 1, "8.10", "4.75", 2, -300n, 240n),
  makeDemoMarket(2n, "Will ETH gas trend lower before settlement?", ".gasGwei", 18n, 3, "5.70", "7.60", 0, 900n, 1400n),
  makeDemoMarket(1n, "Will the oracle response pass jq parsing on first attempt?", ".ok", 1n, 1, "10.00", "2.20", 3, -2400n, -1200n, 1, 1n),
];

function makeDemoMarket(id: bigint, question: string, jsonPath: string, target: bigint, comparator: number, yes: string, no: string, state: number, closeOffset: bigint, resolveOffset: bigint, outcome = 0, observedValue = 0n): Market {
  return {
    id,
    creator: DEMO_CREATOR,
    question,
    oracleUrl: `https://oracle.example/market-${id}`,
    jsonPath,
    target,
    comparator,
    closeBlock: DEMO_BLOCK + closeOffset,
    resolveBlock: DEMO_BLOCK + resolveOffset,
    scheduleId: 91000n + id,
    totalYes: parseEther(yes),
    totalNo: parseEther(no),
    state,
    outcome,
    attempts: state === 2 ? 1 : state === 3 ? 1 : 0,
    observedValue,
    invalidReason: "",
  };
}

function compactAddress(address?: string) {
  if (!address) return "Not connected";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function pct(part: bigint, total: bigint) {
  if (total === 0n) return 50;
  return Number((part * 100n) / total);
}

function oneDecimalRitual(value: bigint) {
  const amount = Number(formatEther(value));
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}K`;
  return amount.toFixed(amount >= 10 ? 1 : 2);
}

function marketSymbol(market: Market) {
  const q = market.question.toLowerCase();
  if (q.includes("btc")) return "BTC";
  if (q.includes("eth")) return "ETH";
  if (q.includes("sol")) return "SOL";
  if (q.includes("ai")) return "AI";
  if (q.includes("ritual")) return "RIT";
  return "YES";
}

function statusTone(state: number) {
  if (state === 0) return "border-[var(--ritual-green)]/40 text-[var(--ritual-green)]";
  if (state === 2) return "border-[var(--ritual-gold)]/50 text-[var(--ritual-gold)]";
  if (state === 3) return "border-[var(--ritual-lime)]/50 text-[var(--ritual-lime)]";
  if (state === 4) return "border-red-400/50 text-red-300";
  return "border-[var(--champagne)]/40 text-[var(--champagne)]";
}

export function PredictionMarket() {
  const isConfigured = RITUAL_PREDICT_ADDRESS !== ZERO_ADDRESS;
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true" || !isConfigured;
  const liveMode = isConfigured && !demoMode;
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { sendTransactionAsync, isPending: isWriting } = useSendTransaction();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [demoMarkets, setDemoMarkets] = useState<Market[]>(initialDemoMarkets);
  const [demoStakes, setDemoStakes] = useState<Record<string, DemoStake>>({});
  const [selectedMarket, setSelectedMarket] = useState<bigint | null>(9n);
  const [focusedMarketId, setFocusedMarketId] = useState<bigint | null>(null);
  const [betAmount, setBetAmount] = useState("0.05");
  const [activeTab, setActiveTab] = useState<ActiveTab>("markets");
  const [lastTx, setLastTx] = useState<`0x${string}` | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wrongChain = liveMode && isConnected && chainId !== ritualChain.id;

  const { data: blockNumber } = useBlockNumber({ watch: true, query: { enabled: liveMode } });
  const currentBlock = demoMode ? DEMO_BLOCK : blockNumber;
  const { data: executionBalance, refetch: refetchExecutionBalance } = useReadContract({
    address: RITUAL_PREDICT_ADDRESS,
    abi: ritualPredictAbi,
    functionName: "executionBalance",
    query: { enabled: liveMode },
  });
  const { data: liveMarkets = [], refetch: refetchMarkets, isLoading } = useReadContract({
    address: RITUAL_PREDICT_ADDRESS,
    abi: ritualPredictAbi,
    functionName: "getMarkets",
    query: { enabled: liveMode, refetchInterval: 7000 },
  });
  const { data: liveStakeData, refetch: refetchStake } = useReadContract({
    address: RITUAL_PREDICT_ADDRESS,
    abi: ritualPredictAbi,
    functionName: "stakesOf",
    args: selectedMarket && address ? [selectedMarket, address as Address] : undefined,
    query: { enabled: liveMode && !!selectedMarket && !!address, refetchInterval: 7000 },
  });

  const markets = demoMode ? demoMarkets : (liveMarkets as readonly Market[]);
  const focusedMarket = focusedMarketId ? markets.find((market) => market.id === focusedMarketId) : undefined;
  const selectedDemoStake = selectedMarket ? demoStakes[selectedMarket.toString()] : undefined;
  const stakeData = demoMode ? [selectedDemoStake?.yes ?? 0n, selectedDemoStake?.no ?? 0n, selectedDemoStake?.settled ?? false, selectedDemoStake?.claimable ?? 0n] as const : liveStakeData;
  const executionValue = demoMode ? parseEther("0.4200") : (executionBalance ?? 0n);

  const totals = useMemo(() => {
    return markets.reduce((acc, market) => ({
      markets: acc.markets + 1,
      pool: acc.pool + market.totalYes + market.totalNo,
      live: acc.live + (market.state === 0 ? 1 : 0),
      resolved: acc.resolved + (market.state === 3 ? 1 : 0),
    }), { markets: 0, pool: 0n, live: 0, resolved: 0 });
  }, [markets]);

  function openMarket(marketId: bigint) {
    setSelectedMarket(marketId);
    setFocusedMarketId(marketId);
  }

  async function write(functionName: "createMarket" | "bet" | "claimWinnings" | "claimRefund" | "fundExecution", args: readonly unknown[], value?: bigint, gas = 750_000n) {
    setError(null);
    if (!liveMode) throw new Error("Live contract mode is disabled for this demo.");
    if (wrongChain) await switchChain({ chainId: ritualChain.id });
    const data = encodeFunctionData({ abi: ritualPredictAbi, functionName, args: args as never });
    const hash = await sendTransactionAsync({ to: RITUAL_PREDICT_ADDRESS, data, value, gas });
    setLastTx(hash);
    setTimeout(() => {
      refetchMarkets();
      refetchStake();
      refetchExecutionBalance();
    }, 2500);
  }

  async function submitMarket() {
    try {
      if (demoMode) {
        const nextId = demoMarkets.reduce((max, market) => market.id > max ? market.id : max, 0n) + 1n;
        const closeBlock = DEMO_BLOCK + BigInt(Math.max(1, Number(form.bettingSeconds || "300")) * 5);
        const resolveBlock = closeBlock + BigInt(Math.max(1, Number(form.resolveDelaySeconds || "120")) * 5);
        const market = makeDemoMarket(nextId, form.question, form.jsonPath, BigInt(form.target || "0"), Number(form.comparator), "0", "0", 0, closeBlock - DEMO_BLOCK, resolveBlock - DEMO_BLOCK);
        market.oracleUrl = form.oracleUrl;
        setDemoMarkets([market, ...demoMarkets]);
        setSelectedMarket(nextId);
        setFocusedMarketId(nextId);
        setActiveTab("markets");
        setNotice(`Demo market #${nextId} created locally.`);
        return;
      }
      await write("createMarket", [[form.question, form.oracleUrl, form.jsonPath, BigInt(form.target), Number(form.comparator), BigInt(form.bettingSeconds), BigInt(form.resolveDelaySeconds)]], undefined, 1_600_000n);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Market creation failed");
    }
  }

  async function placeBet(marketId: bigint, isYes: boolean) {
    try {
      const amount = parseEther(betAmount || "0");
      if (demoMode) {
        setDemoMarkets((items) => items.map((market) => market.id === marketId ? { ...market, totalYes: market.totalYes + (isYes ? amount : 0n), totalNo: market.totalNo + (isYes ? 0n : amount) } : market));
        setDemoStakes((items) => {
          const key = marketId.toString();
          const current = items[key] ?? { yes: 0n, no: 0n, claimable: 0n, settled: false };
          return { ...items, [key]: { ...current, yes: current.yes + (isYes ? amount : 0n), no: current.no + (isYes ? 0n : amount) } };
        });
        setSelectedMarket(marketId);
        setNotice(`Demo bet placed: ${betAmount || "0"} RITUAL on ${isYes ? "YES" : "NO"}.`);
        return;
      }
      await write("bet", [marketId, isYes], amount, 300_000n);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bet failed");
    }
  }

  async function claim(marketId: bigint, refund: boolean) {
    try {
      if (demoMode) {
        setDemoStakes((items) => {
          const key = marketId.toString();
          const current = items[key] ?? { yes: 0n, no: 0n, claimable: 0n, settled: false };
          return { ...items, [key]: { ...current, claimable: 0n, settled: true } };
        });
        setNotice(refund ? "Demo refund claimed locally." : "Demo winnings claimed locally.");
        return;
      }
      await write(refund ? "claimRefund" : "claimWinnings", [marketId], undefined, 300_000n);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed");
    }
  }

  if (focusedMarket) {
    return (
      <Shell demoMode={demoMode} currentBlock={currentBlock} wrongChain={wrongChain} isSwitching={isSwitching} switchToRitual={() => switchChain({ chainId: ritualChain.id })} isConnected={isConnected} address={address} connectWallet={() => connect({ connector: connectors[0] })} canConnect={!isConnecting && connectors.length > 0}>
        <MarketDetail market={focusedMarket} currentBlock={currentBlock} betAmount={betAmount} setBetAmount={setBetAmount} stakeData={stakeData} onBack={() => setFocusedMarketId(null)} onBet={placeBet} onClaim={claim} isWriting={isWriting} demoMode={demoMode} isConnected={isConnected} notice={notice} error={error} lastTx={lastTx} />
      </Shell>
    );
  }

  return (
    <Shell demoMode={demoMode} currentBlock={currentBlock} wrongChain={wrongChain} isSwitching={isSwitching} switchToRitual={() => switchChain({ chainId: ritualChain.id })} isConnected={isConnected} address={address} connectWallet={() => connect({ connector: connectors[0] })} canConnect={!isConnecting && connectors.length > 0}>
      <div className="flex w-full max-w-md gap-2 rounded-xl border border-white/10 bg-black/45 p-1">
        <TabButton active={activeTab === "markets"} onClick={() => setActiveTab("markets")}>Markets</TabButton>
        <TabButton active={activeTab === "create"} onClick={() => setActiveTab("create")}>New Market</TabButton>
      </div>

      {activeTab === "markets" && (
        <>
          <section className="grid gap-3 sm:grid-cols-4">
            <Metric icon={<Landmark size={18} />} label="Markets" value={totals.markets.toString()} />
            <Metric icon={<Activity size={18} />} label="Open" value={totals.live.toString()} />
            <Metric icon={<Trophy size={18} />} label="Resolved" value={totals.resolved.toString()} />
            <Metric icon={<LockKeyhole size={18} />} label="Execution" value={`${Number(formatEther(executionValue)).toFixed(4)} RITUAL`} />
          </section>

          <section id="markets" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase text-[var(--ritual-pink)]">market board</p>
                <h2 className="text-2xl font-semibold text-gray-100">Betting options</h2>
              </div>
              <button onClick={() => demoMode ? setNotice("Demo data refreshed locally.") : refetchMarkets()} className="grid h-11 w-11 place-items-center rounded-lg border border-white/10 text-gray-300 hover:border-[var(--ritual-green)] hover:text-[var(--ritual-green)]" aria-label="Refresh markets"><RefreshCw size={16} /></button>
            </div>
            {isLoading && !demoMode ? <EmptyState text="Loading markets from Ritual Chain" /> : markets.length === 0 ? <EmptyState text="No markets yet. Create the first one from the New Market tab." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{markets.map((market) => <MarketTile key={market.id.toString()} market={market} currentBlock={currentBlock} onOpen={() => openMarket(market.id)} />)}</div>}
          </section>
        </>
      )}

      {activeTab === "create" && (
        <section className="mx-auto w-full max-w-3xl rounded-xl border border-white/10 bg-[var(--ritual-elevated)]/85 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-7">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase text-[var(--ritual-green)]">new market</p>
              <h3 className="text-2xl font-semibold text-gray-100">Resolution recipe</h3>
            </div>
            <Plus className="text-[var(--ritual-pink)]" />
          </div>
          <div className="space-y-3">
            <Input label="Question" value={form.question} onChange={(question) => setForm({ ...form, question })} />
            <Input label="Oracle URL" value={form.oracleUrl} onChange={(oracleUrl) => setForm({ ...form, oracleUrl })} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="jq path" value={form.jsonPath} onChange={(jsonPath) => setForm({ ...form, jsonPath })} />
              <Input label="Target" value={form.target} onChange={(target) => setForm({ ...form, target })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block"><span className="mb-1 block text-xs uppercase text-gray-400">Comparator</span><select value={form.comparator} onChange={(event) => setForm({ ...form, comparator: event.target.value })} className="min-h-11 w-full rounded-lg border border-white/10 bg-[var(--ritual-surface)] px-3 text-sm text-gray-200 outline-none focus:border-[var(--ritual-green)]"><option value="0">GT</option><option value="1">GTE</option><option value="2">LT</option><option value="3">LTE</option></select></label>
              <Input label="Bet seconds" value={form.bettingSeconds} onChange={(bettingSeconds) => setForm({ ...form, bettingSeconds })} />
              <Input label="Delay seconds" value={form.resolveDelaySeconds} onChange={(resolveDelaySeconds) => setForm({ ...form, resolveDelaySeconds })} />
            </div>
            <button onClick={submitMarket} disabled={(!demoMode && !isConnected) || isWriting || (!demoMode && !isConfigured)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--ritual-green)] px-4 py-3 text-sm font-semibold text-[var(--ritual-green)] hover:bg-[var(--ritual-green)]/10 disabled:hover:bg-transparent">
              {isWriting ? <Loader2 size={16} className="animate-spin" /> : <CalendarClock size={16} />} {demoMode ? "Create demo market" : "Create scheduled market"}
            </button>
          </div>
        </section>
      )}
    </Shell>
  );
}

function Shell({ children, demoMode, currentBlock, wrongChain, isSwitching, switchToRitual, isConnected, address, connectWallet, canConnect }: { children: ReactNode; demoMode: boolean; currentBlock?: bigint; wrongChain: boolean; isSwitching: boolean; switchToRitual: () => void; isConnected: boolean; address?: string; connectWallet: () => void; canConnect: boolean }) {
  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
      <a href="#markets" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:border focus:border-[var(--ritual-green)] focus:bg-black focus:px-4 focus:py-2 focus:text-[var(--ritual-green)]">Skip to markets</a>
      <nav className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative grid h-12 w-12 place-items-center rounded-xl border border-[var(--champagne)]/25 bg-[var(--rosewood)]/60 shadow-[0_0_35px_rgba(255,29,206,0.16)]">
            <Rocket size={21} className="absolute -translate-x-1 -translate-y-1 rotate-[-35deg] text-[var(--ritual-green)]" />
            <Rocket size={21} className="absolute translate-x-1 translate-y-1 rotate-[145deg] text-[var(--ritual-pink)]" />
          </div>
          <h1 className="font-[var(--font-display)] text-2xl font-black text-gray-100 sm:text-3xl">Ritual Predict</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {demoMode && <span className="rounded-lg border border-[var(--ritual-pink)]/35 px-3 py-2 font-mono text-xs text-[var(--ritual-pink)]">Demo mode</span>}
          <span className="rounded-lg border border-[var(--champagne)]/20 px-3 py-2 font-mono text-xs text-[var(--champagne)]">Block {currentBlock?.toString() ?? "..."}</span>
          {wrongChain ? (
            <button onClick={switchToRitual} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--ritual-gold)] px-4 py-2 text-sm font-semibold text-[var(--ritual-gold)] hover:bg-[var(--ritual-gold)]/10" disabled={isSwitching}>
              <RefreshCw size={16} className={isSwitching ? "animate-spin" : ""} /> Switch to Ritual
            </button>
          ) : isConnected ? (
            <span className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--ritual-green)]/35 px-4 py-2 font-mono text-xs text-[var(--ritual-green)]"><Wallet size={16} /> {compactAddress(address)}</span>
          ) : (
            <button onClick={connectWallet} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--ritual-green)] px-4 py-2 text-sm font-semibold text-[var(--ritual-green)] shadow-[0_0_30px_rgba(25,209,132,0.14)] hover:bg-[var(--ritual-green)]/10" disabled={!canConnect}>
              <Wallet size={16} /> Connect Wallet
            </button>
          )}
        </div>
      </nav>
      {children}
    </main>
  );
}

function MarketTile({ market, currentBlock, onOpen }: { market: Market; currentBlock?: bigint; onOpen: () => void }) {
  const total = market.totalYes + market.totalNo;
  const yesPct = pct(market.totalYes, total);
  const noPct = 100 - yesPct;
  const symbol = marketSymbol(market);
  const volume = oneDecimalRitual(total);
  const live = market.state === 0 || market.state === 2;
  return (
    <button onClick={onOpen} className="min-h-[228px] rounded-xl border border-white/10 bg-[var(--ritual-elevated)]/80 p-4 text-left shadow-[0_18px_70px_rgba(0,0,0,0.32)] transition hover:-translate-y-0.5 hover:border-[var(--ritual-pink)]/45 hover:bg-[var(--ritual-elevated)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ritual-green)]/50">
      <div className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--champagne)]/25 bg-black/45 font-mono text-xs font-bold text-[var(--champagne)]">{symbol}</div>
          <h3 className="line-clamp-2 min-h-[48px] text-base font-semibold leading-6 text-gray-100">{market.question}</h3>
        </div>
        <div className="flex gap-2 text-[var(--ritual-pink)]"><LinkIcon size={16} /><Star size={16} /></div>
      </div>
      <div className="mb-4 flex items-center justify-between gap-4">
        <span className="font-mono text-2xl font-bold text-[var(--ritual-green)]">{yesPct}%</span>
        <span className="font-mono text-2xl font-bold text-red-300">{noPct}%</span>
      </div>
      <div className="mb-4 h-2 overflow-hidden rounded-full bg-red-500/25"><div className="h-full bg-[var(--ritual-green)]" style={{ width: `${yesPct}%` }} /></div>
      <div className="grid grid-cols-2 gap-2">
        <span className="rounded-lg border border-[var(--ritual-green)]/35 bg-[var(--ritual-green)]/10 px-3 py-2 text-center text-sm font-bold text-[var(--ritual-green)]">YES {yesPct}%</span>
        <span className="rounded-lg border border-red-400/35 bg-red-500/10 px-3 py-2 text-center text-sm font-bold text-red-300">NO {noPct}%</span>
      </div>
      <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-3 text-xs text-gray-400">
        <span className={`rounded-full border px-2 py-1 ${statusTone(market.state)}`}>{stateLabel[market.state] ?? "Unknown"}</span>
        <span className="font-mono">{volume} Vol</span>
        <span className={live ? "text-red-300" : "text-gray-400"}>{live ? "Live" : outcomeLabel[market.outcome]}</span>
      </div>
    </button>
  );
}

function MarketDetail({ market, currentBlock, betAmount, setBetAmount, stakeData, onBack, onBet, onClaim, isWriting, demoMode, isConnected, notice, error, lastTx }: { market: Market; currentBlock?: bigint; betAmount: string; setBetAmount: (value: string) => void; stakeData?: readonly [bigint, bigint, boolean, bigint]; onBack: () => void; onBet: (marketId: bigint, isYes: boolean) => void; onClaim: (marketId: bigint, refund: boolean) => void; isWriting: boolean; demoMode: boolean; isConnected: boolean; notice: string | null; error: string | null; lastTx: `0x${string}` | null }) {
  const total = market.totalYes + market.totalNo;
  const yesPct = pct(market.totalYes, total);
  const noPct = 100 - yesPct;
  const closesIn = currentBlock && market.closeBlock > currentBlock ? market.closeBlock - currentBlock : 0n;
  const resolvesIn = currentBlock && market.resolveBlock > currentBlock ? market.resolveBlock - currentBlock : 0n;
  const disabled = market.state !== 0 || (!demoMode && !isConnected) || isWriting;
  return (
    <section className="grid min-h-[calc(100vh-120px)] gap-5 lg:grid-cols-[1fr_380px]">
      <div className="rounded-xl border border-white/10 bg-black/50 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-8">
        <button onClick={onBack} className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm font-semibold text-gray-300 hover:border-[var(--ritual-green)] hover:text-[var(--ritual-green)]"><ArrowLeft size={16} /> Back to markets</button>
        <div className="mb-6 flex items-start gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl border border-[var(--champagne)]/25 bg-[var(--rosewood)]/60 font-mono text-sm font-bold text-[var(--champagne)]">{marketSymbol(market)}</div>
          <div>
            <span className={`mb-3 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusTone(market.state)}`}>{stateLabel[market.state]}</span>
            <h2 className="max-w-4xl font-[var(--font-display)] text-3xl font-black leading-tight text-gray-100 sm:text-5xl">{market.question}</h2>
          </div>
        </div>
        <div className="mb-8 grid gap-4 sm:grid-cols-2">
          <OutcomePanel label="YES" pct={yesPct} pool={market.totalYes} tone="yes" />
          <OutcomePanel label="NO" pct={noPct} pool={market.totalNo} tone="no" />
        </div>
        <div className="h-4 overflow-hidden rounded-full border border-white/10 bg-red-500/20"><div className="h-full bg-gradient-to-r from-[var(--ritual-green)] to-[var(--ritual-lime)]" style={{ width: `${yesPct}%` }} /></div>
        <div className="mt-8 grid gap-3 sm:grid-cols-4">
          <Line label="Target" value={`${comparatorLabel[market.comparator]} ${market.target}`} />
          <Line label="jq path" value={market.jsonPath} />
          <Line label="Closes" value={`${closesIn} blocks`} />
          <Line label="Resolves" value={`${resolvesIn} blocks`} />
        </div>
        {market.state === 3 && <p className="mt-6 rounded-lg border border-[var(--ritual-lime)]/30 bg-[var(--ritual-lime)]/10 px-3 py-2 text-sm text-[var(--ritual-lime)]">Outcome {outcomeLabel[market.outcome]} at observed value {market.observedValue.toString()}</p>}
        {market.state === 4 && <p className="mt-6 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">Invalid: {market.invalidReason || "refundable"}</p>}
      </div>
      <aside className="h-fit rounded-xl border border-white/10 bg-[var(--ritual-elevated)]/85 p-5">
        <div className="mb-5 flex items-center justify-between"><div><p className="font-mono text-xs uppercase text-[var(--ritual-green)]">bet ticket</p><h3 className="text-xl font-semibold text-gray-100">Place position</h3></div><BadgeDollarSign className="text-[var(--champagne)]" /></div>
        <Input label="Bet amount (RITUAL)" value={betAmount} onChange={setBetAmount} />
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={() => onBet(market.id, true)} disabled={disabled || !betAmount} className="min-h-14 rounded-lg border border-[var(--ritual-green)] px-4 py-3 text-sm font-bold text-[var(--ritual-green)] hover:bg-[var(--ritual-green)]/10">Bet YES</button>
          <button onClick={() => onBet(market.id, false)} disabled={disabled || !betAmount} className="min-h-14 rounded-lg border border-red-400/50 px-4 py-3 text-sm font-bold text-red-300 hover:bg-red-500/10">Bet NO</button>
        </div>
        <div className="mt-5 space-y-3 rounded-lg border border-white/10 bg-black/35 p-4">
          <Line label="Selected" value={`#${market.id}`} />
          <Line label="YES stake" value={`${formatEther(stakeData?.[0] ?? 0n)} RITUAL`} />
          <Line label="NO stake" value={`${formatEther(stakeData?.[1] ?? 0n)} RITUAL`} />
          <Line label="Claimable" value={`${formatEther(stakeData?.[3] ?? 0n)} RITUAL`} highlight />
        </div>
        <div className="mt-4 grid gap-2">
          <button onClick={() => onClaim(market.id, false)} disabled={(!demoMode && !isConnected) || isWriting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--ritual-lime)] px-4 py-2 text-sm font-semibold text-[var(--ritual-lime)] hover:bg-[var(--ritual-lime)]/10"><Trophy size={16} /> Claim winnings</button>
          <button onClick={() => onClaim(market.id, true)} disabled={(!demoMode && !isConnected) || isWriting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-400/50 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/10"><RefreshCw size={16} /> Claim refund</button>
        </div>
        {lastTx && <a className="mt-4 block truncate rounded-lg border border-[var(--ritual-green)]/20 bg-[var(--ritual-green)]/10 px-3 py-2 font-mono text-xs text-[var(--ritual-green)]" href={`https://explorer.ritualfoundation.org/tx/${lastTx}`} target="_blank" rel="noreferrer">Last tx: {lastTx}</a>}
        {notice && <p className="mt-4 rounded-lg border border-[var(--ritual-pink)]/30 bg-[var(--ritual-pink)]/10 px-3 py-2 text-sm text-gray-200">{notice}</p>}
        {error && <p className="mt-4 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
      </aside>
    </section>
  );
}

function OutcomePanel({ label, pct, pool, tone }: { label: string; pct: number; pool: bigint; tone: "yes" | "no" }) {
  const isYes = tone === "yes";
  return <div className={`rounded-xl border p-5 ${isYes ? "border-[var(--ritual-green)]/30 bg-[var(--ritual-green)]/10" : "border-red-400/30 bg-red-500/10"}`}><p className="text-sm font-semibold text-gray-300">{label}</p><p className={`mt-2 font-mono text-5xl font-bold ${isYes ? "text-[var(--ritual-green)]" : "text-red-300"}`}>{pct}%</p><p className="mt-3 font-mono text-sm text-gray-400">Pool {formatEther(pool)} RITUAL</p></div>;
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return <button onClick={onClick} className={`min-h-11 flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition ${active ? "border border-[var(--ritual-pink)]/50 bg-[var(--ritual-pink)]/10 text-[var(--ritual-pink)]" : "border border-transparent text-gray-300 hover:border-white/10 hover:text-gray-100"}`}>{children}</button>;
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="rounded-xl border border-white/10 bg-[var(--ritual-elevated)]/70 p-4"><div className="mb-4 text-[var(--ritual-green)]">{icon}</div><p className="text-xs uppercase text-gray-400">{label}</p><p className="mt-1 break-words font-mono text-lg text-gray-100">{value}</p></div>;
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block"><span className="mb-1 block text-xs uppercase text-gray-400">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="min-h-11 w-full rounded-lg border border-white/10 bg-[var(--ritual-surface)] px-3 text-sm text-gray-200 outline-none focus:border-[var(--ritual-green)]" /></label>;
}

function Line({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return <div className="flex items-center justify-between gap-3 text-sm"><span className="text-gray-400">{label}</span><span className={`truncate font-mono ${highlight ? "text-[var(--ritual-lime)]" : "text-gray-200"}`}>{value}</span></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-white/15 bg-black/35 p-8 text-center text-gray-400">{text}</div>;
}
