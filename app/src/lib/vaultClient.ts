import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { VaultConfig } from "./registry";
import { DEVNET, DevnetVault } from "./devnet";

// EARN vault program (devnet). Deposit USDC / withdraw shares are real
// instructions built here against the deployed program.
export const PROGRAM_ID = new PublicKey(
  "767woN2qJdFwFmw415arDXGVnk6JaTymGmzy6BSzc8YT"
);

// Anchor instruction discriminators = sha256("global:<name>")[:8] (constant).
const DISC: Record<string, number[]> = {
  deposit: [242, 35, 198, 137, 82, 225, 242, 182],
  withdraw: [183, 18, 70, 156, 148, 109, 161, 34],
};

function u64(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setBigUint64(0, n, true);
  return b;
}
function ixData(name: string, arg: bigint): Buffer {
  return Buffer.concat([Buffer.from(DISC[name]), Buffer.from(u64(arg))]);
}

export class VaultNotOnDevnetError extends Error {
  constructor() {
    super(
      "This vault is only live on Devnet in this build. Open the app with ?env=dev to deposit/withdraw."
    );
    this.name = "VaultNotOnDevnetError";
  }
}

function resolveDevnet(vault: VaultConfig): DevnetVault {
  const d = DEVNET.vaults[vault.id];
  if (!d) throw new VaultNotOnDevnetError();
  return d;
}

export interface DepositParams {
  connection: Connection;
  vault: VaultConfig;
  user: PublicKey;
  usdcAmount: bigint; // base units (6 decimals)
}
export interface WithdrawParams {
  connection: Connection;
  vault: VaultConfig;
  user: PublicKey;
  shareAmount: bigint; // base units of the share mint (6 decimals)
}

export async function buildDepositTx(p: DepositParams): Promise<Transaction> {
  const d = resolveDevnet(p.vault);
  const usdcMint = new PublicKey(DEVNET.usdcMint);
  const shareMint = new PublicKey(d.shareMint);
  const vault = new PublicKey(d.vault);
  const usdcVault = new PublicKey(d.usdcVault);
  const userUsdc = getAssociatedTokenAddressSync(usdcMint, p.user, true);
  const userShares = getAssociatedTokenAddressSync(shareMint, p.user, true);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: p.user, isSigner: true, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: false },
      { pubkey: shareMint, isSigner: false, isWritable: true },
      { pubkey: usdcVault, isSigner: false, isWritable: true },
      { pubkey: userUsdc, isSigner: false, isWritable: true },
      { pubkey: userShares, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: ixData("deposit", p.usdcAmount),
  });
  return new Transaction().add(ix);
}

export async function buildWithdrawTx(p: WithdrawParams): Promise<Transaction> {
  const d = resolveDevnet(p.vault);
  const usdcMint = new PublicKey(DEVNET.usdcMint);
  const shareMint = new PublicKey(d.shareMint);
  const vault = new PublicKey(d.vault);
  const usdcVault = new PublicKey(d.usdcVault);
  const userUsdc = getAssociatedTokenAddressSync(usdcMint, p.user, true);
  const userShares = getAssociatedTokenAddressSync(shareMint, p.user, true);

  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: p.user, isSigner: true, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: false },
      { pubkey: shareMint, isSigner: false, isWritable: true },
      { pubkey: usdcVault, isSigner: false, isWritable: true },
      { pubkey: userUsdc, isSigner: false, isWritable: true },
      { pubkey: userShares, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: ixData("withdraw", p.shareAmount),
  });
  return new Transaction().add(ix);
}

// Kept for callers that still reference it.
export class ProgramNotWiredError extends Error {}
export { SYSVAR_RENT_PUBKEY };
