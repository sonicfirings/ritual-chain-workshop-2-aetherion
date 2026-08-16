"use client";

import { useMemo, useState, type ReactNode } from "react";
import { encodeFunctionData, formatEther, parseEther, type Address } from "viem";
import { useAccount, useBlockNumber, useConnect, useReadContract, useSendTransaction, useSwitchChain } from "wagmi";
import { Activity, BadgeDollarSign, CalendarClock, Check, ChevronDown, Gem, Landmark, Loader2, LockKeyhole, Plus, RefreshCw, Sparkles, Trophy, Wallet } from "lucide-react";
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

const defaultForm: FormState = {
  question: "Will ETH/USD be at least 4000 when this market resolves?",
  oracleUrl: "https://api.example.com/eth-usd",
  jsonPath: ".price",
  target: "4000",
  comparator: "1",
  bettingSeconds: "300",
  resolveDelaySeconds: "120",
};

function compactAddress(address?: string) {
  if (!address) return "Not connected";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function pct(part: bigint, total: bigint) {
  if (total === 0n) return 50;
  return Number((part * 100n) / total);
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
  const { address, chainId, isConnected } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const { sendTransactionAsync, isPending: isWriting } = useSendTransaction();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [selectedMarket, setSelectedMarket] = useState<bigint | null>(null);
  const [betAmount, setBetAmount] = useState("0.05");
  const [lastTx, setLastTx] = useState<`0x${string}` | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wrongChain = isConnected && chainId !== ritualChain.id;

  const { data: currentBlock } = useBlockNumber({ watch: true, query: { enabled: isConfigured } });
  const { data: executionBalance, refetch: refetchExecutionBalance } = useReadContract({
    address: RITUAL_PREDICT_ADDRESS,
    abi: ritualPredictAbi,
    functionName: "executionBalance",
    query: { enabled: isConfigured },
  });
  const { data: markets = [], refetch: refetchMarkets, isLoading } = useReadContract({
    address: RITUAL_PREDICT_ADDRESS,
    abi: ritualPredictAbi,
    functionName: "getMarkets",
    query: { enabled: isConfigured, refetchInterval: 7000 },
  });
  const { data: stakeData, refetch: refetchStake } = useReadContract({
    address: RITUAL_PREDICT_ADDRESS,
    abi: ritualPredictAbi,
    functionName: "stakesOf",
    args: selectedMarket && address ? [selectedMarket, address as Address] : undefined,
    query: { enabled: isConfigured && !!selectedMarket && !!address, refetchInterval: 7000 },
  });

  const totals = useMemo(() => {
    const list = markets as readonly Market[];
    return list.reduce((acc, market) => ({
      markets: acc.markets + 1,
      pool: acc.pool + market.totalYes + market.totalNo,
      live: acc.live + (market.state === 0 ? 1 : 0),
      resolved: acc.resolved + (market.state === 3 ? 1 : 0),
    }), { markets: 0, pool: 0n, live: 0, resolved: 0 });
  }, [markets]);

  async function write(functionName: "createMarket" | "bet" | "claimWinnings" | "claimRefund" | "fundExecution", args: readonly unknown[], value?: bigint, gas = 750_000n) {
    setError(null);
    if (!isConfigured) throw new Error("Set NEXT_PUBLIC_RITUAL_PREDICT_ADDRESS first.");
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
      await write("createMarket", [[form.question, form.oracleUrl, form.jsonPath, BigInt(form.target), Number(form.comparator), BigInt(form.bettingSeconds), BigInt(form.resolveDelaySeconds)]], undefined, 1_600_000n);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Market creation failed");
    }
  }

  async function placeBet(marketId: bigint, isYes: boolean) {
    try {
      await write("bet", [marketId, isYes], parseEther(betAmount || "0"), 300_000n);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bet failed");
    }
  }

  async function claim(marketId: bigint, refund: boolean) {
    try {
      await write(refund ? "claimRefund" : "claimWinnings", [marketId], undefined, 300_000n);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed");
    }
  }

  return (
    <main className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
      <a href="#markets" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:border focus:border-[var(--ritual-green)] focus:bg-black focus:px-4 focus:py-2 focus:text-[var(--ritual-green)]">Skip to markets</a>

      <nav className="flex flex-col gap-3 border-b border-white/10 pb-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl border border-[var(--ritual-pink)]/35 bg-[var(--rosewood)]/50 text-[var(--ritual-pink)] shadow-[0_0_35px_rgba(255,29,206,0.14)]"><Gem size={22} /></div>
          <div>
            <p className="font-mono text-xs uppercase text-[var(--ritual-green)]">Ritual Scheduler + HTTP + jq</p>
            <h1 className="font-[var(--font-display)] text-2xl font-black text-gray-100 sm:text-3xl">Ritual Predict</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-[var(--champagne)]/20 px-3 py-2 font-mono text-xs text-[var(--champagne)]">Block {currentBlock?.toString() ?? "..."}</span>
          {wrongChain ? (
            <button onClick={() => switchChain({ chainId: ritualChain.id })} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--ritual-gold)] px-4 py-2 text-sm font-semibold text-[var(--ritual-gold)] hover:bg-[var(--ritual-gold)]/10" disabled={isSwitching}>
              <RefreshCw size={16} className={isSwitching ? "animate-spin" : ""} /> Switch to Ritual
            </button>
          ) : isConnected ? (
            <span className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--ritual-green)]/35 px-4 py-2 font-mono text-xs text-[var(--ritual-green)]"><Wallet size={16} /> {compactAddress(address)}</span>
          ) : (
            <button onClick={() => connect({ connector: connectors[0] })} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--ritual-green)] px-4 py-2 text-sm font-semibold text-[var(--ritual-green)] shadow-[0_0_30px_rgba(25,209,132,0.14)] hover:bg-[var(--ritual-green)]/10" disabled={isConnecting || connectors.length === 0}>
              <Wallet size={16} /> Connect Wallet
            </button>
          )}
        </div>
      </nav>

      {!isConfigured && (
        <section className="rounded-xl border border-[var(--ritual-gold)]/40 bg-[var(--ritual-gold)]/10 p-4 text-sm text-[var(--champagne)]">
          Set <span className="font-mono">NEXT_PUBLIC_RITUAL_PREDICT_ADDRESS</span> in Vercel or <span className="font-mono">web/.env.local</span> before using live contract actions.
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="min-h-[320px] rounded-xl border border-white/10 bg-black/45 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-7">
          <div className="mb-10 max-w-3xl">
            <p className="mb-3 inline-flex items-center gap-2 rounded-lg border border-[var(--ritual-pink)]/30 px-3 py-1 font-mono text-xs uppercase text-[var(--ritual-pink)]"><Sparkles size={14} /> self-resolving market desk</p>
            <h2 className="font-[var(--font-display)] text-4xl font-black leading-tight text-gray-100 sm:text-5xl">Velvet odds, verified outcomes.</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-gray-300">Create YES/NO markets that close by block number, wake by Ritual Scheduler, read an oracle through a TEE-backed HTTP call, extract with jq, and settle without a keeper.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <Metric icon={<Landmark size={18} />} label="Markets" value={totals.markets.toString()} />
            <Metric icon={<Activity size={18} />} label="Open" value={totals.live.toString()} />
            <Metric icon={<Trophy size={18} />} label="Resolved" value={totals.resolved.toString()} />
            <Metric icon={<LockKeyhole size={18} />} label="Execution" value={`${Number(formatEther(executionBalance ?? 0n)).toFixed(4)} RITUAL`} />
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[var(--ritual-elevated)]/85 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase text-[var(--ritual-green)]">new market</p>
              <h3 className="text-xl font-semibold text-gray-100">Resolution recipe</h3>
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
            <button onClick={submitMarket} disabled={!isConnected || isWriting || !isConfigured} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[var(--ritual-green)] px-4 py-3 text-sm font-semibold text-[var(--ritual-green)] hover:bg-[var(--ritual-green)]/10 disabled:hover:bg-transparent">
              {isWriting ? <Loader2 size={16} className="animate-spin" /> : <CalendarClock size={16} />} Create scheduled market
            </button>
          </div>
        </div>
      </section>

      <section id="markets" className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase text-[var(--ritual-pink)]">market floor</p>
              <h2 className="text-2xl font-semibold text-gray-100">Live positions</h2>
            </div>
            <button onClick={() => refetchMarkets()} className="grid h-11 w-11 place-items-center rounded-lg border border-white/10 text-gray-300 hover:border-[var(--ritual-green)] hover:text-[var(--ritual-green)]" aria-label="Refresh markets"><RefreshCw size={16} /></button>
          </div>
          {isLoading ? <EmptyState text="Loading markets from Ritual Chain" /> : (markets as readonly Market[]).length === 0 ? <EmptyState text="No markets yet. Create the first one above." /> : (markets as readonly Market[]).map((market) => <MarketCard key={market.id.toString()} market={market} currentBlock={currentBlock} selected={selectedMarket === market.id} onSelect={() => setSelectedMarket(market.id)} onBet={placeBet} betAmount={betAmount} />)}
        </div>

        <aside className="h-fit rounded-xl border border-white/10 bg-black/45 p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="font-mono text-xs uppercase text-[var(--ritual-green)]">your ticket</p>
              <h3 className="text-xl font-semibold text-gray-100">Position</h3>
            </div>
            <BadgeDollarSign className="text-[var(--champagne)]" />
          </div>
          <Input label="Bet amount (RITUAL)" value={betAmount} onChange={setBetAmount} />
          <div className="mt-4 space-y-3 rounded-lg border border-white/10 bg-[var(--ritual-elevated)]/70 p-4">
            <Line label="Selected" value={selectedMarket ? `#${selectedMarket}` : "None"} />
            <Line label="YES stake" value={`${formatEther(stakeData?.[0] ?? 0n)} RITUAL`} />
            <Line label="NO stake" value={`${formatEther(stakeData?.[1] ?? 0n)} RITUAL`} />
            <Line label="Claimable" value={`${formatEther(stakeData?.[3] ?? 0n)} RITUAL`} highlight />
          </div>
          <div className="mt-4 grid gap-2">
            <button onClick={() => selectedMarket && claim(selectedMarket, false)} disabled={!selectedMarket || !isConnected || isWriting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--ritual-lime)] px-4 py-2 text-sm font-semibold text-[var(--ritual-lime)] hover:bg-[var(--ritual-lime)]/10"><Trophy size={16} /> Claim winnings</button>
            <button onClick={() => selectedMarket && claim(selectedMarket, true)} disabled={!selectedMarket || !isConnected || isWriting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-400/50 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/10"><RefreshCw size={16} /> Claim refund</button>
          </div>
          {lastTx && <a className="mt-4 block truncate rounded-lg border border-[var(--ritual-green)]/20 bg-[var(--ritual-green)]/10 px-3 py-2 font-mono text-xs text-[var(--ritual-green)]" href={`https://explorer.ritualfoundation.org/tx/${lastTx}`} target="_blank" rel="noreferrer">Last tx: {lastTx}</a>}
          {error && <p className="mt-4 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
        </aside>
      </section>
    </main>
  );
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

function MarketCard({ market, currentBlock, selected, onSelect, onBet, betAmount }: { market: Market; currentBlock?: bigint; selected: boolean; onSelect: () => void; onBet: (marketId: bigint, isYes: boolean) => void; betAmount: string }) {
  const total = market.totalYes + market.totalNo;
  const yesPct = pct(market.totalYes, total);
  const closesIn = currentBlock && market.closeBlock > currentBlock ? market.closeBlock - currentBlock : 0n;
  const resolvesIn = currentBlock && market.resolveBlock > currentBlock ? market.resolveBlock - currentBlock : 0n;
  return (
    <article className={`rounded-xl border bg-[var(--ritual-elevated)]/75 p-5 shadow-[0_18px_70px_rgba(0,0,0,0.32)] ${selected ? "border-[var(--ritual-pink)]/60" : "border-white/10"}`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <button onClick={onSelect} className="text-left">
          <span className={`mb-3 inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs font-semibold ${statusTone(market.state)}`}><Check size={13} /> {stateLabel[market.state] ?? "Unknown"}</span>
          <h3 className="text-xl font-semibold leading-snug text-gray-100">{market.question}</h3>
          <p className="mt-2 font-mono text-xs text-gray-400">Rule: observed {comparatorLabel[market.comparator]} {market.target.toString()} via {market.jsonPath}</p>
        </button>
        <button onClick={onSelect} className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-white/10 text-gray-300 hover:border-[var(--ritual-pink)] hover:text-[var(--ritual-pink)]" aria-label="Select market"><ChevronDown size={16} /></button>
      </div>
      <div className="my-5 h-3 overflow-hidden rounded-full border border-white/10 bg-black/45"><div className="h-full bg-gradient-to-r from-[var(--ritual-green)] to-[var(--ritual-lime)]" style={{ width: `${yesPct}%` }} /></div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Line label="YES pool" value={formatEther(market.totalYes)} />
        <Line label="NO pool" value={formatEther(market.totalNo)} />
        <Line label="Closes" value={`${closesIn} blocks`} />
        <Line label="Resolves" value={`${resolvesIn} blocks`} />
      </div>
      {market.state === 3 && <p className="mt-4 rounded-lg border border-[var(--ritual-lime)]/30 bg-[var(--ritual-lime)]/10 px-3 py-2 text-sm text-[var(--ritual-lime)]">Outcome {outcomeLabel[market.outcome]} at observed value {market.observedValue.toString()}</p>}
      {market.state === 4 && <p className="mt-4 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">Invalid: {market.invalidReason || "refundable"}</p>}
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <button onClick={() => onBet(market.id, true)} disabled={market.state !== 0 || !betAmount} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--ritual-green)] px-4 py-2 text-sm font-semibold text-[var(--ritual-green)] hover:bg-[var(--ritual-green)]/10">Bet YES</button>
        <button onClick={() => onBet(market.id, false)} disabled={market.state !== 0 || !betAmount} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--ritual-pink)] px-4 py-2 text-sm font-semibold text-[var(--ritual-pink)] hover:bg-[var(--ritual-pink)]/10">Bet NO</button>
      </div>
    </article>
  );
}
