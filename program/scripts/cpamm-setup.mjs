// Prove Meteora cp-amm works on devnet: create a pool (asset/USDC), then
// add + remove liquidity via the SDK. Uses the deployer as payer/creator.
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  createMint, getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  CpAmm, MIN_SQRT_PRICE, MAX_SQRT_PRICE, derivePositionNftAccount, getTokenProgram,
  getBaseFeeParams, BaseFeeMode,
} from "@meteora-ag/cp-amm-sdk";
import BN from "bn.js";
import fs from "fs";

const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const payer = Keypair.fromSecretKey(new Uint8Array(JSON.parse(
  fs.readFileSync("/Users/maqiyuan/earnonsol/.keys/devnet-deployer.json"))));
const reg = JSON.parse(fs.readFileSync("devnet-registry.json"));
const cpAmm = new CpAmm(conn);
const send = (tx, signers) => sendAndConfirmTransaction(conn, tx, signers, { commitment: "confirmed" });

async function main() {
  console.log("payer", payer.publicKey.toBase58(), (await conn.getBalance(payer.publicKey)) / 1e9, "SOL");
  const usdcMint = new PublicKey(reg.usdcMint);
  // fresh asset mint for the cp-amm pool
  const assetMint = await createMint(conn, payer, payer.publicKey, null, 6);
  console.log("asset:", assetMint.toBase58(), "usdc:", usdcMint.toBase58());

  // cp-amm requires tokenA < tokenB (byte order)
  const [tokenAMint, tokenBMint] =
    Buffer.compare(assetMint.toBuffer(), usdcMint.toBuffer()) < 0
      ? [assetMint, usdcMint] : [usdcMint, assetMint];
  console.log("tokenA:", tokenAMint.toBase58(), "tokenB:", tokenBMint.toBase58());

  // fund creator (payer) with both tokens
  const ataA = await getOrCreateAssociatedTokenAccount(conn, payer, tokenAMint, payer.publicKey);
  const ataB = await getOrCreateAssociatedTokenAccount(conn, payer, tokenBMint, payer.publicKey);
  await mintTo(conn, payer, tokenAMint, ataA.address, payer, 1_000_000_000n); // 1000
  await mintTo(conn, payer, tokenBMint, ataB.address, payer, 1_000_000_000n); // 1000
  console.log("minted 1000 of each to creator");

  // initial pool amounts (1:1)
  const amtA = new BN(100_000_000); // 100
  const amtB = new BN(100_000_000); // 100
  const { liquidityDelta, initSqrtPrice } = cpAmm.preparePoolCreationParams({
    tokenAAmount: amtA, tokenBAmount: amtB, minSqrtPrice: MIN_SQRT_PRICE, maxSqrtPrice: MAX_SQRT_PRICE,
  });
  console.log("initSqrtPrice", initSqrtPrice.toString(), "liqDelta", liquidityDelta.toString());

  const positionNft = Keypair.generate();
  const baseFee = getBaseFeeParams({
    baseFeeMode: BaseFeeMode.FeeTimeSchedulerLinear,
    feeTimeSchedulerParam: { startingFeeBps: 25, endingFeeBps: 25, numberOfPeriod: 0, totalDuration: 0 },
  });
  const poolFees = {
    baseFee, compoundingFeeBps: 0,
    protocolFeePercent: 20, partnerFeePercent: 0, referralFeePercent: 20, dynamicFee: null,
  };
  const res = await cpAmm.createCustomPool({
    payer: payer.publicKey, creator: payer.publicKey, positionNft: positionNft.publicKey,
    tokenAMint, tokenBMint, tokenAAmount: amtA, tokenBAmount: amtB,
    sqrtMinPrice: MIN_SQRT_PRICE, sqrtMaxPrice: MAX_SQRT_PRICE, liquidityDelta, initSqrtPrice,
    poolFees, hasAlphaVault: false, activationType: 1, collectFeeMode: 0, activationPoint: null,
    tokenAProgram: TOKEN_PROGRAM_ID, tokenBProgram: TOKEN_PROGRAM_ID,
  });
  await send(res.tx, [payer, positionNft]);
  const pool = res.pool;
  console.log("✓ pool created:", pool.toBase58(), "position:", res.position.toBase58());

  // add liquidity to the creator position
  const st = await cpAmm.fetchPoolState(pool);
  const addIn = new BN(50_000_000); // 50 tokenA
  const q = cpAmm.getDepositQuote({
    inAmount: addIn, isTokenA: true, sqrtPrice: st.sqrtPrice, minSqrtPrice: st.sqrtMinPrice, maxSqrtPrice: st.sqrtMaxPrice,
  });
  const add = await cpAmm.addLiquidity({
    owner: payer.publicKey, position: res.position, pool,
    positionNftAccount: derivePositionNftAccount(positionNft.publicKey),
    liquidityDelta: q.liquidityDelta, maxAmountTokenA: new BN(200_000_000), maxAmountTokenB: new BN(200_000_000),
    tokenAAmountThreshold: new BN(200_000_000), tokenBAmountThreshold: new BN(200_000_000),
    tokenAMint: st.tokenAMint, tokenBMint: st.tokenBMint, tokenAVault: st.tokenAVault, tokenBVault: st.tokenBVault,
    tokenAProgram: getTokenProgram(st.tokenAFlag), tokenBProgram: getTokenProgram(st.tokenBFlag),
  });
  await send(add.transaction ?? add, [payer]);
  console.log("✓ addLiquidity ok, liqDelta", q.liquidityDelta.toString());

  // remove half
  const rm = await cpAmm.removeLiquidity({
    owner: payer.publicKey, position: res.position, pool,
    positionNftAccount: derivePositionNftAccount(positionNft.publicKey),
    liquidityDelta: q.liquidityDelta.div(new BN(2)),
    tokenAAmountThreshold: new BN(0), tokenBAmountThreshold: new BN(0), // remove: min out, 0 = accept any
    tokenAMint: st.tokenAMint, tokenBMint: st.tokenBMint, tokenAVault: st.tokenAVault, tokenBVault: st.tokenBVault,
    tokenAProgram: getTokenProgram(st.tokenAFlag), tokenBProgram: getTokenProgram(st.tokenBFlag),
    vestings: [], currentPoint: new BN(0),
  });
  await send(rm.transaction ?? rm, [payer]);
  console.log("✓ removeLiquidity ok");

  const st2 = await cpAmm.fetchPoolState(pool);
  console.log("pool liquidity now:", st2.liquidity.toString());
  console.log("\nRESULT: Meteora cp-amm create+add+remove OK ✅");
  console.log(JSON.stringify({ pool: pool.toBase58(), assetMint: assetMint.toBase58(), tokenAMint: tokenAMint.toBase58(), tokenBMint: tokenBMint.toBase58(), tokenAVault: st.tokenAVault.toBase58(), tokenBVault: st.tokenBVault.toBase58() }, null, 2));
}
main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
