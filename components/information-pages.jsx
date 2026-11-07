'use client';

import Link from 'next/link';
import { WritzEarnSection } from './writz-earn-section.jsx';
import { useI18n } from './i18n-provider.jsx';

export function HowItWorksPage() {
  const { t } = useI18n();
  return <div className="content-page info-page"><h1>{t('how.title')}</h1><p className="info-lead">{t('how.lead')}</p>
    <div className="steps-grid">{[1, 2, 3, 4].map((step) => <article key={step}><h2>{step}. {t(`how.s${step}Title`)}</h2><p>{t(`how.s${step}Body`)}</p></article>)}</div>
    <section className="info-callout"><div><h2>{t('how.calloutTitle')}</h2><p>{t('how.calloutBody')}</p></div><Link className="button-secondary" href="/savings">{t('common.browseCircles')}</Link></section>
    <WritzEarnSection />
  </div>;
}

export function NotFoundContent() {
  const { t } = useI18n();
  return <section className="page-state"><span className="empty-symbol">404</span><h1>{t('notFound.title')}</h1><p>{t('notFound.body')}</p><Link className="button-primary" href="/savings">{t('common.browseCircles')}</Link></section>;
}
