use earn_counter_example::{process_instruction, COUNTER_LEN, INCREMENT, INITIALIZE};
use solana_program::{account_info::AccountInfo, program_error::ProgramError, pubkey::Pubkey};

struct Fixture {
    program: Pubkey,
    counter: Pubkey,
    owner: Pubkey,
    signer: Pubkey,
    data: Vec<u8>,
    writable: bool,
    authority_signed: bool,
    counter_signed: bool,
}

impl Fixture {
    fn new() -> Self {
        let program = Pubkey::new_unique();
        Self {
            program,
            counter: Pubkey::new_unique(),
            owner: program,
            signer: Pubkey::new_unique(),
            data: vec![0; COUNTER_LEN],
            writable: true,
            authority_signed: true,
            counter_signed: true,
        }
    }

    fn invoke(&mut self, instruction: &[u8]) -> Result<(), ProgramError> {
        let mut counter_lamports = 1_000_000;
        let mut signer_lamports = 1_000_000;
        let mut signer_data = [];
        let signer_owner = Pubkey::default();
        let accounts = [
            AccountInfo::new(
                &self.counter,
                self.counter_signed,
                self.writable,
                &mut counter_lamports,
                &mut self.data,
                &self.owner,
                false,
                0,
            ),
            AccountInfo::new(
                &self.signer,
                self.authority_signed,
                false,
                &mut signer_lamports,
                &mut signer_data,
                &signer_owner,
                false,
                0,
            ),
        ];
        process_instruction(&self.program, &accounts, instruction)
    }

    fn reject(&mut self, instruction: &[u8], error: ProgramError) {
        let before = self.data.clone();
        assert_eq!(self.invoke(instruction), Err(error));
        assert_eq!(self.data, before, "a rejected operation changed state");
    }
}

#[test]
fn authority_can_initialize_and_increment_without_the_counter_signature() {
    let mut fixture = Fixture::new();
    fixture.invoke(&[INITIALIZE]).unwrap();
    assert_eq!(fixture.data[0], 1);
    assert_eq!(&fixture.data[1..33], fixture.signer.as_ref());
    assert_eq!(&fixture.data[33..41], &0_u64.to_le_bytes());
    fixture.counter_signed = false;
    fixture.invoke(&[INCREMENT]).unwrap();
    fixture.invoke(&[INCREMENT]).unwrap();
    assert_eq!(&fixture.data[33..41], &2_u64.to_le_bytes());
}

#[test]
fn initialization_requires_both_signatures() {
    let mut fixture = Fixture::new();
    fixture.counter_signed = false;
    fixture.reject(&[INITIALIZE], ProgramError::MissingRequiredSignature);
    fixture.counter_signed = true;
    fixture.authority_signed = false;
    fixture.reject(&[INITIALIZE], ProgramError::MissingRequiredSignature);
}

#[test]
fn a_counter_cannot_be_claimed_again() {
    let mut fixture = Fixture::new();
    fixture.invoke(&[INITIALIZE]).unwrap();
    fixture.signer = Pubkey::new_unique();
    fixture.reject(&[INITIALIZE], ProgramError::AccountAlreadyInitialized);
}

#[test]
fn only_the_recorded_signer_can_increment() {
    let mut fixture = Fixture::new();
    fixture.invoke(&[INITIALIZE]).unwrap();
    fixture.authority_signed = false;
    fixture.reject(&[INCREMENT], ProgramError::MissingRequiredSignature);
    fixture.authority_signed = true;
    fixture.signer = Pubkey::new_unique();
    fixture.reject(&[INCREMENT], ProgramError::IllegalOwner);
}

#[test]
fn foreign_and_readonly_accounts_are_rejected() {
    let mut fixture = Fixture::new();
    fixture.owner = Pubkey::new_unique();
    fixture.reject(&[INITIALIZE], ProgramError::IncorrectProgramId);
    fixture.owner = fixture.program;
    fixture.writable = false;
    fixture.reject(&[INITIALIZE], ProgramError::InvalidAccountData);
}

#[test]
fn instructions_must_have_an_exact_supported_encoding() {
    let mut fixture = Fixture::new();
    for instruction in [vec![], vec![2], vec![INITIALIZE, 0], vec![INCREMENT, 0]] {
        fixture.reject(&instruction, ProgramError::InvalidInstructionData);
    }
}

#[test]
fn malformed_account_sizes_are_rejected() {
    for size in [0, COUNTER_LEN - 1, COUNTER_LEN + 1] {
        let mut fixture = Fixture::new();
        fixture.data = vec![0; size];
        fixture.reject(&[INITIALIZE], ProgramError::InvalidAccountData);
    }
}

#[test]
fn increments_require_an_initialized_supported_version() {
    let mut fixture = Fixture::new();
    fixture.reject(&[INCREMENT], ProgramError::UninitializedAccount);
    fixture.invoke(&[INITIALIZE]).unwrap();
    fixture.data[0] = 2;
    fixture.reject(&[INCREMENT], ProgramError::InvalidAccountData);
}

#[test]
fn overflow_leaves_the_counter_unchanged() {
    let mut fixture = Fixture::new();
    fixture.invoke(&[INITIALIZE]).unwrap();
    fixture.data[33..41].copy_from_slice(&u64::MAX.to_le_bytes());
    fixture.reject(&[INCREMENT], ProgramError::ArithmeticOverflow);
}

#[test]
fn missing_accounts_return_an_error() {
    assert_eq!(
        process_instruction(&Pubkey::new_unique(), &[], &[INITIALIZE]),
        Err(ProgramError::NotEnoughAccountKeys)
    );
}
