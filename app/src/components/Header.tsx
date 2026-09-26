import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { selectedNetwork } from "../lib/chain";
import { navigate } from "../router";

export function Header({ variant }: { variant: "home" | "app" }) {
  const net = selectedNetwork();
  return (
    <header className="app-header">
      <a
        className="brand"
        href="/"
        onClick={(e) => {
          e.preventDefault();
          navigate("/");
        }}
      >
        <img className="brand-mark" src="/brand-mark.svg" width={32} height={32} alt="" />
        <span>
          EARN<span className="brand-network">on Solana</span>
        </span>
      </a>

      <div className="header-actions">
        <span className={`net-badge ${net === "devnet" ? "dev" : "main"}`}>
          <span className="dot" />
          {net === "devnet" ? "Devnet" : "Testnet live"}
        </span>
        {variant === "home" ? (
          <a
            className="btn-primary launch"
            href="/app"
            onClick={(e) => {
              e.preventDefault();
              navigate("/app");
            }}
          >
            Launch App ↗
          </a>
        ) : (
          <WalletMultiButton />
        )}
      </div>
    </header>
  );
}
