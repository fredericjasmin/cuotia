extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    vec, Address, Env, String,
};

const CONTRIBUTION: i128 = 10_0000000; // 10 USDC in stroops
const ROUNDS: u32 = 3;

struct Setup<'a> {
    env: Env,
    cuotia: CuotiaClient<'a>,
    token: TokenClient<'a>,
    contract: Address,
    ana: Address,
    luis: Address,
}

fn setup() -> Setup<'static> {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|ledger| {
        ledger.timestamp = 1_800_000_000;
        ledger.sequence_number = 1_000;
    });
    let admin = Address::generate(&env);
    let sac = env.register_stellar_asset_contract_v2(admin);
    let token = TokenClient::new(&env, &sac.address());
    let minter = StellarAssetClient::new(&env, &sac.address());
    let contract = env.register(Cuotia, ());
    let cuotia = CuotiaClient::new(&env, &contract);
    let ana = Address::generate(&env);
    let luis = Address::generate(&env);
    minter.mint(&ana, &(CONTRIBUTION * 10));
    minter.mint(&luis, &(CONTRIBUTION * 10));
    Setup { env, cuotia, token, contract, ana, luis }
}

fn create(s: &Setup) -> u32 {
    let members = vec![
        &s.env,
        CircleMember { address: s.ana.clone(), name: String::from_str(&s.env, "Ana") },
        CircleMember { address: s.luis.clone(), name: String::from_str(&s.env, "Luis") },
    ];
    s.cuotia.create_circle(
        &s.ana,
        &s.token.address,
        &String::from_str(&s.env, "Ahorro Navidad"),
        &String::from_str(&s.env, "weekly"),
        &members,
        &CONTRIBUTION,
        &ROUNDS,
        &false,
    )
}

fn next_round(s: &Setup, id: u32) {
    let due = s.cuotia.get_circle(&id).round_due_at;
    s.env.ledger().with_mut(|ledger| {
        ledger.timestamp = due;
        ledger.sequence_number += 100_000;
    });
    s.cuotia.advance_round(&id);
}

#[test]
fn auto_pay_is_off_by_default() {
    let s = setup();
    let id = create(&s);
    let circle = s.cuotia.get_circle(&id);
    assert_eq!(circle.auto_pay, vec![&s.env, false, false]);
    assert_eq!(s.token.allowance(&s.ana, &s.contract), 0);
    assert_eq!(s.cuotia.try_collect(&id, &s.ana), Err(Ok(CircleError::AutoPayDisabled)));
}

#[test]
fn enabling_grants_allowance_for_remaining_rounds_only() {
    let s = setup();
    let id = create(&s);
    s.cuotia.set_auto_pay(&id, &s.ana, &true);
    assert_eq!(s.cuotia.get_circle(&id).auto_pay, vec![&s.env, true, false]);
    assert_eq!(s.token.allowance(&s.ana, &s.contract), CONTRIBUTION * ROUNDS as i128);
    // Luis did not opt in: nothing can be pulled from him.
    assert_eq!(s.token.allowance(&s.luis, &s.contract), 0);
    assert_eq!(s.cuotia.try_collect(&id, &s.luis), Err(Ok(CircleError::AutoPayDisabled)));
}

#[test]
fn collect_pulls_one_contribution_without_member_signature() {
    let s = setup();
    let id = create(&s);
    s.cuotia.set_auto_pay(&id, &s.ana, &true);

    s.cuotia.collect(&id, &s.ana);
    // The member did not have to authorize the collection itself.
    assert!(s.env.auths().is_empty());

    let circle = s.cuotia.get_circle(&id);
    assert_eq!(circle.contributed, vec![&s.env, true, false]);
    assert_eq!(circle.paid_totals.get(0).unwrap(), CONTRIBUTION);
    assert_eq!(s.token.balance(&s.ana), CONTRIBUTION * 9);
    assert_eq!(s.token.balance(&s.contract), CONTRIBUTION);
    assert_eq!(s.token.allowance(&s.ana, &s.contract), CONTRIBUTION * 2);
    // Only once per round.
    assert_eq!(s.cuotia.try_collect(&id, &s.ana), Err(Ok(CircleError::AlreadyContributed)));
}

#[test]
fn disabling_revokes_the_allowance() {
    let s = setup();
    let id = create(&s);
    s.cuotia.set_auto_pay(&id, &s.ana, &true);
    s.cuotia.set_auto_pay(&id, &s.ana, &false);
    assert_eq!(s.token.allowance(&s.ana, &s.contract), 0);
    assert_eq!(s.cuotia.get_circle(&id).auto_pay, vec![&s.env, false, false]);
    assert_eq!(s.cuotia.try_collect(&id, &s.ana), Err(Ok(CircleError::AutoPayDisabled)));
    // Manual payment still works.
    s.cuotia.contribute(&id, &s.ana);
    assert_eq!(s.cuotia.get_circle(&id).contributed, vec![&s.env, true, false]);
}

#[test]
fn toggling_twice_is_a_no_op() {
    let s = setup();
    let id = create(&s);
    s.cuotia.set_auto_pay(&id, &s.ana, &true);
    s.cuotia.set_auto_pay(&id, &s.ana, &true);
    assert_eq!(s.token.allowance(&s.ana, &s.contract), CONTRIBUTION * ROUNDS as i128);
}

#[test]
fn allowances_from_two_circles_add_up() {
    let s = setup();
    let first = create(&s);
    let second = create(&s);
    s.cuotia.set_auto_pay(&first, &s.ana, &true);
    s.cuotia.set_auto_pay(&second, &s.ana, &true);
    assert_eq!(s.token.allowance(&s.ana, &s.contract), CONTRIBUTION * 2 * ROUNDS as i128);
    s.cuotia.set_auto_pay(&first, &s.ana, &false);
    assert_eq!(s.token.allowance(&s.ana, &s.contract), CONTRIBUTION * ROUNDS as i128);
    s.cuotia.collect(&second, &s.ana);
    assert_eq!(s.cuotia.try_collect(&first, &s.ana), Err(Ok(CircleError::AutoPayDisabled)));
}

#[test]
fn full_cycle_mixing_automatic_and_manual_members() {
    let s = setup();
    let id = create(&s);
    s.cuotia.set_auto_pay(&id, &s.ana, &true);
    for round in 0..ROUNDS {
        s.cuotia.collect(&id, &s.ana);
        s.cuotia.contribute(&id, &s.luis);
        if round + 1 < ROUNDS {
            next_round(&s, id);
        }
    }
    let circle = s.cuotia.get_circle(&id);
    assert_eq!(circle.status, CircleStatus::Complete);
    assert_eq!(s.token.allowance(&s.ana, &s.contract), 0);
    assert_eq!(s.cuotia.claim(&id, &s.ana), CONTRIBUTION * ROUNDS as i128);
    assert_eq!(s.cuotia.claim(&id, &s.luis), CONTRIBUTION * ROUNDS as i128);
    assert_eq!(s.token.balance(&s.ana), CONTRIBUTION * 10);
    assert_eq!(s.token.balance(&s.contract), 0);
}

#[test]
fn enabling_after_paying_the_current_round_skips_it() {
    let s = setup();
    let id = create(&s);
    s.cuotia.contribute(&id, &s.ana);
    s.cuotia.set_auto_pay(&id, &s.ana, &true);
    assert_eq!(s.token.allowance(&s.ana, &s.contract), CONTRIBUTION * (ROUNDS as i128 - 1));
    assert_eq!(s.cuotia.try_collect(&id, &s.ana), Err(Ok(CircleError::AlreadyContributed)));
}

#[test]
fn collect_respects_the_contribution_window() {
    let s = setup();
    let id = create(&s);
    s.cuotia.set_auto_pay(&id, &s.ana, &true);
    let due = s.cuotia.get_circle(&id).round_due_at;
    s.env.ledger().with_mut(|ledger| ledger.timestamp = due + GRACE_PERIOD_SECONDS + 1);
    assert_eq!(s.cuotia.try_collect(&id, &s.ana), Err(Ok(CircleError::ContributionWindowClosed)));
}

#[test]
fn collect_fails_without_balance() {
    let s = setup();
    let id = create(&s);
    s.cuotia.set_auto_pay(&id, &s.ana, &true);
    s.token.transfer(&s.ana, &s.luis, &(CONTRIBUTION * 10));
    assert!(s.cuotia.try_collect(&id, &s.ana).is_err());
    assert_eq!(s.cuotia.get_circle(&id).contributed, vec![&s.env, false, false]);
}

#[test]
fn only_members_can_enable_auto_pay() {
    let s = setup();
    let id = create(&s);
    let stranger = Address::generate(&s.env);
    assert_eq!(s.cuotia.try_set_auto_pay(&id, &stranger, &true), Err(Ok(CircleError::NotAMember)));
}
