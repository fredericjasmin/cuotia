'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink, MessageCircle } from 'lucide-react';
import { getSavingsCircle } from '../lib/cuotia-chain.mjs';
import { readContributionReceipt } from '../lib/receipt.mjs';
import { useI18n } from './i18n-provider.jsx';
import UiIcon from './ui-icon.jsx';

const shortAddress = (address) => address ? `${address.slice(0, 5)}…${address.slice(-5)}` : '';

export function ReceiptPage({ circleId, hash }) {
  const { t, tError, formatNumber, formatDate } = useI18n();
  const [receipt, setReceipt] = useState(null);
  const [circle, setCircle] = useState(null);
  const [error, setError] = useState(null);
  const [pageUrl, setPageUrl] = useState('');

  useEffect(() => {
    let active = true;
    setPageUrl(window.location.href);
    Promise.all([readContributionReceipt({ id: circleId, hash }), getSavingsCircle(circleId).catch(() => null)])
      .then(([found, circleData]) => { if (active) { setReceipt(found); setCircle(circleData); } })
      .catch((cause) => { if (active) setError(cause); });
    return () => { active = false; };
  }, [circleId, hash]);

  const back = <Link className="back-link" href={`/savings/${circleId}`}><UiIcon as={ArrowLeft} size={16} /> {t('receipt.back')}</Link>;
  if (error) return <div className="content-page">{back}<section className="page-state page-error" role="alert"><strong>{t('receipt.errorTitle')}</strong><p>{tError(error, 'receipt.loadFailed')}</p></section></div>;
  if (!receipt) return <div className="content-page">{back}<section className="page-state" aria-busy="true"><p>{t('common.loading')}</p></section></div>;

  const memberName = circle?.members.find((member) => member.address === receipt.member)?.name || shortAddress(receipt.member);
  const amount = formatNumber(receipt.amount, { minimumFractionDigits: 2, maximumFractionDigits: 7 });
  const date = formatDate(new Date(receipt.createdAt), { dateStyle: 'long', timeStyle: 'short' });
  const circleName = circle?.name || `#${receipt.circleId}`;
  const shareText = t('receipt.shareMessage', { member: memberName, amount, asset: receipt.asset, circle: circleName, date, url: pageUrl });

  return <div className="content-page receipt-page">{back}
    <article className="circle-card receipt-card">
      <h1>{t('receipt.title')}</h1>
      <p className="receipt-lead">{t('receipt.lead', { member: memberName, amount, asset: receipt.asset, circle: circleName })}</p>
      <dl className="receipt-details">
        <div><dt>{t('receipt.circle')}</dt><dd><Link href={`/savings/${receipt.circleId}`}>{circleName}</Link></dd></div>
        <div><dt>{t('receipt.member')}</dt><dd>{memberName} <span className="member-status-address">{shortAddress(receipt.member)}</span></dd></div>
        <div><dt>{t('receipt.amount')}</dt><dd>{amount} {receipt.asset}</dd></div>
        <div><dt>{t('receipt.type')}</dt><dd>{receipt.automatic ? t('receipt.automatic') : t('receipt.manual')}</dd></div>
        <div><dt>{t('receipt.date')}</dt><dd>{date}</dd></div>
        <div><dt>{t('receipt.transaction')}</dt><dd><a href={`https://stellar.expert/explorer/testnet/tx/${receipt.hash}`} target="_blank" rel="noreferrer">{shortAddress(receipt.hash)} <UiIcon as={ExternalLink} size={14} /></a></dd></div>
      </dl>
      <p className="form-help">{t('receipt.verifyNote')}</p>
      {pageUrl && <a className="button-primary" href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noreferrer"><UiIcon as={MessageCircle} size={16} /> {t('receipt.share')}</a>}
    </article>
  </div>;
}
