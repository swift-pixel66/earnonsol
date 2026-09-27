import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { VaultConfig } from "../lib/registry";
import { short, usdcBalance, tokenUiBalance, selectedNetwork } from "../lib/chain";
import { fmtCompactUsd } from "../lib/raydium";
import { preIpoMarketFor, buildDbcBuyTx } from "../lib/dbc";

export function PreIpoPanel({ vault }: { vault: VaultConfig }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const m = preIpoMarketFor(vault.id)!;
  const isDev = selectedNetwork() === "devnet";
  const [amount, setAmount] = useState("");
  const [usdc, setUsdc] = useState<number | null>(null);
  const [tok, setTok] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!publicKey) { setUsdc(null); setTok(null); return; }
    usdcBalance(connection, publicKey).then(setUsdc);
    tokenUiBalance(connection, publicKey, new PublicKey(m.baseMint), TOKEN_PROGRAM_ID).then(setTok);
  }
  useEffect(() => { refresh(); }, [publicKey, connection, vault.id]);

  async function buy() {
    setStatus(null);
    if (!isDev) return setStatus("Pre-IPO markets are live on Devnet — open with ?env=dev.");
    if (!publicKey) return setStatus("Connect a wallet first.");
    const v = Number(amount);
    if (!v || v <= 0) return setStatus("Enter a USDC amount.");
    setBusy(true);
    try {
      const tx = await buildDbcBuyTx({ connection, market: m, user: publicKey as PublicKey, usdcAmount: BigInt(Math.round(v * 1e6)) });
      // ensure the token ATA exists (defensive)
      const ata = getAssociatedTokenAddressSync(new PublicKey(m.baseMint), publicKey, true);
      tx.instructions.unshift(createAssociatedTokenAccountIdempotentInstruction(publicKey, ata, publicKey, new PublicKey(m.baseMint)));
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      setStatus(`✅ Bought ${vault.symbol} on the curve · ${sig.slice(0, 8)}…`);
      setAmount("");
      await refresh();
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    } finally { setBusy(false); }
  }

  async function faucet() {
    if (!publicKey) return setStatus("Connect a wallet first.");
    setBusy(true); setStatus("Requesting test USDC…");
    try {
      const url = (import.meta.env.VITE_FAUCET_URL as string) || "http://127.0.0.1:8899/faucet";
      const r = await fetch(`${url}?to=${publicKey.toBase58()}`); const j = await r.json();
      if (j.ok) { setStatus("✅ Received test USDC"); await refresh(); } else setStatus(`Faucet error: ${j.error}`);
    } catch { setStatus("Faucet not running (local demo)."); }
    finally { setBusy(false); }
  }

  const walletShort = publicKey ? short(publicKey.toBase58(), 4) : null;

  return (
    <div className="panel-grid">
      <section className="card vault-card">
        <div className="card-head"><span className="card-label">{vault.symbol} · PRE-IPO MARKET</span></div>
        <div className="vault-identity">
          <img className="asset-img" src={vault.icon} alt="" width={48} height={48} />
          <div><h2>{vault.name}</h2><p className="pair">{vault.symbol} <span>/ USDC · Meteora DBC</span></p></div>
        </div>
        <div className="pool-apr-row">
          <div className="pool-depth">
            <span className="muted">Curve progress</span>
            <strong className="depth">{(m.curveProgress * 100).toFixed(2)}<small style={{ fontSize: 18 }}>%</small></strong>
            <span className="muted small">Price discovery to graduation · $50K MC → DAMM v2</span>
          </div>
        </div>
        <div className="reserves">
          <div><img src="/tokens/usdc.svg" width={26} height={26} alt="" /><div><span className="muted small">Pool liquidity</span><strong>{fmtCompactUsd(m.usdcRaised)}</strong></div></div>
          <div><img src={vault.icon} width={26} height={26} alt="" /><div><span className="muted small">Curve fees</span><strong>{fmtCompactUsd(m.feesQuote)}</strong></div></div>
        </div>
        <div className="card-foot"><span className="muted small">Meteora DBC · USDC-quoted</span><span className="mgmt">Status <b>Price discovery</b></span></div>
      </section>

      <section className="card position-card">
        <div className="card-head"><span className="card-label">YOUR POSITION</span><span className="wallet-addr">{walletShort ?? "Not connected"}</span></div>
        <div className="position-value">
          <div><span className="muted small">Your {vault.symbol}</span><strong className="est">{publicKey ? (tok == null ? "…" : tok.toLocaleString(undefined, { maximumFractionDigits: 4 })) : "—"}</strong></div>
          <div className="right"><span className="muted small">USDC balance</span><strong className="shares">{publicKey ? (usdc == null ? "…" : usdc.toFixed(2)) : "—"}</strong></div>
        </div>
        <div className="action-head"><strong>Deposit USDC</strong><p className="muted small">Buys {vault.symbol} on the Meteora DBC bonding curve — USDC in, tokens to your wallet.</p></div>
        <div className="field">
          <div className="field-label"><span className="muted small">Amount to deposit</span><span className="muted small">Available: {usdc == null ? "—" : usdc.toFixed(2)}</span></div>
          <div className="input-row"><input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /><span className="suffix"><img src="/tokens/usdc.svg" width={20} height={20} alt="" />USDC</span></div>
        </div>
        <button className="btn-primary block" onClick={buy} disabled={busy || !isDev}>{busy ? "Confirm in wallet…" : isDev ? "→ Deposit USDC" : "→ Switch to Devnet (?env=dev)"}</button>
        {isDev && (import.meta.env.VITE_FAUCET_URL || import.meta.env.DEV) && (
          <button className="faucet-btn" onClick={faucet} disabled={busy || !publicKey}>{publicKey ? "🚰 Get test USDC" : "Connect a wallet to get test USDC"}</button>
        )}
        {status && <div className="status">{status}</div>}
      </section>
    </div>
  );
}
