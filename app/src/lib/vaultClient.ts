import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { VaultConfig } from "./registry";

// ---------------------------------------------------------------------------
// Vault program client interface.
//
// The mainnet program (native, magic "EARNVV02") is a reference we do NOT
// transact against. These builders describe the deposit / withdraw flows the
// app needs; they will be implemented against the rebuilt Devnet program once
// its instruction ABI is finalized. Keeping the interface here lets the UI be
// fully built and typed now, and wired in one place later.
// ---------------------------------------------------------------------------

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
  shareAmount: bigint; // base units of the vault share mint
}

export class ProgramNotWiredError extends Error {
  constructor(action: string) {
    super(
      `${action} is not wired to a program yet. ` +
        `Deploy the rebuilt vault program to Devnet and implement the instruction ABI in vaultClient.ts.`
    );
    this.name = "ProgramNotWiredError";
  }
}

// Build the single-transaction USDC deposit (swap half -> asset, add Meteora
// liquidity, mint vault shares to the user). Stub until the ABI is set.
export async function buildDepositTx(_p: DepositParams): Promise<Transaction> {
  throw new ProgramNotWiredError("Deposit");
}

// Build the withdraw transaction (burn shares -> return asset + USDC).
export async function buildWithdrawTx(_p: WithdrawParams): Promise<Transaction> {
  throw new ProgramNotWiredError("Withdraw");
}
