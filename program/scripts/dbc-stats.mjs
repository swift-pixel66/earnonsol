// Read live DBC curve stats for the launched tokens: USDC raised (liquidity),
// curve progress, and the config's base fee. Writes dbc-stats.json.
import { Connection, PublicKey } from "@solana/web3.js";
import { DynamicBondingCurveClient } from "@meteora-ag/dynamic-bonding-curve-sdk";
import fs from "fs";
const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const client = new DynamicBondingCurveClient(conn, "confirmed");
const reg = JSON.parse(fs.readFileSync("dbc-registry.json"));
(async () => {
  const out = {};
  for (const [sym, v] of Object.entries(reg.pools)) {
    try {
      const baseMint = new PublicKey(v.baseMint);
      const pool = await client.state.getPoolByBaseMint(baseMint);
      const progress = await client.state.getPoolBaseTokenCurveProgress(pool.publicKey).catch(() => null);
      const st = pool.account;
      // quote reserve = USDC raised on the curve
      const quoteReserve = Number(st.quoteReserve?.toString?.() ?? 0) / 1e6;
      out[sym] = {
        pool: pool.publicKey.toBase58(),
        usdcRaised: quoteReserve,
        curveProgress: progress != null ? Number(progress) : null,
      };
      console.log(sym, "raised", quoteReserve.toFixed(2), "USDC, progress", progress);
    } catch (e) {
      out[sym] = { error: String(e.message || e).slice(0, 80) };
      console.log(sym, "err", out[sym].error);
    }
  }
  fs.writeFileSync("dbc-stats.json", JSON.stringify(out, null, 2));
  console.log("RESULT: wrote dbc-stats.json");
})().catch(e => { console.error("FAILED", e); process.exit(1); });
