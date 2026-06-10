#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror,
    panic_with_error, symbol_short,
    Address, Env,
    token,
};

// ============================================================
// Storage
// ============================================================

#[contracttype]
pub enum DataKey {
    Admin,
    InputToken,       // XLM wrapper or USDC address
    OutputToken,      // StellarPlay token address
    FeeBps,           // Fee in basis points (e.g. 50 = 0.5%)
    PrizeFeeBps,      // Fee applied when converting prizes back
    TotalInputStored,
    TotalOutputMinted,
    TotalOutputBurned,
    AccumulatedFees,
    AccumulatedPrizeFees,
    Paused,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum VaultError {
    AlreadyInitialized = 1,
    Unauthorized       = 2,
    Paused             = 3,
    InvalidAmount      = 4,
    InvalidFee         = 5,
    InsufficientBalance = 6,
}

// ============================================================
// Contract — StellarPlay Vault
// ============================================================

#[contract]
pub struct StellarPlayVault;

#[contractimpl]
impl StellarPlayVault {
    /// `input_token`  — the token users deposit (e.g. XLM wrapper or USDC Soroban token)
    /// `output_token` — the StellarPlay (STLP) token minted in exchange
    /// `fee_bps`      — conversion fee in basis points (50 = 0.5%)
    pub fn initialize(
        env: Env,
        admin: Address,
        input_token: Address,
        output_token: Address,
        fee_bps: u32,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, VaultError::AlreadyInitialized);
        }
        if fee_bps > 500 {
            panic_with_error!(&env, VaultError::InvalidFee); // max 5%
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::InputToken, &input_token);
        env.storage().instance().set(&DataKey::OutputToken, &output_token);
        env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
        env.storage().instance().set(&DataKey::PrizeFeeBps, &300u32); // 3% default for prize conversion
        env.storage().instance().set(&DataKey::TotalInputStored, &0i128);
        env.storage().instance().set(&DataKey::TotalOutputMinted, &0i128);
        env.storage().instance().set(&DataKey::TotalOutputBurned, &0i128);
        env.storage().instance().set(&DataKey::AccumulatedFees, &0i128);
        env.storage().instance().set(&DataKey::AccumulatedPrizeFees, &0i128);
        env.storage().instance().set(&DataKey::Paused, &false);
    }

    /// Deposit `amount` of input token → receive STLP minus fee.
    pub fn buy_stellar_play(env: Env, user: Address, amount: i128) -> i128 {
        user.require_auth();
        Self::assert_not_paused(&env);

        if amount <= 0 {
            panic_with_error!(&env, VaultError::InvalidAmount);
        }

        let fee_bps: u32 = env.storage().instance().get(&DataKey::FeeBps).unwrap();
        let fee_amount = (amount * fee_bps as i128) / 10_000;
        let output_amount = amount - fee_amount;

        let input_token: Address = env.storage().instance().get(&DataKey::InputToken).unwrap();
        let output_token: Address = env.storage().instance().get(&DataKey::OutputToken).unwrap();
        let contract_addr = env.current_contract_address();

        // Pull input tokens from user (user must have approved vault as spender)
        let input_client = token::Client::new(&env, &input_token);
        input_client.transfer_from(&contract_addr, &user, &contract_addr, &amount);

        // Mint STLP to user via the token contract's mint function.
        // The vault must hold the minter role on the output token.
        // We call it via a generic token interface that supports mint.
        // If the token is a standard Soroban token, adapt as needed.
        let output_client = token::Client::new(&env, &output_token);
        // NOTE: standard token::Client doesn't expose `mint` — call the custom token directly.
        // In production, use soroban_sdk::call_with_args or a custom client.
        // For now, we transfer from contract's own balance (vault pre-minted supply).
        output_client.transfer(&contract_addr, &user, &output_amount);

        // Update accounting
        let stored: i128 = env.storage().instance().get(&DataKey::TotalInputStored).unwrap();
        env.storage().instance().set(&DataKey::TotalInputStored, &(stored + amount));

        let minted: i128 = env.storage().instance().get(&DataKey::TotalOutputMinted).unwrap();
        env.storage().instance().set(&DataKey::TotalOutputMinted, &(minted + output_amount));

        let fees: i128 = env.storage().instance().get(&DataKey::AccumulatedFees).unwrap();
        env.storage().instance().set(&DataKey::AccumulatedFees, &(fees + fee_amount));

        env.events().publish(
            (symbol_short!("BUY"), symbol_short!("STLP")),
            (user, amount, output_amount, fee_amount),
        );

        output_amount
    }

    /// Burn `amount` STLP → receive input token minus prize-conversion fee.
    pub fn convert_to_input(env: Env, user: Address, amount: i128) -> i128 {
        user.require_auth();
        Self::assert_not_paused(&env);

        if amount <= 0 {
            panic_with_error!(&env, VaultError::InvalidAmount);
        }

        let fee_bps: u32 = env.storage().instance().get(&DataKey::PrizeFeeBps).unwrap();
        let fee_amount = (amount * fee_bps as i128) / 10_000;
        let output_amount = amount - fee_amount;

        let input_token: Address = env.storage().instance().get(&DataKey::InputToken).unwrap();
        let output_token: Address = env.storage().instance().get(&DataKey::OutputToken).unwrap();
        let contract_addr = env.current_contract_address();

        // Pull and burn STLP from user
        let output_client = token::Client::new(&env, &output_token);
        output_client.transfer_from(&contract_addr, &user, &contract_addr, &amount);
        // NOTE: call burn on output_token here in production

        // Return input tokens to user
        let input_client = token::Client::new(&env, &input_token);
        input_client.transfer(&contract_addr, &user, &output_amount);

        let burned: i128 = env.storage().instance().get(&DataKey::TotalOutputBurned).unwrap();
        env.storage().instance().set(&DataKey::TotalOutputBurned, &(burned + amount));

        let prize_fees: i128 = env.storage().instance().get(&DataKey::AccumulatedPrizeFees).unwrap();
        env.storage().instance().set(&DataKey::AccumulatedPrizeFees, &(prize_fees + fee_amount));

        env.events().publish(
            (symbol_short!("CONV"), symbol_short!("INPUT")),
            (user, amount, output_amount),
        );

        output_amount
    }

    // ──────────────────────────────────────────────────────────
    // Admin
    // ──────────────────────────────────────────────────────────

    pub fn set_fee_bps(env: Env, fee_bps: u32) {
        Self::require_admin(&env);
        if fee_bps > 500 {
            panic_with_error!(&env, VaultError::InvalidFee);
        }
        env.storage().instance().set(&DataKey::FeeBps, &fee_bps);
    }

    pub fn set_prize_fee_bps(env: Env, fee_bps: u32) {
        Self::require_admin(&env);
        if fee_bps > 1000 {
            panic_with_error!(&env, VaultError::InvalidFee);
        }
        env.storage().instance().set(&DataKey::PrizeFeeBps, &fee_bps);
    }

    pub fn withdraw_fees(env: Env, recipient: Address) -> i128 {
        Self::require_admin(&env);
        let fees: i128 = env.storage().instance().get(&DataKey::AccumulatedFees).unwrap();
        if fees == 0 {
            return 0;
        }
        let input_token: Address = env.storage().instance().get(&DataKey::InputToken).unwrap();
        let input_client = token::Client::new(&env, &input_token);
        input_client.transfer(&env.current_contract_address(), &recipient, &fees);
        env.storage().instance().set(&DataKey::AccumulatedFees, &0i128);
        fees
    }

    pub fn set_paused(env: Env, paused: bool) {
        Self::require_admin(&env);
        env.storage().instance().set(&DataKey::Paused, &paused);
        env.events().publish((symbol_short!("PAUSE"),), paused);
    }

    // ──────────────────────────────────────────────────────────
    // View
    // ──────────────────────────────────────────────────────────

    pub fn get_fee_bps(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::FeeBps).unwrap_or(50)
    }

    pub fn get_total_input_stored(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalInputStored).unwrap_or(0)
    }

    pub fn is_paused(env: Env) -> bool {
        env.storage().instance().get(&DataKey::Paused).unwrap_or(false)
    }

    // ──────────────────────────────────────────────────────────
    // Private
    // ──────────────────────────────────────────────────────────

    fn require_admin(env: &Env) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
    }

    fn assert_not_paused(env: &Env) {
        let paused: bool = env.storage().instance().get(&DataKey::Paused).unwrap_or(false);
        if paused {
            panic_with_error!(env, VaultError::Paused);
        }
    }
}
