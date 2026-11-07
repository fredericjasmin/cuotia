'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import UiIcon from './ui-icon.jsx';
import { useWritzApy } from './use-writz-apy.jsx';
import { useI18n } from './i18n-provider.jsx';

export default function HomePage() {
  const { apy } = useWritzApy();
  const { t } = useI18n();

  return <div className="home-page">
    <section className="home-hero">
      <div className="home-copy"><h1>{t('home.titleStart')}<em>{t('home.titleEm')}</em></h1><p className="home-lead">{t('home.lead')}</p>
        <div className="home-actions"><Link className="button-primary" href="/savings/create">{t('shell.createCircle')} <UiIcon as={ArrowUpRight} size={16} /></Link><Link className="button-quiet" href="/savings">{t('home.explore')}</Link></div>
      </div>
      <div className="home-art" aria-hidden="true">
        <div className="home-brush home-brush-lavender" />
        <div className="home-brush home-brush-yellow" />
        <div className="home-brush home-brush-cream" />
        <div className="home-brush home-brush-lavender-light" />
        <Image className="home-art-logo" src="/brand-coin.png" alt="" width={512} height={512} />
      </div>
    </section>

    <section className="home-proof" aria-label={t('home.proofAria')}><article><span>01</span><h2>{t('home.p1Title')}</h2><p>{t('home.p1Body')}</p></article><article><span>02</span><h2>{t('home.p2Title')}</h2><p>{t('home.p2Body')}</p></article><Link className="apy-card" href="/how-it-works#earn"><span>03</span><h2>{t('home.p3Title')}</h2><span className="apy-card-kicker">{t('home.apyLabel')}</span><strong>{apy || <span className="skeleton-block apy-card-skeleton" aria-label={t('common.loadingApy')} />}</strong><span className="earn-card-link">{t('home.earnLink')} <UiIcon as={ArrowRight} size={15} /></span></Link></section>

    <section className="home-next"><div><h2>{t('home.nextTitle')}</h2></div><div className="home-next-actions"><Link href="/how-it-works">{t('home.seeHow')} <UiIcon as={ArrowUpRight} size={15} /></Link><Link href="/savings">{t('common.browseCircles')} <UiIcon as={ArrowUpRight} size={15} /></Link></div></section>
  </div>;
}
