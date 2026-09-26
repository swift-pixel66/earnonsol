use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer},
};

declare_id!("767woN2qJdFwFmw415arDXGVnk6JaTymGmzy6BSzc8YT");

// EARN vault (devnet). A USDC-denominated single-asset vault with real share
// accounting. USDC deposits mint vault shares; redeeming shares returns the
// proportional USDC held by the vault.
//
// The liquidity strategy (Meteora DAMM v2 cp-amm) plugs in at the marked seam:
// on deposit the reserve would be deployed into a cp-amm position, and on
// withdraw pulled back. Until then the vault custodies USDC directly, so the
// deposit/withdraw flow and share math are already real and end-to-end.

const VAULT_SEED: &[u8] = b"vault";
const SHARE_SEED: &[u8] = b"share";

#[program]
pub mod earnvault {
    use super::*;

    /// Create a vault for `asset_mint`, its share mint and USDC custody account.
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let v = &mut ctx.accounts.vault;
        v.authority = ctx.accounts.authority.key();
        v.usdc_mint = ctx.accounts.usdc_mint.key();
        v.asset_mint = ctx.accounts.asset_mint.key();
        v.share_mint = ctx.accounts.share_mint.key();
        v.usdc_vault = ctx.accounts.usdc_vault.key();
        v.deposits_paused = false;
        v.withdrawals_paused = false;
        v.bump = ctx.bumps.vault;
        emit!(VaultInitialized {
            vault: v.key(),
            asset_mint: v.asset_mint,
            share_mint: v.share_mint,
        });
        Ok(())
    }

    /// Deposit USDC and receive vault shares.
    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        require!(!ctx.accounts.vault.deposits_paused, VaultError::DepositsPaused);
        require!(amount > 0, VaultError::ZeroAmount);

        let reserve_before = ctx.accounts.usdc_vault.amount;
        let supply = ctx.accounts.share_mint.supply;

        // pull USDC from the user into the vault reserve
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_usdc.to_account_info(),
                    to: ctx.accounts.usdc_vault.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
            ),
            amount,
        )?;

        // shares = first deposit ? amount : amount * supply / reserve_before
        let shares: u64 = if supply == 0 || reserve_before == 0 {
            amount
        } else {
            (amount as u128)
                .checked_mul(supply as u128)
                .unwrap()
                .checked_div(reserve_before as u128)
                .unwrap() as u64
        };
        require!(shares > 0, VaultError::ZeroShares);

        // --- Meteora strategy seam: deploy `amount` into the cp-amm position here ---

        let asset_key = ctx.accounts.vault.asset_mint;
        let seeds = &[VAULT_SEED, asset_key.as_ref(), &[ctx.accounts.vault.bump]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.share_mint.to_account_info(),
                    to: ctx.accounts.user_shares.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[&seeds[..]],
            ),
            shares,
        )?;

        emit!(Deposited {
            vault: ctx.accounts.vault.key(),
            user: ctx.accounts.user.key(),
            usdc_in: amount,
            shares_out: shares,
        });
        Ok(())
    }

    /// Redeem vault shares for the proportional USDC.
    pub fn withdraw(ctx: Context<Withdraw>, shares: u64) -> Result<()> {
        require!(!ctx.accounts.vault.withdrawals_paused, VaultError::WithdrawalsPaused);
        require!(shares > 0, VaultError::ZeroAmount);

        let supply = ctx.accounts.share_mint.supply;
        let reserve = ctx.accounts.usdc_vault.amount;
        require!(supply > 0, VaultError::NoSupply);
        require!(shares <= supply, VaultError::InsufficientShares);

        // --- Meteora strategy seam: pull proportional liquidity from cp-amm here ---

        let usdc_out: u64 = (reserve as u128)
            .checked_mul(shares as u128)
            .unwrap()
            .checked_div(supply as u128)
            .unwrap() as u64;
        require!(usdc_out > 0, VaultError::ZeroAmount);

        // burn the user's shares
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

        // return USDC from the vault reserve
        let asset_key = ctx.accounts.vault.asset_mint;
        let seeds = &[VAULT_SEED, asset_key.as_ref(), &[ctx.accounts.vault.bump]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.usdc_vault.to_account_info(),
                    to: ctx.accounts.user_usdc.to_account_info(),
                    authority: ctx.accounts.vault.to_account_info(),
                },
                &[&seeds[..]],
            ),
            usdc_out,
        )?;

        emit!(Withdrawn {
            vault: ctx.accounts.vault.key(),
            user: ctx.accounts.user.key(),
            shares_in: shares,
            usdc_out,
        });
        Ok(())
    }

    /// Management: pause or unpause deposits / withdrawals.
    pub fn set_pause(ctx: Context<SetPause>, deposits: bool, withdrawals: bool) -> Result<()> {
        let v = &mut ctx.accounts.vault;
        v.deposits_paused = deposits;
        v.withdrawals_paused = withdrawals;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub usdc_mint: Account<'info, Mint>,
    pub asset_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        space = 8 + Vault::LEN,
        seeds = [VAULT_SEED, asset_mint.key().as_ref()],
        bump
    )]
    pub vault: Account<'info, Vault>,
    #[account(
        init,
        payer = authority,
        seeds = [SHARE_SEED, vault.key().as_ref()],
        bump,
        mint::decimals = 6,
        mint::authority = vault,
    )]
    pub share_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = authority,
        associated_token::mint = usdc_mint,
        associated_token::authority = vault,
    )]
    pub usdc_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        seeds = [VAULT_SEED, vault.asset_mint.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,
    #[account(mut, address = vault.share_mint)]
    pub share_mint: Account<'info, Mint>,
    #[account(mut, address = vault.usdc_vault)]
    pub usdc_vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = vault.usdc_mint, token::authority = user)]
    pub user_usdc: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = share_mint,
        associated_token::authority = user,
    )]
    pub user_shares: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        seeds = [VAULT_SEED, vault.asset_mint.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,
    #[account(mut, address = vault.share_mint)]
    pub share_mint: Account<'info, Mint>,
    #[account(mut, address = vault.usdc_vault)]
    pub usdc_vault: Account<'info, TokenAccount>,
    #[account(mut, token::mint = vault.usdc_mint, token::authority = user)]
    pub user_usdc: Account<'info, TokenAccount>,
    #[account(mut, token::mint = vault.share_mint, token::authority = user)]
    pub user_shares: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct SetPause<'info> {
    #[account(address = vault.authority)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [VAULT_SEED, vault.asset_mint.as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,
}

#[account]
pub struct Vault {
    pub authority: Pubkey,
    pub usdc_mint: Pubkey,
    pub asset_mint: Pubkey,
    pub share_mint: Pubkey,
    pub usdc_vault: Pubkey,
    pub bump: u8,
    pub deposits_paused: bool,
    pub withdrawals_paused: bool,
}
impl Vault {
    pub const LEN: usize = 32 * 5 + 1 + 1 + 1;
}

#[event]
pub struct VaultInitialized {
    pub vault: Pubkey,
    pub asset_mint: Pubkey,
    pub share_mint: Pubkey,
}
#[event]
pub struct Deposited {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub usdc_in: u64,
    pub shares_out: u64,
}
#[event]
pub struct Withdrawn {
    pub vault: Pubkey,
    pub user: Pubkey,
    pub shares_in: u64,
    pub usdc_out: u64,
}

#[error_code]
pub enum VaultError {
    #[msg("Deposits are paused")]
    DepositsPaused,
    #[msg("Withdrawals are paused")]
    WithdrawalsPaused,
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Computed shares are zero")]
    ZeroShares,
    #[msg("No shares in circulation")]
    NoSupply,
    #[msg("Not enough shares")]
    InsufficientShares,
}
