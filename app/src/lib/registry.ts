// EARN vault registry — recovered from the mainnet program's on-chain accounts.
//
// Program:            GKE6epPxdtYEKZC1L4CdcWQdoJz7xJjJzbeVHVQBsRXj  (native, magic "EARNVV02")
// Upgrade authority:  BzqUAMezMkdQTcpWvN3dYxrAwgpn5RaRPh93K4yDPfd2
// Meteora DAMM v2:    CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK
//
// The mainnet deployment is READ-ONLY reference. New iteration targets Devnet:
// the `devnet` map is filled in once our rebuilt program + test pools are deployed.

export type VaultKind = "stock" | "etf" | "token";

export interface VaultConfig {
  id: string; // url slug used by the app (?vault=<id>)
  symbol: string; // e.g. NVDAx
  name: string; // e.g. NVIDIA
  short: string; // pill label, e.g. NVDA
  icon: string; // /tokens/<file>
  kind: VaultKind;
  quote?: string; // quote asset label (default USDC)
  comingSoon?: boolean;
  // on-chain addresses (mainnet reference deployment)
  vaultState?: string;
  assetMint?: string; // xStock (Token-2022) or community token
  assetIsToken2022?: boolean;
  usdcMint: string;
  shareMint?: string; // vault share mint handed to the depositor
  meteoraPool?: string; // Meteora DAMM v2 pool account (1544B)
  meteoraPositionOwner?: string; // the vault's LP position/authority account
}

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const PROGRAM_ID = "GKE6epPxdtYEKZC1L4CdcWQdoJz7xJjJzbeVHVQBsRXj";
export const METEORA_DAMM_V2 = "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK";

// Ordered to match the marketing site (NVDA, TSLA, AAPL, SPY, QQQ, STONK).
export const VAULTS: VaultConfig[] = [
  {
    id: "nvda", symbol: "NVDAx", name: "NVIDIA", short: "NVDA",
    icon: "/tokens/nvda.png", kind: "stock",
    vaultState: "GLL7ai2Z3x4ESo72tebi3rajsAjnLaNJoui6Q3paa1La",
    assetMint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
    assetIsToken2022: true,
    usdcMint: USDC_MINT,
    shareMint: "4SPbzffyeXAtsSBhdB6oyAs8nVgdv5SbH6Exgzn45Gmm",
    meteoraPool: "49iMatQtoyabsYAQc8GafVq6aeBFVDxSRH44oiatyyw6", // DAMM v2 pool (1544B)
    meteoraPositionOwner: "6qAmaQgdv99N3VfDRCEUNASwgMiRv7mXANfjsJzgM7Gh",
  },
  {
    id: "tsla", symbol: "TSLAx", name: "Tesla", short: "TSLA",
    icon: "/tokens/tsla.png", kind: "stock",
    vaultState: "2B3mR8txsJV1N9d24s4NRcUWqw6tFkCF1VXA9GYgTWzp",
    assetMint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB",
    assetIsToken2022: true,
    usdcMint: USDC_MINT,
    shareMint: "9he6gQCeJZRstuZKBGFkDYfaJPgvXcZNrv72Svh9BMtD",
    meteoraPool: "8aDaBQkTrS6HVMjyc6EZebgdiaXhLYGriDWKWWp1NpFF", // DAMM v2 pool (1544B)
    meteoraPositionOwner: "FqMZBfvntYwRdwkTNMMDRyGYJ6Wmv5vHiZhYAkQYpY8j",
  },
  {
    id: "aapl", symbol: "AAPLx", name: "Apple", short: "AAPL",
    icon: "/tokens/aapl.png", kind: "stock",
    vaultState: "HRH9XCDNDVekck8TUiEEjjTuDQsJwwj9nXvzknEpr7c1",
    assetMint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    assetIsToken2022: true,
    usdcMint: USDC_MINT,
    shareMint: "CSPg2n1H2hMChktyugXYb9h3ZHxAB1DunysBNis3RJfM",
    meteoraPool: "CKwJZwm7oj3nu4653N1EpDrqXbXAYXoPFiPeEnLouF8y", // DAMM v2 pool (1544B)
    meteoraPositionOwner: "2oQv6A4wTGR2C1CaEVp2YXMGEM4UTPXLNzVeA6iezQRq",
  },
  {
    id: "spy", symbol: "SPYx", name: "S&P 500", short: "SPY",
    icon: "/tokens/spy.png", kind: "etf",
    vaultState: "GGZYdMV4Bg22kUbP7nXEy1sJr5xFisWKwg7KoSuQ4XkU",
    assetMint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W",
    assetIsToken2022: true,
    usdcMint: USDC_MINT,
    shareMint: "8HPXAV7qe6oKM6ywS78YB7eDaqKHmVdfgJfhaZT6mWbn",
    meteoraPool: "6truu3rZuiB9rKQg4VYC3Dt3QwV7DgwGqXrYUcrvnDDE", // DAMM v2 pool (1544B)
    meteoraPositionOwner: "2Wx3HgNPj4AxC1aL7UEZnYbmEmafupVU94ScTBUKC9cF",
  },
  {
    id: "qqq", symbol: "QQQx", name: "Nasdaq 100", short: "QQQ",
    icon: "/tokens/qqq.png", kind: "etf",
    vaultState: "5mYtacuEfKXvBi7k22dMzPG3TCZZQdc3JtTjWSqaxSxP",
    assetMint: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ",
    assetIsToken2022: true,
    usdcMint: USDC_MINT,
    shareMint: "DtRzw8tHQx288ACC5HEswATRVaHtTsF98CJoZRCgkriW",
    meteoraPool: "GMjGLWzvK75LPetrgAmdeXnvxc4fUuQPwJxeQqTDU1aG", // DAMM v2 pool (1544B)
    meteoraPositionOwner: "kXdWuzbm8wuqAyEADZdT6k7QRinSFnrHJSuX2TqBBg9",
  },
  {
    id: "stonk", symbol: "STONK", name: "STONK", short: "STONK",
    icon: "/tokens/stonk.png", kind: "token",
    vaultState: "7FM1tkNzVWkFC9j9LcKJvvdtKfXuYHGBGgUiPQyc8gJK",
    assetMint: "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx",
    usdcMint: USDC_MINT,
    shareMint: "6M3pMtugJANALd7KbJE6BXwQjpCK7vucNDgNTAJazzNW",
    meteoraPool: "G4G5SzkbLFMhoSgHiQNeyJFt75sSDsL1rD8LVyT5xZbU", // DAMM v2 pool (1544B)
    meteoraPositionOwner: "CLbB7ANFtJwmUGi8bREudSxSazJ8rgW53sHDZ5XewcEL",
  },
  // Coming soon — shown on the site, not yet published on-chain.
  {
    id: "zcat", symbol: "ZCAT", name: "Anonymous Cat", short: "ZCAT",
    icon: "/tokens/zcat.jpg", kind: "token", comingSoon: true, usdcMint: USDC_MINT,
  },
  {
    id: "alice-vidax", symbol: "ALICE", name: "Alice", short: "ALICE",
    icon: "/tokens/alice.png", kind: "token", quote: "VIDAx", comingSoon: true, usdcMint: USDC_MINT,
  },
];

export function getVault(id: string | null): VaultConfig | undefined {
  if (!id) return undefined;
  return VAULTS.find((v) => v.id === id);
}
