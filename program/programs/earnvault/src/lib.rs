use anchor_lang::prelude::*;
use anchor_lang::solana_program::{instruction::{AccountMeta, Instruction}, program::invoke_signed};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer},
};

declare_id!("767woN2qJdFwFmw415arDXGVnk6JaTymGmzy6BSzc8YT");

// EARN vault (devnet) — Meteora DAMM v2 (cp-amm) integrated.
//
// The vault owns a single cp-amm position (created off-chain with owner = the
// vault PDA). Depositors supply the asset + USDC pair; the vault adds that
// liquidity to its cp-amm position via CPI and mints vault shares proportional
// to the liquidity added. Redeeming shares removes the proportional liquidity
// from the position and returns the underlying tokens.

const VAULT_SEED: &[u8] = b"vault";
const SHARE_SEED: &[u8] = b"share";
const CP_AMM: Pubkey = pubkey!("cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG");

// cp-amm Anchor discriminators (sha256("global:<name>")[..8]).
const IX_ADD_LIQUIDITY: [u8; 8] = [181, 157, 89, 67, 143, 182, 52, 72];
const IX_REMOVE_LIQUIDITY: [u8; 8] = [80, 85, 209, 72, 24, 206, 177, 108];
// Position.unlocked_liquidity offset: 8 disc +32 pool +32 nft +32 +32 +8 +8 = 152
const POS_UNLOCKED_LIQ_OFF: usize = 152;

#[program]
pub mod earnvault {
    use super::*;

    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let v = &mut ctx.accounts.vault;
        v.authority = ctx.accounts.authority.key();
        v.usdc_mint = ctx.accounts.usdc_mint.key();
        v.asset_mint = ctx.accounts.asset_mint.key();
        v.share_mint = ctx.accounts.share_mint.key();
        v.asset_vault = ctx.accounts.asset_vault.key();
        v.usdc_vault = ctx.accounts.usdc_vault.key();
        v.pool = Pubkey::default();
        v.position = Pubkey::default();
        v.position_nft_account = Pubkey::default();
        v.deposits_paused = false;
        v.withdrawals_paused = false;
        v.bump = ctx.bumps.vault;
        Ok(())
    }

    /// One-time: register the cp-amm pool + vault-owned position.
    pub fn set_pool(
        ctx: Context<SetPool>,
        pool: Pubkey,
        position: Pubkey,
        position_nft_account: Pubkey,
    ) -> Result<()> {
        let v = &mut ctx.accounts.vault;
        v.pool = pool;
        v.position = position;
        v.position_nft_account = position_nft_account;
        Ok(())
    }

    /// Deposit the asset+USDC pair (amounts a/b, in cp-amm tokenA/tokenB order)
    /// and add `liquidity_delta` to the vault's cp-amm position. Mints shares.
    pub fn deposit(
        ctx: Context<CpLiquidity>,
        liquidity_delta: u128,
        amount_a: u64,
        amount_b: u64,
    ) -> Result<()> {
        require!(!ctx.accounts.vault.deposits_paused, VaultError::DepositsPaused);
        require!(liquidity_delta > 0, VaultError::ZeroAmount);

        let liq_before = read_position_liquidity(&ctx.accounts.position)?;
        let supply = ctx.accounts.share_mint.supply;

        // move the pair from the user into the vault's token accounts
        if amount_a > 0 {
            token::transfer(
                CpiContext::new(ctx.accounts.token_program.to_account_info(), Transfer {
                    from: ctx.accounts.user_token_a.to_account_info(),
                    to: ctx.accounts.vault_token_a.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                }),
                amount_a,
            )?;
        }
        if amount_b > 0 {
            token::transfer(
                CpiContext::new(ctx.accounts.token_program.to_account_info(), Transfer {
                    from: ctx.accounts.user_token_b.to_account_info(),
                    to: ctx.accounts.vault_token_b.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                }),
                amount_b,
            )?;
        }

        // CPI cp-amm add_liquidity (vault PDA signs as position owner)
        cpi_add_liquidity(&ctx, liquidity_delta, amount_a, amount_b)?;

        // Shares are token-scale (small), not liquidity-scale, so every mul_div
        // below stays well within u128. First deposit pegs shares to the tokens
        // supplied; later deposits scale by the liquidity actually added.
        let shares: u64 = if supply == 0 || liq_before == 0 {
            amount_a.checked_add(amount_b).ok_or(VaultError::MathOverflow)?
        } else {
            u128_mul_div(liquidity_delta, supply as u128, liq_before)?
        };
        require!(shares > 0, VaultError::ZeroShares);

        let asset_key = ctx.accounts.vault.asset_mint;
        let seeds: &[&[u8]] = &[VAULT_SEED, asset_key.as_ref(), &[ctx.accounts.vault.bump]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.share_mint.to_account_info(),
                    to: ctx.accounts.user_shares.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[seeds],
            ),
            shares,
        )?;

        emit!(Deposited { vault: ctx.accounts.vault.key(), user: ctx.accounts.user.key(), liquidity: liquidity_delta, shares_out: shares });
        Ok(())
    }

    /// Redeem `shares` — remove the proportional liquidity and return tokens.
    pub fn withdraw(ctx: Context<CpLiquidity>, shares: u64, min_a: u64, min_b: u64) -> Result<()> {
        require!(!ctx.accounts.vault.withdrawals_paused, VaultError::WithdrawalsPaused);
        require!(shares > 0, VaultError::ZeroAmount);

        let supply = ctx.accounts.share_mint.supply;
        require!(supply > 0, VaultError::NoSupply);
        let liq = read_position_liquidity(&ctx.accounts.position)?;
        // shares are token-scale, so liq * shares stays within u128
        let liq_to_remove = u128_mul_div_u128(liq, shares as u128, supply as u128)?;
        require!(liq_to_remove > 0, VaultError::ZeroAmount);

        // burn first
        token::burn(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Burn {
                    mint: ctx.accounts.share_mint.to_account_info(),
                    from: ctx.accounts.user_shares.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            shares,
        )?;

        // record vault balances before removing, to know how much to forward
        let va_before = ctx.accounts.vault_token_a.amount;
        let vb_before = ctx.accounts.vault_token_b.amount;

        cpi_remove_liquidity(&ctx, liq_to_remove, min_a, min_b)?;

        ctx.accounts.vault_token_a.reload()?;
        ctx.accounts.vault_token_b.reload()?;
        let out_a = ctx.accounts.vault_token_a.amount.saturating_sub(va_before);
        let out_b = ctx.accounts.vault_token_b.amount.saturating_sub(vb_before);

        let asset_key = ctx.accounts.vault.asset_mint;
        let bump = ctx.accounts.vault.bump;
        let seeds: &[&[u8]] = &[VAULT_SEED, asset_key.as_ref(), &[bump]];
        if out_a > 0 {
            token::transfer(
                CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), Transfer {
                    from: ctx.accounts.vault_token_a.to_account_info(),
                    to: ctx.accounts.user_token_a.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                }, &[seeds]),
                out_a,
            )?;
        }
        if out_b > 0 {
            token::transfer(
                CpiContext::new_with_signer(ctx.accounts.token_program.to_account_info(), Transfer {
                    from: ctx.accounts.vault_token_b.to_account_info(),
                    to: ctx.accounts.user_token_b.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                }, &[seeds]),
                out_b,
            )?;
        }

        emit!(Withdrawn { vault: ctx.accounts.vault.key(), user: ctx.accounts.user.key(), liquidity: liq_to_remove, shares_in: shares });
        Ok(())
    }

    pub fn set_pause(ctx: Context<SetPause>, deposits: bool, withdrawals: bool) -> Result<()> {
        let v = &mut ctx.accounts.vault;
        v.deposits_paused = deposits;
        v.withdrawals_paused = withdrawals;
        Ok(())
    }
}

// ---------- CPI helpers ----------


fn read_position_liquidity(pos: &AccountInfo) -> Result<u128> {
    let data = pos.data.borrow();
    require!(data.len() >= POS_UNLOCKED_LIQ_OFF + 16, VaultError::BadPosition);
    let mut b = [0u8; 16];
    b.copy_from_slice(&data[POS_UNLOCKED_LIQ_OFF..POS_UNLOCKED_LIQ_OFF + 16]);
    Ok(u128::from_le_bytes(b))
}

fn u128_mul_div(a: u128, b: u128, d: u128) -> Result<u64> {
    let r = a.checked_mul(b).ok_or(VaultError::MathOverflow)?.checked_div(d).ok_or(VaultError::MathOverflow)?;
    u64::try_from(r).map_err(|_| VaultError::MathOverflow.into())
}
fn u128_mul_div_u128(a: u128, b: u128, d: u128) -> Result<u128> {
    a.checked_mul(b).ok_or(VaultError::MathOverflow)?.checked_div(d).ok_or(VaultError::MathOverflow.into())
}

// transfer user<->vault for token A or B

fn cpi_add_liquidity(ctx: &Context<CpLiquidity>, liq: u128, max_a: u64, max_b: u64) -> Result<()> {
    let mut data = Vec::with_capacity(8 + 32);
    data.extend_from_slice(&IX_ADD_LIQUIDITY);
    data.extend_from_slice(&liq.to_le_bytes());
    data.extend_from_slice(&max_a.to_le_bytes());
    data.extend_from_slice(&max_b.to_le_bytes());
    let a = &ctx.accounts;
    let metas = vec![
        AccountMeta::new(a.pool.key(), false),
        AccountMeta::new(a.position.key(), false),
        AccountMeta::new(a.vault_token_a.key(), false),
        AccountMeta::new(a.vault_token_b.key(), false),
        AccountMeta::new(a.token_a_vault.key(), false),
        AccountMeta::new(a.token_b_vault.key(), false),
        AccountMeta::new_readonly(a.token_a_mint.key(), false),
        AccountMeta::new_readonly(a.token_b_mint.key(), false),
        AccountMeta::new_readonly(a.position_nft_account.key(), false),
        AccountMeta::new_readonly(a.vault.key(), true), // signer = position owner (vault PDA)
        AccountMeta::new_readonly(a.token_a_program.key(), false),
        AccountMeta::new_readonly(a.token_b_program.key(), false),
        AccountMeta::new_readonly(a.event_authority.key(), false),
        AccountMeta::new_readonly(a.cp_program.key(), false),
    ];
    let infos = [
        a.pool.to_account_info(), a.position.to_account_info(),
        a.vault_token_a.to_account_info(), a.vault_token_b.to_account_info(),
        a.token_a_vault.to_account_info(), a.token_b_vault.to_account_info(),
        a.token_a_mint.to_account_info(), a.token_b_mint.to_account_info(),
        a.position_nft_account.to_account_info(), a.vault.to_account_info(),
        a.token_a_program.to_account_info(), a.token_b_program.to_account_info(),
        a.event_authority.to_account_info(), a.cp_program.to_account_info(),
    ];
    let asset_key = a.vault.asset_mint;
    let seeds: &[&[u8]] = &[VAULT_SEED, asset_key.as_ref(), &[a.vault.bump]];
    invoke_signed(&Instruction { program_id: CP_AMM, accounts: metas, data }, &infos, &[seeds])
        .map_err(Into::into)
}

fn cpi_remove_liquidity(ctx: &Context<CpLiquidity>, liq: u128, min_a: u64, min_b: u64) -> Result<()> {
    let mut data = Vec::with_capacity(8 + 32);
    data.extend_from_slice(&IX_REMOVE_LIQUIDITY);
    data.extend_from_slice(&liq.to_le_bytes());
    data.extend_from_slice(&min_a.to_le_bytes());
    data.extend_from_slice(&min_b.to_le_bytes());
    let a = &ctx.accounts;
    let metas = vec![
        AccountMeta::new_readonly(a.pool_authority.key(), false),
        AccountMeta::new(a.pool.key(), false),
        AccountMeta::new(a.position.key(), false),
        AccountMeta::new(a.vault_token_a.key(), false),
        AccountMeta::new(a.vault_token_b.key(), false),
        AccountMeta::new(a.token_a_vault.key(), false),
        AccountMeta::new(a.token_b_vault.key(), false),
        AccountMeta::new_readonly(a.token_a_mint.key(), false),
        AccountMeta::new_readonly(a.token_b_mint.key(), false),
        AccountMeta::new_readonly(a.position_nft_account.key(), false),
        AccountMeta::new_readonly(a.vault.key(), true),
        AccountMeta::new_readonly(a.token_a_program.key(), false),
        AccountMeta::new_readonly(a.token_b_program.key(), false),
        AccountMeta::new_readonly(a.event_authority.key(), false),
        AccountMeta::new_readonly(a.cp_program.key(), false),
    ];
    let infos = [
        a.pool_authority.to_account_info(), a.pool.to_account_info(), a.position.to_account_info(),
        a.vault_token_a.to_account_info(), a.vault_token_b.to_account_info(),
        a.token_a_vault.to_account_info(), a.token_b_vault.to_account_info(),
        a.token_a_mint.to_account_info(), a.token_b_mint.to_account_info(),
        a.position_nft_account.to_account_info(), a.vault.to_account_info(),
        a.token_a_program.to_account_info(), a.token_b_program.to_account_info(),
        a.event_authority.to_account_info(), a.cp_program.to_account_info(),
    ];
    let asset_key = a.vault.asset_mint;
    let seeds: &[&[u8]] = &[VAULT_SEED, asset_key.as_ref(), &[a.vault.bump]];
    invoke_signed(&Instruction { program_id: CP_AMM, accounts: metas, data }, &infos, &[seeds])
        .map_err(Into::into)
}

// ---------- Accounts ----------

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub usdc_mint: Account<'info, Mint>,
    pub asset_mint: Account<'info, Mint>,
    #[account(init, payer = authority, space = 8 + Vault::LEN, seeds = [VAULT_SEED, asset_mint.key().as_ref()], bump)]
    pub vault: Account<'info, Vault>,
    #[account(init, payer = authority, seeds = [SHARE_SEED, vault.key().as_ref()], bump, mint::decimals = 6, mint::authority = vault)]
    pub share_mint: Account<'info, Mint>,
    #[account(init, payer = authority, associated_token::mint = asset_mint, associated_token::authority = vault)]
    pub asset_vault: Account<'info, TokenAccount>,
    #[account(init, payer = authority, associated_token::mint = usdc_mint, associated_token::authority = vault)]
    pub usdc_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct SetPool<'info> {
    #[account(address = vault.authority)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [VAULT_SEED, vault.asset_mint.as_ref()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
}

#[derive(Accounts)]
pub struct CpLiquidity<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(seeds = [VAULT_SEED, vault.asset_mint.as_ref()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
    #[account(mut, address = vault.share_mint)]
    pub share_mint: Box<Account<'info, Mint>>,
    #[account(mut, associated_token::mint = share_mint, associated_token::authority = user)]
    pub user_shares: Box<Account<'info, TokenAccount>>,

    // user's pair token accounts (source/destination), in cp-amm tokenA/tokenB order
    #[account(mut)]
    pub user_token_a: Box<Account<'info, TokenAccount>>,
    #[account(mut)]
    pub user_token_b: Box<Account<'info, TokenAccount>>,
    // vault's pair token accounts (authority = vault PDA), in tokenA/tokenB order
    #[account(mut, token::authority = vault)]
    pub vault_token_a: Box<Account<'info, TokenAccount>>,
    #[account(mut, token::authority = vault)]
    pub vault_token_b: Box<Account<'info, TokenAccount>>,

    // cp-amm accounts (validated against stored pool/position)
    /// CHECK: cp-amm program
    #[account(address = CP_AMM)]
    pub cp_program: AccountInfo<'info>,
    /// CHECK: validated == vault.pool
    #[account(mut, address = vault.pool)]
    pub pool: AccountInfo<'info>,
    /// CHECK: validated == vault.position
    #[account(mut, address = vault.position)]
    pub position: AccountInfo<'info>,
    /// CHECK: validated == vault.position_nft_account
    #[account(address = vault.position_nft_account)]
    pub position_nft_account: AccountInfo<'info>,
    /// CHECK: cp-amm pool token vault A
    #[account(mut)]
    pub token_a_vault: AccountInfo<'info>,
    /// CHECK: cp-amm pool token vault B
    #[account(mut)]
    pub token_b_vault: AccountInfo<'info>,
    /// CHECK: token A mint
    pub token_a_mint: AccountInfo<'info>,
    /// CHECK: token B mint
    pub token_b_mint: AccountInfo<'info>,
    /// CHECK: cp-amm pool authority (remove_liquidity)
    pub pool_authority: AccountInfo<'info>,
    /// CHECK: cp-amm event authority
    pub event_authority: AccountInfo<'info>,
    /// CHECK: token A program
    pub token_a_program: AccountInfo<'info>,
    /// CHECK: token B program
    pub token_b_program: AccountInfo<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SetPause<'info> {
    #[account(address = vault.authority)]
    pub authority: Signer<'info>,
    #[account(mut, seeds = [VAULT_SEED, vault.asset_mint.as_ref()], bump = vault.bump)]
    pub vault: Account<'info, Vault>,
}

#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub usdc_mint: Pubkey,
    pub asset_mint: Pubkey,
    pub share_mint: Pubkey,
    pub asset_vault: Pubkey,
    pub usdc_vault: Pubkey,
    pub pool: Pubkey,
    pub position: Pubkey,
    pub position_nft_account: Pubkey,
    pub bump: u8,
    pub deposits_paused: bool,
    pub withdrawals_paused: bool,
}
impl Vault {
    pub const LEN: usize = 32 * 9 + 1 + 1 + 1;
}

#[event]
pub struct Deposited { pub vault: Pubkey, pub user: Pubkey, pub liquidity: u128, pub shares_out: u64 }
#[event]
pub struct Withdrawn { pub vault: Pubkey, pub user: Pubkey, pub liquidity: u128, pub shares_in: u64 }

#[error_code]
pub enum VaultError {
    #[msg("Deposits are paused")] DepositsPaused,
    #[msg("Withdrawals are paused")] WithdrawalsPaused,
    #[msg("Amount must be greater than zero")] ZeroAmount,
    #[msg("Computed shares are zero")] ZeroShares,
    #[msg("No shares in circulation")] NoSupply,
    #[msg("Math overflow")] MathOverflow,
    #[msg("Bad position account")] BadPosition,
}
