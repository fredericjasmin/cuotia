'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, CircleAlert, ExternalLink, PiggyBank, Plus, TrendingUp, Wallet, X } from 'lucide-react';
import {
  advanceSavingsCircleRound,
  acceptSavingsCircleEarn,
  cancelSavingsCircle,
  cancelUnstartedSavingsCircle,
  claimSavingsCircle,
  contributeToSavingsCircle,
  createSavingsCircle,
  getSavingsCircleActivity,
  getSavingsCircle,
  listSavingsCircles,
  setupUsdcTrustline,
} from '../lib/cuotia-chain.mjs';
import { isChainConfigured } from '../lib/chain-config.mjs';
import { useCuotia } from './app-provider.jsx';
import { ActivitySkeleton, CircleCollectionSkeleton, CircleDetailSkeleton } from './loading-skeletons.jsx';
import UiIcon from './ui-icon.jsx';

const MAX_MEMBERS = 12;
const money = (value) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortAddress = (address) => address ? `${address.slice(0, 5)}…${address.slice(-5)}` : '';
const dateLabel = (timestamp) => timestamp ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(timestamp * 1000)) + ' UTC' : '—';
const frequencyLabel = (frequency) => ({ weekly: 'Weekly', biweekly: 'Every two weeks', monthly: 'Monthly' })[frequency] || frequency;

function SetupNote() {
  return <section className="page-state"><span className="empty-symbol"><UiIcon as={CircleAlert} size={34} /></span><h2>Savings circles are not configured in this environment.</h2><p>The circle contract keeps each member’s contributions separate and supports final claims or refunds after cancellation. Configure <code>NEXT_PUBLIC_CUOTIA_CONTRACT_ID</code> with the appropriate Testnet instance.</p></section>;
}

function SavingsActivity({ activity, loading, error }) {
  return <section className="circle-activity" aria-labelledby="savings-activity-title"><h2 id="savings-activity-title">Recent Stellar activity</h2>
    {loading ? <ActivitySkeleton /> : error ? <p role="status">Could not load activity: {error}</p> : activity.length ? <ol>{activity.map((item) => <li key={`${item.hash}-${item.ledger}`}><span>{item.label}</span><a href={`https://stellar.expert/explorer/testnet/tx/${item.hash}`} target="_blank" rel="noreferrer">View transaction <UiIcon as={ExternalLink} size={14} /></a><time dateTime={item.timestamp}>{new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(item.timestamp))} UTC</time></li>)}</ol> : <p>No recent events are available for this savings circle.</p>}
  </section>;
}

function SavingsCircleCard({ circle, walletAddress, onAction, onTrustlineSetup, busy, showToast, compact = false }) {
  const [now, setNow] = useState(0);
  const [trustlineSetupRequired, setTrustlineSetupRequired] = useState(false);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const memberIndex = circle.members.findIndex((member) => member.address === walletAddress);
  const isMember = memberIndex >= 0;
  const myContribution = circle.contributions[memberIndex];
  const paidCount = circle.contributions.filter((entry) => entry.paid).length;
  const allPaid = paidCount === circle.members.length;
  const deadline = circle.roundDueAt + circle.gracePeriodSeconds;
  const expired = now > deadline * 1000;
  const canClaim = (circle.complete || circle.cancelled) && myContribution?.total > 0 && !myContribution.claimed;
  const canAdvance = circle.status === 'active' && circle.round + 1 < circle.roundsTotal && allPaid && now >= circle.roundDueAt * 1000;
  const canCancel = circle.status === 'active' && !allPaid && expired && !(circle.earnEnabled && circle.pot === 0);
  const canContribute = circle.status === 'active' && isMember && !myContribution?.paid && !expired && circle.earnReady;
  const earnAcceptedCount = circle.earnAccepted.filter(Boolean).length;
  const canAcceptEarn = circle.status === 'active' && circle.earnEnabled && isMember && !circle.earnAccepted[memberIndex] && circle.pot === 0;
  const canCancelUnstarted = circle.status === 'active' && circle.earnEnabled && isMember && circle.pot === 0;
  const assetLabel = circle.earnEnabled ? 'Writz Earn USDC' : 'USDC';
  const contributionPercent = Math.round((paidCount / circle.members.length) * 100);
  async function runAction(kind) {
    try { await onAction(circle.id, kind); }
    catch (cause) { if (cause?.code === 'USDC_TRUSTLINE_REQUIRED') setTrustlineSetupRequired(true); }
  }
  async function setupTrustline() {
    try {
      await onTrustlineSetup({ earnEnabled: circle.earnEnabled });
      setTrustlineSetupRequired(false);
      showToast('USDC is set up for this wallet.');
    } catch (cause) { showToast(cause.message || 'Could not set up USDC for this wallet.', 'error'); }
  }

  return <article className="circle-card savings-card">
    <div className="circle-heading"><div><span className="circle-meta">Stellar Testnet · {circle.earnEnabled ? 'Writz Earn · USDC' : 'USDC'} · Savings circle</span><h3><Link href={`/savings/${circle.id}`}>{circle.name}</Link></h3><p>{circle.members.length} members <span>·</span> {frequencyLabel(circle.frequency)} <span>·</span> {circle.roundsTotal} rounds <span>·</span> {money(circle.contribution)} {assetLabel} per member</p>{circle.earnEnabled && !compact && <p className="form-help">Writz Earn’s vault currently uses Blend Testnet USDC underneath.</p>}</div><span className="round-chip">{circle.status === 'active' ? `Round ${circle.round + 1} / ${circle.roundsTotal}` : circle.status === 'complete' ? 'Complete' : circle.status === 'cancelled' ? 'Cancelled' : 'Status unavailable'}</span></div>
    <div className="progress-track" role="progressbar" aria-label="Round contributions" aria-valuenow={paidCount} aria-valuemin="0" aria-valuemax={circle.members.length}><i style={{ width: `${contributionPercent}%` }} /></div>
    <div className="circle-stats"><div><span>Contributions this round</span><b>{paidCount} / {circle.members.length}</b></div><div><span>Total contributed</span><b>{money(circle.pot)} {assetLabel}</b></div><div><span>Round deadline</span><b>{dateLabel(circle.roundDueAt)}</b></div></div>
    {circle.earnEnabled && <div className={`earn-consensus ${compact ? 'is-compact' : ''}`}>
      <div className="earn-consensus-info">
        <div className="earn-consensus-heading"><span className="earn-consensus-mark"><UiIcon as={TrendingUp} size={17} /></span><div><strong>Writz Earn consent</strong><span>{earnAcceptedCount} of {circle.members.length} approved{!circle.earnReady && isMember && !circle.earnAccepted[memberIndex] ? ' · yours is pending' : ''}</span></div></div>
        {!compact && <p>{circle.earnReady ? 'Everyone approved. Contributions go to the vault; each member later claims the value their shares recover, which can rise or fall.' : 'Everyone must approve before contributions open. Approval does not move funds; each contribution is signed separately.'}</p>}
      </div>
      {!compact && <div className="earn-consensus-actions">
        {circle.status === 'active' && !circle.earnReady && !walletAddress && <button className="button-consent-connect" type="button" onClick={() => onAction(circle.id)}>Connect wallet to review consent <UiIcon as={ArrowUpRight} size={15} /></button>}
        {canAcceptEarn && <button className="button-consent" type="button" disabled={busy} onClick={() => runAction('accept_earn')}><span className="consent-check"><UiIcon as={Check} size={15} /></span><span className="consent-copy"><strong>{busy ? 'Waiting for signature…' : 'Approve Writz Earn'}</strong><small>Approval only · no funds move</small></span></button>}
        {canCancelUnstarted && <div className="earn-decline"><button className="button-decline" type="button" disabled={busy} onClick={() => runAction('cancel_unstarted')}>Decline and cancel circle</button><span>Cancels for everyone before contributions begin.</span></div>}
      </div>}
    </div>}
    {!compact && circle.status === 'active' && <p className={`circle-due${expired && !allPaid ? ' is-overdue' : ''}`}>{allPaid && circle.round + 1 < circle.roundsTotal ? `All members paid. Next round can open after ${dateLabel(circle.roundDueAt)}.` : `If this round is still incomplete after ${dateLabel(deadline)}, a member can cancel it manually. It will not cancel automatically.`}</p>}
    {!compact && <ul className="member-status-list" aria-label="Member status">{circle.members.map((member, index) => <li key={member.address}><span className={`member-status-dot ${circle.contributions[index]?.paid ? 'is-paid' : ''}`} /><span className="member-status-name">{member.name}{member.address === walletAddress ? ' · you' : ''}</span><span className="member-status-address">{shortAddress(member.address)}</span><span className="member-status-label">{circle.earnEnabled && !circle.earnAccepted[index] ? 'Writz consent pending · ' : ''}{money(circle.contributions[index]?.total)} {assetLabel} · {circle.contributions[index]?.claimed ? 'Claimed' : circle.contributions[index]?.paid ? 'Paid this round' : 'Pending'}</span></li>)}</ul>}
    <div className="circle-controls">
      {!walletAddress && !circle.earnEnabled && <button className="button-secondary" type="button" onClick={onAction}>Connect wallet to check your membership</button>}
      {walletAddress && !isMember && <span className="complete-label">Your wallet is not a member of this circle.</span>}
      {canContribute && <button className="button-primary" disabled={busy} onClick={() => runAction('contribute')}>{busy ? 'Waiting for signature…' : `Contribute ${money(circle.contribution)} ${assetLabel}`} <UiIcon as={ArrowUpRight} size={16} /></button>}
      {isMember && myContribution?.paid && circle.status === 'active' && <span className="complete-label"><UiIcon as={Check} size={15} /> Your contribution is recorded for this round.</span>}
      {canAdvance && <button className="button-secondary" disabled={busy} onClick={() => runAction('advance')}>{busy ? 'Waiting for signature…' : 'Open next round'} <UiIcon as={ArrowRight} size={16} /></button>}
      {canCancel && <button className="button-secondary" disabled={busy} onClick={() => runAction('cancel')}>{busy ? 'Waiting for signature…' : 'Cancel and enable refunds'}</button>}
      {canClaim && <button className="button-primary" disabled={busy} onClick={() => runAction('claim')}>{busy ? 'Waiting for signature…' : circle.earnEnabled ? 'Claim Writz share' : `Claim ${money(myContribution.total)} USDC`} <UiIcon as={ArrowUpRight} size={16} /></button>}
      {trustlineSetupRequired && <div className="inline-note trustline-setup-note" role="status"><p>This wallet needs the {assetLabel} Testnet trustline before it can contribute or claim. Cuotia can add the correct trustline with your wallet signature. The account also needs Testnet XLM for fees.</p><button className="button-secondary" type="button" disabled={busy} onClick={setupTrustline}>{busy ? 'Waiting for signature…' : `Set up ${assetLabel} in wallet`}</button><a href={circle.earnEnabled ? 'https://testnet.blend.capital' : 'https://faucet.circle.com/'} target="_blank" rel="noreferrer">Get {assetLabel} Testnet <UiIcon as={ExternalLink} size={14} /></a></div>}
      {isMember && myContribution?.claimed && <span className="complete-label"><UiIcon as={Check} size={15} /> Your funds have been claimed.</span>}
      {compact && <Link className="button-quiet" href={`/savings/${circle.id}`}>Circle details <UiIcon as={ArrowRight} size={15} /></Link>}
    </div>
  </article>;
}

function SavingsCollection({ circles, loading, error, retry, busyId, ...cardProps }) {
  if (loading) return <CircleCollectionSkeleton />;
  if (error) return <div className="page-state page-error" role="alert"><strong>Could not load savings circles.</strong><p>{error}</p><button className="button-secondary" onClick={retry}>Try again</button></div>;
  if (!circles.length) return <div className="page-state"><span className="empty-symbol"><UiIcon as={PiggyBank} size={34} /></span><h2>No savings circles yet.</h2><p>Create one and invite your group.</p><Link className="button-primary" href="/savings/create">Create a savings circle</Link></div>;
  return <div className="circle-list">{circles.map((circle) => <SavingsCircleCard key={circle.id} circle={circle} compact busy={busyId === circle.id} {...cardProps} />)}</div>;
}

export function SavingsCirclesPage() {
  const { walletAddress, connectWallet, showToast } = useCuotia();
  const [circles, setCircles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [nextStartId, setNextStartId] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const configured = isChainConfigured();
  const refresh = useCallback(async () => {
    if (!configured) { setLoading(false); setNextStartId(null); return; }
    setLoading(true); setError('');
    try {
      const page = await listSavingsCircles();
      setCircles(page.circles);
      setNextStartId(page.nextStartId);
      setMoreError('');
    }
    catch (cause) { setError(cause.message); }
    finally { setLoading(false); }
  }, [configured]);
  useEffect(() => { refresh(); }, [refresh]);
  async function loadMore() {
    if (nextStartId === null || loadingMore) return;
    setLoadingMore(true); setMoreError('');
    try {
      const page = await listSavingsCircles(nextStartId);
      setCircles((current) => [...current, ...page.circles]);
      setNextStartId(page.nextStartId);
    } catch (cause) { setMoreError(cause.message); }
    finally { setLoadingMore(false); }
  }
  async function trustlineSetup({ earnEnabled = false } = {}) {
    if (!walletAddress) { await connectWallet(); return; }
    await setupUsdcTrustline({ address: walletAddress, earnEnabled });
  }
  async function act(circleId, kind) {
    if (!walletAddress) { await connectWallet().catch(() => {}); return; }
    if (!kind) return;
    setBusyId(circleId);
    try {
      const input = { address: walletAddress, id: circleId };
      if (kind === 'contribute') await contributeToSavingsCircle(input);
      if (kind === 'advance') await advanceSavingsCircleRound(input);
      if (kind === 'cancel') await cancelSavingsCircle(input);
      if (kind === 'claim') await claimSavingsCircle(input);
      if (kind === 'accept_earn') await acceptSavingsCircleEarn(input);
      if (kind === 'cancel_unstarted') await cancelUnstartedSavingsCircle(input);
      showToast(kind === 'contribute' ? 'Your contribution was recorded.' : kind === 'claim' ? 'Your claim was sent to your wallet.' : kind === 'cancel' ? 'The circle was cancelled. Members can now claim their own contributions.' : 'The next round is open.');
      await refresh();
    } catch (cause) { showToast(cause.message || 'Could not complete this action.', 'error'); throw cause; }
    finally { setBusyId(null); }
  }
  return <div className="content-page"><div className="page-heading"><div><h1>Savings circles</h1><p>Everyone contributes each period. After all rounds, each member claims their own contributions.</p></div><Link className="button-primary" href="/savings/create"><UiIcon as={Plus} size={17} /> Create a savings circle</Link></div>
    {!configured ? <SetupNote /> : <><SavingsCollection circles={circles} loading={loading} error={error} retry={refresh} walletAddress={walletAddress} busyId={busyId} onAction={(circleId, kind) => act(circleId, kind)} onTrustlineSetup={trustlineSetup} showToast={showToast} />{nextStartId !== null && !loading && !error && <div className="circle-pagination">{moreError && <p role="alert">{moreError}</p>}<button className="button-secondary" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading…' : moreError ? 'Try again' : 'Load more savings circles'}</button></div>}</>}
  </div>;
}

export function SavingsDashboardPage() {
  const { walletAddress, connectWallet, showToast } = useCuotia();
  const [circles, setCircles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [nextStartId, setNextStartId] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const configured = isChainConfigured();

  const refresh = useCallback(async () => {
    if (!walletAddress || !configured) { setCircles([]); setNextStartId(null); setLoading(false); return; }
    setLoading(true); setError('');
    try {
      const page = await listSavingsCircles();
      setCircles(page.circles.filter((circle) => circle.members.some((member) => member.address === walletAddress)));
      setNextStartId(page.nextStartId);
      setMoreError('');
    } catch (cause) { setError(cause.message); }
    finally { setLoading(false); }
  }, [walletAddress, configured]);

  useEffect(() => { refresh(); }, [refresh]);

  async function loadMore() {
    if (nextStartId === null || loadingMore) return;
    setLoadingMore(true); setMoreError('');
    try {
      const page = await listSavingsCircles(nextStartId);
      const memberCircles = page.circles.filter((circle) => circle.members.some((member) => member.address === walletAddress));
      setCircles((current) => [...current, ...memberCircles]);
      setNextStartId(page.nextStartId);
    } catch (cause) { setMoreError(cause.message); }
    finally { setLoadingMore(false); }
  }

  async function act(circleId, kind) {
    if (!walletAddress) { await connectWallet().catch(() => {}); return; }
    setBusyId(circleId);
    try {
      const input = { address: walletAddress, id: circleId };
      if (kind === 'contribute') await contributeToSavingsCircle(input);
      if (kind === 'advance') await advanceSavingsCircleRound(input);
      if (kind === 'cancel') await cancelSavingsCircle(input);
      if (kind === 'claim') await claimSavingsCircle(input);
      if (kind === 'accept_earn') await acceptSavingsCircleEarn(input);
      if (kind === 'cancel_unstarted') await cancelUnstartedSavingsCircle(input);
      showToast(kind === 'contribute' ? 'Your contribution was recorded.' : kind === 'claim' ? 'Your claim was sent to your wallet.' : kind === 'cancel' ? 'The circle was cancelled. Members can now claim their own contributions.' : kind === 'accept_earn' ? 'You accepted Writz Earn for this circle.' : kind === 'cancel_unstarted' ? 'The unstarted circle was cancelled.' : 'The next round is open.');
      await refresh();
    } catch (cause) { showToast(cause.message || 'Could not complete this action.', 'error'); throw cause; }
    finally { setBusyId(null); }
  }

  const pending = circles.reduce((count, circle) => {
    const index = circle.members.findIndex((member) => member.address === walletAddress);
    return count + (circle.status === 'active' && index >= 0 && (circle.earnEnabled && !circle.earnAccepted[index] || !circle.contributions[index]?.paid) ? 1 : 0);
  }, 0);

  return <div className="content-page"><div className="page-heading"><div><h1>My dashboard</h1><p>Your savings circles and contributions that need your attention.</p></div></div>
    {!walletAddress ? <div className="page-state"><span className="empty-symbol"><UiIcon as={Wallet} size={34} /></span><h2>Connect your wallet to see your circles.</h2><p>Your public address lets us find the savings circles you belong to.</p><button className="button-primary" onClick={() => connectWallet().catch(() => {})}>Connect wallet</button></div> : <>
      <div className="account-summary"><div><span>Your address</span><strong>{walletAddress}</strong></div><div><span>Active savings circles</span><strong>{configured ? circles.filter((circle) => circle.status === 'active').length : '—'}</strong></div><div><span>Pending contributions</span><strong>{configured ? pending : '—'}</strong></div></div>
      {!configured && <SetupNote />}
      {configured && <><SavingsCollection circles={circles} loading={loading} error={error} retry={refresh} walletAddress={walletAddress} busyId={busyId} onAction={act} onTrustlineSetup={({ earnEnabled }) => setupUsdcTrustline({ address: walletAddress, earnEnabled })} showToast={showToast} />{nextStartId !== null && !loading && !error && <div className="circle-pagination">{moreError && <p role="alert">{moreError}</p>}<button className="button-secondary" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Loading…' : moreError ? 'Try again' : 'Load more circles'}</button></div>}</>}
    </>}
  </div>;
}

export function CreateSavingsCirclePage() {
  const { walletAddress, connectWallet, showToast } = useCuotia();
  const [form, setForm] = useState({ name: '', amount: '', frequency: 'weekly', rounds: '4', ownerName: '', others: [{ name: '', address: '' }], earnEnabled: false });
  const [busy, setBusy] = useState(false);
  const configured = isChainConfigured();
  function updateOther(index, field, value) { setForm((current) => ({ ...current, others: current.others.map((member, i) => i === index ? { ...member, [field]: value } : member) })); }
  async function submit(event) {
    event.preventDefault(); setBusy(true);
    try {
      const { StrKey } = await import('@stellar/stellar-sdk');
      const others = form.others.map(({ name, address }) => ({ name: name.trim(), address: address.trim() }));
      if (!StrKey.isValidEd25519PublicKey(walletAddress)) throw new Error('The connected wallet is not a valid Stellar address.');
      const invalidAddress = others.find((member) => !StrKey.isValidEd25519PublicKey(member.address));
      if (invalidAddress) throw new Error(`${invalidAddress.name || 'A participant'} does not have a valid Stellar address.`);
      if (others.some((member) => member.address === walletAddress) || new Set(others.map((member) => member.address)).size !== others.length) throw new Error('Each participant must have a unique address; do not add your organizer address again.');
      const { id } = await createSavingsCircle({ address: walletAddress, name: form.name.trim(), frequency: form.frequency, amount: form.amount, rounds: form.rounds, members: { ownerName: form.ownerName.trim(), others }, earnEnabled: form.earnEnabled });
      window.location.assign(`/savings/${id}`);
    } catch (cause) { showToast(cause.message || 'Could not create the savings circle.', 'error'); }
    finally { setBusy(false); }
  }
  if (!configured) return <div className="content-page"><Link className="back-link" href="/savings"><UiIcon as={ArrowLeft} size={16} /> Savings circles</Link><SetupNote /></div>;
  if (!walletAddress) return <div className="content-page"><section className="page-state"><h1>Connect your wallet to create a circle.</h1><p>Only your public Stellar address is shared; each transaction still needs your wallet signature.</p><button className="button-primary" onClick={() => connectWallet().catch(() => {})}>Connect wallet</button></section></div>;
  const total = Number(form.amount || 0) * Number(form.rounds || 0);
  return <div className="content-page create-page"><Link className="back-link" href="/savings"><UiIcon as={ArrowLeft} size={16} /> Savings circles</Link><div className="create-layout"><div className="create-intro"><h1>Save together.</h1><p>Choose each person’s contribution, schedule, and number of rounds. No one receives a payout before the whole circle completes.</p><ul><li>After completion, each person claims what they contributed.</li><li>If a round is missed beyond the 3-day grace period, anyone can cancel.</li><li>After cancellation, each person claims only their own recorded contributions.</li></ul></div><section className="create-form-panel"><h2>Circle details</h2><form onSubmit={submit}>
    <label className="field-label">Circle name<input required minLength="2" maxLength="48" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Neighborhood savings" /></label>
    <div className="form-grid"><label className="field-label">Contribution per person, per round<input required type="number" min="0.0000001" max="1000000" step="0.0000001" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="25.00" /></label><label className="field-label">Frequency<select value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value })}><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="monthly">Monthly</option></select></label></div>
    <label className="field-label">Number of rounds<input required type="number" min="1" max="52" step="1" value={form.rounds} onChange={(event) => setForm({ ...form, rounds: event.target.value })} /><span className="form-help">Each person plans to contribute {money(total)} {form.earnEnabled ? 'USDC through Writz Earn' : 'USDC'} in total.</span></label>
    <div className="member-fields"><div className="member-fields-heading"><span>Your membership</span><span>Organizer · {shortAddress(walletAddress)}</span></div><input required maxLength="40" value={form.ownerName} onChange={(event) => setForm({ ...form, ownerName: event.target.value })} placeholder="Your name or nickname" /></div>
    <div className="member-fields"><div className="member-fields-heading"><span>Invite members</span><span>{form.others.length + 1} / {MAX_MEMBERS}</span></div><p className="form-help">Enter each person’s public Stellar address.</p>{form.others.map((member, index) => <div className="invite-member" key={index}><span className="member-number">{String(index + 2).padStart(2, '0')}</span><input required maxLength="40" value={member.name} onChange={(event) => updateOther(index, 'name', event.target.value)} placeholder="Name or nickname" /><input required autoCapitalize="characters" spellCheck="false" value={member.address} onChange={(event) => updateOther(index, 'address', event.target.value.trim().toUpperCase())} placeholder="Public G… address" aria-label={`Stellar address for member ${index + 2}`} />{form.others.length > 1 && <button className="remove-member" type="button" onClick={() => setForm({ ...form, others: form.others.filter((_, i) => i !== index) })} aria-label="Remove member"><UiIcon as={X} size={16} /></button>}</div>)}{form.others.length + 1 < MAX_MEMBERS && <button className="add-member" type="button" onClick={() => setForm((current) => ({ ...current, others: [...current.others, { name: '', address: '' }] }))}><UiIcon as={Plus} size={16} /> Add a member</button>}</div>
    <div className="earn-choice"><label><input type="checkbox" checked={form.earnEnabled} onChange={(event) => setForm({ ...form, earnEnabled: event.target.checked })} /><span><strong>Enable optional Writz Earn</strong><small>Every member must accept before any contribution.</small></span></label>{form.earnEnabled && <p>Contributions go into Writz’s Testnet Earn vault and each member’s shares are tracked. The vault currently accepts Blend Testnet USDC as its underlying asset; Circle USDC cannot be deposited directly. Cuotia can add the required trustline in each member’s wallet. Yield is variable and not guaranteed, and claims can be lower or delayed. Creating the circle does not move funds.</p>}</div>
    {!form.earnEnabled && <p className="dialog-disclaimer">Standard savings: funds remain in the Cuotia contract and are not deposited into Writz. Signing creation does not transfer contributions.</p>}
    <button className="button-primary submit-button" disabled={busy} type="submit">{busy ? 'Waiting for signature…' : 'Create savings circle'} <UiIcon as={ArrowUpRight} size={16} /></button>
  </form></section></div></div>;
}

export function SavingsCircleDetailPage({ circleId }) {
  const { walletAddress, connectWallet, showToast } = useCuotia();
  const [circle, setCircle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');
  const configured = isChainConfigured();
  const refresh = useCallback(async () => {
    if (!configured) { setLoading(false); return; }
    setLoading(true); setError('');
    try { setCircle(await getSavingsCircle(circleId)); }
    catch (cause) { setError(cause.message); }
    finally { setLoading(false); }
  }, [circleId, configured]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!configured) return undefined;
    let active = true;
    setActivityLoading(true); setActivityError('');
    getSavingsCircleActivity(circleId).then((items) => { if (active) setActivity(items); })
      .catch((cause) => { if (active) setActivityError(cause.message || 'RPC error.'); })
      .finally(() => { if (active) setActivityLoading(false); });
    return () => { active = false; };
  }, [circleId, configured]);
  async function act(kind) {
    if (!walletAddress) { await connectWallet().catch(() => {}); return; }
    if (!kind) return;
    setBusy(true);
    try {
      const input = { address: walletAddress, id: Number(circleId) };
      if (kind === 'contribute') await contributeToSavingsCircle(input);
      if (kind === 'advance') await advanceSavingsCircleRound(input);
      if (kind === 'cancel') await cancelSavingsCircle(input);
      if (kind === 'claim') await claimSavingsCircle(input);
      if (kind === 'accept_earn') await acceptSavingsCircleEarn(input);
      if (kind === 'cancel_unstarted') await cancelUnstartedSavingsCircle(input);
      showToast(kind === 'contribute' ? 'Your contribution was recorded.' : kind === 'claim' ? 'Your claim was sent to your wallet.' : kind === 'cancel' ? 'The circle was cancelled. Members can claim their contributions.' : kind === 'accept_earn' ? 'You accepted Writz Earn for this circle.' : kind === 'cancel_unstarted' ? 'The unstarted circle was cancelled.' : 'The next round is open.');
      await refresh();
    } catch (cause) { showToast(cause.message || 'Could not complete this action.', 'error'); throw cause; }
    finally { setBusy(false); }
  }
  return <div className="content-page detail-page"><Link className="back-link" href="/savings"><UiIcon as={ArrowLeft} size={16} /> All savings circles</Link><div className="page-heading"><div><h1>Circle details</h1><p>Every member contributes through all rounds. Funds are claimed individually at the end.</p></div></div>
    {!configured ? <SetupNote /> : loading ? <CircleDetailSkeleton /> : error ? <div className="page-state page-error" role="alert"><strong>Could not open this savings circle.</strong><p>{error}</p><button className="button-secondary" onClick={refresh}>Try again</button></div> : circle && <><SavingsCircleCard circle={circle} walletAddress={walletAddress} busy={busy} onAction={(_id, kind) => act(kind)} onTrustlineSetup={({ earnEnabled }) => setupUsdcTrustline({ address: walletAddress, earnEnabled })} showToast={showToast} /><SavingsActivity activity={activity} loading={activityLoading} error={activityError} /><p className="detail-footnote">The Testnet RPC may limit how far back event history is available.</p></>}
  </div>;
}
