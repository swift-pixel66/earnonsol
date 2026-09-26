import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { VaultConfig } from "../lib/registry";
import { short, usdcBalance, shareBalance, selectedNetwork } from "../lib/chain";
import { getAllPoolInfo, PoolInfo, fmtCompactUsd, fmtNum } from "../lib/raydium";
import { DEVNET } from "../lib/devnet";
import {
  buildDepositTx,
  buildWithdrawTx,
  ProgramNotWiredError,
} from "../lib/vaultClient";

type Tab = "deposit" | "withdraw";

export function VaultPanel({ vault }: { vault: VaultConfig }) {
  const { connection } = useConnection();
  const { publicKey, sendTransaction } = useWallet();
  const [pool, setPool] = useState<PoolInfo | null>(null);
  const [loadingPool, setLoadingPool] = useState(true);
  const [tab, setTab] = useState<Tab>("deposit");
  const [amount, setAmount] = useState("");
  const [usdc, setUsdc] = useState<number | null>(null);
  const [shares, setShares] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // pool stats
  useEffect(() => {
    let live = true;
    setPool(null);
    setLoadingPool(true);
    if (vault.comingSoon) {
      setLoadingPool(false);
      return;
    }
    if (selectedNetwork() === "devnet") {
      // Devnet: no external pool — show the vault's own USDC reserve as depth.
      const d = DEVNET.vaults[vault.id];
      if (!d) { setLoadingPool(false); return; }
      connection
        .getTokenAccountBalance(new PublicKey(d.usdcVault))
        .then((b) => {
          const usdc = b.value.uiAmount ?? 0;
          if (live) {
            setPool({ tvl: usdc, apr: 0, fees24h: 0, volume24h: 0, reserveAsset: 0, reserveUsdc: usdc, price: 0 });
            setLoadingPool(false);
          }
        })
        .catch(() => live && setLoadingPool(false));
      return () => { live = false; };
    }
    getAllPoolInfo().then((all) => {
      if (live) {
        setPool(all[vault.id] ?? null);
        setLoadingPool(false);
      }
    });
    return () => {
      live = false;
    };
  }, [vault.id]);

  const isDev = selectedNetwork() === "devnet";
  const devVault = DEVNET.vaults[vault.id];
  const activeShareMint = isDev ? devVault?.shareMint : vault.shareMint;

  async function refreshBalances() {
    if (!publicKey) {
      setUsdc(null);
      setShares(null);
      return;
    }
    usdcBalance(connection, publicKey).then(setUsdc);
    if (activeShareMint)
      shareBalance(connection, publicKey, activeShareMint).then(setShares);
  }

  // wallet balances
  useEffect(() => {
    refreshBalances();
  }, [publicKey, connection, vault.id]);

  const estValue =
    shares != null && pool != null ? shares * 0 : null; // shares priced via program later
  const walletShort = publicKey ? short(publicKey.toBase58(), 4) : null;

  async function submit() {
    setStatus(null);
    if (!publicKey) return setStatus("Connect a wallet first.");
    const value = Number(amount);
    if (!value || value <= 0) return setStatus("Enter an amount.");
    setBusy(true);
    try {
      const tx =
        tab === "deposit"
          ? await buildDepositTx({
              connection,
              vault,
              user: publicKey as PublicKey,
              usdcAmount: BigInt(Math.round(value * 1e6)),
            })
          : await buildWithdrawTx({
              connection,
              vault,
              user: publicKey as PublicKey,
              shareAmount: BigInt(Math.round(value * 1e6)),
            });
      const sig = await sendTransaction(tx, connection);
      await connection.confirmTransaction(sig, "confirmed");
      setStatus(`✅ ${tab === "deposit" ? "Deposited" : "Withdrew"} · ${sig.slice(0, 8)}…`);
      setAmount("");
      await refreshBalances();
    } catch (e) {
      const msg = (e as Error).message || String(e);
      if (msg.includes("only live on Devnet"))
        setStatus("These vaults only accept deposits/withdrawals on Devnet — open with ?env=dev.");
      else setStatus(`Error: ${msg}`);
    } finally {
      setBusy(false);
    }
  }

  async function faucet() {
    if (!publicKey) return setStatus("Connect a wallet first.");
    setBusy(true);
    setStatus("Requesting test USDC…");
    try {
      const r = await fetch(`http://127.0.0.1:8899/faucet?to=${publicKey.toBase58()}`);
      const j = await r.json();
      if (j.ok) {
        setStatus("✅ Received 1000 test USDC");
        await refreshBalances();
      } else setStatus(`Faucet error: ${j.error}`);
    } catch {
      setStatus("Faucet not running. Start the local faucet server first (see README).");
    } finally {
      setBusy(false);
    }
  }

  const quote = vault.quote ?? "USDC";

  return (
    <div className="panel-grid">
      {/* LEFT — vault / pool card */}
      <section className="card vault-card">
        <div className="card-head">
          <span className="card-label">{vault.short} VAULT</span>
          <button className="icon-btn" aria-label="Refresh" onClick={() => {
            setLoadingPool(true);
            fetchPoolStats(connection, vault).then((s) => { setPool(s); setLoadingPool(false); });
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
          </button>
        </div>

        <div className="vault-identity">
          <img className="asset-img" src={vault.icon} alt="" width={48} height={48} />
          <div>
            <h2>{vault.name}</h2>
            <p className="pair">{vault.symbol} <span>/ {quote}</span></p>
          </div>
        </div>

        {vault.comingSoon ? (
          <div className="soon-note">This vault is coming soon.</div>
        ) : (
          <>
            <div className="pool-apr-row">
              <div className="pool-depth">
                <span className="muted">Underlying liquidity pool</span>
                <strong className="depth">
                  {loadingPool ? "…" : fmtCompactUsd(pool?.tvl)}
                </strong>
                <span className="muted small">
                  Total depth of the pool this vault provides liquidity to.
                </span>
              </div>
              <div className="pool-apr">
                <span className="muted small">Pool fee APR</span>
                <strong>{loadingPool ? "…" : (pool?.apr ?? 0).toFixed(2)}<small>%</small></strong>
                <span className="muted small">24h fees {loadingPool ? "…" : fmtCompactUsd(pool?.fees24h)}</span>
              </div>
            </div>

            <div className="reserves">
              <div>
                <img src={vault.icon} width={26} height={26} alt="" />
                <div>
                  <span className="muted small">{vault.symbol}</span>
                  <strong>{loadingPool ? "…" : fmtNum(pool?.reserveAsset)}</strong>
                </div>
              </div>
              <div>
                <img src="/tokens/usdc.svg" width={26} height={26} alt="" />
                <div>
                  <span className="muted small">USDC</span>
                  <strong>{loadingPool ? "…" : fmtNum(pool?.reserveUsdc, 4)}</strong>
                </div>
              </div>
            </div>

            <div className="card-foot">
              <span className="muted small">Good to know</span>
              <span className="mgmt">
                Management <b>Allocating</b>
              </span>
            </div>
          </>
        )}
      </section>

      {/* RIGHT — position / action card */}
      <section className="card position-card">
        <div className="card-head">
          <span className="card-label">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="14" x="3" y="6" rx="2"/><path d="M3 10h18"/></svg>
            YOUR POSITION
          </span>
          <span className="wallet-addr">{walletShort ?? "Not connected"}</span>
        </div>

        <div className="position-value">
          <div>
            <span className="muted small">Estimated value</span>
            <strong className="est">
              {publicKey ? (estValue == null ? "$0" : fmtCompactUsd(estValue)) : "—"}
            </strong>
          </div>
          <div className="right">
            <span className="muted small">Your vault shares</span>
            <strong className="shares">
              {publicKey ? (shares == null ? "…" : shares.toFixed(4)) : "—"}
            </strong>
          </div>
        </div>

        <div className="tabs">
          <button className={tab === "deposit" ? "active" : ""} onClick={() => setTab("deposit")}>Deposit</button>
          <button className={tab === "withdraw" ? "active" : ""} onClick={() => setTab("withdraw")}>Withdraw</button>
        </div>

        <div className="action-head">
          <strong>{tab === "deposit" ? "Deposit USDC" : "Withdraw"}</strong>
          <p className="muted small">
            {tab === "deposit"
              ? "Only USDC is accepted. The vault manages liquidity automatically."
              : "Redeem your shares for the underlying asset and USDC."}
          </p>
        </div>

        <div className="field">
          <div className="field-label">
            <span className="muted small">{tab === "deposit" ? "Amount to deposit" : "Shares to redeem"}</span>
            <span className="muted small">
              Available: {tab === "deposit" ? (usdc == null ? "—" : usdc.toFixed(6)) : (shares == null ? "—" : shares.toFixed(6))}
            </span>
          </div>
          <div className="input-row">
            <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            <span className="suffix">
              <img src={tab === "deposit" ? "/tokens/usdc.svg" : vault.icon} width={20} height={20} alt="" />
              {tab === "deposit" ? "USDC" : vault.symbol}
            </span>
          </div>
        </div>

        <button className="btn-primary block" onClick={submit} disabled={busy || vault.comingSoon}>
          {busy ? "Confirm in wallet…" : tab === "deposit" ? "→ Deposit USDC" : "→ Withdraw"}
        </button>

        {isDev && (
          <button className="faucet-btn" onClick={faucet} disabled={busy || !publicKey}>
            {publicKey ? "🚰 Get 1000 test USDC" : "Connect a wallet to get test USDC"}
          </button>
        )}

        {status && <div className="status">{status}</div>}
      </section>
    </div>
  );
}
