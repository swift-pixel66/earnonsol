// End-to-end test: create test mints, init vault, deposit, withdraw — all on devnet.
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction,
  TransactionInstruction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint, getOrCreateAssociatedTokenAccount, mintTo,
  getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { createHash } from "crypto";
import fs from "fs";

const RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("767woN2qJdFwFmw415arDXGVnk6JaTymGmzy6BSzc8YT");
const conn = new Connection(RPC, "confirmed");
const payer = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync("/Users/maqiyuan/earnonsol/.keys/devnet-deployer.json")))
);

const disc = (name) => createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };

const VAULT_SEED = Buffer.from("vault");
const SHARE_SEED = Buffer.from("share");

async function main() {
  console.log("payer:", payer.publicKey.toBase58(), "bal:", (await conn.getBalance(payer.publicKey)) / 1e9, "SOL");

  // 1) test mints: USDC (6dp) and an asset (stock) mint (6dp)
  console.log("creating test USDC + asset mints…");
  const usdcMint = await createMint(conn, payer, payer.publicKey, null, 6);
  const assetMint = await createMint(conn, payer, payer.publicKey, null, 6);
  console.log("  usdc:", usdcMint.toBase58(), "\n  asset:", assetMint.toBase58());

  // 2) user USDC ATA + mint 1,000 test USDC
  const userUsdc = await getOrCreateAssociatedTokenAccount(conn, payer, usdcMint, payer.publicKey);
  await mintTo(conn, payer, usdcMint, userUsdc.address, payer, 1_000_000_000n); // 1000 USDC
  console.log("minted 1000 test USDC to user");

  // 3) PDAs
  const [vault] = PublicKey.findProgramAddressSync([VAULT_SEED, assetMint.toBuffer()], PROGRAM_ID);
  const [shareMint] = PublicKey.findProgramAddressSync([SHARE_SEED, vault.toBuffer()], PROGRAM_ID);
  const usdcVault = getAssociatedTokenAddressSync(usdcMint, vault, true);
  const userShares = getAssociatedTokenAddressSync(shareMint, payer.publicKey, true);
  console.log("vault:", vault.toBase58(), "\nshareMint:", shareMint.toBase58());

  // 4) initialize_vault
  const initIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },       // authority
      { pubkey: usdcMint, isSigner: false, isWritable: false },
      { pubkey: assetMint, isSigner: false, isWritable: false },
      { pubkey: vault, isSigner: false, isWritable: true },
      { pubkey: shareMint, isSigner: false, isWritable: true },
      { pubkey: usdcVault, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
    ],
    data: disc("initialize_vault"),
  });
  await sendAndConfirmTransaction(conn, new Transaction().add(initIx), [payer]);
  console.log("✓ vault initialized");

  // 5) deposit 250 USDC
  const depIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },   // user
      { pubkey: vault, isSigner: false, isWritable: false },
      { pubkey: shareMint, isSigner: false, isWritable: true },
      { pubkey: usdcVault, isSigner: false, isWritable: true },
      { pubkey: userUsdc.address, isSigner: false, isWritable: true },
      { pubkey: userShares, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([disc("deposit"), u64(250_000_000)]), // 250 USDC
  });
  await sendAndConfirmTransaction(conn, new Transaction().add(depIx), [payer]);
  const sharesBal = (await conn.getTokenAccountBalance(userShares)).value;
  const vaultBal = (await conn.getTokenAccountBalance(usdcVault)).value;
  console.log(`✓ deposited 250 USDC → shares=${sharesBal.uiAmount}, vault USDC=${vaultBal.uiAmount}`);

  // 6) withdraw half the shares
  const half = Math.floor(Number(sharesBal.amount) / 2);
  const wIx = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: vault, isSigner: false, isWritable: false },
      { pubkey: shareMint, isSigner: false, isWritable: true },
      { pubkey: usdcVault, isSigner: false, isWritable: true },
      { pubkey: userUsdc.address, isSigner: false, isWritable: true },
      { pubkey: userShares, isSigner: false, isWritable: true },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([disc("withdraw"), u64(half)]),
  });
  await sendAndConfirmTransaction(conn, new Transaction().add(wIx), [payer]);
  const uUsdc = (await conn.getTokenAccountBalance(userUsdc.address)).value;
  const sBal2 = (await conn.getTokenAccountBalance(userShares)).value;
  const vBal2 = (await conn.getTokenAccountBalance(usdcVault)).value;
  console.log(`✓ withdrew ${half / 1e6} shares → user USDC=${uUsdc.uiAmount}, shares left=${sBal2.uiAmount}, vault USDC=${vBal2.uiAmount}`);

  console.log("\nRESULT: deposit + withdraw end-to-end OK ✅");
  console.log(JSON.stringify({ usdcMint: usdcMint.toBase58(), assetMint: assetMint.toBase58(), vault: vault.toBase58(), shareMint: shareMint.toBase58(), usdcVault: usdcVault.toBase58() }, null, 2));
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
