import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { DynamicBondingCurveClient } from "@meteora-ag/dynamic-bonding-curve-sdk";
import BN from "bn.js";
import fs from "fs";
const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const payer = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync("/Users/maqiyuan/earnonsol/.keys/devnet-deployer.json"))));
const reg = JSON.parse(fs.readFileSync("dbc-registry.json"));
const USDC = new PublicKey(reg.quoteMint);
const client = new DynamicBondingCurveClient(conn, "confirmed");
(async () => {
  const sym = "TKALSHI";
  const baseMint = new PublicKey(reg.pools[sym].baseMint);
  const pool = await client.state.getPoolByBaseMint(baseMint);
  console.log(sym, "virtual pool:", pool.publicKey.toBase58());
  const uAta = await getOrCreateAssociatedTokenAccount(conn, payer, USDC, payer.publicKey);
  await mintTo(conn, payer, USDC, uAta.address, payer, 5_000_000n); // 5 USDC
  const tx = await client.pool.swap({
    amountIn: new BN(5_000_000), minimumAmountOut: new BN(1), swapBaseForQuote: false,
    owner: payer.publicKey, pool: pool.publicKey, referralTokenAccount: null, payer: payer.publicKey,
  });
  const sig = await sendAndConfirmTransaction(conn, tx, [payer], { commitment: "confirmed" });
  console.log("✓ bought", sym, "on the bonding curve with 5 USDC, sig", sig.slice(0,12));
  const prog = await client.state.getPoolBaseTokenCurveProgress(pool.publicKey).catch(()=>null);
  console.log("curve progress:", prog);
  reg.pools[sym].pool = pool.publicKey.toBase58();
  fs.writeFileSync("dbc-registry.json", JSON.stringify(reg, null, 2));
  console.log("RESULT: DBC trade OK ✅");
})().catch(e => { console.error("FAILED:", (e.transactionLogs || e.message || e)); process.exit(1); });
