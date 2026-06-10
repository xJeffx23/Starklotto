#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror,
    panic_with_error, symbol_short,
    Address, Env, String,
};

// ============================================================
// Storage
// ============================================================

#[contracttype]
pub enum DataKey {
    Admin,
    Name,
    Symbol,
    Decimals,
    TotalSupply,
    Balance(Address),
    Allowance(Address, Address), // (owner, spender)
    MinterRole(Address),
    BurnerRole(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum TokenError {
    AlreadyInitialized = 1,
    Unauthorized       = 2,
    InsufficientBalance = 3,
    InsufficientAllowance = 4,
    InvalidAmount      = 5,
    AllowanceExpired   = 6,
}

// ============================================================
// Contract — StellarPlay Token (STLP)
// ============================================================

#[contract]
pub struct StellarPlayToken;

#[contractimpl]
impl StellarPlayToken {
    pub fn initialize(
        env: Env,
        admin: Address,
        name: String,
        symbol: String,
        decimals: u32,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, TokenError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Name, &name);
        env.storage().instance().set(&DataKey::Symbol, &symbol);
        env.storage().instance().set(&DataKey::Decimals, &decimals);
        env.storage().instance().set(&DataKey::TotalSupply, &0i128);
    }

    // ──────────────────────────────────────────────────────────
    // Role management
    // ──────────────────────────────────────────────────────────

    pub fn grant_minter(env: Env, minter: Address) {
        Self::require_admin(&env);
        env.storage().persistent().set(&DataKey::MinterRole(minter.clone()), &true);
        env.events().publish((symbol_short!("MINTER"), symbol_short!("GRANT")), minter);
    }

    pub fn revoke_minter(env: Env, minter: Address) {
        Self::require_admin(&env);
        env.storage().persistent().remove(&DataKey::MinterRole(minter.clone()));
        env.events().publish((symbol_short!("MINTER"), symbol_short!("REVOKE")), minter);
    }

    pub fn grant_burner(env: Env, burner: Address) {
        Self::require_admin(&env);
        env.storage().persistent().set(&DataKey::BurnerRole(burner.clone()), &true);
    }

    pub fn revoke_burner(env: Env, burner: Address) {
        Self::require_admin(&env);
        env.storage().persistent().remove(&DataKey::BurnerRole(burner.clone()));
    }

    // ──────────────────────────────────────────────────────────
    // Mint / Burn
    // ──────────────────────────────────────────────────────────

    pub fn mint(env: Env, caller: Address, to: Address, amount: i128) {
        caller.require_auth();
        if !env.storage().persistent().has(&DataKey::MinterRole(caller.clone())) {
            let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
            if caller != admin {
                panic_with_error!(&env, TokenError::Unauthorized);
            }
        }
        if amount <= 0 {
            panic_with_error!(&env, TokenError::InvalidAmount);
        }

        let bal = Self::balance_of(&env, &to);
        env.storage().persistent().set(&DataKey::Balance(to.clone()), &(bal + amount));

        let supply: i128 = env.storage().instance().get(&DataKey::TotalSupply).unwrap();
        env.storage().instance().set(&DataKey::TotalSupply, &(supply + amount));

        env.events().publish((symbol_short!("MINT"),), (to, amount));
    }

    pub fn burn(env: Env, from: Address, amount: i128) {
        from.require_auth();
        Self::do_burn(&env, &from, amount);
    }

    pub fn burn_from(env: Env, caller: Address, from: Address, amount: i128) {
        caller.require_auth();
        if !env.storage().persistent().has(&DataKey::BurnerRole(caller.clone())) {
            let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
            if caller != admin {
                panic_with_error!(&env, TokenError::Unauthorized);
            }
        }
        Self::do_burn(&env, &from, amount);
    }

    // ──────────────────────────────────────────────────────────
    // SEP-0041 core interface
    // ──────────────────────────────────────────────────────────

    pub fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        env.storage().persistent()
            .get(&DataKey::Allowance(from, spender))
            .unwrap_or(0)
    }

    /// `expiration_ledger` is informational here; enforcement is left for v2.
    pub fn approve(env: Env, from: Address, spender: Address, amount: i128, _expiration_ledger: u32) {
        from.require_auth();
        if amount < 0 {
            panic_with_error!(&env, TokenError::InvalidAmount);
        }
        env.storage().persistent().set(&DataKey::Allowance(from.clone(), spender.clone()), &amount);
        env.events().publish((symbol_short!("APPROVE"),), (from, spender, amount));
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        Self::balance_of(&env, &id)
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        Self::do_transfer(&env, &from, &to, amount);
    }

    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        let allowance = Self::allowance(env.clone(), from.clone(), spender.clone());
        if allowance < amount {
            panic_with_error!(&env, TokenError::InsufficientAllowance);
        }
        env.storage().persistent().set(
            &DataKey::Allowance(from.clone(), spender.clone()),
            &(allowance - amount),
        );
        Self::do_transfer(&env, &from, &to, amount);
    }

    pub fn decimals(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::Decimals).unwrap_or(7)
    }

    pub fn name(env: Env) -> String {
        env.storage().instance().get(&DataKey::Name).unwrap()
    }

    pub fn symbol(env: Env) -> String {
        env.storage().instance().get(&DataKey::Symbol).unwrap()
    }

    pub fn total_supply(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalSupply).unwrap_or(0)
    }

    // ──────────────────────────────────────────────────────────
    // Private
    // ──────────────────────────────────────────────────────────

    fn balance_of(env: &Env, id: &Address) -> i128 {
        env.storage().persistent().get(&DataKey::Balance(id.clone())).unwrap_or(0)
    }

    fn do_transfer(env: &Env, from: &Address, to: &Address, amount: i128) {
        if amount <= 0 {
            panic_with_error!(env, TokenError::InvalidAmount);
        }
        let from_bal = Self::balance_of(env, from);
        if from_bal < amount {
            panic_with_error!(env, TokenError::InsufficientBalance);
        }
        env.storage().persistent().set(&DataKey::Balance(from.clone()), &(from_bal - amount));
        let to_bal = Self::balance_of(env, to);
        env.storage().persistent().set(&DataKey::Balance(to.clone()), &(to_bal + amount));
        env.events().publish((symbol_short!("TRANSFER"),), (from.clone(), to.clone(), amount));
    }

    fn do_burn(env: &Env, from: &Address, amount: i128) {
        if amount <= 0 {
            panic_with_error!(env, TokenError::InvalidAmount);
        }
        let bal = Self::balance_of(env, from);
        if bal < amount {
            panic_with_error!(env, TokenError::InsufficientBalance);
        }
        env.storage().persistent().set(&DataKey::Balance(from.clone()), &(bal - amount));
        let supply: i128 = env.storage().instance().get(&DataKey::TotalSupply).unwrap();
        env.storage().instance().set(&DataKey::TotalSupply, &(supply - amount));
        env.events().publish((symbol_short!("BURN"),), (from.clone(), amount));
    }

    fn require_admin(env: &Env) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
    }
}
