// Create a shared test USDC mint + 6 vaults on devnet, one per symbol.
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction,
  TransactionInstruction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { createHash } from "crypto";
import fs from "fs";

const RPC = "https://api.devnet.solana.com";
const PROGRAM_ID = new PublicKey("767woN2qJdFwFmw415arDXGVnk6JaTymGmzy6BSzc8YT");
const conn = new Connection(RPC, "confirmed");
const payer = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync("/Users/maqiyuan/earnonsol/.keys/devnet-deployer.json")))
);
const disc = (n) => createHash("sha256").update(`global:${n}`).digest().subarray(0, 8);
const RENT = new PublicKey("SysvarRent111111111111111111111111111111111");
const VAULT_SEED = Buffer.from("vault"), SHARE_SEED = Buffer.from("share");
const SYMBOLS = ["nvda", "tsla", "aapl", "spy", "qqq", "stonk"];

async function main() {
  console.log("payer", payer.publicKey.toBase58(), (await conn.getBalance(payer.publicKey)) / 1e9, "SOL");
  // shared test USDC (mint authority = deployer, so we can faucet)
  const usdcMint = await createMint(conn, payer, payer.publicKey, null, 6);
  console.log("test USDC:", usdcMint.toBase58());

  const out = { network: "devnet", programId: PROGRAM_ID.toBase58(), usdcMint: usdcMint.toBase58(), mintAuthority: payer.publicKey.toBase58(), vaults: {} };
  for (const sym of SYMBOLS) {
    const assetMint = await createMint(conn, payer, payer.publicKey, null, 6);
    const [vault] = PublicKey.findProgramAddressSync([VAULT_SEED, assetMint.toBuffer()], PROGRAM_ID);
    const [shareMint] = PublicKey.findProgramAddressSync([SHARE_SEED, vault.toBuffer()], PROGRAM_ID);
    const usdcVault = getAssociatedTokenAddressSync(usdcMint, vault, true);
    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: payer.publicKey, isSigner: true, isWritable: true },
        { pubkey: usdcMint, isSigner: false, isWritable: false },
        { pubkey: assetMint, isSigner: false, isWritable: false },
        { pubkey: vault, isSigner: false, isWritable: true },
        { pubkey: shareMint, isSigner: false, isWritable: true },
        { pubkey: usdcVault, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: RENT, isSigner: false, isWritable: false },
      ],
      data: disc("initialize_vault"),
    });
    await sendAndConfirmTransaction(conn, new Transaction().add(ix), [payer]);
    out.vaults[sym] = {
      vault: vault.toBase58(), assetMint: assetMint.toBase58(),
      shareMint: shareMint.toBase58(), usdcVault: usdcVault.toBase58(),
    };
    console.log(`✓ ${sym} vault ${vault.toBase58()}`);
  }
  fs.writeFileSync("devnet-registry.json", JSON.stringify(out, null, 2));
  console.log("\nwrote devnet-registry.json");
}
main().catch((e) => { console.error("FAILED", e); process.exit(1); });
