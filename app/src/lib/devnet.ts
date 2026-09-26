import raw from "./devnet-registry.json";

export interface DevnetVault {
  vault: string;
  assetMint: string;
  shareMint: string;
  usdcVault: string;
}
export interface DevnetRegistry {
  network: string;
  programId: string;
  usdcMint: string;
  mintAuthority: string;
  vaults: Record<string, DevnetVault>;
}

// Deployed EARN vault program + 6 vaults on devnet. Deposit/withdraw operate
// against these; the shared test USDC mint is faucet-funded for testing.
export const DEVNET = raw as DevnetRegistry;
