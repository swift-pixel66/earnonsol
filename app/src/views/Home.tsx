import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { VAULTS, VaultConfig } from "../lib/registry";
import { fetchPoolStats, PoolStats, fmtUsd } from "../lib/pool";
import { Header } from "../components/Header";
import { SecurityStrip } from "../components/SecurityStrip";
import { navigate } from "../router";

const KIND_LABEL: Record<string, string> = { stock: "Stock", etf: "ETF", token: "Token" };

export function Home() {
  const { connection } = useConnection();
  const [stats, setStats] = useState<Record<string, PoolStats | null>>({});

  useEffect(() => {
    let live = true;
    VAULTS.filter((v) => !v.comingSoon).forEach((v) => {
      fetchPoolStats(connection, v).then((s) => {
        if (live) setStats((prev) => ({ ...prev, [v.id]: s }));
      });
    });
    return () => {
      live = false;
    };
  }, [connection]);

  const liveVaults = VAULTS.filter((v) => !v.comingSoon).length;
  const comingSoon = VAULTS.filter((v) => v.comingSoon).length;
  const totalDepth = Object.values(stats).reduce(
    (sum, s) => sum + (s?.depthUsd ?? 0),
    0
  );
  const loaded = Object.keys(stats).length >= liveVaults;

  return (
    <div className="app">
      <Header variant="home" />
      <main className="app-main">
        <SecurityStrip />

        <section className="home-hero">
          <div>
            <div className="kicker">ON-CHAIN AUTOMATIC LIQUIDITY VAULTS</div>
            <h1 className="home-title">
              Deposit once.
              <br />
              Earn on <span className="accent">tokenized stocks.</span>
            </h1>
          </div>
          <div className="home-hero-side">
            <span className="net-badge main"><span className="dot" />Testnet live</span>
            <p>
              <strong>Deposit USDC.</strong>
              <br />
              Your choice of tokenized stocks.
              <br />
              Liquidity managed automatically.
            </p>
            <p className="muted small">
              Onchain and transparent. Your shares, your control.
            </p>
          </div>
        </section>

        <section className="home-metrics">
          <div>
            <span className="muted small">Live vaults</span>
            <strong>
              {liveVaults}
              <small><span className="dot green" /> {comingSoon} coming soon</small>
            </strong>
          </div>
          <div>
            <span className="muted small">Tracked pool liquidity <em>Testnet</em></span>
            <strong>{loaded ? fmtUsd(totalDepth, { compact: true }) : "…"}</strong>
          </div>
          <a className="home-deposit" href="/app" onClick={(e) => { e.preventDefault(); navigate("/app"); }}>
            <span className="muted small">Deposit with</span>
            <strong><img src="/tokens/usdc.svg" width={22} height={22} alt="" /> USDC</strong>
            <span className="muted small">Deposit on Solana ↗</span>
          </a>
        </section>

        <section className="home-vaults">
          <h2>Choose your vault.</h2>
          <div className="home-vault-grid">
            {VAULTS.map((v) => (
              <HomeVaultCard key={v.id} vault={v} stats={stats[v.id]} />
            ))}
          </div>
        </section>

        <section className="how">
          <div className="kicker">YOUR STOCK CHOICE. AUTOMATICALLY MANAGED.</div>
          <h2>Tokenized stocks. One simple deposit.</h2>
          <ol className="how-steps">
            <li>
              <span className="how-num">01</span>
              <h3>Choose your vault</h3>
              <p>Explore NVDA, TSLA, AAPL, SPY and QQQ, plus the STONK community-token vault. Pick the asset you want to provide liquidity for.</p>
            </li>
            <li>
              <span className="how-num">02</span>
              <h3>Deposit USDC</h3>
              <p>The app prepares your chosen stock-token position in one transaction. Your shares go straight to your wallet.</p>
            </li>
            <li>
              <span className="how-num">03</span>
              <h3>Liquidity on autopilot</h3>
              <p>The strategy manages your stock-token liquidity using preset onchain rules. You hold the shares while positions adjust automatically.</p>
            </li>
          </ol>
        </section>

        <footer className="home-footer">
          <div className="brand">
            <img className="brand-mark" src="/brand-mark.svg" width={30} height={30} alt="" />
            <span>EARN<span className="brand-network">on Solana</span></span>
          </div>
          <p className="muted small">
            Independent project for tokenized stock and community-token markets. Not affiliated with Solana, xStocks or the referenced companies. Pool liquidity is read live from Meteora, not a forecast of vault returns.
          </p>
        </footer>
      </main>
    </div>
  );
}

function HomeVaultCard({ vault, stats }: { vault: VaultConfig; stats: PoolStats | null | undefined }) {
  const go = () => !vault.comingSoon && navigate(`/app?vault=${vault.id}`);
  return (
    <article className={`home-vault-card ${vault.comingSoon ? "soon" : ""}`} onClick={go}>
      <div className="hv-top">
        <img className="asset-img" src={vault.icon} width={40} height={40} alt="" />
        <span className="asset-kind">{KIND_LABEL[vault.kind]}</span>
      </div>
      <h3>{vault.name}</h3>
      <p className="pair">{vault.symbol} <span>/ {vault.quote ?? "USDC"}</span></p>
      <div className="hv-liq">
        <span className="muted small">Pool liquidity</span>
        <strong>{vault.comingSoon ? "—" : stats === undefined ? "…" : fmtUsd(stats?.depthUsd ?? null, { compact: true })}</strong>
      </div>
      <span className="hv-cta">
        {vault.comingSoon ? "Coming soon" : "Deposit USDC"} ↗
      </span>
    </article>
  );
}
