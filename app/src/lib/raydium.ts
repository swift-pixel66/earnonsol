import { VAULTS } from "./registry";

// Live pool stats for the reference vaults. The mainnet pools these vaults use
// are Raydium CLMM accounts (on-chain owner CAMMCzo5…), so their fee/APR/volume
// come from Raydium's public API. On devnet the rebuilt vaults deploy their own
// Meteora cp-amm pools; this module is swapped for a Meteora reader there.
export interface PoolInfo {
  tvl: number;
  apr: number; // day fee APR (%)
  fees24h: number;
  volume24h: number;
  reserveAsset: number;
  reserveUsdc: number;
  price: number;
}

const API = "https://api-v3.raydium.io/pools/info/ids?ids=";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

let cache: { at: number; data: Record<string, PoolInfo> } | null = null;
let inflight: Promise<Record<string, PoolInfo>> | null = null;

export async function getAllPoolInfo(): Promise<Record<string, PoolInfo>> {
  if (cache && Date.now() - cache.at < 30_000) return cache.data;
  if (inflight) return inflight;
  inflight = fetchAll().finally(() => (inflight = null));
  return inflight;
}

async function fetchAll(): Promise<Record<string, PoolInfo>> {
  const pools = VAULTS.filter((v) => v.meteoraPool).map((v) => v.meteoraPool!);
  const byPool: Record<string, PoolInfo> = {};
  try {
    const r = await fetch(API + pools.join(","));
    const j = await r.json();
    for (const p of j?.data ?? []) {
      if (!p) continue;
      const aIsUsdc = p.mintA?.address === USDC;
      byPool[p.id] = {
        tvl: Number(p.tvl) || 0,
        apr: Number(p.day?.apr) || 0,
        fees24h: Number(p.day?.volumeFee) || 0,
        volume24h: Number(p.day?.volume) || 0,
        reserveAsset: Number(aIsUsdc ? p.mintAmountB : p.mintAmountA) || 0,
        reserveUsdc: Number(aIsUsdc ? p.mintAmountA : p.mintAmountB) || 0,
        price: Number(p.price) || 0,
      };
    }
  } catch {
    /* ignore — callers handle missing data */
  }
  const data: Record<string, PoolInfo> = {};
  for (const v of VAULTS) if (v.meteoraPool && byPool[v.meteoraPool]) data[v.id] = byPool[v.meteoraPool];
  cache = { at: Date.now(), data };
  return data;
}

export const fmtUsd = (n: number | null | undefined, compact = false) => {
  if (n == null) return "—";
  if (compact && n >= 1000)
    return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
};
export const fmtCompactUsd = (n: number | null | undefined) => {
  if (n == null) return "—";
  if (n >= 1e6) return "$" + (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return "$" + (n / 1e3).toFixed(2) + "K";
  return "$" + n.toFixed(0);
};
export const fmtNum = (n: number | null | undefined, dp = 6) =>
  n == null ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: dp });
