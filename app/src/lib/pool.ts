import { Connection, PublicKey } from "@solana/web3.js";
import { VaultConfig, USDC_MINT } from "./registry";

export interface PoolStats {
  assetReserve: number; // asset token amount held by the pool
  usdcReserve: number; // USDC amount held by the pool
  assetPrice: number | null; // USD per asset token (estimate)
  depthUsd: number | null; // total pool depth in USD (estimate)
}

// Meteora DAMM v2 pool account layout (offsets into account data):
//   +73  token_a_mint    +105 token_b_mint
//   +137 token_a_vault   +169 token_b_vault
const OFF_A_MINT = 73;
const OFF_B_MINT = 105;
const OFF_A_VAULT = 137;
const OFF_B_VAULT = 169;

function pkAt(data: Buffer, off: number) {
  return new PublicKey(data.subarray(off, off + 32));
}

export async function fetchPoolStats(
  conn: Connection,
  vault: VaultConfig
): Promise<PoolStats | null> {
  if (!vault.meteoraPool || !vault.assetMint) return null;
  try {
    const poolAcc = await conn.getAccountInfo(new PublicKey(vault.meteoraPool));
    if (!poolAcc) return null;
    const data = poolAcc.data as Buffer;

    const aMint = pkAt(data, OFF_A_MINT).toBase58();
    const aVault = pkAt(data, OFF_A_VAULT);
    const bVault = pkAt(data, OFF_B_VAULT);

    const [aBal, bBal] = await Promise.all([
      conn.getTokenAccountBalance(aVault).catch(() => null),
      conn.getTokenAccountBalance(bVault).catch(() => null),
    ]);
    const aAmt = aBal?.value.uiAmount ?? 0;
    const bAmt = bBal?.value.uiAmount ?? 0;

    // side A is the asset unless A happens to be USDC
    const aIsUsdc = aMint === USDC_MINT;
    const assetReserve = aIsUsdc ? bAmt : aAmt;
    const usdcReserve = aIsUsdc ? aAmt : bAmt;

    const assetPrice = await fetchAssetPrice(vault.assetMint, {
      usdcReserve,
      assetReserve,
    });
    const depthUsd =
      assetPrice != null ? usdcReserve + assetReserve * assetPrice : null;

    return { assetReserve, usdcReserve, assetPrice, depthUsd };
  } catch {
    return null;
  }
}

async function fetchAssetPrice(
  mint: string,
  fallback: { usdcReserve: number; assetReserve: number }
): Promise<number | null> {
  try {
    const r = await fetch(`https://lite-api.jup.ag/price/v3?ids=${mint}`);
    if (r.ok) {
      const j = await r.json();
      const p = j?.[mint]?.usdPrice ?? j?.data?.[mint]?.price;
      if (p) return Number(p);
    }
  } catch {
    /* ignore */
  }
  if (fallback.assetReserve > 0)
    return fallback.usdcReserve / fallback.assetReserve;
  return null;
}

export function fmtUsd(n: number | null, opts: { compact?: boolean } = {}) {
  if (n == null) return "—";
  if (opts.compact && n >= 1000)
    return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return "$" + n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function fmtAmount(n: number | null, dp = 6) {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: dp });
}
