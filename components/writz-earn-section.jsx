'use client';

import { ExternalLink } from 'lucide-react';
import UiIcon from './ui-icon.jsx';
import { useWritzApy } from './use-writz-apy.jsx';
import { useI18n } from './i18n-provider.jsx';

export function WritzEarnSection() {
  const { apy, updatedAt } = useWritzApy();
  const { t, formatDate } = useI18n();

  return <section className="writz-earn-section" id="earn" aria-labelledby="earn-reference-title">
    <div className="writz-earn-heading"><div><h2 id="earn-reference-title">{t('earn.title')}</h2><p>{t('earn.intro')}</p></div></div>
    <div className="earn-summary">
      <div className="earn-summary-main"><span className="circle-meta">{t('earn.apyRef')}</span><strong className="earn-apy-value">{apy ? apy : <span className="skeleton-block apy-skeleton" aria-label={t('common.loadingApy')} />}</strong><p>{t('earn.apyNote')}</p>{updatedAt && <p className="earn-checked-at">{t('earn.updated')} <time dateTime={updatedAt}>{formatDate(new Date(updatedAt), { dateStyle: 'medium', timeStyle: 'short' })}</time></p>}</div>
      <div className="earn-position"><strong>Writz Earn · USDC</strong><small>{t('earn.vaultNote')}</small><a className="button-quiet earn-refresh" href="https://testnet.blend.capital" target="_blank" rel="noreferrer">{t('earn.getUsdc')} <UiIcon as={ExternalLink} size={14} /></a></div>
    </div>
    <p className="earn-asset-note">{t('earn.assetNote')}</p>
    <div className="earn-details">
      {[1, 2, 3].map((item) => <article key={item}><h3>{t(`earn.d${item}Title`)}</h3><p>{t(`earn.d${item}Body`)}</p></article>)}
    </div>
  </section>;
}
