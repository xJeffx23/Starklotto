#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, contracterror,
    panic_with_error, symbol_short,
    Address, Bytes, BytesN, Env, Vec,
    token,
};

// ============================================================
// Data Types
// ============================================================

#[contracttype]
#[derive(Clone)]
pub struct Ticket {
    pub player: Address,
    pub numbers: Vec<u32>,
    pub draw_id: u64,
    pub claimed: bool,
    pub prize_amount: i128,
    pub prize_assigned: bool,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone)]
pub struct Draw {
    pub draw_id: u64,
    pub accumulated_prize: i128,
    pub winning_numbers: Vec<u32>,
    pub is_active: bool,
    pub end_ledger: u32,
    pub distribution_done: bool,
    pub randomness_hash: BytesN<32>,
    pub randomness_committed: bool,
    pub ticket_count: u64,
}

#[contracttype]
pub enum DataKey {
    Admin,
    TokenContract,
    CurrentDrawId,
    TicketPrice,
    TotalTickets,
    Draw(u64),
    Ticket(u64, u64),           // (draw_id, ticket_id)
    DrawTicketCount(u64),
    UserTickets(Address, u64),  // (player, draw_id)
    TotalPrizesDistributed(u64),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum LotteryError {
    AlreadyInitialized      = 1,
    Unauthorized            = 2,
    DrawNotActive           = 3,
    DrawAlreadyActive       = 4,
    DrawNotFound            = 5,
    InvalidNumbers          = 6,
    InvalidQuantity         = 7,
    TicketNotFound          = 8,
    PrizeAlreadyClaimed     = 9,
    PrizeNotAssigned        = 10,
    RandomnessNotCommitted  = 11,
    RandomnessAlreadyCommitted = 12,
    InvalidRandomnessReveal = 13,
    DistributionNotDone     = 14,
    DistributionAlreadyDone = 15,
    DrawStillActive         = 16,
    DuplicateNumbers        = 17,
    NumberOutOfRange        = 18,
}

// ============================================================
// Contract
// ============================================================

#[contract]
pub struct LotteryContract;

#[contractimpl]
impl LotteryContract {
    /// One-time setup. Must be called before anything else.
    pub fn initialize(
        env: Env,
        admin: Address,
        token_contract: Address,
        ticket_price: i128,
    ) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, LotteryError::AlreadyInitialized);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::TokenContract, &token_contract);
        env.storage().instance().set(&DataKey::TicketPrice, &ticket_price);
        env.storage().instance().set(&DataKey::CurrentDrawId, &0u64);
        env.storage().instance().set(&DataKey::TotalTickets, &0u64);
    }

    /// Create a new draw. Only callable by admin when no draw is active.
    pub fn create_draw(env: Env, duration_ledgers: u32) -> u64 {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let current_id: u64 = env.storage().instance().get(&DataKey::CurrentDrawId).unwrap();

        if current_id > 0 {
            if let Some(draw) = env.storage().persistent().get::<DataKey, Draw>(&DataKey::Draw(current_id)) {
                if draw.is_active {
                    panic_with_error!(&env, LotteryError::DrawAlreadyActive);
                }
            }
        }

        let new_id = current_id + 1;
        let end_ledger = env.ledger().sequence() + duration_ledgers;
        let empty_numbers: Vec<u32> = Vec::new(&env);
        let empty_hash: BytesN<32> = BytesN::from_array(&env, &[0u8; 32]);

        let draw = Draw {
            draw_id: new_id,
            accumulated_prize: 0,
            winning_numbers: empty_numbers,
            is_active: true,
            end_ledger,
            distribution_done: false,
            randomness_hash: empty_hash,
            randomness_committed: false,
            ticket_count: 0,
        };

        env.storage().persistent().set(&DataKey::Draw(new_id), &draw);
        env.storage().instance().set(&DataKey::CurrentDrawId, &new_id);

        env.events().publish(
            (symbol_short!("DRAW"), symbol_short!("CREATED")),
            (new_id, end_ledger),
        );

        new_id
    }

    /// Purchase 1–10 tickets for an active draw.
    /// `numbers` is a Vec of Vecs — one inner Vec per ticket, each with 5 numbers [1–40].
    /// Caller must have approved this contract to spend `quantity * ticket_price` tokens.
    pub fn buy_ticket(
        env: Env,
        player: Address,
        draw_id: u64,
        numbers: Vec<Vec<u32>>,
        quantity: u32,
    ) {
        player.require_auth();

        if quantity == 0 || quantity > 10 {
            panic_with_error!(&env, LotteryError::InvalidQuantity);
        }
        if numbers.len() != quantity {
            panic_with_error!(&env, LotteryError::InvalidQuantity);
        }

        let mut draw: Draw = env.storage().persistent()
            .get(&DataKey::Draw(draw_id))
            .unwrap_or_else(|| panic_with_error!(&env, LotteryError::DrawNotFound));

        if !draw.is_active || env.ledger().sequence() > draw.end_ledger {
            panic_with_error!(&env, LotteryError::DrawNotActive);
        }

        // Validate each ticket's numbers before touching funds
        for i in 0..numbers.len() {
            let ticket_nums = numbers.get(i).unwrap();
            Self::validate_numbers(&env, &ticket_nums);
        }

        let ticket_price: i128 = env.storage().instance().get(&DataKey::TicketPrice).unwrap();
        let total_cost = ticket_price * (quantity as i128);

        // Pull payment: player must have approved lottery contract as spender
        let token_contract: Address = env.storage().instance().get(&DataKey::TokenContract).unwrap();
        let token_client = token::Client::new(&env, &token_contract);
        let contract_addr = env.current_contract_address();

        token_client.transfer_from(&contract_addr, &player, &contract_addr, &total_cost);

        // 55% goes to jackpot, 45% covers platform fees (handled off-chain via vault)
        let jackpot_contribution = (total_cost * 55) / 100;
        draw.accumulated_prize += jackpot_contribution;

        let mut total_tickets: u64 = env.storage().instance().get(&DataKey::TotalTickets).unwrap();
        let mut user_tickets: Vec<u64> = env.storage().persistent()
            .get(&DataKey::UserTickets(player.clone(), draw_id))
            .unwrap_or_else(|| Vec::new(&env));

        for i in 0..numbers.len() {
            let ticket_nums = numbers.get(i).unwrap();
            total_tickets += 1;
            draw.ticket_count += 1;
            let ticket_id = total_tickets;

            let ticket = Ticket {
                player: player.clone(),
                numbers: ticket_nums.clone(),
                draw_id,
                claimed: false,
                prize_amount: 0,
                prize_assigned: false,
                timestamp: env.ledger().timestamp(),
            };

            env.storage().persistent().set(&DataKey::Ticket(draw_id, ticket_id), &ticket);
            user_tickets.push_back(ticket_id);

            env.events().publish(
                (symbol_short!("TICKET"), symbol_short!("BOUGHT")),
                (player.clone(), draw_id, ticket_id),
            );
        }

        env.storage().persistent().set(&DataKey::Draw(draw_id), &draw);
        env.storage().instance().set(&DataKey::TotalTickets, &total_tickets);
        env.storage().persistent().set(&DataKey::UserTickets(player.clone(), draw_id), &user_tickets);
        env.storage().persistent().set(&DataKey::DrawTicketCount(draw_id), &draw.ticket_count);
    }

    /// Phase 1 of randomness: admin commits sha256(seed_bytes || secret) before draw ends.
    /// The commitment prevents admin from cherry-picking a favorable seed after seeing tickets.
    pub fn commit_randomness(env: Env, draw_id: u64, hash: BytesN<32>) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let mut draw: Draw = env.storage().persistent()
            .get(&DataKey::Draw(draw_id))
            .unwrap_or_else(|| panic_with_error!(&env, LotteryError::DrawNotFound));

        if draw.randomness_committed {
            panic_with_error!(&env, LotteryError::RandomnessAlreadyCommitted);
        }

        draw.randomness_hash = hash;
        draw.randomness_committed = true;
        env.storage().persistent().set(&DataKey::Draw(draw_id), &draw);
    }

    /// Phase 2: admin reveals seed + secret after draw ends.
    /// Contract verifies sha256(seed || secret) == committed hash, then draws numbers.
    pub fn reveal_and_draw(env: Env, draw_id: u64, seed: u64, secret: BytesN<32>) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let mut draw: Draw = env.storage().persistent()
            .get(&DataKey::Draw(draw_id))
            .unwrap_or_else(|| panic_with_error!(&env, LotteryError::DrawNotFound));

        if !draw.is_active {
            panic_with_error!(&env, LotteryError::DrawNotActive);
        }
        if !draw.randomness_committed {
            panic_with_error!(&env, LotteryError::RandomnessNotCommitted);
        }
        if env.ledger().sequence() <= draw.end_ledger {
            panic_with_error!(&env, LotteryError::DrawStillActive);
        }

        // Verify: sha256(seed_bytes || secret) == committed hash
        let mut preimage = Bytes::new(&env);
        for byte in seed.to_be_bytes().iter() {
            preimage.push_back(*byte);
        }
        for i in 0..32u32 {
            preimage.push_back(secret.get(i).unwrap());
        }
        let computed = env.crypto().sha256(&preimage);
        for i in 0..32u32 {
            if computed.get(i).unwrap() != draw.randomness_hash.get(i).unwrap() {
                panic_with_error!(&env, LotteryError::InvalidRandomnessReveal);
            }
        }

        let winning_numbers = Self::derive_winning_numbers(&env, seed, draw_id);
        draw.winning_numbers = winning_numbers.clone();
        draw.is_active = false;
        env.storage().persistent().set(&DataKey::Draw(draw_id), &draw);

        env.events().publish(
            (symbol_short!("DRAW"), symbol_short!("DONE")),
            (draw_id, winning_numbers),
        );
    }

    /// Scan all tickets and assign prizes by match level.
    /// Prize pool percentages mirror the Starknet contract: 1/4/10/15/70%.
    pub fn distribute_prizes(env: Env, draw_id: u64) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let mut draw: Draw = env.storage().persistent()
            .get(&DataKey::Draw(draw_id))
            .unwrap_or_else(|| panic_with_error!(&env, LotteryError::DrawNotFound));

        if draw.is_active {
            panic_with_error!(&env, LotteryError::DrawStillActive);
        }
        if draw.distribution_done {
            panic_with_error!(&env, LotteryError::DistributionAlreadyDone);
        }

        let ticket_count: u64 = env.storage().persistent()
            .get(&DataKey::DrawTicketCount(draw_id))
            .unwrap_or(0);

        // Bucket ticket IDs by match count (1–5)
        let mut w1: Vec<u64> = Vec::new(&env);
        let mut w2: Vec<u64> = Vec::new(&env);
        let mut w3: Vec<u64> = Vec::new(&env);
        let mut w4: Vec<u64> = Vec::new(&env);
        let mut w5: Vec<u64> = Vec::new(&env);

        for i in 1..=ticket_count {
            if let Some(ticket) = env.storage().persistent().get::<DataKey, Ticket>(&DataKey::Ticket(draw_id, i)) {
                match Self::count_matches(&draw.winning_numbers, &ticket.numbers) {
                    1 => w1.push_back(i),
                    2 => w2.push_back(i),
                    3 => w3.push_back(i),
                    4 => w4.push_back(i),
                    5 => w5.push_back(i),
                    _ => {}
                }
            }
        }

        // [0%, 1%, 4%, 10%, 15%, 70%] — index = match count
        let prize_pct: [i128; 6] = [0, 1, 4, 10, 15, 70];
        let total_pool = draw.accumulated_prize;
        let mut total_distributed: i128 = 0;

        let buckets = [&w1, &w2, &w3, &w4, &w5];
        for (level_idx, bucket) in buckets.iter().enumerate() {
            let match_level = level_idx + 1;
            let count = bucket.len() as i128;
            if count == 0 {
                continue;
            }
            let level_pool = (total_pool * prize_pct[match_level]) / 100;
            let prize_per = level_pool / count;

            for j in 0..bucket.len() {
                let ticket_id = bucket.get(j).unwrap();
                let mut ticket: Ticket = env.storage().persistent()
                    .get(&DataKey::Ticket(draw_id, ticket_id))
                    .unwrap();
                ticket.prize_amount = prize_per;
                ticket.prize_assigned = true;
                env.storage().persistent().set(&DataKey::Ticket(draw_id, ticket_id), &ticket);
                total_distributed += prize_per;
            }
        }

        draw.distribution_done = true;
        env.storage().persistent().set(&DataKey::Draw(draw_id), &draw);
        env.storage().persistent().set(&DataKey::TotalPrizesDistributed(draw_id), &total_distributed);

        env.events().publish(
            (symbol_short!("PRIZES"), symbol_short!("DIST")),
            (draw_id, total_distributed),
        );
    }

    /// Ticket owner calls this to receive their prize.
    pub fn claim_prize(env: Env, draw_id: u64, ticket_id: u64) {
        let draw: Draw = env.storage().persistent()
            .get(&DataKey::Draw(draw_id))
            .unwrap_or_else(|| panic_with_error!(&env, LotteryError::DrawNotFound));

        if !draw.distribution_done {
            panic_with_error!(&env, LotteryError::DistributionNotDone);
        }

        let mut ticket: Ticket = env.storage().persistent()
            .get(&DataKey::Ticket(draw_id, ticket_id))
            .unwrap_or_else(|| panic_with_error!(&env, LotteryError::TicketNotFound));

        ticket.player.require_auth();

        if ticket.claimed {
            panic_with_error!(&env, LotteryError::PrizeAlreadyClaimed);
        }
        if !ticket.prize_assigned || ticket.prize_amount == 0 {
            panic_with_error!(&env, LotteryError::PrizeNotAssigned);
        }

        let token_contract: Address = env.storage().instance().get(&DataKey::TokenContract).unwrap();
        let token_client = token::Client::new(&env, &token_contract);
        let contract_addr = env.current_contract_address();

        token_client.transfer(&contract_addr, &ticket.player, &ticket.prize_amount);

        ticket.claimed = true;
        env.storage().persistent().set(&DataKey::Ticket(draw_id, ticket_id), &ticket);

        env.events().publish(
            (symbol_short!("PRIZE"), symbol_short!("CLAIMED")),
            (draw_id, ticket_id, ticket.player.clone(), ticket.prize_amount),
        );
    }

    // ============================================================
    // View functions
    // ============================================================

    pub fn get_ticket_price(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TicketPrice).unwrap_or(0)
    }

    pub fn get_current_draw_id(env: Env) -> u64 {
        env.storage().instance().get(&DataKey::CurrentDrawId).unwrap_or(0)
    }

    pub fn get_draw(env: Env, draw_id: u64) -> Option<Draw> {
        env.storage().persistent().get(&DataKey::Draw(draw_id))
    }

    pub fn get_ticket(env: Env, draw_id: u64, ticket_id: u64) -> Option<Ticket> {
        env.storage().persistent().get(&DataKey::Ticket(draw_id, ticket_id))
    }

    pub fn get_user_tickets(env: Env, player: Address, draw_id: u64) -> Vec<u64> {
        env.storage().persistent()
            .get(&DataKey::UserTickets(player, draw_id))
            .unwrap_or_else(|| Vec::new(&env))
    }

    pub fn get_ledgers_remaining(env: Env, draw_id: u64) -> u32 {
        if let Some(draw) = env.storage().persistent().get::<DataKey, Draw>(&DataKey::Draw(draw_id)) {
            let current = env.ledger().sequence();
            if draw.end_ledger > current {
                return draw.end_ledger - current;
            }
        }
        0
    }

    // ============================================================
    // Private helpers
    // ============================================================

    fn validate_numbers(env: &Env, numbers: &Vec<u32>) {
        if numbers.len() != 5 {
            panic_with_error!(env, LotteryError::InvalidNumbers);
        }
        for i in 0..numbers.len() {
            let n = numbers.get(i).unwrap();
            if n < 1 || n > 40 {
                panic_with_error!(env, LotteryError::NumberOutOfRange);
            }
            for j in (i + 1)..numbers.len() {
                if n == numbers.get(j).unwrap() {
                    panic_with_error!(env, LotteryError::DuplicateNumbers);
                }
            }
        }
    }

    fn count_matches(winning: &Vec<u32>, ticket: &Vec<u32>) -> u32 {
        let mut count = 0u32;
        for i in 0..winning.len() {
            let w = winning.get(i).unwrap();
            for j in 0..ticket.len() {
                if w == ticket.get(j).unwrap() {
                    count += 1;
                }
            }
        }
        count
    }

    /// Derives 5 unique numbers in [1,40] from a seed using iterative SHA-256.
    /// Each iteration hashes (seed || draw_id || counter) to avoid bias.
    fn derive_winning_numbers(env: &Env, seed: u64, draw_id: u64) -> Vec<u32> {
        let mut numbers: Vec<u32> = Vec::new(env);
        let mut counter: u64 = 0;

        while numbers.len() < 5 {
            let mut preimage = Bytes::new(env);
            for b in seed.to_be_bytes().iter() {
                preimage.push_back(*b);
            }
            for b in draw_id.to_be_bytes().iter() {
                preimage.push_back(*b);
            }
            for b in counter.to_be_bytes().iter() {
                preimage.push_back(*b);
            }

            let hash = env.crypto().sha256(&preimage);

            // Take the first 4 bytes of the hash as a u32, map into [1,40]
            let n = ((hash.get(0).unwrap() as u32) << 24
                | (hash.get(1).unwrap() as u32) << 16
                | (hash.get(2).unwrap() as u32) << 8
                | hash.get(3).unwrap() as u32)
                % 40
                + 1;

            let mut duplicate = false;
            for k in 0..numbers.len() {
                if numbers.get(k).unwrap() == n {
                    duplicate = true;
                    break;
                }
            }

            if !duplicate {
                numbers.push_back(n);
            }
            counter += 1;
        }

        numbers
    }
}
