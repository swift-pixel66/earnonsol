import { PoolInfo } from "./raydium";

// Live stats for the pre-IPO tokens (real Tessera / PreStocks tokens on Meteora),
// sourced from DexScreener. APR / 24h fees are estimated from real 24h volume at
// the pool fee tier (these markets don't expose a fee-APR feed).
const FEE_RATE = 0.02; // ~2% Meteora pool fee (estimate for fee/APR derivation)

export async function fetchPreIpoInfo(pairAddress: string): Promise<PoolInfo | null> {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${pairAddress}`);
    const j = await r.json();
    const p = (j?.pairs && j.pairs[0]) || j?.pair;
    if (!p) return null;
    const tvl = Number(p.liquidity?.usd) || 0;
    const vol24 = Number(p.volume?.h24) || 0;
    const price = Number(p.priceUsd) || 0;
    const fees24h = vol24 * FEE_RATE;
    const apr = tvl > 0 ? (fees24h / tvl) * 365 * 100 : 0;
    return {
      tvl, apr, fees24h, volume24h: vol24,
      reserveAsset: 0, reserveUsdc: 0, price,
    };
  } catch {
    return null;
  }
}
