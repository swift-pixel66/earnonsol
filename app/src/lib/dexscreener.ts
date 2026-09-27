import { PoolInfo } from "./raydium";

// Live stats for the pre-IPO tokens (real Tessera / PreStocks tokens on Meteora
// DLMM), sourced from DexScreener. Fee APR is computed from real 24h volume and
// the pool's real base fee: fees = volume * feeRate, APR = fees/TVL * 365.
export async function fetchPreIpoInfo(pairAddress: string, feeRate = 0.0001): Promise<PoolInfo | null> {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${pairAddress}`);
    const j = await r.json();
    const p = (j?.pairs && j.pairs[0]) || j?.pair;
    if (!p) return null;
    const tvl = Number(p.liquidity?.usd) || 0;
    const vol24 = Number(p.volume?.h24) || 0;
    const price = Number(p.priceUsd) || 0;
    const fees24h = vol24 * feeRate;
    const apr = tvl > 0 ? (fees24h / tvl) * 365 * 100 : 0;
    return { tvl, apr, fees24h, volume24h: vol24, reserveAsset: 0, reserveUsdc: 0, price };
  } catch {
    return null;
  }
}
