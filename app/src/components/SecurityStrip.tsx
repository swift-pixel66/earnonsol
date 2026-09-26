const TOOLS = [
  { name: "solana-lints", org: "Trail of Bits", icon: "/audit/trail-of-bits.png" },
  { name: "OSV-Scanner", org: "Google", icon: "/audit/osv-scanner.svg" },
  { name: "cargo-audit", org: "RustSec", icon: "/audit/rustsec.svg" },
  { name: "Semgrep", org: "Semgrep", icon: "/audit/semgrep.svg" },
  { name: "Clippy", org: "Rust project", icon: "/audit/rust.svg" },
  { name: "npm audit", org: "npm", icon: "/audit/npm.svg" },
];

export function SecurityStrip() {
  return (
    <div className="security-strip">
      <span className="sec-pass">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        Security audit passed
      </span>
      <ul>
        {TOOLS.map((t) => (
          <li key={t.name}>
            <img src={t.icon} width={28} height={28} alt="" />
            <span>
              <strong>{t.name}</strong>
              <small>{t.org}</small>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
