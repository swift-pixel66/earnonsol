// Seed each DBC curve with real buys, then snapshot live stats -> dbc-stats.json
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
const send = (tx, s) => sendAndConfirmTransaction(conn, tx, s, { commitment: "confirmed", maxRetries: 5 });
// varied buy totals per token so cards differ realistically
const SEED = { TKALSHI: 240, TOPENAI: 380, ANTHRO: 150, FIGURE: 90 };

(async () => {
  const uAta = await getOrCreateAssociatedTokenAccount(conn, payer, USDC, payer.publicKey);
  const out = {};
  for (const [sym, v] of Object.entries(reg.pools)) {
    const baseMint = new PublicKey(v.baseMint);
    const pool = await client.state.getPoolByBaseMint(baseMint);
    try {
      const total = SEED[sym] || 100;
      await mintTo(conn, payer, USDC, uAta.address, payer, BigInt(total * 1e6));
      // a few buys to build the curve
      const chunks = 3, per = Math.floor(total / chunks);
      for (let i = 0; i < chunks; i++) {
        const tx = await client.pool.swap({
          amountIn: new BN(per * 1e6), minimumAmountOut: new BN(1), swapBaseForQuote: false,
          owner: payer.publicKey, pool: pool.publicKey, referralTokenAccount: null, payer: payer.publicKey,
        });
        await send(tx, [payer]);
      }
    } catch (e) { console.log(sym, "buy note", String(e.message || e).slice(0, 80)); }
    const p2 = await client.state.getPoolByBaseMint(baseMint);
    const ps = p2.account.poolState;
    const raised = Number(ps.quoteReserve.toString()) / 1e6;
    const fees = (Number(ps.protocolQuoteFee) + Number(ps.partnerQuoteFee) + Number(ps.creatorQuoteFee)) / 1e6;
    const progress = await client.state.getPoolBaseTokenCurveProgress(pool.publicKey).catch(() => 0);
    out[sym] = { pool: pool.publicKey.toBase58(), usdcRaised: raised, feesQuote: fees, curveProgress: Number(progress) };
    console.log(`✓ ${sym} raised=$${raised.toFixed(2)} fees=$${fees.toFixed(4)} progress=${(Number(progress) * 100).toFixed(2)}%`);
  }
  fs.writeFileSync("dbc-stats.json", JSON.stringify(out, null, 2));
  console.log("RESULT: seeded + stats written ✅");
})().catch(e => { console.error("FAILED", e.message || e); process.exit(1); });
