extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Ledger},
    token::{StellarAssetClient, TokenClient},
    vec, Address, BytesN, Env, String,
};

const CONTRIBUTION: i128 = 10_0000000; // 10 USDC in stroops
const ROUNDS: u32 = 3;
const CLAIM_FEE_BPS: u32 = 100; // 1%
const YIELD_FEE_BPS: u32 = 1_500; // 15%

struct Setup<'a> {
    env: Env,
    cuotia: CuotiaClient<'a>,
    token: TokenClient<'a>,
    contract: Address,
    treasury: Address,
    owner: Address,
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
    let treasury = Address::generate(&env);
    let owner = Address::generate(&env);
    let contract = env.register(Cuotia, (owner.clone(), treasury.clone(), CLAIM_FEE_BPS, YIELD_FEE_BPS));
    let cuotia = CuotiaClient::new(&env, &contract);
    let ana = Address::generate(&env);
    let luis = Address::generate(&env);
    minter.mint(&ana, &(CONTRIBUTION * 10));
    minter.mint(&luis, &(CONTRIBUTION * 10));
    Setup { env, cuotia, token, contract, treasury, owner, ana, luis }
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
    let saved = CONTRIBUTION * ROUNDS as i128;
    let fee = saved / 100;
    assert_eq!(s.cuotia.claim(&id, &s.ana), saved - fee);
    assert_eq!(s.cuotia.claim(&id, &s.luis), saved - fee);
    assert_eq!(s.token.balance(&s.ana), CONTRIBUTION * 10 - fee);
    assert_eq!(s.cuotia.accrued_fees(&s.token.address), fee * 2);
    assert_eq!(s.cuotia.withdraw_fees(&s.token.address), fee * 2);
    assert_eq!(s.token.balance(&s.treasury), fee * 2);
    assert_eq!(s.cuotia.accrued_fees(&s.token.address), 0);
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

#[test]
fn paying_manually_while_automatic_leaves_no_extra_allowance() {
    let s = setup();
    let id = create(&s);
    s.cuotia.set_auto_pay(&id, &s.ana, &true);
    s.cuotia.contribute(&id, &s.ana); // pays round 1 by hand before the collection
    assert_eq!(s.token.allowance(&s.ana, &s.contract), CONTRIBUTION * (ROUNDS as i128 - 1));
    assert_eq!(s.cuotia.auto_pay_grant(&s.ana, &s.token.address).committed, CONTRIBUTION * (ROUNDS as i128 - 1));
    s.cuotia.contribute(&id, &s.luis);
    for _ in 1..ROUNDS {
        next_round(&s, id);
        s.cuotia.collect(&id, &s.ana);
        s.cuotia.contribute(&id, &s.luis);
    }
    assert_eq!(s.cuotia.get_circle(&id).status, CircleStatus::Complete);
    assert_eq!(s.token.allowance(&s.ana, &s.contract), 0);
    assert_eq!(s.cuotia.auto_pay_grant(&s.ana, &s.token.address).committed, 0);
}

#[test]
fn disabling_after_cancellation_cleans_the_allowance() {
    let s = setup();
    let id = create(&s);
    s.cuotia.set_auto_pay(&id, &s.ana, &true);
    s.cuotia.collect(&id, &s.ana);
    let due = s.cuotia.get_circle(&id).round_due_at;
    s.env.ledger().with_mut(|ledger| ledger.timestamp = due + GRACE_PERIOD_SECONDS + 1);
    s.cuotia.cancel_circle(&id);
    assert_eq!(s.token.allowance(&s.ana, &s.contract), CONTRIBUTION * 2);
    s.cuotia.set_auto_pay(&id, &s.ana, &false);
    assert_eq!(s.token.allowance(&s.ana, &s.contract), 0);
    // Enabling is still blocked on a circle that is no longer active.
    assert_eq!(s.cuotia.try_set_auto_pay(&id, &s.ana, &true), Err(Ok(CircleError::CircleNotActive)));
}

#[test]
fn enabling_again_renews_the_expiration() {
    let s = setup();
    let id = create(&s);
    s.cuotia.set_auto_pay(&id, &s.ana, &true);
    let first = s.cuotia.auto_pay_grant(&s.ana, &s.token.address);
    assert!(first.expires_ledger > s.env.ledger().sequence());
    s.env.ledger().with_mut(|ledger| ledger.sequence_number += 50_000);
    s.cuotia.set_auto_pay(&id, &s.ana, &true);
    let renewed = s.cuotia.auto_pay_grant(&s.ana, &s.token.address);
    assert!(renewed.expires_ledger >= first.expires_ledger + 50_000 - 17_280);
    assert!(renewed.expires_ledger > first.expires_ledger);
    assert_eq!(renewed.committed, CONTRIBUTION * ROUNDS as i128);
    assert_eq!(s.token.allowance(&s.ana, &s.contract), CONTRIBUTION * ROUNDS as i128);
}

#[test]
fn grant_is_empty_by_default_and_after_disabling() {
    let s = setup();
    let id = create(&s);
    let empty = AutoPayGrant { committed: 0, expires_ledger: 0 };
    assert_eq!(s.cuotia.auto_pay_grant(&s.ana, &s.token.address), empty);
    s.cuotia.set_auto_pay(&id, &s.ana, &true);
    s.cuotia.set_auto_pay(&id, &s.ana, &false);
    assert_eq!(s.cuotia.auto_pay_grant(&s.ana, &s.token.address), empty);
}

fn complete_manually(s: &Setup, id: u32) {
    for round in 0..ROUNDS {
        s.cuotia.contribute(&id, &s.ana);
        s.cuotia.contribute(&id, &s.luis);
        if round + 1 < ROUNDS {
            next_round(s, id);
        }
    }
}

#[test]
fn fee_config_is_fixed_at_deployment_and_copied_to_each_circle() {
    let s = setup();
    let config = s.cuotia.fee_config();
    assert_eq!(config, FeeConfig { treasury: s.treasury.clone(), claim_fee_bps: CLAIM_FEE_BPS, yield_fee_bps: YIELD_FEE_BPS });
    let circle = s.cuotia.get_circle(&create(&s));
    assert_eq!((circle.claim_fee_bps, circle.yield_fee_bps), (CLAIM_FEE_BPS, YIELD_FEE_BPS));
}

#[test]
#[should_panic]
fn deployment_rejects_a_fee_above_the_cap() {
    let env = Env::default();
    let treasury = Address::generate(&env);
    env.register(Cuotia, (treasury.clone(), treasury, 1_001_u32, 0_u32));
}

#[test]
fn completed_claim_pays_one_percent_to_the_treasury() {
    let s = setup();
    let id = create(&s);
    complete_manually(&s, id);
    let saved = CONTRIBUTION * ROUNDS as i128;
    assert_eq!(s.cuotia.claim(&id, &s.ana), saved - saved / 100);
    assert_eq!(s.cuotia.accrued_fees(&s.token.address), saved / 100);
    assert_eq!(s.token.balance(&s.contract), saved + saved / 100);
}

#[test]
fn only_the_treasury_can_withdraw_fees() {
    let env = Env::default();
    let treasury = Address::generate(&env);
    let contract = env.register(Cuotia, (treasury.clone(), treasury, CLAIM_FEE_BPS, YIELD_FEE_BPS));
    let cuotia = CuotiaClient::new(&env, &contract);
    let token = Address::generate(&env);
    // No auth mocked: the treasury signature is missing.
    assert!(cuotia.try_withdraw_fees(&token).is_err());
}

#[test]
fn cancelled_circle_returns_everything_without_fee() {
    let s = setup();
    let id = create(&s);
    s.cuotia.contribute(&id, &s.ana);
    let due = s.cuotia.get_circle(&id).round_due_at;
    s.env.ledger().with_mut(|ledger| ledger.timestamp = due + GRACE_PERIOD_SECONDS + 1);
    s.cuotia.cancel_circle(&id);
    assert_eq!(s.cuotia.claim(&id, &s.ana), CONTRIBUTION);
    assert_eq!(s.token.balance(&s.ana), CONTRIBUTION * 10);
    assert_eq!(s.cuotia.accrued_fees(&s.token.address), 0);
}

#[test]
fn zero_fee_deployment_charges_nothing() {
    let s = setup();
    let contract = s.env.register(Cuotia, (s.owner.clone(), s.treasury.clone(), 0_u32, 0_u32));
    let cuotia = CuotiaClient::new(&s.env, &contract);
    let members = vec![
        &s.env,
        CircleMember { address: s.ana.clone(), name: String::from_str(&s.env, "Ana") },
        CircleMember { address: s.luis.clone(), name: String::from_str(&s.env, "Luis") },
    ];
    let id = cuotia.create_circle(&s.ana, &s.token.address, &String::from_str(&s.env, "Sin fee"), &String::from_str(&s.env, "weekly"), &members, &CONTRIBUTION, &1, &false);
    cuotia.contribute(&id, &s.ana);
    cuotia.contribute(&id, &s.luis);
    assert_eq!(cuotia.claim(&id, &s.ana), CONTRIBUTION);
    assert_eq!(cuotia.accrued_fees(&s.token.address), 0);
}

#[test]
fn fee_on_yield_only_touches_the_gain() {
    let s = setup();
    let id = create(&s);
    let mut circle = s.cuotia.get_circle(&id);
    circle.claim_fee_bps = 100;
    circle.yield_fee_bps = 1_500;
    // 100 saved, 110 withdrawn: 1 on principal + 15% of 10.
    assert_eq!(claim_fee(&circle, 100_0000000, 110_0000000), Ok(1_0000000 + 1_5000000));
    // Vault lost value: no yield fee, and never more than what is withdrawn.
    assert_eq!(claim_fee(&circle, 100_0000000, 90_0000000), Ok(1_0000000));
    circle.claim_fee_bps = 1_000;
    assert_eq!(claim_fee(&circle, 100_0000000, 5_0000000), Ok(5_0000000));
}

#[test]
fn accepts_up_to_25_members_and_520_rounds() {
    let s = setup();
    let mut members = vec![&s.env, CircleMember { address: s.ana.clone(), name: String::from_str(&s.env, "Ana") }];
    for _ in 1..25 {
        members.push_back(CircleMember { address: Address::generate(&s.env), name: String::from_str(&s.env, "Integrante con nombre largo") });
    }
    let name = String::from_str(&s.env, "Ahorro largo");
    let weekly = String::from_str(&s.env, "weekly");
    let id = s.cuotia.create_circle(&s.ana, &s.token.address, &name, &weekly, &members, &CONTRIBUTION, &520, &false);
    let circle = s.cuotia.get_circle(&id);
    assert_eq!(circle.members.len(), 25);
    assert_eq!(circle.contributed.len(), 25);
    assert_eq!(circle.rounds_total, 520);
    s.cuotia.set_auto_pay(&id, &s.ana, &true);
    assert_eq!(s.token.allowance(&s.ana, &s.contract), CONTRIBUTION * 520);

    members.push_back(CircleMember { address: Address::generate(&s.env), name: String::from_str(&s.env, "26") });
    assert_eq!(s.cuotia.try_create_circle(&s.ana, &s.token.address, &name, &weekly, &members, &CONTRIBUTION, &1, &false), Err(Ok(CircleError::InvalidMemberCount)));
    members.pop_back();
    assert_eq!(s.cuotia.try_create_circle(&s.ana, &s.token.address, &name, &weekly, &members, &CONTRIBUTION, &521, &false), Err(Ok(CircleError::InvalidRoundCount)));
}

#[test]
fn large_contributions_have_no_cap() {
    let s = setup();
    let members = vec![
        &s.env,
        CircleMember { address: s.ana.clone(), name: String::from_str(&s.env, "Ana") },
        CircleMember { address: s.luis.clone(), name: String::from_str(&s.env, "Luis") },
    ];
    let big: i128 = 50_000_000 * 10_000_000; // 50 million USDC per round
    let id = s.cuotia.create_circle(&s.ana, &s.token.address, &String::from_str(&s.env, "Grande"), &String::from_str(&s.env, "monthly"), &members, &big, &520, &false);
    assert_eq!(s.cuotia.get_circle(&id).contribution, big);
}

#[test]
fn storage_stays_alive_longer_than_a_monthly_round() {
    let s = setup();
    let id = create(&s);
    let ttl = s.env.as_contract(&s.contract, || {
        s.env.storage().persistent().get_ttl(&DataKey::Circle(id))
    });
    // At least 60 days of ledgers (~5 s each), so a 30-day round plus grace never lapses.
    assert!(ttl > 17_280 * 60, "circle ttl {ttl}");
}

#[test]
fn listing_a_full_page_of_25_member_circles_fits_network_limits() {
    let s = setup();
    let mut members = vec![&s.env, CircleMember { address: s.ana.clone(), name: String::from_str(&s.env, "Ana") }];
    for _ in 1..25 {
        members.push_back(CircleMember { address: Address::generate(&s.env), name: String::from_str(&s.env, "Integrante con un nombre bastante largo") });
    }
    for _ in 0..30 {
        s.cuotia.create_circle(&s.ana, &s.token.address, &String::from_str(&s.env, "Ahorro grande de prueba"), &String::from_str(&s.env, "weekly"), &members, &CONTRIBUTION, &520, &false);
    }
    s.cuotia.list_circles(&1, &30);
    let resources = s.env.cost_estimate().resources();
    std::println!("list 30x25: {resources:?}");
    // Well under Stellar's per-transaction limits (100M+ instructions, 100+ entries read).
    assert!(resources.instructions < 50_000_000, "instructions {}", resources.instructions);
    assert!(resources.memory_read_entries + resources.disk_read_entries < 50);
}

#[test]
fn allowance_expiration_does_not_change_between_simulation_and_execution() {
    // The member signs `approve` with its exact arguments while simulating; the transaction
    // lands a few ledgers later. The expiration must be the same in both.
    let s = setup();
    let id = create(&s);
    s.env.ledger().with_mut(|ledger| ledger.sequence_number = 17_280 * 10 + 5);
    s.cuotia.set_auto_pay(&id, &s.ana, &true);
    let simulated = s.cuotia.auto_pay_grant(&s.ana, &s.token.address).expires_ledger;
    s.cuotia.set_auto_pay(&id, &s.ana, &false);
    s.env.ledger().with_mut(|ledger| ledger.sequence_number += 3);
    s.cuotia.set_auto_pay(&id, &s.ana, &true);
    assert_eq!(s.cuotia.auto_pay_grant(&s.ana, &s.token.address).expires_ledger, simulated);
    assert_eq!(s.token.allowance(&s.ana, &s.contract), CONTRIBUTION * ROUNDS as i128);
}

#[test]
fn reports_version_and_admin() {
    let s = setup();
    assert_eq!(s.cuotia.version(), CONTRACT_VERSION);
    assert_eq!(s.cuotia.admin(), s.owner);
}

#[test]
fn migrate_cannot_run_on_storage_that_is_already_current() {
    let s = setup();
    assert_eq!(s.cuotia.try_migrate(), Err(Ok(CircleError::VersionNotNewer)));
}

#[test]
fn upgrade_and_migrate_need_the_admin_signature() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let contract = env.register(Cuotia, (admin, treasury, CLAIM_FEE_BPS, YIELD_FEE_BPS));
    let cuotia = CuotiaClient::new(&env, &contract);
    // No auth mocked: nobody signed.
    assert!(cuotia.try_upgrade(&BytesN::from_array(&env, &[7; 32])).is_err());
    assert!(cuotia.try_migrate().is_err());
    assert!(cuotia.try_set_admin(&Address::generate(&env)).is_err());
}

#[test]
fn admin_role_moves_only_with_both_signatures() {
    let s = setup();
    let multisig = Address::generate(&s.env);
    s.cuotia.set_admin(&multisig);
    let auths = s.env.auths();
    assert!(auths.iter().any(|(address, _)| *address == s.owner));
    assert!(auths.iter().any(|(address, _)| *address == multisig));
    assert_eq!(s.cuotia.admin(), multisig);
}
