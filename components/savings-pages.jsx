'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, CircleAlert, ExternalLink, MessageCircle, PiggyBank, Plus, TrendingUp, Wallet, X } from 'lucide-react';
import {
  advanceSavingsCircleRound,
  acceptSavingsCircleEarn,
  cancelSavingsCircle,
  cancelUnstartedSavingsCircle,
  claimSavingsCircle,
  contributeToSavingsCircle,
  setSavingsCircleAutoPay,
  createSavingsCircle,
  getSavingsCircleActivity,
  readAutoPayGrant,
  readUsdcBalance,
  getSavingsCircle,
  listSavingsCircles,
  readWritzAssetsPerReferenceShare,
  setupUsdcTrustline,
  writzSharesToUsdc,
} from '../lib/cuotia-chain.mjs';
import { getChainConfiguration, isChainConfigured } from '../lib/chain-config.mjs';
import { useCuotia } from './app-provider.jsx';
import { useI18n } from './i18n-provider.jsx';
import { ActivitySkeleton, CircleCollectionSkeleton, CircleDetailSkeleton } from './loading-skeletons.jsx';
import UiIcon from './ui-icon.jsx';

const MAX_MEMBERS = 12;
const FREQUENCIES = ['weekly', 'biweekly', 'monthly'];
const ACTION_TOAST_KEYS = {
  contribute: 'toast.contributed',
  claim: 'toast.claimed',
  cancel: 'toast.cancelled',
  accept_earn: 'toast.acceptedEarn',
  cancel_unstarted: 'toast.cancelledUnstarted',
  advance: 'toast.advanced',
  auto_pay_on: 'toast.autoPayOn',
  auto_pay_off: 'toast.autoPayOff',
  auto_pay_renew: 'toast.autoPayRenewed',
};
const shortAddress = (address) => address ? `${address.slice(0, 5)}…${address.slice(-5)}` : '';

// Locale-aware number, date and frequency helpers (es-CR or en-US).
function useFormatters() {
  const { t, formatNumber, formatDate } = useI18n();
  return {
    money: (value) => formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    preciseMoney: (value) => formatNumber(value, { minimumFractionDigits: 2, maximumFractionDigits: 7 }),
    dateLabel: (timestamp) => timestamp ? `${formatDate(new Date(timestamp * 1000), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC` : '—',
    frequencyLabel: (frequency) => FREQUENCIES.includes(frequency) ? t(`freq.${frequency}`) : frequency,
  };
}

function SetupNote() {
  const { t } = useI18n();
  return <section className="page-state"><span className="empty-symbol"><UiIcon as={CircleAlert} size={34} /></span><h2>{t('setup.title')}</h2><p>{t('setup.bodyStart')}<code>NEXT_PUBLIC_CUOTIA_CONTRACT_ID</code>{t('setup.bodyEnd')}</p></section>;
}

function WalletConnectOptions({ connectWallet, connectCavosWallet, cavosEnabled, walletBusy, compact = false }) {
  const { t } = useI18n();
  return <div className={`wallet-connect-options${compact ? ' is-compact' : ''}`}>
    <button className="button-primary" type="button" disabled={walletBusy} onClick={() => connectWallet().catch(() => {})}>{walletBusy ? t('wallet.connecting') : t('wallet.browser')}</button>
    {cavosEnabled && <button className="button-secondary" type="button" disabled={walletBusy} onClick={() => connectCavosWallet().catch(() => {})}>{t('wallet.cavos')}</button>}
  </div>;
}

function WalletActivationNote({ walletAddress, walletProvider, earnApproval = false, creating = false }) {
  const { t } = useI18n();
  return <div className="wallet-activation-note" role="note">
    <p>{walletProvider === 'cavos' ? t('activation.cavos') : t('activation.browser')}
      {earnApproval ? t('activation.earnApproval') : creating ? t('activation.creating') : t('activation.contributions')}</p>
    {walletProvider !== 'cavos' && walletAddress && <a href={`https://friendbot.stellar.org/?addr=${encodeURIComponent(walletAddress)}`} target="_blank" rel="noreferrer">{t('activation.friendbot')} <UiIcon as={ExternalLink} size={14} /></a>}
  </div>;
}

function SavingsActivity({ circleId, activity, loading, error }) {
  const { t, tError, formatDate } = useI18n();
  return <section className="circle-activity" aria-labelledby="savings-activity-title"><h2 id="savings-activity-title">{t('activity.title')}</h2>
    {loading ? <ActivitySkeleton /> : error ? <p role="status">{t('activity.error', { error: tError(error, 'activity.rpcError') })}</p> : activity.length ? <ol>{activity.map((item) => <li key={`${item.hash}-${item.ledger}`}><span>{item.labelKey ? t(item.labelKey) : item.label}</span>{(item.event === 'contrib' || item.event === 'auto_paid') && circleId && <Link href={`/savings/${circleId}/receipt/${item.hash}`}>{t('activity.receipt')}</Link>}<a href={`https://stellar.expert/explorer/testnet/tx/${item.hash}`} target="_blank" rel="noreferrer">{t('activity.viewTx')} <UiIcon as={ExternalLink} size={14} /></a><time dateTime={item.timestamp}>{formatDate(new Date(item.timestamp), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' })} UTC</time></li>)}</ol> : <p>{t('activity.empty')}</p>}
  </section>;
}

function SavingsCircleCard({ circle, walletAddress, walletProvider, onAction, onTrustlineSetup, onConnectBrowser, onConnectCavos, cavosEnabled, walletBusy, busy, actionPending = false, showToast, compact = false }) {
  const { t, tError, formatNumber, formatDate } = useI18n();
  const { money, preciseMoney, dateLabel, frequencyLabel } = useFormatters();
  const [now, setNow] = useState(0);
  const [trustlineSetupRequired, setTrustlineSetupRequired] = useState(false);
  const [trustlineBusy, setTrustlineBusy] = useState(false);
  const [writzRate, setWritzRate] = useState(null);
  const trustlineLock = useRef(false);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    if (!circle.earnEnabled || !circle.earnShares?.some((shares) => Number(shares) > 0)) { setWritzRate(null); return undefined; }
    readWritzAssetsPerReferenceShare().then((rate) => { if (active) setWritzRate(rate); }).catch(() => {});
    return () => { active = false; };
  }, [circle.earnEnabled, circle.earnShares]);
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
  const totalVaultValue = writzRate ? circle.earnShares.reduce((sum, shares) => sum + writzSharesToUsdc(shares, writzRate), 0n) : null;
  const vaultDeltaPercent = totalVaultValue !== null && circle.pot > 0 ? ((Number(totalVaultValue) / 10_000_000) - circle.pot) / circle.pot * 100 : null;
  const myAutoPay = isMember && Boolean(circle.autoPay?.[memberIndex]);
  const canToggleAutoPay = circle.status === 'active' && isMember && circle.earnReady;
  // Lets a member release what was still authorized once the circle ended or was cancelled.
  const canDisableEndedAutoPay = circle.status !== 'active' && myAutoPay;
  const [autoPayGrant, setAutoPayGrant] = useState(null);
  const [autoPayBalance, setAutoPayBalance] = useState(null);
  const needsNextContribution = canToggleAutoPay && myAutoPay && myContribution && !myContribution.paid && !expired;
  useEffect(() => {
    // With automatic contribution on, warn early if the next collection would fail.
    let active = true;
    if (compact || !needsNextContribution || !walletAddress || !circle.token) { setAutoPayBalance(null); return undefined; }
    const { rpcUrl, networkPassphrase } = getChainConfiguration();
    readUsdcBalance(walletAddress, circle.token, rpcUrl, networkPassphrase)
      .then((balance) => { if (active) setAutoPayBalance(Number(balance) / 10_000_000); })
      .catch((cause) => {
        if (!active) return;
        setAutoPayBalance(null);
        if (cause?.code === 'USDC_TRUSTLINE_REQUIRED') setTrustlineSetupRequired(true);
      });
    return () => { active = false; };
  }, [compact, needsNextContribution, walletAddress, circle.token, circle.round, paidCount]);
  const autoPayLowBalance = autoPayBalance !== null && autoPayBalance < circle.contribution;
  useEffect(() => {
    let active = true;
    if (compact || !myAutoPay || !walletAddress || !circle.token) { setAutoPayGrant(null); return undefined; }
    readAutoPayGrant({ address: walletAddress, token: circle.token }).then((grant) => { if (active) setAutoPayGrant(grant); }).catch(() => { if (active) setAutoPayGrant(null); });
    return () => { active = false; };
  }, [compact, myAutoPay, walletAddress, circle.token, circle.round, paidCount]);
  const autoPayExpiringSoon = Boolean(autoPayGrant && !autoPayGrant.expired && autoPayGrant.expiresAt && autoPayGrant.expiresAt - now < 30 * 24 * 60 * 60 * 1000);
  const grantDate = autoPayGrant?.expiresAt ? formatDate(new Date(autoPayGrant.expiresAt), { dateStyle: 'medium' }) : '';
  const canAcceptEarn = circle.status === 'active' && circle.earnEnabled && isMember && !circle.earnAccepted[memberIndex] && circle.pot === 0;
  const canCancelUnstarted = circle.status === 'active' && circle.earnEnabled && isMember && circle.pot === 0;
  const assetLabel = circle.earnEnabled ? 'Blend USDC' : 'Circle USDC';
  const [shareUrl, setShareUrl] = useState('');
  const [remindUrl, setRemindUrl] = useState('');
  useEffect(() => {
    // Built after mount: the link uses the current site address (localhost, preview or production).
    if (compact || circle.status !== 'active') { setShareUrl(''); setRemindUrl(''); return; }
    const circleUrl = `${window.location.origin}/savings/${circle.id}`;
    const message = t('share.message', { name: circle.name, amount: money(circle.contribution), asset: assetLabel, frequency: frequencyLabel(circle.frequency).toLowerCase(), rounds: circle.roundsTotal, url: circleUrl });
    setShareUrl(`https://wa.me/?text=${encodeURIComponent(message)}`);
    // Reminder: lists who has not contributed this round. The person sends it to the group.
    const pending = circle.members.filter((_, index) => !circle.contributions[index]?.paid).map((member) => member.name);
    const windowOpen = Date.now() <= (circle.roundDueAt + circle.gracePeriodSeconds) * 1000;
    if (!isMember || !pending.length || !windowOpen) { setRemindUrl(''); return; }
    const reminder = t('remind.message', { name: circle.name, count: pending.length, amount: money(circle.contribution), asset: assetLabel, round: circle.round + 1, members: pending.join(', '), date: dateLabel(circle.roundDueAt), url: circleUrl });
    setRemindUrl(`https://wa.me/?text=${encodeURIComponent(reminder)}`);
  }, [compact, circle.status, circle.id, circle.name, circle.contribution, circle.frequency, circle.roundsTotal, circle.round, circle.roundDueAt, paidCount, isMember, assetLabel, t]);
  const contributionPercent = Math.round((paidCount / circle.members.length) * 100);
  const waiting = t('common.waitingSignature');
  const roundChip = circle.status === 'active'
    ? t('card.round', { current: circle.round + 1, total: circle.roundsTotal })
    : circle.status === 'complete' ? t('card.complete') : circle.status === 'cancelled' ? t('card.cancelled') : t('card.statusUnknown');
  const vaultDelta = vaultDeltaPercent !== null ? t('card.vaultDelta', { delta: formatNumber(vaultDeltaPercent, { minimumFractionDigits: 3, maximumFractionDigits: 3, signDisplay: 'always' }) }) : '';
  async function runAction(kind) {
    try { await onAction(circle.id, kind); }
    catch (cause) { if (cause?.code === 'USDC_TRUSTLINE_REQUIRED') setTrustlineSetupRequired(true); }
  }
  async function setupTrustline() {
    if (trustlineLock.current) return;
    trustlineLock.current = true;
    setTrustlineBusy(true);
    try {
      await onTrustlineSetup({ earnEnabled: circle.earnEnabled });
      setTrustlineSetupRequired(false);
      showToast(t('trustline.done'));
    } catch (cause) { showToast(tError(cause, 'trustline.failed'), 'error'); }
    finally { trustlineLock.current = false; setTrustlineBusy(false); }
  }
  function memberStatus(index) {
    const entry = circle.contributions[index];
    return entry?.claimed ? t('status.claimed') : entry?.paid ? t('status.paid') : t('status.pending');
  }

  return <article className="circle-card savings-card">
    <div className="circle-heading"><div><h3><Link href={`/savings/${circle.id}`}>{circle.name}</Link></h3><p>{t('card.members', { count: circle.members.length })} <span>·</span> {frequencyLabel(circle.frequency)} <span>·</span> {t('card.rounds', { count: circle.roundsTotal })} <span>·</span> {t('card.perMember', { amount: money(circle.contribution), asset: assetLabel })}</p>{circle.earnEnabled && !compact && <p className="form-help">{t('card.blendNote')}</p>}</div><span className="round-chip">{roundChip}</span></div>
    <div className="progress-track" role="progressbar" aria-label={t('card.progressAria')} aria-valuenow={paidCount} aria-valuemin="0" aria-valuemax={circle.members.length}><i style={{ width: `${contributionPercent}%` }} /></div>
    <div className="circle-stats"><div><span>{t('card.contributionsThisRound')}</span><b>{paidCount} / {circle.members.length}</b></div><div><span>{t('card.totalContributed')}</span><b>{money(circle.pot)} {assetLabel}</b></div>{circle.earnEnabled && <div><span>{t('card.vaultValue')}{vaultDelta}</span><b>{totalVaultValue !== null ? `${preciseMoney(Number(totalVaultValue) / 10_000_000)} Blend USDC` : '—'}</b></div>}<div><span>{t('card.deadline')}</span><b>{dateLabel(circle.roundDueAt)}</b></div></div>
    {circle.earnEnabled && <div className={`earn-consensus ${compact ? 'is-compact' : ''}`}>
      <div className="earn-consensus-heading"><span className="earn-consensus-mark"><UiIcon as={TrendingUp} size={17} /></span><div><strong>{t('consent.title')}</strong><span>{t('consent.count', { accepted: earnAcceptedCount, total: circle.members.length })}{!circle.earnReady && isMember && !circle.earnAccepted[memberIndex] ? t('consent.yoursPending') : ''}</span></div></div>
      {!compact && <p className="earn-consensus-copy">{circle.earnReady ? t('consent.ready') : t('consent.waiting')}</p>}
      {!compact && <div className="earn-consensus-actions">
        {circle.status === 'active' && !circle.earnReady && !walletAddress && <><p className="form-help">{t('consent.connect')}</p><WalletConnectOptions compact connectWallet={onConnectBrowser} connectCavosWallet={onConnectCavos} cavosEnabled={cavosEnabled} walletBusy={walletBusy} /></>}
        {canAcceptEarn && <button className="button-consent" type="button" disabled={actionPending} onClick={() => runAction('accept_earn')}><span className="consent-check"><UiIcon as={Check} size={15} /></span><span className="consent-copy"><strong>{busy ? waiting : t('consent.approve')}</strong><small>{t('consent.approveNote')}</small></span></button>}
        {canCancelUnstarted && <div className="earn-decline"><button className="button-decline" type="button" disabled={actionPending} onClick={() => runAction('cancel_unstarted')}>{t('consent.decline')}</button><span>{t('consent.declineNote')}</span></div>}
      </div>}
      {!compact && canAcceptEarn && <WalletActivationNote walletAddress={walletAddress} walletProvider={walletProvider} earnApproval />}
    </div>}
    {!compact && circle.status === 'active' && <p className={`circle-due${expired && !allPaid ? ' is-overdue' : ''}`}>{allPaid && circle.round + 1 < circle.roundsTotal ? t('card.allPaid', { date: dateLabel(circle.roundDueAt) }) : t('card.graceNote', { date: dateLabel(deadline) })}</p>}
    {!compact && <ul className="member-status-list" aria-label={t('card.memberStatusAria')}>{circle.members.map((member, index) => <li key={member.address}><span className={`member-status-dot ${circle.contributions[index]?.paid ? 'is-paid' : ''}`} /><span className="member-status-name">{member.name}{member.address === walletAddress ? t('card.you') : ''}</span><span className="member-status-address">{shortAddress(member.address)}</span><span className="member-status-label">{circle.earnEnabled && !circle.earnAccepted[index] ? t('card.consentPending') : ''}{money(circle.contributions[index]?.total)} {assetLabel} · {memberStatus(index)}{circle.status === 'active' && circle.autoPay?.[index] ? t('auto.memberLabel') : ''}{circle.earnEnabled && writzRate !== null && Number(circle.earnShares?.[index]) > 0 ? t('card.inVault', { amount: preciseMoney(Number(writzSharesToUsdc(circle.earnShares[index], writzRate)) / 10_000_000) }) : ''}</span></li>)}</ul>}
    {!compact && (canToggleAutoPay || canDisableEndedAutoPay) && <div className={`auto-pay-panel${myAutoPay ? ' is-on' : ''}${autoPayGrant?.expired ? ' is-warning' : ''}`}>
      <div className="auto-pay-copy"><strong>{t('auto.title')} <span className="auto-pay-state">{myAutoPay ? t('auto.on') : t('auto.off')}</span></strong>
        {canDisableEndedAutoPay ? <p>{t('auto.endedNote')}</p> : <p>{t(myAutoPay ? 'auto.bodyOn' : 'auto.bodyOff', { amount: money(circle.contribution), asset: assetLabel })}</p>}
        {canToggleAutoPay && myAutoPay && autoPayGrant && (autoPayGrant.expired
          ? <p className="auto-pay-alert" role="alert">{t('auto.expired')}</p>
          : autoPayExpiringSoon
            ? <p className="auto-pay-alert">{t('auto.expiringSoon', { date: grantDate })}</p>
            : grantDate && <p className="form-help">{t('auto.validUntil', { date: grantDate })}</p>)}
        {autoPayLowBalance && <p className="auto-pay-alert" role="alert">{t('auto.lowBalance', { balance: money(autoPayBalance), amount: money(circle.contribution), asset: assetLabel })}</p>}
        {canToggleAutoPay && myAutoPay && !autoPayGrant?.expired && !autoPayLowBalance && !myContribution?.paid && !expired && <p className="form-help">{t('auto.pendingCollection')}</p>}
      </div>
      <div className="auto-pay-actions">
        {canToggleAutoPay && myAutoPay && (autoPayGrant?.expired || autoPayExpiringSoon) && <button className="button-primary" type="button" disabled={actionPending} onClick={() => runAction('auto_pay_renew')}>{busy ? waiting : t('auto.renew')}</button>}
        <button className={myAutoPay ? 'button-secondary' : 'button-primary'} type="button" role="switch" aria-checked={myAutoPay} disabled={actionPending} onClick={() => runAction(myAutoPay ? 'auto_pay_off' : 'auto_pay_on')}>{busy ? waiting : myAutoPay ? t('auto.disable') : t('auto.enable')}</button>
      </div>
    </div>}
    <div className="circle-controls">
      {!walletAddress && !circle.earnEnabled && <div className="circle-connect-prompt"><span>{t('card.connectPrompt')}</span><WalletConnectOptions compact connectWallet={onConnectBrowser} connectCavosWallet={onConnectCavos} cavosEnabled={cavosEnabled} walletBusy={walletBusy} /></div>}
      {walletAddress && !isMember && <span className="complete-label">{t('card.notMember')}</span>}
      {!compact && walletAddress && !canAcceptEarn && (canContribute || canAdvance || canCancel || canCancelUnstarted || canClaim) && <WalletActivationNote walletAddress={walletAddress} walletProvider={walletProvider} />}
      {canContribute && <button className="button-primary" disabled={actionPending} onClick={() => runAction('contribute')}>{busy ? waiting : t('card.contribute', { amount: money(circle.contribution), asset: assetLabel })} <UiIcon as={ArrowUpRight} size={16} /></button>}
      {isMember && myContribution?.paid && circle.status === 'active' && <span className="complete-label"><UiIcon as={Check} size={15} /> {t('card.recorded')}</span>}
      {canAdvance && <button className="button-secondary" disabled={actionPending} onClick={() => runAction('advance')}>{busy ? waiting : t('card.advance')} <UiIcon as={ArrowRight} size={16} /></button>}
      {canCancel && <button className="button-secondary" disabled={actionPending} onClick={() => runAction('cancel')}>{busy ? waiting : t('card.cancel')}</button>}
      {canClaim && <button className="button-primary" disabled={actionPending} onClick={() => runAction('claim')}>{busy ? waiting : circle.earnEnabled ? t('card.claimWritz') : t('card.claim', { amount: money(myContribution.total) })} <UiIcon as={ArrowUpRight} size={16} /></button>}
      {trustlineSetupRequired && <div className="inline-note trustline-setup-note" role="status"><p>{t('card.trustlineNote', { asset: assetLabel })}</p>{walletProvider !== 'cavos' && walletAddress && <a href={`https://friendbot.stellar.org/?addr=${encodeURIComponent(walletAddress)}`} target="_blank" rel="noreferrer">{t('activation.friendbot')} <UiIcon as={ExternalLink} size={14} /></a>}<button className="button-secondary" type="button" disabled={actionPending || trustlineBusy} onClick={setupTrustline}>{trustlineBusy ? waiting : t('card.authorize', { asset: assetLabel })}</button><a href={circle.earnEnabled ? 'https://testnet.blend.capital' : 'https://faucet.circle.com/'} target="_blank" rel="noreferrer">{t('card.getAsset', { asset: assetLabel })} <UiIcon as={ExternalLink} size={14} /></a></div>}
      {isMember && myContribution?.claimed && <span className="complete-label"><UiIcon as={Check} size={15} /> {t('card.claimedDone')}</span>}
      {remindUrl && <a className="button-quiet share-whatsapp" href={remindUrl} target="_blank" rel="noreferrer"><UiIcon as={MessageCircle} size={16} /> {t('remind.whatsapp')}</a>}
      {shareUrl && <a className="button-quiet share-whatsapp" href={shareUrl} target="_blank" rel="noreferrer" title={t('share.note')}><UiIcon as={MessageCircle} size={16} /> {t('share.whatsapp')}</a>}
      {compact && <Link className="button-quiet" href={`/savings/${circle.id}`}>{t('card.details')} <UiIcon as={ArrowRight} size={15} /></Link>}
    </div>
  </article>;
}

function SavingsCollection({ circles, loading, error, retry, busyId, emptyTitle, emptyBody, ...cardProps }) {
  const { t, tError } = useI18n();
  if (loading) return <CircleCollectionSkeleton />;
  if (error) return <div className="page-state page-error" role="alert"><strong>{t('list.error')}</strong><p>{tError(error)}</p><button className="button-secondary" onClick={retry}>{t('common.retry')}</button></div>;
  if (!circles.length) return <div className="page-state"><span className="empty-symbol"><UiIcon as={PiggyBank} size={34} /></span><h2>{emptyTitle || t('list.emptyTitle')}</h2><p>{emptyBody || t('list.emptyBody')}</p><Link className="button-primary" href="/savings/create">{t('shell.createCircle')}</Link></div>;
  return <div className="circle-list">{circles.map((circle) => <SavingsCircleCard key={circle.id} circle={circle} compact busy={busyId === circle.id} actionPending={busyId !== null} {...cardProps} />)}</div>;
}

async function runSavingsAction(kind, input) {
  if (kind === 'contribute') await contributeToSavingsCircle(input);
  if (kind === 'advance') await advanceSavingsCircleRound(input);
  if (kind === 'cancel') await cancelSavingsCircle(input);
  if (kind === 'claim') await claimSavingsCircle(input);
  if (kind === 'accept_earn') await acceptSavingsCircleEarn(input);
  if (kind === 'cancel_unstarted') await cancelUnstartedSavingsCircle(input);
  if (kind === 'auto_pay_on') await setSavingsCircleAutoPay({ ...input, enabled: true });
  if (kind === 'auto_pay_off') await setSavingsCircleAutoPay({ ...input, enabled: false });
  if (kind === 'auto_pay_renew') await setSavingsCircleAutoPay({ ...input, enabled: true });
}

export function SavingsCirclesPage() {
  const { walletAddress, walletProvider, connectWallet, connectCavosWallet, cavosEnabled, walletBusy, showToast } = useCuotia();
  const { t, tError } = useI18n();
  const [circles, setCircles] = useState([]);
  const [circleFilter, setCircleFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const actionLock = useRef(false);
  const [nextStartId, setNextStartId] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreLock = useRef(false);
  const [moreError, setMoreError] = useState(null);
  const configured = isChainConfigured();
  const refresh = useCallback(async () => {
    if (!configured) { setLoading(false); setNextStartId(null); return; }
    setLoading(true); setError(null);
    try {
      const page = await listSavingsCircles();
      setCircles(page.circles);
      setNextStartId(page.nextStartId);
      setMoreError(null);
    }
    catch (cause) { setError(cause || new Error('')); }
    finally { setLoading(false); }
  }, [configured]);
  useEffect(() => { refresh(); }, [refresh]);
  async function loadMore() {
    if (nextStartId === null || loadMoreLock.current) return;
    loadMoreLock.current = true;
    setLoadingMore(true); setMoreError(null);
    try {
      const page = await listSavingsCircles(nextStartId);
      setCircles((current) => [...current, ...page.circles]);
      setNextStartId(page.nextStartId);
    } catch (cause) { setMoreError(cause || new Error('')); }
    finally { loadMoreLock.current = false; setLoadingMore(false); }
  }
  async function trustlineSetup({ earnEnabled = false } = {}) {
    if (!walletAddress) { await connectWallet(); return; }
    await setupUsdcTrustline({ address: walletAddress, earnEnabled });
  }
  async function act(circleId, kind) {
    if (!walletAddress) { await connectWallet().catch(() => {}); return; }
    if (!kind || actionLock.current) return;
    actionLock.current = true;
    setBusyId(circleId);
    try {
      await runSavingsAction(kind, { address: walletAddress, id: circleId });
      showToast(t(ACTION_TOAST_KEYS[kind] || 'toast.advanced'));
      await refresh();
    } catch (cause) { showToast(tError(cause, 'toast.actionFailed'), 'error'); throw cause; }
    finally { actionLock.current = false; setBusyId(null); }
  }
  const activeFilter = walletAddress ? circleFilter : 'all';
  const mineCount = walletAddress ? circles.filter((circle) => circle.members.some((member) => member.address === walletAddress)).length : 0;
  const visibleCircles = activeFilter === 'mine' ? circles.filter((circle) => circle.members.some((member) => member.address === walletAddress)) : circles;
  return <div className="content-page"><div className="page-heading"><div><h1>{t('nav.savings')}</h1><p>{t('circles.lead')}</p></div><Link className="button-primary" href="/savings/create"><UiIcon as={Plus} size={17} /> {t('shell.createCircle')}</Link></div>
    {walletAddress && <div className="circle-filter" role="group" aria-label={t('circles.filterAria')}><button type="button" className={activeFilter === 'all' ? 'is-active' : ''} aria-pressed={activeFilter === 'all'} onClick={() => setCircleFilter('all')}>{t('circles.all')}</button><button type="button" className={activeFilter === 'mine' ? 'is-active' : ''} aria-pressed={activeFilter === 'mine'} onClick={() => setCircleFilter('mine')}>{t('circles.mine', { count: mineCount })}</button></div>}
    {!configured ? <SetupNote /> : <><SavingsCollection circles={visibleCircles} loading={loading} error={error} retry={refresh} emptyTitle={activeFilter === 'mine' ? t('circles.mineEmptyTitle') : undefined} emptyBody={activeFilter === 'mine' ? t('circles.mineEmptyBody') : undefined} walletAddress={walletAddress} walletProvider={walletProvider} busyId={busyId} onAction={(circleId, kind) => act(circleId, kind)} onConnectBrowser={connectWallet} onConnectCavos={connectCavosWallet} cavosEnabled={cavosEnabled} walletBusy={walletBusy} onTrustlineSetup={trustlineSetup} showToast={showToast} />{nextStartId !== null && !loading && !error && <div className="circle-pagination">{moreError && <p role="alert">{tError(moreError)}</p>}<button className="button-secondary" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? t('common.loading') : moreError ? t('common.retry') : t('circles.loadMore')}</button></div>}</>}
  </div>;
}

export function SavingsDashboardPage() {
  const { walletAddress, walletProvider, connectWallet, connectCavosWallet, cavosEnabled, walletBusy, showToast } = useCuotia();
  const { t, tError } = useI18n();
  const [circles, setCircles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const actionLock = useRef(false);
  const [nextStartId, setNextStartId] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadMoreLock = useRef(false);
  const [moreError, setMoreError] = useState(null);
  const configured = isChainConfigured();

  const refresh = useCallback(async () => {
    if (!walletAddress || !configured) { setCircles([]); setNextStartId(null); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const page = await listSavingsCircles();
      setCircles(page.circles.filter((circle) => circle.members.some((member) => member.address === walletAddress)));
      setNextStartId(page.nextStartId);
      setMoreError(null);
    } catch (cause) { setError(cause || new Error('')); }
    finally { setLoading(false); }
  }, [walletAddress, configured]);

  useEffect(() => { refresh(); }, [refresh]);

  async function loadMore() {
    if (nextStartId === null || loadMoreLock.current) return;
    loadMoreLock.current = true;
    setLoadingMore(true); setMoreError(null);
    try {
      const page = await listSavingsCircles(nextStartId);
      const memberCircles = page.circles.filter((circle) => circle.members.some((member) => member.address === walletAddress));
      setCircles((current) => [...current, ...memberCircles]);
      setNextStartId(page.nextStartId);
    } catch (cause) { setMoreError(cause || new Error('')); }
    finally { loadMoreLock.current = false; setLoadingMore(false); }
  }

  async function act(circleId, kind) {
    if (!walletAddress) { await connectWallet().catch(() => {}); return; }
    if (actionLock.current) return;
    actionLock.current = true;
    setBusyId(circleId);
    try {
      await runSavingsAction(kind, { address: walletAddress, id: circleId });
      showToast(t(ACTION_TOAST_KEYS[kind] || 'toast.advanced'));
      await refresh();
    } catch (cause) { showToast(tError(cause, 'toast.actionFailed'), 'error'); throw cause; }
    finally { actionLock.current = false; setBusyId(null); }
  }

  const pending = circles.reduce((count, circle) => {
    const index = circle.members.findIndex((member) => member.address === walletAddress);
    return count + (circle.status === 'active' && index >= 0 && (circle.earnEnabled && !circle.earnAccepted[index] || !circle.contributions[index]?.paid) ? 1 : 0);
  }, 0);

  return <div className="content-page"><div className="page-heading"><div><h1>{t('dash.title')}</h1><p>{t('dash.lead')}</p></div></div>
    {!walletAddress ? <div className="page-state"><span className="empty-symbol"><UiIcon as={Wallet} size={34} /></span><h2>{t('dash.connectTitle')}</h2><p>{t('dash.connectBody')}</p><WalletConnectOptions connectWallet={connectWallet} connectCavosWallet={connectCavosWallet} cavosEnabled={cavosEnabled} walletBusy={walletBusy} /></div> : <>
      <div className="account-summary"><div><span>{t('dash.address')}</span><strong>{walletAddress}</strong></div><div><span>{t('dash.active')}</span><strong>{configured ? circles.filter((circle) => circle.status === 'active').length : '—'}</strong></div><div><span>{t('dash.pending')}</span><strong>{configured ? pending : '—'}</strong></div></div>
      {!configured && <SetupNote />}
      {configured && <><SavingsCollection circles={circles} loading={loading} error={error} retry={refresh} walletAddress={walletAddress} walletProvider={walletProvider} busyId={busyId} onAction={act} onConnectBrowser={connectWallet} onConnectCavos={connectCavosWallet} cavosEnabled={cavosEnabled} walletBusy={walletBusy} onTrustlineSetup={({ earnEnabled }) => setupUsdcTrustline({ address: walletAddress, earnEnabled })} showToast={showToast} />{nextStartId !== null && !loading && !error && <div className="circle-pagination">{moreError && <p role="alert">{tError(moreError)}</p>}<button className="button-secondary" type="button" disabled={loadingMore} onClick={loadMore}>{loadingMore ? t('common.loading') : moreError ? t('common.retry') : t('dash.loadMore')}</button></div>}</>}
    </>}
  </div>;
}

export function CreateSavingsCirclePage() {
  const { walletAddress, walletProvider, connectWallet, connectCavosWallet, cavosEnabled, walletBusy, showToast } = useCuotia();
  const { t, tError } = useI18n();
  const { money } = useFormatters();
  const [form, setForm] = useState({ name: '', amount: '', frequency: 'weekly', rounds: '4', ownerName: '', others: [{ name: '', address: '' }], earnEnabled: false });
  const [busy, setBusy] = useState(false);
  const submitLock = useRef(false);
  const configured = isChainConfigured();
  function updateOther(index, field, value) { setForm((current) => ({ ...current, others: current.others.map((member, i) => i === index ? { ...member, [field]: value } : member) })); }
  async function submit(event) {
    event.preventDefault();
    if (submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    try {
      const { StrKey } = await import('@stellar/stellar-sdk');
      const others = form.others.map(({ name, address }) => ({ name: name.trim(), address: address.trim() }));
      if (!StrKey.isValidEd25519PublicKey(walletAddress)) throw new Error(t('create.invalidWallet'));
      const invalidAddress = others.find((member) => !StrKey.isValidEd25519PublicKey(member.address));
      if (invalidAddress) throw new Error(invalidAddress.name ? t('create.invalidMember', { name: invalidAddress.name }) : t('create.invalidMemberUnnamed'));
      if (others.some((member) => member.address === walletAddress) || new Set(others.map((member) => member.address)).size !== others.length) throw new Error(t('create.duplicate'));
      const { id } = await createSavingsCircle({ address: walletAddress, name: form.name.trim(), frequency: form.frequency, amount: form.amount, rounds: form.rounds, members: { ownerName: form.ownerName.trim(), others }, earnEnabled: form.earnEnabled });
      window.location.assign(`/savings/${id}`);
    } catch (cause) { showToast(tError(cause, 'create.failed'), 'error'); }
    finally { submitLock.current = false; setBusy(false); }
  }
  if (!configured) return <div className="content-page"><Link className="back-link" href="/savings"><UiIcon as={ArrowLeft} size={16} /> {t('nav.savings')}</Link><SetupNote /></div>;
  if (!walletAddress) return <div className="content-page"><section className="page-state"><h1>{t('create.connectTitle')}</h1><p>{t('create.connectBody')}</p><WalletConnectOptions connectWallet={connectWallet} connectCavosWallet={connectCavosWallet} cavosEnabled={cavosEnabled} walletBusy={walletBusy} /></section></div>;
  const total = Number(form.amount || 0) * Number(form.rounds || 0);
  return <div className="content-page create-page"><Link className="back-link" href="/savings"><UiIcon as={ArrowLeft} size={16} /> {t('nav.savings')}</Link><div className="create-layout"><div className="create-intro"><h1>{t('create.title')}</h1><p>{t('create.lead')}</p><ul><li>{t('create.b1')}</li><li>{t('create.b2')}</li><li>{t('create.b3')}</li></ul></div><section className="create-form-panel"><h2>{t('card.details')}</h2><form onSubmit={submit}>
    <label className="field-label">{t('create.name')}<input required minLength="2" maxLength="48" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={t('create.namePlaceholder')} /></label>
    <div className="form-grid"><label className="field-label">{t('create.amount')}<input required type="number" min="0.0000001" max="1000000" step="0.0000001" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="25.00" /></label><label className="field-label">{t('create.frequency')}<select value={form.frequency} onChange={(event) => setForm({ ...form, frequency: event.target.value })}>{FREQUENCIES.map((frequency) => <option key={frequency} value={frequency}>{t(`freq.${frequency}`)}</option>)}</select></label></div>
    <label className="field-label">{t('create.rounds')}<input required type="number" min="1" max="52" step="1" value={form.rounds} onChange={(event) => setForm({ ...form, rounds: event.target.value })} /><span className="form-help">{t('create.totalHelp', { amount: money(total), asset: form.earnEnabled ? t('create.assetEarn') : 'Circle USDC' })}</span></label>
    <div className="member-fields"><div className="member-fields-heading"><span>{t('create.yourMembership')}</span><span>{t('create.organizer', { address: shortAddress(walletAddress) })}</span></div><input required maxLength="40" value={form.ownerName} onChange={(event) => setForm({ ...form, ownerName: event.target.value })} placeholder={t('create.yourName')} /></div>
    <div className="member-fields"><div className="member-fields-heading"><span>{t('create.invite')}</span><span>{form.others.length + 1} / {MAX_MEMBERS}</span></div><p className="form-help">{t('create.inviteHelp')}</p>{form.others.map((member, index) => <div className="invite-member" key={index}><span className="member-number">{String(index + 2).padStart(2, '0')}</span><input required maxLength="40" value={member.name} onChange={(event) => updateOther(index, 'name', event.target.value)} placeholder={t('create.memberName')} /><input required autoCapitalize="characters" spellCheck="false" value={member.address} onChange={(event) => updateOther(index, 'address', event.target.value.trim().toUpperCase())} placeholder={t('create.memberAddress')} aria-label={t('create.memberAddressAria', { n: String(index + 2) })} />{form.others.length > 1 && <button className="remove-member" type="button" onClick={() => setForm({ ...form, others: form.others.filter((_, i) => i !== index) })} aria-label={t('create.remove')}><UiIcon as={X} size={16} /></button>}</div>)}{form.others.length + 1 < MAX_MEMBERS && <button className="add-member" type="button" onClick={() => setForm((current) => ({ ...current, others: [...current.others, { name: '', address: '' }] }))}><UiIcon as={Plus} size={16} /> {t('create.add')}</button>}</div>
    <div className="earn-choice"><label><input type="checkbox" checked={form.earnEnabled} onChange={(event) => setForm({ ...form, earnEnabled: event.target.checked })} /><span><strong>{t('create.earnLabel')}</strong><small>{t('create.earnSmall')}</small></span></label>{form.earnEnabled ? <p>{t('create.earnOnStart')}<strong>{t('create.earnOnStrong')}</strong>{t('create.earnOnEnd')}</p> : <p>{t('create.earnOffStart')}<strong>{t('create.earnOffStrong')}</strong>{t('create.earnOffEnd')}</p>}</div>
    <WalletActivationNote walletAddress={walletAddress} walletProvider={walletProvider} creating />
    <button className="button-primary submit-button" disabled={busy} type="submit">{busy ? t('common.waitingSignature') : t('create.submit')} <UiIcon as={ArrowUpRight} size={16} /></button>
  </form></section></div></div>;
}

export function SavingsCircleDetailPage({ circleId }) {
  const { walletAddress, walletProvider, connectWallet, connectCavosWallet, cavosEnabled, walletBusy, showToast } = useCuotia();
  const { t, tError } = useI18n();
  const [circle, setCircle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const actionLock = useRef(false);
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState(null);
  const configured = isChainConfigured();
  const refresh = useCallback(async () => {
    if (!configured) { setLoading(false); return; }
    setLoading(true); setError(null);
    try { setCircle(await getSavingsCircle(circleId)); }
    catch (cause) { setError(cause || new Error('')); }
    finally { setLoading(false); }
  }, [circleId, configured]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!configured) return undefined;
    let active = true;
    setActivityLoading(true); setActivityError(null);
    getSavingsCircleActivity(circleId).then((items) => { if (active) setActivity(items); })
      .catch((cause) => { if (active) setActivityError(cause || new Error('')); })
      .finally(() => { if (active) setActivityLoading(false); });
    return () => { active = false; };
  }, [circleId, configured]);
  async function act(kind) {
    if (!walletAddress) { await connectWallet().catch(() => {}); return; }
    if (!kind || actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    try {
      await runSavingsAction(kind, { address: walletAddress, id: Number(circleId) });
      showToast(t(ACTION_TOAST_KEYS[kind] || 'toast.advanced'));
      await refresh();
    } catch (cause) { showToast(tError(cause, 'toast.actionFailed'), 'error'); throw cause; }
    finally { actionLock.current = false; setBusy(false); }
  }
  return <div className="content-page detail-page"><Link className="back-link" href="/savings"><UiIcon as={ArrowLeft} size={16} /> {t('detail.back')}</Link><div className="page-heading"><div><h1>{t('card.details')}</h1><p>{t('detail.lead')}</p></div></div>
    {!configured ? <SetupNote /> : loading ? <CircleDetailSkeleton /> : error ? <div className="page-state page-error" role="alert"><strong>{t('detail.error')}</strong><p>{tError(error)}</p><button className="button-secondary" onClick={refresh}>{t('common.retry')}</button></div> : circle && <><SavingsCircleCard circle={circle} walletAddress={walletAddress} walletProvider={walletProvider} busy={busy} actionPending={busy} onAction={(_id, kind) => act(kind)} onConnectBrowser={connectWallet} onConnectCavos={connectCavosWallet} cavosEnabled={cavosEnabled} walletBusy={walletBusy} onTrustlineSetup={({ earnEnabled }) => setupUsdcTrustline({ address: walletAddress, earnEnabled })} showToast={showToast} /><SavingsActivity circleId={circleId} activity={activity} loading={activityLoading} error={activityError} /><p className="detail-footnote">{t('detail.footnote')}</p></>}
  </div>;
}
