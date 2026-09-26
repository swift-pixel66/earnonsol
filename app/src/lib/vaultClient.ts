import { Buffer } from "buffer";
import {
  Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { CpAmm } from "@meteora-ag/cp-amm-sdk";
import BN from "bn.js";
import { VaultConfig } from "./registry";
import meteoraReg from "./meteora-devnet-registry.json";

// EARN vault program (devnet), Meteora DAMM v2 integrated. deposit/withdraw are
// real CPI-into-cp-amm instructions built against a vault-owned position.
export const PROGRAM_ID = new PublicKey("767woN2qJdFwFmw415arDXGVnk6JaTymGmzy6BSzc8YT");
const CP_AMM = new PublicKey("cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG");

const DISC = {
  deposit: [242, 35, 198, 137, 82, 225, 242, 182],
  withdraw: [183, 18, 70, 156, 148, 109, 161, 34],
};
const u64 = (n: bigint) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, n, true); return b; };
const u128 = (bn: BN) => Uint8Array.from(bn.toArrayLike(Buffer, "le", 16));

interface MVault {
  vault: string; shareMint: string; assetMint: string; assetVault: string; usdcVault: string;
  pool: string; position: string; positionNftAccount: string; aFirst: boolean;
  tokenAMint: string; tokenBMint: string; tokenAVault: string; tokenBVault: string;
  poolAuthority: string; eventAuthority: string;
}
const MET = meteoraReg as { usdcMint: string; vaults: Record<string, MVault> };

export function meteoraVaultFor(id: string): MVault | undefined { return MET.vaults[id]; }
export function meteoraUsdcMint(): string { return MET.usdcMint; }

export class VaultNotOnDevnetError extends Error {
  constructor() { super("This vault's Meteora pool is only set up on Devnet in this build (demo covers NVDA). Open /app?env=dev."); this.name = "VaultNotOnDevnetError"; }
}
export class ProgramNotWiredError extends Error {}

function cpKeys(m: MVault, user: PublicKey) {
  const pk = (s: string) => new PublicKey(s);
  const shareMint = pk(m.shareMint);
  const userShares = getAssociatedTokenAddressSync(shareMint, user, true);
  const userTokenA = getAssociatedTokenAddressSync(pk(m.tokenAMint), user, true);
  const userTokenB = getAssociatedTokenAddressSync(pk(m.tokenBMint), user, true);
  return {
    shareMint, userShares, userTokenA, userTokenB,
    keys: [
      { pubkey: user, isSigner: true, isWritable: true },
      { pubkey: pk(m.vault), isSigner: false, isWritable: false },
      { pubkey: shareMint, isSigner: false, isWritable: true },
      { pubkey: userShares, isSigner: false, isWritable: true },
      { pubkey: userTokenA, isSigner: false, isWritable: true },
      { pubkey: userTokenB, isSigner: false, isWritable: true },
      { pubkey: pk(m.aFirst ? m.assetVault : m.usdcVault), isSigner: false, isWritable: true }, // vault_token_a
      { pubkey: pk(m.aFirst ? m.usdcVault : m.assetVault), isSigner: false, isWritable: true }, // vault_token_b
      { pubkey: CP_AMM, isSigner: false, isWritable: false },
      { pubkey: pk(m.pool), isSigner: false, isWritable: true },
      { pubkey: pk(m.position), isSigner: false, isWritable: true },
      { pubkey: pk(m.positionNftAccount), isSigner: false, isWritable: false },
      { pubkey: pk(m.tokenAVault), isSigner: false, isWritable: true },
      { pubkey: pk(m.tokenBVault), isSigner: false, isWritable: true },
      { pubkey: pk(m.tokenAMint), isSigner: false, isWritable: false },
      { pubkey: pk(m.tokenBMint), isSigner: false, isWritable: false },
      { pubkey: pk(m.poolAuthority), isSigner: false, isWritable: false },
      { pubkey: pk(m.eventAuthority), isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_a_program
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_b_program
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
    ],
  };
}

export interface DepositParams { connection: Connection; vault: VaultConfig; user: PublicKey; usdcAmount: bigint; }
export interface WithdrawParams { connection: Connection; vault: VaultConfig; user: PublicKey; shareAmount: bigint; }

export async function buildDepositTx(p: DepositParams): Promise<Transaction> {
  const m = meteoraVaultFor(p.vault.id);
  if (!m) throw new VaultNotOnDevnetError();
  const cpAmm = new CpAmm(p.connection);
  const st = await cpAmm.fetchPoolState(new PublicKey(m.pool));
  const usdcIsTokenA = !m.aFirst; // aFirst = asset<usdc, so USDC is tokenB when aFirst
  const q = cpAmm.getDepositQuote({
    inAmount: new BN(p.usdcAmount.toString()), isTokenA: usdcIsTokenA,
    sqrtPrice: st.sqrtPrice, minSqrtPrice: st.sqrtMinPrice, maxSqrtPrice: st.sqrtMaxPrice,
  } as any);
  // amounts in tokenA/tokenB order, with a tiny buffer so add_liquidity has enough
  const buf = (bn: BN) => bn.muln(101).divn(100).addn(1);
  const usdcAmt = buf(new BN(p.usdcAmount.toString()));
  const assetAmt = buf(q.outputAmount);
  const amountA = m.aFirst ? assetAmt : usdcAmt;
  const amountB = m.aFirst ? usdcAmt : assetAmt;

  const { shareMint, userShares, userTokenA, userTokenB, keys } = cpKeys(m, p.user);
  const data = Buffer.concat([Buffer.from(DISC.deposit), Buffer.from(u128(q.liquidityDelta)), Buffer.from(u64(BigInt(amountA.toString()))), Buffer.from(u64(BigInt(amountB.toString())))]);

  const tx = new Transaction();
  tx.add(createAssociatedTokenAccountIdempotentInstruction(p.user, userShares, p.user, shareMint));
  tx.add(createAssociatedTokenAccountIdempotentInstruction(p.user, userTokenA, p.user, new PublicKey(m.tokenAMint)));
  tx.add(createAssociatedTokenAccountIdempotentInstruction(p.user, userTokenB, p.user, new PublicKey(m.tokenBMint)));
  tx.add(new TransactionInstruction({ programId: PROGRAM_ID, keys, data }));
  return tx;
}

export async function buildWithdrawTx(p: WithdrawParams): Promise<Transaction> {
  const m = meteoraVaultFor(p.vault.id);
  if (!m) throw new VaultNotOnDevnetError();
  const { keys } = cpKeys(m, p.user);
  const data = Buffer.concat([Buffer.from(DISC.withdraw), Buffer.from(u64(p.shareAmount)), Buffer.from(u64(0n)), Buffer.from(u64(0n))]);
  return new Transaction().add(new TransactionInstruction({ programId: PROGRAM_ID, keys, data }));
}

export { SystemProgram, ASSOCIATED_TOKEN_PROGRAM_ID };
