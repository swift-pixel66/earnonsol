// Persistent Meteora vaults on devnet for the frontend: for each asset create a
// cp-amm pool + a vault-owned position, initialize_vault, set_pool. Writes
// meteora-devnet-registry.json with every account the browser deposit needs.
import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction,
  TransactionInstruction, sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint, getOrCreateAssociatedTokenAccount, mintTo, getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  CpAmm, MIN_SQRT_PRICE, MAX_SQRT_PRICE, derivePositionNftAccount, getBaseFeeParams, BaseFeeMode, derivePoolAuthority,
} from "@meteora-ag/cp-amm-sdk";
import BN from "bn.js";
import { createHash } from "crypto";
import fs from "fs";

const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const PROG = new PublicKey("767woN2qJdFwFmw415arDXGVnk6JaTymGmzy6BSzc8YT");
const CP = new PublicKey("cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG");
const payer = Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync("/Users/maqiyuan/earnonsol/.keys/devnet-deployer.json"))));
const USDC = new PublicKey(JSON.parse(fs.readFileSync("devnet-registry.json")).usdcMint);
const cpAmm = new CpAmm(conn);
async function send(tx, s) {
  let last;
  for (let i = 0; i < 6; i++) {
    try { return await sendAndConfirmTransaction(conn, tx, s, { commitment: "confirmed", maxRetries: 5 }); }
    catch (e) { last = e; await new Promise(r => setTimeout(r, 2500 * (i + 1))); }
  }
  throw last;
}
const disc = (n) => createHash("sha256").update("global:" + n).digest().subarray(0, 8);
const VS = Buffer.from("vault"), SS = Buffer.from("share");
const EVENT_AUTH = PublicKey.findProgramAddressSync([Buffer.from("__event_authority")], CP)[0];

const ASSETS = [
  { id: "nvda", symbol: "NVDAx", name: "NVIDIA" },
];

async function setupOne(a) {
  const assetMint = await createMint(conn, payer, payer.publicKey, null, 6);
  const [vault] = PublicKey.findProgramAddressSync([VS, assetMint.toBuffer()], PROG);
  const [shareMint] = PublicKey.findProgramAddressSync([SS, vault.toBuffer()], PROG);
  const assetVault = getAssociatedTokenAddressSync(assetMint, vault, true);
  const usdcVault = getAssociatedTokenAddressSync(USDC, vault, true);
  // seed tokens to payer for pool creation
  const pA = await getOrCreateAssociatedTokenAccount(conn, payer, assetMint, payer.publicKey);
  const pU = await getOrCreateAssociatedTokenAccount(conn, payer, USDC, payer.publicKey);
  await mintTo(conn, payer, assetMint, pA.address, payer, 500_000_000n);
  await mintTo(conn, payer, USDC, pU.address, payer, 500_000_000n);

  const aFirst = Buffer.compare(assetMint.toBuffer(), USDC.toBuffer()) < 0;
  const tokenAMint = aFirst ? assetMint : USDC;
  const tokenBMint = aFirst ? USDC : assetMint;
  const amt = new BN(100_000_000);
  const { liquidityDelta, initSqrtPrice } = cpAmm.preparePoolCreationParams({ tokenAAmount: amt, tokenBAmount: amt, minSqrtPrice: MIN_SQRT_PRICE, maxSqrtPrice: MAX_SQRT_PRICE });
  const baseFee = getBaseFeeParams({ baseFeeMode: BaseFeeMode.FeeTimeSchedulerLinear, feeTimeSchedulerParam: { startingFeeBps: 25, endingFeeBps: 25, numberOfPeriod: 0, totalDuration: 0 } });
  const nft = Keypair.generate();
  const created = await cpAmm.createCustomPool({
    payer: payer.publicKey, creator: vault, positionNft: nft.publicKey,
    tokenAMint, tokenBMint, tokenAAmount: amt, tokenBAmount: amt,
    sqrtMinPrice: MIN_SQRT_PRICE, sqrtMaxPrice: MAX_SQRT_PRICE, liquidityDelta, initSqrtPrice,
    poolFees: { baseFee, compoundingFeeBps: 0, protocolFeePercent: 20, partnerFeePercent: 0, referralFeePercent: 20, dynamicFee: null },
    hasAlphaVault: false, activationType: 1, collectFeeMode: 0, activationPoint: null,
    tokenAProgram: TOKEN_PROGRAM_ID, tokenBProgram: TOKEN_PROGRAM_ID,
  });
  await send(created.tx, [payer, nft]);
  const pool = created.pool, position = created.position;
  const positionNftAccount = derivePositionNftAccount(nft.publicKey);
  const st = await cpAmm.fetchPoolState(pool);

  // initialize_vault
  const initIx = new TransactionInstruction({ programId: PROG, keys: [
    { pubkey: payer.publicKey, isSigner: true, isWritable: true },
    { pubkey: USDC, isSigner: false, isWritable: false },
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

  // set_pool
  const setData = Buffer.concat([disc("set_pool"), pool.toBuffer(), position.toBuffer(), positionNftAccount.toBuffer()]);
  await send(new Transaction().add(new TransactionInstruction({ programId: PROG, keys: [
    { pubkey: payer.publicKey, isSigner: true, isWritable: false },
    { pubkey: vault, isSigner: false, isWritable: true },
  ], data: setData })), [payer]);

  return {
    ...a, aFirst,
    vault: vault.toBase58(), shareMint: shareMint.toBase58(), assetMint: assetMint.toBase58(),
    assetVault: assetVault.toBase58(), usdcVault: usdcVault.toBase58(),
    pool: pool.toBase58(), position: position.toBase58(), positionNftAccount: positionNftAccount.toBase58(),
    tokenAMint: tokenAMint.toBase58(), tokenBMint: tokenBMint.toBase58(),
    tokenAVault: st.tokenAVault.toBase58(), tokenBVault: st.tokenBVault.toBase58(),
    poolAuthority: derivePoolAuthority().toBase58(), eventAuthority: EVENT_AUTH.toBase58(),
  };
}

async function main() {
  console.log("payer", payer.publicKey.toBase58(), (await conn.getBalance(payer.publicKey)) / 1e9, "SOL");
  const out = { network: "devnet", programId: PROG.toBase58(), cpAmm: CP.toBase58(), usdcMint: USDC.toBase58(), vaults: {} };
  for (const a of ASSETS) {
    const v = await setupOne(a);
    out.vaults[a.id] = v;
    console.log(`✓ ${a.id} meteora vault ${v.vault}`);
  }
  fs.writeFileSync("meteora-devnet-registry.json", JSON.stringify(out, null, 2));
  console.log("RESULT: meteora devnet vaults ready ✅");
}
main().catch((e) => { console.error("FAILED:", (e.transactionLogs || e.message || e)); process.exit(1); });
