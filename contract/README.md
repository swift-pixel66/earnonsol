# Contract

An independent native Solana program that initializes a counter and lets its recorded authority increment it. The program stores a version, an authority public key, and a `u64` count in 41 bytes.

## Development

```sh
cd contract
cargo check --locked
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
```

The counter account must already be allocated to this program and zero-filled. Initialization requires both the counter and authority to sign. Later increments require the recorded authority's signature. Reinitialization, invalid account ownership, malformed state and integer overflow are rejected.

This example does not implement a vault, accept deposits, or manage liquidity. No on-chain program has been deployed from this directory.

The tests call the instruction processor on the host and cover authorized updates, rejected signatures, reinitialization, account validation and overflow. They are not validator integration or deployment tests.
