import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { DynamicBondingCurveClient } from "@meteora-ag/dynamic-bonding-curve-sdk";
import BN from "bn.js";
import dbcReg from "./dbc-registry.json";
import dbcStats from "./dbc-stats.json";

// Pre-IPO markets launched on Meteora DBC (Devnet). "Deposit USDC" here buys the
// token on its bonding curve (price discovery) — the pre-graduation analog of
// depositing into a graduated DAMM v2 vault.
export interface PreIpoMarket {
  id: string; symbol: string; name: string; icon: string; kind: string;
  baseMint: string; pool: string; config: string; quoteMint: string;
  usdcRaised: number; feesQuote: number; curveProgress: number;
}

const ICON: Record<string, string> = { TKALSHI: "tkalshi", TOPENAI: "topenai", ANTHRO: "anthro", FIGURE: "figure" };
const ID: Record<string, string> = { TKALSHI: "tkalshi", TOPENAI: "topenai", ANTHRO: "anthro", FIGURE: "figure" };

const reg = dbcReg as any;
const stats = dbcStats as any;

export const PREIPO: Record<string, PreIpoMarket> = Object.fromEntries(
  Object.entries(reg.pools).map(([sym, v]: any) => {
    const id = ID[sym] ?? sym.toLowerCase();
    const s = stats[sym] ?? {};
    return [id, {
      id, symbol: sym, name: v.name, icon: `/tokens/${ICON[sym] ?? "usdc"}.png`, kind: v.kind,
      baseMint: v.baseMint, pool: s.pool ?? "", config: reg.config, quoteMint: reg.quoteMint,
      usdcRaised: s.usdcRaised ?? 0, feesQuote: s.feesQuote ?? 0, curveProgress: s.curveProgress ?? 0,
    }];
  })
);

export function preIpoMarketFor(id: string): PreIpoMarket | undefined { return PREIPO[id]; }

// Buy the token on its DBC bonding curve with USDC (deposit USDC -> get token).
export async function buildDbcBuyTx(params: {
  connection: Connection; market: PreIpoMarket; user: PublicKey; usdcAmount: bigint;
}): Promise<Transaction> {
  const client = new DynamicBondingCurveClient(params.connection, "confirmed");
  const tx = await client.pool.swap({
    amountIn: new BN(params.usdcAmount.toString()),
    minimumAmountOut: new BN(1),
    swapBaseForQuote: false, // quote(USDC) -> base(token)
    owner: params.user,
    pool: new PublicKey(params.market.pool),
    referralTokenAccount: null,
    payer: params.user,
  } as any);
  return tx as Transaction;
}
