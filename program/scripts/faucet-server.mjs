// Local devnet faucet: mints test USDC + each Meteora vault's test asset to a
// requested wallet so it can deposit the pair. Holds the mint authority (local).
import http from "http";
import fs from "fs";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

const RPC = "https://api.devnet.solana.com";
const reg = JSON.parse(fs.readFileSync("devnet-registry.json"));
let meteora = { vaults: {} };
try { meteora = JSON.parse(fs.readFileSync("meteora-devnet-registry.json")); } catch {}
const USDC = new PublicKey(reg.usdcMint);
const conn = new Connection(RPC, "confirmed");
const authority = Keypair.fromSecretKey(new Uint8Array(JSON.parse(
  fs.readFileSync("/Users/maqiyuan/earnonsol/.keys/devnet-deployer.json"))));
const PORT = 8899;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };

async function mintTok(mint, owner, amount) {
  const ata = await getOrCreateAssociatedTokenAccount(conn, authority, mint, owner);
  return mintTo(conn, authority, mint, ata.address, authority, amount);
}

http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname !== "/faucet") { res.writeHead(404, cors); return res.end("not found"); }
  const to = url.searchParams.get("to");
  try {
    const owner = new PublicKey(to);
    await mintTok(USDC, owner, 1_000_000_000n); // 1000 test USDC
    const assets = [...new Set(Object.values(meteora.vaults).map(v => v.assetMint))];
    for (const a of assets) await mintTok(new PublicKey(a), owner, 1_000_000_000n); // 1000 of each test asset
    res.writeHead(200, { "Content-Type": "application/json", ...cors });
    res.end(JSON.stringify({ ok: true, usdc: "1000", assets: assets.length }));
    console.log("faucet ->", to, "USDC + assets", assets.length);
  } catch (e) {
    res.writeHead(400, { "Content-Type": "application/json", ...cors });
    res.end(JSON.stringify({ ok: false, error: String(e) }));
    console.error("faucet err", String(e));
  }
}).listen(PORT, "127.0.0.1", () => console.log(`faucet on http://127.0.0.1:${PORT}/faucet?to=<wallet>`));
