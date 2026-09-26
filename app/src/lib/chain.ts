import { Connection, PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { USDC_MINT } from "./registry";

// Network selection: ?env=dev -> devnet, otherwise mainnet reference reads.
export function selectedNetwork(): "mainnet-beta" | "devnet" {
  const env = new URLSearchParams(location.search).get("env");
  return env === "dev" ? "devnet" : "mainnet-beta";
}

// Resolve the RPC endpoint. Order of precedence:
//   1. ?rpc=<url>            (quick override for testing)
//   2. localStorage EARN_RPC_<NET>
//   3. Vite env VITE_RPC_MAINNET / VITE_RPC_DEVNET  (drop a Helius/QuickNode key here)
//   4. public endpoint (rate-limited; live pool stats may not load)
export function rpcEndpoint(): string {
  const net = selectedNetwork();
  const qs = new URLSearchParams(location.search).get("rpc");
  if (qs) return qs;
  try {
    const ls = localStorage.getItem(
      net === "devnet" ? "EARN_RPC_DEVNET" : "EARN_RPC_MAINNET"
    );
    if (ls) return ls;
  } catch {
    /* ignore */
  }
  const env = import.meta.env as Record<string, string | undefined>;
  const fromEnv =
    net === "devnet" ? env.VITE_RPC_DEVNET : env.VITE_RPC_MAINNET;
  if (fromEnv) return fromEnv;
  return net === "devnet"
    ? "https://api.devnet.solana.com"
    : "https://api.mainnet-beta.solana.com";
}

export function makeConnection(): Connection {
  return new Connection(rpcEndpoint(), "confirmed");
}

// Read an SPL/Token-2022 token balance for owner+mint. Returns UI amount (float).
export async function tokenUiBalance(
  conn: Connection,
  owner: PublicKey,
  mint: PublicKey,
  programId: PublicKey = TOKEN_PROGRAM_ID
): Promise<number> {
  try {
    const ata = getAssociatedTokenAddressSync(mint, owner, true, programId);
    const bal = await conn.getTokenAccountBalance(ata);
    return bal.value.uiAmount ?? 0;
  } catch {
    return 0;
  }
}

export async function usdcBalance(conn: Connection, owner: PublicKey) {
  return tokenUiBalance(conn, owner, new PublicKey(USDC_MINT), TOKEN_PROGRAM_ID);
}

export async function shareBalance(
  conn: Connection,
  owner: PublicKey,
  shareMint: string
) {
  // share mints observed as plain SPL on the reference deployment
  return tokenUiBalance(conn, owner, new PublicKey(shareMint), TOKEN_PROGRAM_ID);
}

export const short = (s: string, n = 4) =>
  s.length <= n * 2 + 1 ? s : `${s.slice(0, n)}…${s.slice(-n)}`;

export { TOKEN_2022_PROGRAM_ID };
