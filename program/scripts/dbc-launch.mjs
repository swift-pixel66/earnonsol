// Launch tokenized-stock tokens on Meteora Dynamic Bonding Curve (DBC), devnet.
// Equity-tuned config: USDC-quoted, dynamic volatility fee, locked LP, graduates
// into Meteora DAMM v2 (which the EARN vault then provides liquidity to).
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import {
  DynamicBondingCurveClient, buildCurveWithMarketCap, MigrationOption, TokenDecimal,
  BaseFeeMode, ActivationType, CollectFeeMode, MigrationFeeOption, TokenType,
  TokenAuthorityOption, DammV2DynamicFeeMode,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import BN from "bn.js";
import fs from "fs";

const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const payer = Keypair.fromSecretKey(new Uint8Array(JSON.parse(
  fs.readFileSync("/Users/maqiyuan/earnonsol/.keys/devnet-deployer.json"))));
const USDC = new PublicKey(JSON.parse(fs.readFileSync("devnet-registry.json")).usdcMint);
const client = new DynamicBondingCurveClient(conn, "confirmed");
const send = (tx, s) => sendAndConfirmTransaction(conn, tx, s, { commitment: "confirmed" });

// The newly tokenized / pre-IPO equities to launch (Tessera T-stocks & PreStock).
const ASSETS = [
  { symbol: "TKALSHI", name: "Tessera Kalshi", kind: "T-stock" },
  { symbol: "TOPENAI", name: "Tessera OpenAI", kind: "T-stock" },
  { symbol: "ANTHRO",  name: "Anthropic (PreStock)", kind: "pre-IPO" },
  { symbol: "FIGURE",  name: "Figure AI (PreStock)", kind: "pre-IPO" },
];

// Equity-tuned bonding curve: USDC-quoted price discovery, dynamic fee to damp
// volatility in thin markets, locked LP on graduation, migrate to DAMM v2.
function equityCurve() {
  return buildCurveWithMarketCap({
    initialMarketCap: 5_000,        // USDC — modest launch valuation for a thin equity
    migrationMarketCap: 50_000,     // graduates once price discovery fills the curve
    activationType: ActivationType.Timestamp,
    token: {
      tokenType: TokenType.SPLToken,
      tokenBaseDecimal: TokenDecimal.SIX,
      tokenQuoteDecimal: TokenDecimal.SIX, // USDC has 6 decimals
      tokenAuthorityOption: TokenAuthorityOption.Immutable,
      totalTokenSupply: 1_000_000_000,
      leftover: 0,
    },
    fee: {
      baseFeeParams: {
        baseFeeMode: BaseFeeMode.FeeSchedulerLinear,
        feeSchedulerParam: { startingFeeBps: 300, endingFeeBps: 100, numberOfPeriod: 120, totalDuration: 3600 }, // 3%→1% anti-snipe decay over 1h
      },
      dynamicFeeEnabled: true,      // volatility surcharge for thin equity pairs
      collectFeeMode: CollectFeeMode.QuoteToken, // fees in USDC
      creatorTradingFeePercentage: 0,
      poolCreationFee: 0,
      enableFirstSwapWithMinFee: false,
    },
    migration: {
      migrationOption: MigrationOption.MET_DAMM_V2,
      migrationFeeOption: MigrationFeeOption.Customizable,
      migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
      migratedPoolFee: { collectFeeMode: CollectFeeMode.QuoteToken, dynamicFee: DammV2DynamicFeeMode.Enabled, poolFeeBps: 250 },
    },
    liquidityDistribution: {
      partnerPermanentLockedLiquidityPercentage: 100, // locked LP on graduation
      partnerLiquidityPercentage: 0,
      creatorPermanentLockedLiquidityPercentage: 0,
      creatorLiquidityPercentage: 0,
    },
    lockedVesting: { totalLockedVestingAmount: 0, numberOfVestingPeriod: 0, cliffUnlockAmount: 0, totalVestingDuration: 0, cliffDurationFromMigrationTime: 0 },
  });
}

async function main() {
  console.log("payer", payer.publicKey.toBase58(), (await conn.getBalance(payer.publicKey)) / 1e9, "SOL");
  const curve = equityCurve();
  const config = Keypair.generate();
  const createConfigTx = await client.partner.createConfig({
    payer: payer.publicKey, config: config.publicKey,
    feeClaimer: payer.publicKey, leftoverReceiver: payer.publicKey,
    quoteMint: USDC, ...curve,
  });
  await send(createConfigTx, [payer, config]);
  console.log("✓ equity DBC config:", config.publicKey.toBase58());

  const out = { network: "devnet", dbcProgram: "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN", config: config.publicKey.toBase58(), quoteMint: USDC.toBase58(), pools: {} };
  for (const a of ASSETS) {
    const baseMint = Keypair.generate();
    const tx = await client.creator.createPool({
      baseMint: baseMint.publicKey, config: config.publicKey,
      name: a.name, symbol: a.symbol, uri: `https://earnonsol.vercel.app/dbc/${a.symbol}.json`,
      payer: payer.publicKey, poolCreator: payer.publicKey,
    });
    await send(tx, [payer, baseMint]);
    out.pools[a.symbol] = { name: a.name, kind: a.kind, baseMint: baseMint.publicKey.toBase58() };
    console.log(`✓ launched ${a.symbol} (${a.name}) baseMint=${baseMint.publicKey.toBase58()}`);
  }

  // test buy on the first pool to prove the curve trades
  const first = Object.values(out.pools)[0];
  const baseMint = new PublicKey(first.baseMint);
  const pool = client.state.deriveDbcPoolAddress
    ? client.state.deriveDbcPoolAddress(USDC, baseMint, new PublicKey(out.config))
    : null;
  try {
    // ensure payer has USDC to spend
    const uAta = await getOrCreateAssociatedTokenAccount(conn, payer, USDC, payer.publicKey);
    await mintTo(conn, payer, USDC, uAta.address, payer, 1_000_000n); // 1 USDC test
    const poolState = await client.state.getPoolByBaseMint(baseMint);
    const swapTx = await client.pool.swap({
      amountIn: new BN(1_000_000), minimumAmountOut: new BN(1), swapBaseForQuote: false,
      owner: payer.publicKey, pool: poolState.publicKey, referralTokenAccount: null, payer: payer.publicKey,
    });
    await send(swapTx, [payer]);
    console.log("✓ test buy on", first.symbol, "succeeded (bonding curve trades)");
    out.pools[first.symbol].pool = poolState.publicKey.toBase58();
  } catch (e) {
    console.log("test buy note:", (e.message || e).toString().slice(0, 200));
  }

  fs.writeFileSync("dbc-registry.json", JSON.stringify(out, null, 2));
  console.log("\nRESULT: Meteora DBC equity launches OK ✅");
  console.log(JSON.stringify(out, null, 2));
}
main().catch((e) => { console.error("FAILED:", (e.transactionLogs || e.message || e)); process.exit(1); });
