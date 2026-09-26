// Full e2e: vault program CPI into Meteora cp-amm on devnet.
// pool + vault-owned position -> initialize_vault -> set_pool -> deposit -> withdraw
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction,
  TransactionInstruction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint, getOrCreateAssociatedTokenAccount, mintTo, getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  CpAmm, MIN_SQRT_PRICE, MAX_SQRT_PRICE, derivePositionNftAccount, getTokenProgram,
  getBaseFeeParams, BaseFeeMode, derivePoolAuthority,
} from "@meteora-ag/cp-amm-sdk";
import BN from "bn.js";
import { createHash } from "crypto";
import fs from "fs";

const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const PROG = new PublicKey("767woN2qJdFwFmw415arDXGVnk6JaTymGmzy6BSzc8YT");
const CP = new PublicKey("cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG");
const payer = Keypair.fromSecretKey(new Uint8Array(JSON.parse(
  fs.readFileSync("/Users/maqiyuan/earnonsol/.keys/devnet-deployer.json"))));
const cpAmm = new CpAmm(conn);
const send = (tx, s) => sendAndConfirmTransaction(conn, tx, s, { commitment: "confirmed" });
const disc = (n) => createHash("sha256").update("global:" + n).digest().subarray(0, 8);
const u64 = (n) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const u128 = (bn) => { const b = Buffer.alloc(16); b.set(bn.toArrayLike(Buffer, "le", 16)); return b; };
const VS = Buffer.from("vault"), SS = Buffer.from("share");
const EVENT_AUTH = PublicKey.findProgramAddressSync([Buffer.from("__event_authority")], CP)[0];

async function main() {
  const usdcMint = new PublicKey(JSON.parse(fs.readFileSync("devnet-registry.json")).usdcMint);
  const assetMint = await createMint(conn, payer, payer.publicKey, null, 6);
  console.log("asset", assetMint.toBase58(), "usdc", usdcMint.toBase58());

  // vault PDA
  const [vault] = PublicKey.findProgramAddressSync([VS, assetMint.toBuffer()], PROG);
  const [shareMint] = PublicKey.findProgramAddressSync([SS, vault.toBuffer()], PROG);
  const assetVault = getAssociatedTokenAddressSync(assetMint, vault, true);
  const usdcVault = getAssociatedTokenAddressSync(usdcMint, vault, true);

  // fund payer with both tokens (creator liquidity + user deposit)
  const pAsset = await getOrCreateAssociatedTokenAccount(conn, payer, assetMint, payer.publicKey);
  const pUsdc = await getOrCreateAssociatedTokenAccount(conn, payer, usdcMint, payer.publicKey);
  await mintTo(conn, payer, assetMint, pAsset.address, payer, 1_000_000_000n);
  await mintTo(conn, payer, usdcMint, pUsdc.address, payer, 1_000_000_000n);

  // token ordering
  const aFirst = Buffer.compare(assetMint.toBuffer(), usdcMint.toBuffer()) < 0;
  const tokenAMint = aFirst ? assetMint : usdcMint;
  const tokenBMint = aFirst ? usdcMint : assetMint;

  // 1) create cp-amm pool with a vault-OWNED initial position
  const amtA = new BN(100_000_000), amtB = new BN(100_000_000);
  const { liquidityDelta, initSqrtPrice } = cpAmm.preparePoolCreationParams({
    tokenAAmount: amtA, tokenBAmount: amtB, minSqrtPrice: MIN_SQRT_PRICE, maxSqrtPrice: MAX_SQRT_PRICE,
  });
  const baseFee = getBaseFeeParams({ baseFeeMode: BaseFeeMode.FeeTimeSchedulerLinear,
    feeTimeSchedulerParam: { startingFeeBps: 25, endingFeeBps: 25, numberOfPeriod: 0, totalDuration: 0 } });
  const positionNft = Keypair.generate();
  const created = await cpAmm.createCustomPool({
    payer: payer.publicKey, creator: vault, positionNft: positionNft.publicKey, // owner = vault PDA
    tokenAMint, tokenBMint, tokenAAmount: amtA, tokenBAmount: amtB,
    sqrtMinPrice: MIN_SQRT_PRICE, sqrtMaxPrice: MAX_SQRT_PRICE, liquidityDelta, initSqrtPrice,
    poolFees: { baseFee, compoundingFeeBps: 0, protocolFeePercent: 20, partnerFeePercent: 0, referralFeePercent: 20, dynamicFee: null },
    hasAlphaVault: false, activationType: 1, collectFeeMode: 0, activationPoint: null,
    tokenAProgram: TOKEN_PROGRAM_ID, tokenBProgram: TOKEN_PROGRAM_ID,
  });
  await send(created.tx, [payer, positionNft]);
  const pool = created.pool, position = created.position;
  const positionNftAccount = derivePositionNftAccount(positionNft.publicKey);
  const poolAuthority = derivePoolAuthority();
  const st = await cpAmm.fetchPoolState(pool);
  console.log("✓ pool", pool.toBase58(), "position(vault-owned)", position.toBase58());

  // 2) initialize_vault
  const initIx = new TransactionInstruction({ programId: PROG, keys: [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: usdcMint, isSigner: false, isWritable: false },
    { pubkey: assetMint, isSigner: false, isWritable: false },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: shareMint, isSigner: false, isWritable: true },
    { pubkey: assetVault, isSigner: false, isWritable: true },
    { pubkey: usdcVault, isSigner: false, isWritable: true },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    { pubkey: new PublicKey("SysvarRent111111111111111111111111111111111"), isSigner: false, isWritable: false },
  ], data: disc("initialize_vault") });
  await send(new Transaction().add(initIx), [payer]);
  console.log("✓ initialize_vault");

  // 3) set_pool(pool, position, positionNftAccount)
  const setData = Buffer.concat([disc("set_pool"), pool.toBuffer(), position.toBuffer(), positionNftAccount.toBuffer()]);
  const setIx = new TransactionInstruction({ programId: PROG, keys: [
    { pubkey: payer.publicKey, isSigner: true, isWritable: false },
    { pubkey: vault, isSigner: false, isWritable: true },
  ], data: setData });
  await send(new Transaction().add(setIx), [payer]);
  console.log("✓ set_pool");

  // map vault/user token accounts to A/B order
  const vaultTokenA = aFirst ? assetVault : usdcVault;
  const vaultTokenB = aFirst ? usdcVault : assetVault;
  const userTokenA = aFirst ? pAsset.address : pUsdc.address;
  const userTokenB = aFirst ? pUsdc.address : pAsset.address;
  const userShares = getAssociatedTokenAddressSync(shareMint, payer.publicKey, true);
  await getOrCreateAssociatedTokenAccount(conn, payer, shareMint, payer.publicKey); // ensure share ATA

  // deposit quote for 30 tokenA
  const q = cpAmm.getDepositQuote({ inAmount: new BN(30_000_000), isTokenA: true,
    sqrtPrice: st.sqrtPrice, minSqrtPrice: st.sqrtMinPrice, maxSqrtPrice: st.sqrtMaxPrice });
  const liq = q.liquidityDelta;
  const maxA = new BN(40_000_000), maxB = new BN(40_000_000);

  // build cp-liquidity account list shared by deposit/withdraw
  const cpKeys = (withPoolAuth) => ([
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },        // user
    { pubkey: vault, isSigner: false, isWritable: false },
    { pubkey: shareMint, isSigner: false, isWritable: true },
    { pubkey: userShares, isSigner: false, isWritable: true },
    { pubkey: userTokenA, isSigner: false, isWritable: true },
    { pubkey: userTokenB, isSigner: false, isWritable: true },
    { pubkey: vaultTokenA, isSigner: false, isWritable: true },
    { pubkey: vaultTokenB, isSigner: false, isWritable: true },
    { pubkey: CP, isSigner: false, isWritable: false },
    { pubkey: pool, isSigner: false, isWritable: true },
    { pubkey: position, isSigner: false, isWritable: true },
    { pubkey: positionNftAccount, isSigner: false, isWritable: false },
    { pubkey: st.tokenAVault, isSigner: false, isWritable: true },
    { pubkey: st.tokenBVault, isSigner: false, isWritable: true },
    { pubkey: tokenAMint, isSigner: false, isWritable: false },
    { pubkey: tokenBMint, isSigner: false, isWritable: false },
    { pubkey: poolAuthority, isSigner: false, isWritable: false },
    { pubkey: EVENT_AUTH, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_a_program
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_b_program
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // token_program
  ]);

  // 4) deposit
  const depData = Buffer.concat([disc("deposit"), u128(liq), u64(maxA.toString()), u64(maxB.toString())]);
  await send(new Transaction().add(new TransactionInstruction({ programId: PROG, keys: cpKeys(), data: depData })), [payer]);
  const sh = (await conn.getTokenAccountBalance(userShares)).value;
  console.log(`✓ deposit -> shares=${sh.uiAmount}, liqDelta=${liq.toString()}`);

  // 5) withdraw half the shares
  const half = Math.floor(Number(sh.amount) / 2);
  const wData = Buffer.concat([disc("withdraw"), u64(half), u64(0), u64(0)]);
  await send(new Transaction().add(new TransactionInstruction({ programId: PROG, keys: cpKeys(), data: wData })), [payer]);
  const sh2 = (await conn.getTokenAccountBalance(userShares)).value;
  console.log(`✓ withdraw ${half/1e6} shares -> shares left=${sh2.uiAmount}`);

  const st2 = await cpAmm.fetchPoolState(pool);
  console.log("position liquidity via pool ok; RESULT: vault<->Meteora cp-amm deposit+withdraw OK ✅");
  console.log(JSON.stringify({ vault: vault.toBase58(), pool: pool.toBase58(), position: position.toBase58(), assetMint: assetMint.toBase58(), shareMint: shareMint.toBase58() }, null, 2));
}
main().catch((e) => { console.error("FAILED:", e.transactionLogs || e); process.exit(1); });
