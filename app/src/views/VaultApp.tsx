import { useMemo, useState, useEffect } from "react";
import { VAULTS, getVault } from "../lib/registry";
import { Header } from "../components/Header";
import { VaultPanel } from "../components/VaultPanel";

function useVaultParam() {
  const initial =
    new URLSearchParams(location.search).get("vault") || VAULTS[0].id;
  const [id, setId] = useState<string>(initial);
  useEffect(() => {
    const on = () =>
      setId(new URLSearchParams(location.search).get("vault") || VAULTS[0].id);
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  const go = (next: string) => {
    const url = new URL(location.href);
    url.searchParams.set("vault", next);
    history.replaceState({}, "", url);
    setId(next);
  };
  return { id, go };
}

export function VaultApp() {
  const { id, go } = useVaultParam();
  const vault = useMemo(() => getVault(id) ?? VAULTS[0], [id]);

  return (
    <div className="app">
      <Header variant="app" />
      <main className="app-main">

        <section className="hero">
          <div className="kicker">ON-CHAIN AUTOMATIC LIQUIDITY VAULTS</div>
          <h1>
            Earn on tokenized stocks<span className="dot-accent">.</span>
          </h1>
          <p>Deposit once. Automatic liquidity management, on-chain.</p>
        </section>

        <div className="vault-pills">
          {VAULTS.map((v) => (
            <button
              key={v.id}
              className={`pill ${v.id === vault.id ? "active" : ""} ${
                v.comingSoon ? "soon" : ""
              }`}
              onClick={() => !v.comingSoon && go(v.id)}
              title={v.comingSoon ? "Coming soon" : v.name}
            >
              <img src={v.icon} alt="" width={22} height={22} />
              <span>{v.short}</span>
              {v.comingSoon && <em>soon</em>}
            </button>
          ))}
        </div>

        <VaultPanel vault={vault} />

        <footer className="transparency">
          <span className="tp-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>
            On-chain transparency
          </span>
          <nav>
            <a href={`https://solscan.io/account/${vault.vaultState ?? ""}`} target="_blank" rel="noreferrer">Smart contract ↗</a>
            <a href={`https://solscan.io/account/${vault.vaultState ?? ""}`} target="_blank" rel="noreferrer">Vault ↗</a>
            <a href={`https://solscan.io/account/${vault.meteoraPool ?? ""}`} target="_blank" rel="noreferrer">Liquidity pool ↗</a>
            <a href="/#how-it-works">How it works ↗</a>
          </nav>
        </footer>
      </main>
    </div>
  );
}
