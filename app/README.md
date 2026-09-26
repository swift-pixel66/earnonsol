# EARN App (reproduction)

React + Vite + TypeScript app reproducing the EARN vault UI, wired to a vault
registry recovered from the mainnet program's on-chain accounts.

## Run

```bash
pnpm install
pnpm dev            # http://127.0.0.1:5173
```

Query params:
- `?vault=nvda|tsla|aapl|spy|qqq|stonk` — select a vault
- `?env=dev` — use Devnet
- `?rpc=<url>` — override the RPC endpoint

## Live data / RPC

Pool reserves and depth are read on-chain at runtime. The public Solana RPC is
rate-limited and will often show `—`. Provide a real endpoint via `.env`
(`VITE_RPC_MAINNET=`) — see `.env.example` — or `?rpc=...`, or
`localStorage.EARN_RPC_MAINNET`.

## What is real vs. pending

| Part | Status |
| --- | --- |
| UI, vault selector, wallet connect, styling | ✅ complete |
| Vault registry (all 6 vaults' addresses) | ✅ recovered from chain (`lib/registry.ts`) |
| Pool reserves / depth (Meteora) | ✅ live via RPC (`lib/pool.ts`) |
| Deposit / withdraw transactions | ⚙️ typed stubs (`lib/vaultClient.ts`) — wired once the rebuilt Devnet program's ABI is set |

## Source of the registry

Program `GKE6epPxdtYEKZC1L4CdcWQdoJz7xJjJzbeVHVQBsRXj` (native, magic `EARNVV02`).
The 6 vault state accounts (768 bytes) and registry (128 bytes) were decoded
directly from mainnet; asset symbols confirmed via each xStock's Token-2022
metadata. Raw snapshot: `lib/onchain-registry.mainnet.json`.
