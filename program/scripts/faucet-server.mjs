// Local devnet test-USDC faucet. Holds the mint authority (deployer keypair,
// local only) and mints test USDC to a requested wallet. For local testing only.
import http from "http";
import fs from "fs";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

const RPC = "https://api.devnet.solana.com";
const reg = JSON.parse(fs.readFileSync("devnet-registry.json"));
const USDC = new PublicKey(reg.usdcMint);
const conn = new Connection(RPC, "confirmed");
const authority = Keypair.fromSecretKey(
  new Uint8Array(JSON.parse(fs.readFileSync("/Users/maqiyuan/earnonsol/.keys/devnet-deployer.json")))
);
const AMOUNT = 1_000_000_000n; // 1000 test USDC (6dp)
const PORT = 8899;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

http
  .createServer(async (req, res) => {
    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (url.pathname !== "/faucet") { res.writeHead(404, cors); return res.end("not found"); }
    const to = url.searchParams.get("to");
    try {
      const owner = new PublicKey(to);
      const ata = await getOrCreateAssociatedTokenAccount(conn, authority, USDC, owner);
      const sig = await mintTo(conn, authority, USDC, ata.address, authority, AMOUNT);
      res.writeHead(200, { "Content-Type": "application/json", ...cors });
      res.end(JSON.stringify({ ok: true, sig, amount: "1000", mint: USDC.toBase58() }));
      console.log("faucet ->", to, sig);
    } catch (e) {
      res.writeHead(400, { "Content-Type": "application/json", ...cors });
      res.end(JSON.stringify({ ok: false, error: String(e) }));
      console.error("faucet err", String(e));
    }
  })
  .listen(PORT, "127.0.0.1", () => console.log(`test-USDC faucet on http://127.0.0.1:${PORT}/faucet?to=<wallet>`));
