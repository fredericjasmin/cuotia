#![no_std]

use soroban_sdk::{
    auth::{ContractContext, InvokerContractAuthEntry, SubContractInvocation},
    contract, contracterror, contractevent, contractimpl, contracttype, symbol_short, token,
    Address, Env, IntoVal, String, TryFromVal, Val, Vec,
};

const MAX_MEMBERS: u32 = 12;
const MAX_CIRCLES_PER_PAGE: u32 = 30;
const TTL_THRESHOLD: u32 = 30_000;
const TTL_EXTEND_TO: u32 = 500_000;
const SECONDS_PER_DAY: u64 = 86_400;
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
    pub amount: i128,
}

#[contracttype]
#[derive(Clone)]
enum DataKey {
    NextId,
    Circle(u32),
}

#[contract]
pub struct Cuotia;

#[contractimpl]
impl Cuotia {
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
        if name.len() < 2 || name.len() > 48 {
            return Err(CircleError::InvalidName);
        }
        if !valid_frequency(&env, &frequency) {
            return Err(CircleError::InvalidFrequency);
        }
        if members.len() < 2 || members.len() > MAX_MEMBERS {
            return Err(CircleError::InvalidMemberCount);
        }
        if rounds_total == 0 || rounds_total > 52 {
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
        let mut earn_accepted = Vec::from_array(&env, [!earn_enabled; 12]).slice(0..members.len());
        if earn_enabled {
            let owner_index = member_index(&members, &owner).ok_or(CircleError::OwnerNotMember)?;
            earn_accepted.set(owner_index, true);
        }
        let member_count = members.len();
        let circle = Circle {
            id,
            owner,
            token: token_address,
            name,
            frequency,
            contributed: Vec::from_array(&env, [false; 12]).slice(0..members.len()),
            paid_totals: Vec::from_array(&env, [0_i128; 12]).slice(0..members.len()),
            claimed: Vec::from_array(&env, [false; 12]).slice(0..members.len()),
            members,
            contribution,
            round: 0,
            rounds_total,
            status: CircleStatus::Active,
            created_at,
            round_due_at,
            earn_enabled,
            earn_accepted,
            earn_shares: Vec::from_array(&env, [0_i128; 12]).slice(0..member_count),
        };

        let circle_key = DataKey::Circle(id);
        env.storage().persistent().set(&circle_key, &circle);
        env.storage().persistent().extend_ttl(&circle_key, TTL_THRESHOLD, TTL_EXTEND_TO);
        env.storage().persistent().set(&DataKey::NextId, &next_id);
        env.storage().persistent().extend_ttl(&DataKey::NextId, TTL_THRESHOLD, TTL_EXTEND_TO);
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
        let mut circle = load(&env, id)?;
        require_active(&circle)?;
        if circle.earn_enabled && !all_consent(&circle.earn_accepted) {
            return Err(CircleError::EarnConsentMissing);
        }
        let now = env.ledger().timestamp();
        let deadline = circle.round_due_at.checked_add(GRACE_PERIOD_SECONDS)
            .ok_or(CircleError::TimestampOverflow)?;
        if now > deadline {
            return Err(CircleError::ContributionWindowClosed);
        }
        let index = member_index(&circle.members, &member).ok_or(CircleError::NotAMember)?;
        if circle.contributed.get(index).unwrap_or(false) {
            return Err(CircleError::AlreadyContributed);
        }
        let paid_total = circle.paid_totals.get(index).unwrap_or(0)
            .checked_add(circle.contribution).ok_or(CircleError::AmountOverflow)?;
        token::Client::new(&env, &circle.token).transfer(
            &member,
            &env.current_contract_address(),
            &circle.contribution,
        );
        if circle.earn_enabled {
            let minted_shares = deposit_into_writz(&env, circle.contribution)?;
            let current_shares = circle.earn_shares.get(index).unwrap_or(0)
                .checked_add(minted_shares).ok_or(CircleError::AmountOverflow)?;
            circle.earn_shares.set(index, current_shares);
        }
        circle.contributed.set(index, true);
        circle.paid_totals.set(index, paid_total);
        save(&env, id, &circle);
        ContributionRecorded { id, member, round: circle.round }.publish(&env);
        if circle.round + 1 == circle.rounds_total && all_contributed(&circle.contributed) {
            circle.status = CircleStatus::Complete;
            save(&env, id, &circle);
        }
        Ok(())
    }

    /// Each member individually opts into Writz before any contributions are accepted.
    pub fn accept_earn(env: Env, id: u32, member: Address) -> Result<(), CircleError> {
        member.require_auth();
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
        circle.contributed = Vec::from_array(&env, [false; 12]).slice(0..circle.members.len());
        circle.round_due_at = env.ledger().timestamp()
            .checked_add(frequency_interval(&env, &circle.frequency))
            .ok_or(CircleError::TimestampOverflow)?;
        save(&env, id, &circle);
        RoundAdvanced { id, round: circle.round, due_at: circle.round_due_at }.publish(&env);
        Ok(circle.round)
    }

    /// Anyone may cancel once the current round remains incomplete past its grace period.
    pub fn cancel_circle(env: Env, id: u32) -> Result<(), CircleError> {
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
        let amount = if circle.earn_enabled {
            withdraw_writz_shares(&env, circle.earn_shares.get(index).unwrap_or(0))?
        } else {
            principal
        };
        if amount <= 0 { return Err(CircleError::NothingToClaim); }
        circle.claimed.set(index, true);
        save(&env, id, &circle);
        token::Client::new(&env, &circle.token).transfer(
            &env.current_contract_address(),
            &member,
            &amount,
        );
        ClaimRecorded { id, member, amount }.publish(&env);
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
    env.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
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
