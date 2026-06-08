// CU-04: Ejecutar Sorteo (Execute Draw Numbers)
// Tests for RequestRandomGeneration and DrawNumbers functions.
// Covers the admin flow: request randomness → execute draw → verify results.

use contracts::Lottery::{ILotteryDispatcher, ILotteryDispatcherTrait, Lottery};
use contracts::StarkPlayERC20::{IMintableDispatcher, IMintableDispatcherTrait};
use openzeppelin_testing::declare_and_deploy;
use openzeppelin_token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
use snforge_std::{
    CheatSpan, ContractClassTrait, DeclareResultTrait, EventSpyAssertionsTrait, EventSpyTrait,
    cheat_block_timestamp, cheat_caller_address, declare, spy_events, start_cheat_caller_address,
    start_mock_call, stop_cheat_caller_address, stop_mock_call,
};
use starknet::ContractAddress;

const OWNER: ContractAddress = 0x02dA5254690b46B9C4059C25366D1778839BE63C142d899F0306fd5c312A5918
    .try_into()
    .unwrap();

const USER1: ContractAddress = 0x03dA5254690b46B9C4059C25366D1778839BE63C142d899F0306fd5c312A5919
    .try_into()
    .unwrap();

const TICKET_PRICE: u256 = 1000000000000000000;

fn owner_address() -> ContractAddress {
    OWNER
}

fn deploy_mock_strk_play() -> ContractAddress {
    let contract_class = declare("StarkPlayERC20").unwrap().contract_class();
    let mut calldata = array![owner_address().into(), owner_address().into()];
    let (contract_address, _) = contract_class.deploy(@calldata).unwrap();
    contract_address
}

fn deploy_mock_vault(strk_play_address: ContractAddress) -> ContractAddress {
    let contract_class = declare("StarkPlayVault").unwrap().contract_class();
    let mut calldata = array![owner_address().into(), strk_play_address.into(), 50_u64.into()];
    let (contract_address, _) = contract_class.deploy(@calldata).unwrap();
    contract_address
}

fn deploy_mock_randomness() -> ContractAddress {
    let randomness_contract = declare("MockRandomness").unwrap().contract_class();
    let (randomness_address, _) = randomness_contract.deploy(@array![]).unwrap();
    randomness_address
}

fn deploy_lottery() -> (ContractAddress, ContractAddress, ContractAddress) {
    let mock_strk_play = deploy_mock_strk_play();
    let mock_vault = deploy_mock_vault(mock_strk_play);
    let randomness_address = deploy_mock_randomness();

    let mut calldata = array![
        owner_address().into(),
        mock_strk_play.into(),
        mock_vault.into(),
        randomness_address.into(),
    ];
    let lottery_address = declare_and_deploy("Lottery", calldata);

    (lottery_address, mock_strk_play, mock_vault)
}

fn setup_initialized_lottery() -> (ContractAddress, ContractAddress, ContractAddress) {
    let (lottery_address, mock_strk_play, mock_vault) = deploy_lottery();
    let lottery = ILotteryDispatcher { contract_address: lottery_address };

    cheat_caller_address(lottery_address, OWNER, CheatSpan::TargetCalls(1));
    lottery.Initialize(TICKET_PRICE);

    (lottery_address, mock_strk_play, mock_vault)
}

//=======================================================================================
// Phase 1: RequestRandomGeneration Tests
//=======================================================================================

#[test]
fn test_request_random_generation_success() {
    let (lottery_address, _, _) = setup_initialized_lottery();
    let lottery = ILotteryDispatcher { contract_address: lottery_address };

    cheat_caller_address(lottery_address, OWNER, CheatSpan::TargetCalls(1));
    let generation_id = lottery.RequestRandomGeneration(1_u64, 12345_u64);

    assert(generation_id == 1, 'Generation ID should be 1');
}

#[test]
fn test_request_random_generation_returns_correct_id() {
    let (lottery_address, _, _) = setup_initialized_lottery();
    let lottery = ILotteryDispatcher { contract_address: lottery_address };

    // First draw — generation_id starts at 1 in MockRandomness
    cheat_caller_address(lottery_address, OWNER, CheatSpan::TargetCalls(1));
    let gen_id = lottery.RequestRandomGeneration(1_u64, 99999_u64);

    assert(gen_id == 1, 'First gen ID should be 1');
}

#[should_panic(expected: 'Caller is not the owner')]
#[test]
fn test_request_random_generation_non_owner_fails() {
    let (lottery_address, _, _) = setup_initialized_lottery();
    let lottery = ILotteryDispatcher { contract_address: lottery_address };

    cheat_caller_address(lottery_address, USER1, CheatSpan::TargetCalls(1));
    lottery.RequestRandomGeneration(1_u64, 12345_u64);
}

#[should_panic(expected: 'Draw is not active')]
#[test]
fn test_request_random_generation_inactive_draw_fails() {
    let (lottery_address, _, _) = setup_initialized_lottery();
    let lottery = ILotteryDispatcher { contract_address: lottery_address };

    // Close the draw first
    cheat_caller_address(lottery_address, OWNER, CheatSpan::TargetCalls(1));
    lottery.DrawNumbers(1_u64);

    // Now request on the now-inactive draw
    cheat_caller_address(lottery_address, OWNER, CheatSpan::TargetCalls(1));
    lottery.RequestRandomGeneration(1_u64, 12345_u64);
}

#[should_panic(expected: 'Draw does not exist')]
#[test]
fn test_request_random_generation_nonexistent_draw_fails() {
    let (lottery_address, _, _) = setup_initialized_lottery();
    let lottery = ILotteryDispatcher { contract_address: lottery_address };

    cheat_caller_address(lottery_address, OWNER, CheatSpan::TargetCalls(1));
    lottery.RequestRandomGeneration(999_u64, 12345_u64);
}

//=======================================================================================
// Phase 2: DrawNumbers Tests
//=======================================================================================

#[test]
fn test_draw_numbers_success() {
    let (lottery_address, _, _) = setup_initialized_lottery();
    let lottery = ILotteryDispatcher { contract_address: lottery_address };

    cheat_caller_address(lottery_address, OWNER, CheatSpan::TargetCalls(1));
    lottery.DrawNumbers(1_u64);

    let is_active = lottery.IsDrawActive(1_u64);
    assert(!is_active, 'Draw should be inactive after draw');
}

#[should_panic(expected: 'Caller is not the owner')]
#[test]
fn test_draw_numbers_non_owner_fails() {
    let (lottery_address, _, _) = setup_initialized_lottery();
    let lottery = ILotteryDispatcher { contract_address: lottery_address };

    cheat_caller_address(lottery_address, USER1, CheatSpan::TargetCalls(1));
    lottery.DrawNumbers(1_u64);
}

#[should_panic(expected: 'Draw is not active')]
#[test]
fn test_draw_numbers_already_drawn_fails() {
    let (lottery_address, _, _) = setup_initialized_lottery();
    let lottery = ILotteryDispatcher { contract_address: lottery_address };

    // First draw succeeds
    cheat_caller_address(lottery_address, OWNER, CheatSpan::TargetCalls(1));
    lottery.DrawNumbers(1_u64);

    // Second draw on same draw ID must fail
    cheat_caller_address(lottery_address, OWNER, CheatSpan::TargetCalls(1));
    lottery.DrawNumbers(1_u64);
}

#[test]
fn test_draw_numbers_sets_winning_numbers() {
    let (lottery_address, _, _) = setup_initialized_lottery();
    let lottery = ILotteryDispatcher { contract_address: lottery_address };

    cheat_caller_address(lottery_address, OWNER, CheatSpan::TargetCalls(1));
    lottery.DrawNumbers(1_u64);

    let winning_numbers = lottery.GetWinningNumbers(1_u64);
    assert(winning_numbers.len() == 5, 'Should have 5 winning numbers');

    // MockRandomness always returns [5, 12, 23, 31, 38]
    assert(*winning_numbers.at(0) == 5, 'First number should be 5');
    assert(*winning_numbers.at(1) == 12, 'Second number should be 12');
    assert(*winning_numbers.at(2) == 23, 'Third number should be 23');
    assert(*winning_numbers.at(3) == 31, 'Fourth number should be 31');
    assert(*winning_numbers.at(4) == 38, 'Fifth number should be 38');
}

#[test]
fn test_draw_numbers_winning_numbers_in_valid_range() {
    let (lottery_address, _, _) = setup_initialized_lottery();
    let lottery = ILotteryDispatcher { contract_address: lottery_address };

    cheat_caller_address(lottery_address, OWNER, CheatSpan::TargetCalls(1));
    lottery.DrawNumbers(1_u64);

    let winning_numbers = lottery.GetWinningNumbers(1_u64);

    let mut i: usize = 0;
    while i < winning_numbers.len() {
        let num = *winning_numbers.at(i);
        assert(num >= 1 && num <= 40, 'Number out of valid range 1-40');
        i += 1;
    }
}

#[test]
fn test_draw_numbers_emits_event() {
    let (lottery_address, _, _) = setup_initialized_lottery();
    let lottery = ILotteryDispatcher { contract_address: lottery_address };

    let mut spy = spy_events();

    cheat_caller_address(lottery_address, OWNER, CheatSpan::TargetCalls(1));
    lottery.DrawNumbers(1_u64);

    let events = spy.get_events();
    assert(events.events.len() >= 1, 'Should emit at least 1 event');

    let (from, _) = events.events.at(0);
    assert(from == @lottery_address, 'Event must come from lottery');
}

#[test]
fn test_draw_numbers_emits_draw_completed_event() {
    let (lottery_address, _, _) = setup_initialized_lottery();
    let lottery = ILotteryDispatcher { contract_address: lottery_address };

    let mut spy = spy_events();

    cheat_caller_address(lottery_address, OWNER, CheatSpan::TargetCalls(1));
    lottery.DrawNumbers(1_u64);

    // MockRandomness returns [5, 12, 23, 31, 38]
    let expected = Lottery::Event::DrawCompleted(
        Lottery::DrawCompleted {
            drawId: 1_u64,
            winningNumbers: array![5_u16, 12_u16, 23_u16, 31_u16, 38_u16],
            accumulatedPrize: 0_u256,
        },
    );

    spy.assert_emitted(@array![(lottery_address, expected)]);
}

#[test]
fn test_draw_numbers_updates_draw_status() {
    let (lottery_address, _, _) = setup_initialized_lottery();
    let lottery = ILotteryDispatcher { contract_address: lottery_address };

    let status_before = lottery.GetDrawStatus(1_u64);
    assert(status_before, 'Draw should be active before');

    cheat_caller_address(lottery_address, OWNER, CheatSpan::TargetCalls(1));
    lottery.DrawNumbers(1_u64);

    let status_after = lottery.GetDrawStatus(1_u64);
    assert(!status_after, 'Draw should be inactive after');
}

//=======================================================================================
// Phase 3: Complete Draw Execution Flow (RequestRandomGeneration + DrawNumbers)
//=======================================================================================

#[test]
fn test_full_draw_execution_flow() {
    let (lottery_address, _, _) = setup_initialized_lottery();
    let lottery = ILotteryDispatcher { contract_address: lottery_address };

    // Step 1: Request random generation
    cheat_caller_address(lottery_address, OWNER, CheatSpan::TargetCalls(1));
    let gen_id = lottery.RequestRandomGeneration(1_u64, 42_u64);
    assert(gen_id == 1, 'Generation ID should be 1');

    // Step 2: Execute draw using generated randomness
    cheat_caller_address(lottery_address, OWNER, CheatSpan::TargetCalls(1));
    lottery.DrawNumbers(1_u64);

    // Step 3: Verify draw is finalized
    let is_active = lottery.IsDrawActive(1_u64);
    assert(!is_active, 'Draw should be inactive');

    // Step 4: Verify winning numbers are set
    let winning_numbers = lottery.GetWinningNumbers(1_u64);
    assert(winning_numbers.len() == 5, 'Should have 5 winning numbers');
}

#[test]
fn test_draw_blocks_ticket_purchase() {
    let (lottery_address, mock_strk_play, _) = setup_initialized_lottery();
    let lottery = ILotteryDispatcher { contract_address: lottery_address };

    // Execute draw to finalize it
    cheat_caller_address(lottery_address, OWNER, CheatSpan::TargetCalls(1));
    lottery.DrawNumbers(1_u64);

    // Verify draw is no longer active for purchases
    let is_active = lottery.IsDrawActive(1_u64);
    assert(!is_active, 'Draw must be inactive after draw');

    let draw_status = lottery.GetDrawStatus(1_u64);
    assert(!draw_status, 'Draw status should be false after draw');
}

#[test]
fn test_draw_sequence_multiple_draws() {
    let (lottery_address, _, _) = setup_initialized_lottery();
    let lottery = ILotteryDispatcher { contract_address: lottery_address };

    // Complete draw 1
    cheat_caller_address(lottery_address, OWNER, CheatSpan::TargetCalls(1));
    lottery.DrawNumbers(1_u64);

    assert(!lottery.IsDrawActive(1_u64), 'Draw 1 should be inactive');

    // Create and execute draw 2
    cheat_caller_address(lottery_address, OWNER, CheatSpan::TargetCalls(1));
    lottery.CreateNewDraw();

    let current_id = lottery.GetCurrentDrawId();
    assert(current_id == 2, 'Current draw should be 2');
    assert(lottery.IsDrawActive(2_u64), 'Draw 2 should be active');

    cheat_caller_address(lottery_address, OWNER, CheatSpan::TargetCalls(1));
    lottery.DrawNumbers(2_u64);

    assert(!lottery.IsDrawActive(2_u64), 'Draw 2 should be inactive after draw');

    // Both draws have valid winning numbers
    let numbers1 = lottery.GetWinningNumbers(1_u64);
    let numbers2 = lottery.GetWinningNumbers(2_u64);
    assert(numbers1.len() == 5, 'Draw 1 should have 5 numbers');
    assert(numbers2.len() == 5, 'Draw 2 should have 5 numbers');
}

#[test]
fn test_draw_numbers_winning_numbers_unique() {
    let (lottery_address, _, _) = setup_initialized_lottery();
    let lottery = ILotteryDispatcher { contract_address: lottery_address };

    cheat_caller_address(lottery_address, OWNER, CheatSpan::TargetCalls(1));
    lottery.DrawNumbers(1_u64);

    let winning_numbers = lottery.GetWinningNumbers(1_u64);

    // Verify no duplicate winning numbers
    let mut i: usize = 0;
    while i < 4 {
        let mut j: usize = i + 1;
        while j < 5 {
            assert(*winning_numbers.at(i) != *winning_numbers.at(j), 'No duplicate numbers');
            j += 1;
        }
        i += 1;
    }
}

#[test]
fn test_draw_after_tickets_purchased() {
    let (lottery_address, mock_strk_play, _) = setup_initialized_lottery();
    let lottery = ILotteryDispatcher { contract_address: lottery_address };

    // Simulate ticket purchase
    start_mock_call(mock_strk_play, selector!("balance_of"), TICKET_PRICE * 10_u256);
    start_mock_call(mock_strk_play, selector!("allowance"), TICKET_PRICE * 10_u256);
    start_mock_call(mock_strk_play, selector!("transfer_from"), true);

    cheat_caller_address(lottery_address, USER1, CheatSpan::TargetCalls(1));
    lottery.BuyTicket(1_u64, array![array![1_u16, 2_u16, 3_u16, 4_u16, 5_u16]], 1_u8);

    stop_mock_call(mock_strk_play, selector!("balance_of"));
    stop_mock_call(mock_strk_play, selector!("allowance"));
    stop_mock_call(mock_strk_play, selector!("transfer_from"));

    // Verify ticket was purchased
    let ticket_count = lottery.GetUserTicketsCount(1_u64, USER1);
    assert(ticket_count == 1, 'Should have 1 ticket');

    // Now execute the draw
    cheat_caller_address(lottery_address, OWNER, CheatSpan::TargetCalls(1));
    lottery.DrawNumbers(1_u64);

    let is_active = lottery.IsDrawActive(1_u64);
    assert(!is_active, 'Draw should be inactive after draw');

    let winning_numbers = lottery.GetWinningNumbers(1_u64);
    assert(winning_numbers.len() == 5, 'Should have 5 winning numbers');
}
