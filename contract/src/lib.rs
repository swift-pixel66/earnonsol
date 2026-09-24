//! An independent Solana counter with a fixed authority and checked increments.

use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint::ProgramResult,
    program_error::ProgramError,
    pubkey::Pubkey,
};

#[cfg(not(feature = "no-entrypoint"))]
solana_program::entrypoint!(process_instruction);

/// One version byte, a 32-byte authority, and an eight-byte little-endian count.
pub const COUNTER_LEN: usize = 41;
pub const INITIALIZE: u8 = 0;
pub const INCREMENT: u8 = 1;
const VERSION: u8 = 1;

/// Accounts: writable counter, followed by its signing authority.
/// Initialization also requires the counter account's signature.
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction = match instruction_data {
        [INITIALIZE] => INITIALIZE,
        [INCREMENT] => INCREMENT,
        _ => return Err(ProgramError::InvalidInstructionData),
    };

    let mut accounts = accounts.iter();
    let counter = next_account_info(&mut accounts)?;
    let authority = next_account_info(&mut accounts)?;

    if counter.owner != program_id {
        return Err(ProgramError::IncorrectProgramId);
    }
    if !counter.is_writable || counter.executable {
        return Err(ProgramError::InvalidAccountData);
    }
    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let mut data = counter.try_borrow_mut_data()?;
    if data.len() != COUNTER_LEN {
        return Err(ProgramError::InvalidAccountData);
    }

    if instruction == INITIALIZE {
        // A second signature prevents claiming another party's fresh account.
        if !counter.is_signer {
            return Err(ProgramError::MissingRequiredSignature);
        }
        if data.iter().any(|byte| *byte != 0) {
            return Err(ProgramError::AccountAlreadyInitialized);
        }
        data[0] = VERSION;
        data[1..33].copy_from_slice(authority.key.as_ref());
        return Ok(());
    }

    match data[0] {
        0 => return Err(ProgramError::UninitializedAccount),
        VERSION => {}
        _ => return Err(ProgramError::InvalidAccountData),
    }
    if &data[1..33] != authority.key.as_ref() {
        return Err(ProgramError::IllegalOwner);
    }

    let count = u64::from_le_bytes(
        data[33..41]
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    );
    let next = count
        .checked_add(1)
        .ok_or(ProgramError::ArithmeticOverflow)?;
    data[33..41].copy_from_slice(&next.to_le_bytes());
    Ok(())
}
