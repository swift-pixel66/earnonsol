# EARN vault program (devnet)

Anchor program: a USDC-denominated single-asset vault with real share accounting.
Deposit USDC → mint shares; redeem shares → proportional USDC. The Meteora
DAMM v2 (cp-amm) liquidity strategy plugs into the marked seam in `deposit`/
`withdraw` (next stage).

- Program ID: `767woN2qJdFwFmw415arDXGVnk6JaTymGmzy6BSzc8YT` (deployed on devnet)
- Instructions: `initialize_vault`, `deposit(amount)`, `withdraw(shares)`, `set_pause`

## Build & deploy

The macOS Xcode is broken in this environment; build/deploy with the Command
Line Tools toolchain:

```bash
export DEVELOPER_DIR=/Library/Developer/CommandLineTools
anchor build
solana program deploy target/deploy/earnvault.so \
  --program-id target/deploy/earnvault-keypair.json \
  --keypair ../.keys/devnet-deployer.json --url https://api.devnet.solana.com
```

`Cargo.lock` pins several crates to versions compatible with the Solana v1.48
platform-tools cargo (1.84): blake3, zeroize(_derive), toml stack, borsh,
proc-macro-crate, indexmap, unicode-segmentation.

## Scripts (scripts/)

- `setup-devnet.mjs` — create shared test USDC + 6 vaults; writes `devnet-registry.json`
- `e2e.mjs` — full deposit/withdraw smoke test
- `faucet-server.mjs` — local test-USDC faucet on :8899 (holds the mint authority)

Keys live in `../.keys/` (gitignored): `devnet-deployer.json` (payer + mint
authority), `earnvault-program-keypair.json` (program upgrade authority).
