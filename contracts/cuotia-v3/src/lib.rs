#![no_std]

use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, symbol_short, token,
    Address, BytesN, ContractExecutable, Env, IntoVal, String, TryFromVal, Val, Vec,
};

/// Version of this code. Raise it in every release that is installed with `upgrade`, so anyone
/// can check on chain which code a contract is running.
pub const CONTRACT_VERSION: u32 = 6;

const MAX_MEMBERS: u32 = 25;
const MAX_ROUNDS: u32 = 520;
const MAX_CIRCLES_PER_PAGE: u32 = 30;
/// Entries are extended to the network's maximum TTL (~180 days) whenever fewer than ~30 days
/// remain, so a monthly circle never lapses between contributions.
const TTL_THRESHOLD: u32 = 518_400;
const BPS_DENOMINATOR: i128 = 10_000;
/// Hard caps fixed in the code: the deployer can never set a higher fee.
const MAX_CLAIM_FEE_BPS: u32 = 1_000;
const MAX_YIELD_FEE_BPS: u32 = 5_000;
const SECONDS_PER_DAY: u64 = 86_400;
/// ~5 s per ledger.
const LEDGERS_PER_DAY: u32 = 17_280;
pub const GRACE_PERIOD_SECONDS: u64 = 3 * SECONDS_PER_DAY;
const WRITZ_VAULT_ID: &str = "CBMHGL7GGGHODEDDJ5H2LKJEFHJWBRSQUKOXMC4FKOFDZK5HBKW6PI2S";
const BLEND_USDC_ID: &str = "CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU";

#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CircleError {
    InvalidMemberCount = 1,
    InvalidContribution = 2,
    DuplicateMember = 3,
    CircleNotFound = 4,
    NotAMember = 5,
    AlreadyContributed = 6,
    MissingContributions = 7,
    CircleNotActive = 8,
    AmountOverflow = 9,
    CircleIdOverflow = 10,
    InvalidName = 11,
    InvalidFrequency = 12,
    OwnerNotMember = 13,
    InvalidPageSize = 14,
    TimestampOverflow = 15,
    ContributionWindowClosed = 16,
    RoundNotDue = 17,
    AlreadyClaimed = 18,
    NothingToClaim = 19,
    InvalidRoundCount = 20,
    RoundAlreadyPaid = 21,
    EarnConsentMissing = 22,
    EarnNotEnabled = 23,
    EarnAlreadyAccepted = 24,
    InvalidEarnAsset = 25,
    AutoPayDisabled = 26,
    NothingToCollect = 27,
    InvalidFee = 28,
    /// `upgrade` was asked to install a release that is not newer than the running one.
    VersionNotNewer = 29,
}

/// Set once by the constructor and never changed: who may withdraw Cuotia's fees and how much they are.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeConfig {
    pub treasury: Address,
    /// Fee on the saved principal, in basis points (100 = 1%). Only on completed circles.
    pub claim_fee_bps: u32,
    /// Fee on the yield earned in Writz, in basis points (1500 = 15%). Never on the principal.
    pub yield_fee_bps: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CircleMember {
    pub address: Address,
    pub name: String,
}

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CircleStatus {
    Active,
    Complete,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Circle {
    pub id: u32,
    pub owner: Address,
    pub token: Address,
    pub name: String,
    pub frequency: String,
    pub members: Vec<CircleMember>,
    pub contribution: i128,
    pub round: u32,
    pub rounds_total: u32,
    pub contributed: Vec<bool>,
    pub paid_totals: Vec<i128>,
    pub claimed: Vec<bool>,
    pub status: CircleStatus,
    pub created_at: u64,
    pub round_due_at: u64,
    pub earn_enabled: bool,
    pub earn_accepted: Vec<bool>,
    pub earn_shares: Vec<i128>,
    /// Per-member opt-in for automatic contributions. Off by default.
    pub auto_pay: Vec<bool>,
    /// Fees copied from the contract configuration when the circle was created: the rules a
    /// group agreed to cannot change afterwards.
    pub claim_fee_bps: u32,
    pub yield_fee_bps: u32,
}

#[contractevent(topics = ["created"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CircleCreated {
    #[topic]
    pub id: u32,
    pub name: String,
}

#[contractevent(topics = ["contrib"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContributionRecorded {
    #[topic]
    pub id: u32,
    pub member: Address,
    pub round: u32,
}

#[contractevent(topics = ["advanced"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RoundAdvanced {
    #[topic]
    pub id: u32,
    pub round: u32,
    pub due_at: u64,
}

#[contractevent(topics = ["cancelled"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CircleCancelled {
    #[topic]
    pub id: u32,
}

#[contractevent(topics = ["claimed"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ClaimRecorded {
    #[topic]
    pub id: u32,
    pub member: Address,
    /// What the member received, after Cuotia's fee.
    pub amount: i128,
    pub fee: i128,
}

#[contractevent(topics = ["upgraded"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractUpgraded {
    pub wasm_hash: BytesN<32>,
}

#[contractevent(topics = ["migrated"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StorageMigrated {
    pub from_version: u32,
    pub to_version: u32,
}

#[contractevent(topics = ["admin"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AdminChanged {
    pub admin: Address,
}

#[contractevent(topics = ["fees_out"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeesWithdrawn {
    #[topic]
    pub token: Address,
    pub amount: i128,
}

#[contractevent(topics = ["auto_pay"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AutoPayChanged {
    #[topic]
    pub id: u32,
    pub member: Address,
    pub enabled: bool,
}

#[contractevent(topics = ["auto_paid"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AutoContributionCollected {
    #[topic]
    pub id: u32,
    pub member: Address,
    pub round: u32,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    NextId,
    Config,
    /// Who may install new code with `upgrade` (and hand that role over with `set_admin`).
    Admin,
    /// Version of the code that last wrote the storage; see `migrate`.
    StorageVersion,
    Circle(u32),
    /// (member, token): what Cuotia may still pull from this member across all circles.
    AutoPay(Address, Address),
    /// Fees collected per token, waiting for `withdraw_fees`.
    Fees(Address),
}

/// Allowance that Cuotia keeps in sync with the member's opted-in circles. `committed` is the
/// sum of the remaining contributions in every circle (same token) where the member enabled
/// auto-pay; the token allowance always equals it. `expires_ledger` is when it lapses.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AutoPayGrant {
    pub committed: i128,
    pub expires_ledger: u32,
}

#[contract]
pub struct Cuotia;

#[contractimpl]
impl Cuotia {
    /// Runs once, at deployment. The fee can never exceed the caps written in the code above.
    pub fn __constructor(env: Env, admin: Address, treasury: Address, claim_fee_bps: u32, yield_fee_bps: u32) {
        if claim_fee_bps > MAX_CLAIM_FEE_BPS || yield_fee_bps > MAX_YIELD_FEE_BPS {
            panic_with_error!(&env, CircleError::InvalidFee);
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Config, &FeeConfig { treasury, claim_fee_bps, yield_fee_bps });
        env.storage().instance().set(&DataKey::StorageVersion, &CONTRACT_VERSION);
        bump_instance(&env);
    }

    /// Version of the code this contract is running.
    pub fn version(_env: Env) -> u32 {
        CONTRACT_VERSION
    }

    pub fn admin(env: Env) -> Address {
        admin(&env)
    }

    /// Replaces this contract's code, keeping its address and every circle. Only the admin.
    /// The new code must already be uploaded (`stellar contract upload`); then call `migrate`.
    pub fn upgrade(env: Env, new_wasm_hash: BytesN<32>) {
        admin(&env).require_auth();
        bump_instance(&env);
        env.deployer().update_current_contract(ContractExecutable::Wasm(new_wasm_hash.clone()));
        ContractUpgraded { wasm_hash: new_wasm_hash }.publish(&env);
    }

    /// Runs right after `upgrade`, already with the new code: converts stored data when a release
    /// changes its shape and records the new storage version. Only the admin. Fails if the code
    /// is not newer than what wrote the storage, so it cannot run twice.
    pub fn migrate(env: Env) -> Result<u32, CircleError> {
        admin(&env).require_auth();
        bump_instance(&env);
        let from_version: u32 = env.storage().instance().get(&DataKey::StorageVersion).unwrap_or(0);
        if from_version >= CONTRACT_VERSION {
            return Err(CircleError::VersionNotNewer);
        }
        // Per-release conversions go here, e.g. `if from_version < 7 { ... }`.
        env.storage().instance().set(&DataKey::StorageVersion, &CONTRACT_VERSION);
        StorageMigrated { from_version, to_version: CONTRACT_VERSION }.publish(&env);
        Ok(CONTRACT_VERSION)
    }

    /// Hands the admin role to another account (for example a multisig before Mainnet). Both the
    /// current and the new admin sign, so a typo can never lock the contract.
    pub fn set_admin(env: Env, new_admin: Address) {
        admin(&env).require_auth();
        new_admin.require_auth();
        bump_instance(&env);
        env.storage().instance().set(&DataKey::Admin, &new_admin);
        AdminChanged { admin: new_admin }.publish(&env);
    }

    pub fn fee_config(env: Env) -> FeeConfig {
        config(&env)
    }

    pub fn create_circle(
        env: Env,
        owner: Address,
        token_address: Address,
        name: String,
        frequency: String,
        members: Vec<CircleMember>,
        contribution: i128,
        rounds_total: u32,
        earn_enabled: bool,
    ) -> Result<u32, CircleError> {
        owner.require_auth();
        bump_instance(&env);
        if name.len() < 2 || name.len() > 48 {
            return Err(CircleError::InvalidName);
        }
        if !valid_frequency(&env, &frequency) {
            return Err(CircleError::InvalidFrequency);
        }
        if members.len() < 2 || members.len() > MAX_MEMBERS {
            return Err(CircleError::InvalidMemberCount);
        }
        if rounds_total == 0 || rounds_total > MAX_ROUNDS {
            return Err(CircleError::InvalidRoundCount);
        }
        if contribution <= 0 {
            return Err(CircleError::InvalidContribution);
        }
        if earn_enabled {
            let expected_asset = Address::from_string(&String::from_str(&env, BLEND_USDC_ID));
            if token_address != expected_asset {
                return Err(CircleError::InvalidEarnAsset);
            }
        }

        let mut owner_is_member = false;
        for first in 0..members.len() {
            let member = members.get(first).unwrap();
            if member.name.len() == 0 || member.name.len() > 40 {
                return Err(CircleError::InvalidName);
            }
            if member.address == owner {
                owner_is_member = true;
            }
            for second in (first + 1)..members.len() {
                if member.address == members.get(second).unwrap().address {
                    return Err(CircleError::DuplicateMember);
                }
            }
        }
        if !owner_is_member {
            return Err(CircleError::OwnerNotMember);
        }

        let created_at = env.ledger().timestamp();
        let round_due_at = created_at
            .checked_add(frequency_interval(&env, &frequency))
            .ok_or(CircleError::TimestampOverflow)?;
        let id = env.storage().persistent().get(&DataKey::NextId).unwrap_or(1_u32);
        let next_id = id.checked_add(1).ok_or(CircleError::CircleIdOverflow)?;
        let member_count = members.len();
        let fees = config(&env);
        let mut earn_accepted = filled(&env, !earn_enabled, member_count);
        if earn_enabled {
            let owner_index = member_index(&members, &owner).ok_or(CircleError::OwnerNotMember)?;
            earn_accepted.set(owner_index, true);
        }
        let circle = Circle {
            id,
            owner,
            token: token_address,
            name,
            frequency,
            contributed: filled(&env, false, member_count),
            paid_totals: filled(&env, 0_i128, member_count),
            claimed: filled(&env, false, member_count),
            members,
            contribution,
            round: 0,
            rounds_total,
            status: CircleStatus::Active,
            created_at,
            round_due_at,
            earn_enabled,
            earn_accepted,
            earn_shares: filled(&env, 0_i128, member_count),
            auto_pay: filled(&env, false, member_count),
            claim_fee_bps: fees.claim_fee_bps,
            yield_fee_bps: fees.yield_fee_bps,
        };

        save(&env, id, &circle);
        env.storage().persistent().set(&DataKey::NextId, &next_id);
        bump_persistent(&env, &DataKey::NextId);
        CircleCreated { id, name: circle.name.clone() }.publish(&env);
        Ok(id)
    }

    pub fn list_circles(env: Env, start_id: u32, limit: u32) -> Result<Vec<Circle>, CircleError> {
        if limit == 0 || limit > MAX_CIRCLES_PER_PAGE {
            return Err(CircleError::InvalidPageSize);
        }
        let next_id = env.storage().persistent().get(&DataKey::NextId).unwrap_or(1_u32);
        let mut circles = Vec::new(&env);
        let mut id = if start_id == 0 { 1 } else { start_id };
        while id < next_id && circles.len() < limit {
            if let Some(circle) = env.storage().persistent().get(&DataKey::Circle(id)) {
                circles.push_back(circle);
            }
            id += 1;
        }
        Ok(circles)
    }

    pub fn contribute(env: Env, id: u32, member: Address) -> Result<(), CircleError> {
        member.require_auth();
        bump_instance(&env);
        let mut circle = load(&env, id)?;
        require_active(&circle)?;
        let index = member_index(&circle.members, &member).ok_or(CircleError::NotAMember)?;
        record_contribution(&env, id, &mut circle, index, &member, false)
    }

    /// A member opts in or out of automatic contributions for this circle (off by default).
    /// Enabling commits this member's remaining contributions in the circle to Cuotia's token
    /// allowance; disabling removes them. Calling it with `true` while already enabled renews
    /// the allowance's expiration. Disabling also works after the circle ended or was cancelled,
    /// so no allowance is left behind.
    pub fn set_auto_pay(env: Env, id: u32, member: Address, enabled: bool) -> Result<(), CircleError> {
        member.require_auth();
        bump_instance(&env);
        let mut circle = load(&env, id)?;
        let index = member_index(&circle.members, &member).ok_or(CircleError::NotAMember)?;
        let currently = circle.auto_pay.get(index).unwrap_or(false);
        let mut grant = load_grant(&env, &member, &circle.token);
        if enabled {
            require_active(&circle)?;
            if !currently {
                let remaining = remaining_contributions(&circle, index)?;
                if remaining == 0 {
                    return Err(CircleError::NothingToCollect);
                }
                grant.committed = grant.committed.checked_add(remaining).ok_or(CircleError::AmountOverflow)?;
            }
        } else {
            if !currently {
                return Ok(());
            }
            let remaining = remaining_contributions(&circle, index)?;
            grant.committed = if grant.committed > remaining { grant.committed - remaining } else { 0 };
        }
        sync_allowance(&env, &member, &circle.token, &mut grant);
        if currently != enabled {
            circle.auto_pay.set(index, enabled);
            save(&env, id, &circle);
        }
        AutoPayChanged { id, member, enabled }.publish(&env);
        Ok(())
    }

    /// Current automatic-payment allowance of a member for a token (zero when none).
    pub fn auto_pay_grant(env: Env, member: Address, token_address: Address) -> AutoPayGrant {
        load_grant(&env, &member, &token_address)
    }

    /// Anyone (for example a scheduled job) may collect the current round's contribution from a
    /// member who enabled auto-pay. The member does not sign: the contract pulls exactly one
    /// contribution with the allowance granted in `set_auto_pay`, under the same rules as a
    /// manual contribution (open window, not yet paid this round, Earn consent complete).
    pub fn collect(env: Env, id: u32, member: Address) -> Result<(), CircleError> {
        bump_instance(&env);
        let mut circle = load(&env, id)?;
        require_active(&circle)?;
        let index = member_index(&circle.members, &member).ok_or(CircleError::NotAMember)?;
        if !circle.auto_pay.get(index).unwrap_or(false) {
            return Err(CircleError::AutoPayDisabled);
        }
        record_contribution(&env, id, &mut circle, index, &member, true)
    }

    /// Each member individually opts into Writz before any contributions are accepted.
    pub fn accept_earn(env: Env, id: u32, member: Address) -> Result<(), CircleError> {
        member.require_auth();
        bump_instance(&env);
        let mut circle = load(&env, id)?;
        require_active(&circle)?;
        if !circle.earn_enabled { return Err(CircleError::EarnNotEnabled); }
        if circle.paid_totals.iter().any(|total| total > 0) { return Err(CircleError::RoundAlreadyPaid); }
        let index = member_index(&circle.members, &member).ok_or(CircleError::NotAMember)?;
        if circle.earn_accepted.get(index).unwrap_or(false) { return Err(CircleError::EarnAlreadyAccepted); }
        circle.earn_accepted.set(index, true);
        save(&env, id, &circle);
        EarnAccepted { id, member }.publish(&env);
        Ok(())
    }

    /// A member may cancel an Earn circle before contributions if the group does not reach consensus.
    pub fn cancel_unstarted(env: Env, id: u32, member: Address) -> Result<(), CircleError> {
        member.require_auth();
        bump_instance(&env);
        let mut circle = load(&env, id)?;
        require_active(&circle)?;
        if !circle.earn_enabled { return Err(CircleError::EarnNotEnabled); }
        if circle.paid_totals.iter().any(|total| total > 0) { return Err(CircleError::RoundAlreadyPaid); }
        if member_index(&circle.members, &member).is_none() { return Err(CircleError::NotAMember); }
        circle.status = CircleStatus::Cancelled;
        save(&env, id, &circle);
        CircleCancelled { id }.publish(&env);
        Ok(())
    }

    /// Anyone may advance a fully paid round once its scheduled period has elapsed.
    pub fn advance_round(env: Env, id: u32) -> Result<u32, CircleError> {
        bump_instance(&env);
        let mut circle = load(&env, id)?;
        require_active(&circle)?;
        if circle.round + 1 >= circle.rounds_total {
            return Err(CircleError::CircleNotActive);
        }
        if !all_contributed(&circle.contributed) {
            return Err(CircleError::MissingContributions);
        }
        if env.ledger().timestamp() < circle.round_due_at {
            return Err(CircleError::RoundNotDue);
        }
        circle.round += 1;
        circle.contributed = filled(&env, false, circle.members.len());
        circle.round_due_at = env.ledger().timestamp()
            .checked_add(frequency_interval(&env, &circle.frequency))
            .ok_or(CircleError::TimestampOverflow)?;
        save(&env, id, &circle);
        RoundAdvanced { id, round: circle.round, due_at: circle.round_due_at }.publish(&env);
        Ok(circle.round)
    }

    /// Anyone may cancel once the current round remains incomplete past its grace period.
    pub fn cancel_circle(env: Env, id: u32) -> Result<(), CircleError> {
        bump_instance(&env);
        let mut circle = load(&env, id)?;
        require_active(&circle)?;
        if all_contributed(&circle.contributed) {
            return Err(CircleError::RoundAlreadyPaid);
        }
        let deadline = circle.round_due_at.checked_add(GRACE_PERIOD_SECONDS)
            .ok_or(CircleError::TimestampOverflow)?;
        if env.ledger().timestamp() <= deadline {
            return Err(CircleError::RoundNotDue);
        }
        circle.status = CircleStatus::Cancelled;
        save(&env, id, &circle);
        CircleCancelled { id }.publish(&env);
        Ok(())
    }

    /// After completion, returns each member's full principal. After cancellation, returns
    /// only that member's recorded contributions. Claims are individual and one-time.
    pub fn claim(env: Env, id: u32, member: Address) -> Result<i128, CircleError> {
        member.require_auth();
        bump_instance(&env);
        let mut circle = load(&env, id)?;
        if circle.status == CircleStatus::Active {
            return Err(CircleError::CircleNotActive);
        }
        let index = member_index(&circle.members, &member).ok_or(CircleError::NotAMember)?;
        if circle.claimed.get(index).unwrap_or(false) {
            return Err(CircleError::AlreadyClaimed);
        }
        let principal = circle.paid_totals.get(index).unwrap_or(0);
        if principal <= 0 {
            return Err(CircleError::NothingToClaim);
        }
        let gross = if circle.earn_enabled {
            withdraw_writz_shares(&env, circle.earn_shares.get(index).unwrap_or(0))?
        } else {
            principal
        };
        if gross <= 0 { return Err(CircleError::NothingToClaim); }
        // A cancelled circle returns everything: Cuotia only charges when the group completes.
        let fee = if circle.status == CircleStatus::Complete { claim_fee(&circle, principal, gross)? } else { 0 };
        let amount = gross - fee;
        circle.claimed.set(index, true);
        save(&env, id, &circle);
        if fee > 0 {
            // Fees stay in the contract until the treasury withdraws them, so a problem with the
            // treasury account (for example a missing trustline) can never block a member's claim.
            let key = DataKey::Fees(circle.token.clone());
            let accrued: i128 = env.storage().persistent().get(&key).unwrap_or(0);
            env.storage().persistent().set(&key, &accrued.checked_add(fee).ok_or(CircleError::AmountOverflow)?);
            bump_persistent(&env, &key);
        }
        token::Client::new(&env, &circle.token).transfer(&env.current_contract_address(), &member, &amount);
        ClaimRecorded { id, member, amount, fee }.publish(&env);
        Ok(amount)
    }

    /// Fees collected in a token and not yet withdrawn.
    pub fn accrued_fees(env: Env, token_address: Address) -> i128 {
        env.storage().persistent().get(&DataKey::Fees(token_address)).unwrap_or(0)
    }

    /// Sends the accrued fees of a token to the treasury. Only the treasury can call it.
    pub fn withdraw_fees(env: Env, token_address: Address) -> Result<i128, CircleError> {
        let treasury = config(&env).treasury;
        treasury.require_auth();
        bump_instance(&env);
        let key = DataKey::Fees(token_address.clone());
        let amount: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if amount <= 0 {
            return Err(CircleError::NothingToClaim);
        }
        env.storage().persistent().set(&key, &0_i128);
        token::Client::new(&env, &token_address).transfer(&env.current_contract_address(), &treasury, &amount);
        FeesWithdrawn { token: token_address, amount }.publish(&env);
        Ok(amount)
    }

    pub fn get_circle(env: Env, id: u32) -> Result<Circle, CircleError> {
        load(&env, id)
    }
}

#[contractevent(topics = ["earn_accepted"])]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EarnAccepted {
    #[topic]
    pub id: u32,
    pub member: Address,
}

fn all_consent(accepted: &Vec<bool>) -> bool {
    accepted.iter().all(|has_accepted| has_accepted)
}

fn deposit_into_writz(env: &Env, amount: i128) -> Result<i128, CircleError> {
    let vault = Address::from_string(&String::from_str(env, WRITZ_VAULT_ID));
    let current_contract = env.current_contract_address();
    let asset = Address::from_string(&String::from_str(env, BLEND_USDC_ID));
    let mut amounts = Vec::new(env);
    amounts.push_back(amount);
    let mut minimums = Vec::new(env);
    minimums.push_back(amount);
    // DeFindex calls the underlying token's `transfer` from inside `deposit`.
    // Cuotia owns the funds, so explicitly authorize that nested transfer only.
    let transfer_auth = InvokerContractAuthEntry::Contract(SubContractInvocation {
        context: ContractContext {
            contract: asset,
            fn_name: symbol_short!("transfer"),
            args: (current_contract.clone(), vault.clone(), amount).into_val(env),
        },
        sub_invocations: Vec::new(env),
    });
    env.authorize_as_current_contract(Vec::from_array(env, [transfer_auth]));
    let args = Vec::from_array(env, [
        amounts.into_val(env),
        minimums.into_val(env),
        current_contract.into_val(env),
        true.into_val(env),
    ]);
    let result: Val = env.invoke_contract(&vault, &symbol_short!("deposit"), args);
    let tuple = Vec::<Val>::try_from_val(env, &result).map_err(|_| CircleError::InvalidEarnAsset)?;
    let shares_val = tuple.get(1).ok_or(CircleError::InvalidEarnAsset)?;
    let shares = i128::try_from_val(env, &shares_val).map_err(|_| CircleError::InvalidEarnAsset)?;
    if shares <= 0 { return Err(CircleError::InvalidEarnAsset); }
    Ok(shares)
}

fn withdraw_writz_shares(env: &Env, shares: i128) -> Result<i128, CircleError> {
    if shares <= 0 { return Err(CircleError::NothingToClaim); }
    let vault = Address::from_string(&String::from_str(env, WRITZ_VAULT_ID));
    let current_contract = env.current_contract_address();
    let mut minimums = Vec::new(env);
    minimums.push_back(0_i128);
    let args = Vec::from_array(env, [
        shares.into_val(env),
        minimums.into_val(env),
        current_contract.clone().into_val(env),
    ]);
    let amounts: Vec<i128> = env.invoke_contract(&vault, &symbol_short!("withdraw"), args);
    Ok(amounts.get(0).unwrap_or(0))
}

fn record_contribution(
    env: &Env,
    id: u32,
    circle: &mut Circle,
    index: u32,
    member: &Address,
    automatic: bool,
) -> Result<(), CircleError> {
    if circle.earn_enabled && !all_consent(&circle.earn_accepted) {
        return Err(CircleError::EarnConsentMissing);
    }
    let now = env.ledger().timestamp();
    let deadline = circle.round_due_at.checked_add(GRACE_PERIOD_SECONDS)
        .ok_or(CircleError::TimestampOverflow)?;
    if now > deadline {
        return Err(CircleError::ContributionWindowClosed);
    }
    if circle.contributed.get(index).unwrap_or(false) {
        return Err(CircleError::AlreadyContributed);
    }
    let paid_total = circle.paid_totals.get(index).unwrap_or(0)
        .checked_add(circle.contribution).ok_or(CircleError::AmountOverflow)?;
    let token = token::Client::new(env, &circle.token);
    let contract = env.current_contract_address();
    if automatic {
        // Cuotia is the spender; it only pulls what this member owes for this round.
        token.transfer_from(&contract, member, &contract, &circle.contribution);
    } else {
        token.transfer(member, &contract, &circle.contribution);
    }
    if circle.auto_pay.get(index).unwrap_or(false) {
        // This round no longer needs to be collected: release it from the committed amount.
        let mut grant = load_grant(env, member, &circle.token);
        grant.committed = if grant.committed > circle.contribution { grant.committed - circle.contribution } else { 0 };
        if automatic {
            // transfer_from already reduced the token allowance by the same amount.
            store_grant(env, member, &circle.token, &grant);
        } else {
            sync_allowance(env, member, &circle.token, &mut grant);
        }
    }
    if circle.earn_enabled {
        let minted_shares = deposit_into_writz(env, circle.contribution)?;
        let current_shares = circle.earn_shares.get(index).unwrap_or(0)
            .checked_add(minted_shares).ok_or(CircleError::AmountOverflow)?;
        circle.earn_shares.set(index, current_shares);
    }
    circle.contributed.set(index, true);
    circle.paid_totals.set(index, paid_total);
    if circle.round + 1 == circle.rounds_total && all_contributed(&circle.contributed) {
        circle.status = CircleStatus::Complete;
    }
    save(env, id, circle);
    if automatic {
        AutoContributionCollected { id, member: member.clone(), round: circle.round }.publish(env);
    } else {
        ContributionRecorded { id, member: member.clone(), round: circle.round }.publish(env);
    }
    Ok(())
}

fn load_grant(env: &Env, member: &Address, token_address: &Address) -> AutoPayGrant {
    env.storage().persistent()
        .get(&DataKey::AutoPay(member.clone(), token_address.clone()))
        .unwrap_or(AutoPayGrant { committed: 0, expires_ledger: 0 })
}

fn store_grant(env: &Env, member: &Address, token_address: &Address, grant: &AutoPayGrant) {
    let key = DataKey::AutoPay(member.clone(), token_address.clone());
    env.storage().persistent().set(&key, grant);
    bump_persistent(env, &key);
}

/// Sets the token allowance to exactly the committed amount, with (almost) the longest expiration
/// the network allows, or revokes it when nothing is committed. Requires the member's auth.
///
/// The member signs the nested `approve` call with its exact arguments during simulation, and the
/// transaction executes a few ledgers later. So the expiration must not depend on the exact ledger:
/// it is rounded down to a whole day, and a revocation uses a fixed 0.
fn sync_allowance(env: &Env, member: &Address, token_address: &Address, grant: &mut AutoPayGrant) {
    let expiration = if grant.committed > 0 {
        let max = env.ledger().max_live_until_ledger();
        let rounded = max - max % LEDGERS_PER_DAY;
        if rounded > env.ledger().sequence() { rounded } else { max }
    } else {
        0
    };
    token::Client::new(env, token_address).approve(member, &env.current_contract_address(), &grant.committed, &expiration);
    grant.expires_ledger = if grant.committed > 0 { expiration } else { 0 };
    store_grant(env, member, token_address, grant);
}

/// Amount this member still owes in the circle: remaining rounds, minus the current one if paid.
fn remaining_contributions(circle: &Circle, index: u32) -> Result<i128, CircleError> {
    let paid_current = if circle.contributed.get(index).unwrap_or(false) { 1 } else { 0 };
    let rounds = circle.rounds_total.saturating_sub(circle.round).saturating_sub(paid_current);
    circle.contribution.checked_mul(rounds as i128).ok_or(CircleError::AmountOverflow)
}

fn require_active(circle: &Circle) -> Result<(), CircleError> {
    if circle.status != CircleStatus::Active { return Err(CircleError::CircleNotActive); }
    Ok(())
}

fn all_contributed(contributed: &Vec<bool>) -> bool {
    contributed.iter().all(|paid| paid)
}

fn load(env: &Env, id: u32) -> Result<Circle, CircleError> {
    env.storage().persistent().get(&DataKey::Circle(id)).ok_or(CircleError::CircleNotFound)
}

fn save(env: &Env, id: u32, circle: &Circle) {
    let key = DataKey::Circle(id);
    env.storage().persistent().set(&key, circle);
    bump_persistent(env, &key);
}

fn admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

fn config(env: &Env) -> FeeConfig {
    env.storage().instance().get(&DataKey::Config).unwrap()
}

/// Cuotia's fee on a completed claim: `claim_fee_bps` of the principal plus `yield_fee_bps` of
/// any Writz gain. Never more than what is being withdrawn.
fn claim_fee(circle: &Circle, principal: i128, gross: i128) -> Result<i128, CircleError> {
    let on_principal = principal.checked_mul(circle.claim_fee_bps as i128).ok_or(CircleError::AmountOverflow)? / BPS_DENOMINATOR;
    let gain = if gross > principal { gross - principal } else { 0 };
    let on_yield = gain.checked_mul(circle.yield_fee_bps as i128).ok_or(CircleError::AmountOverflow)? / BPS_DENOMINATOR;
    let fee = on_principal.checked_add(on_yield).ok_or(CircleError::AmountOverflow)?;
    Ok(if fee > gross { gross } else { fee })
}

/// Keeps the contract instance and its code alive (both share this TTL).
fn bump_instance(env: &Env) {
    let max = env.storage().max_ttl();
    env.storage().instance().extend_ttl(TTL_THRESHOLD.min(max), max);
}

fn bump_persistent(env: &Env, key: &DataKey) {
    let max = env.storage().max_ttl();
    env.storage().persistent().extend_ttl(key, TTL_THRESHOLD.min(max), max);
}

fn filled<T: IntoVal<Env, Val> + TryFromVal<Env, Val> + Clone>(env: &Env, value: T, count: u32) -> Vec<T> {
    let mut items = Vec::new(env);
    for _ in 0..count {
        items.push_back(value.clone());
    }
    items
}

fn member_index(members: &Vec<CircleMember>, address: &Address) -> Option<u32> {
    for index in 0..members.len() {
        if members.get(index).unwrap().address == *address { return Some(index); }
    }
    None
}

fn valid_frequency(env: &Env, frequency: &String) -> bool {
    frequency == &String::from_str(env, "weekly")
        || frequency == &String::from_str(env, "biweekly")
        || frequency == &String::from_str(env, "monthly")
}

fn frequency_interval(env: &Env, frequency: &String) -> u64 {
    if frequency == &String::from_str(env, "weekly") { SECONDS_PER_DAY * 7 }
    else if frequency == &String::from_str(env, "biweekly") { SECONDS_PER_DAY * 14 }
    else { SECONDS_PER_DAY * 30 }
}

#[cfg(test)]
mod test;
