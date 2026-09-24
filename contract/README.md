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

## Instruction interface

Each instruction is exactly one byte; additional bytes are rejected.

| Byte | Operation | Behavior |
| --- | --- | --- |
| `0` | Initialize | Record the signing authority and start the count at zero. |
| `1` | Increment | Add one to the count after checking the authority's signature. |

The first two accounts are:

| Position | Account | Requirements |
| --- | --- | --- |
| `0` | Counter | Owned by this program, writable, non-executable, exactly 41 bytes. Must sign initialization. |
| `1` | Authority | Must sign both operations. Must match the stored authority when incrementing. |

Create and fund the counter through the System Program with sufficient rent-exempt lamports before initialization. Creation and initialization should be included in the same transaction. This processor does not create accounts or move lamports.

## Account layout

| Byte range | Type | Value |
| --- | --- | --- |
| `0` | `u8` | Version `1` after initialization. |
| `1..33` | 32 bytes | Authority public key. |
| `33..41` | `u64`, little-endian | Counter value. |

The authority is fixed after initialization. Unknown state versions fail validation. Incrementing `u64::MAX` returns `ArithmeticOverflow` without changing state.

## Validation recorded

`cargo check --locked`, all 10 host tests, and `cargo clippy --locked --all-targets -- -D warnings` passed during initial development. The dependency graph is pinned in `Cargo.lock`. These checks do not establish SBF compatibility or an on-chain deployment.

See the [Solana native program structure documentation](https://solana.com/docs/programs/rust/program-structure) for the surrounding execution model.
