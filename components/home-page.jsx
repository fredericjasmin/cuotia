'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import UiIcon from './ui-icon.jsx';
import { useWritzApy } from './use-writz-apy.jsx';

export default function HomePage() {
  const { apy } = useWritzApy();

  return <div className="home-page">
    <section className="home-hero">
      <div className="home-copy"><h1>Your savings circle, with the rules <em>in plain sight.</em></h1><p className="home-lead">Choose the contribution, schedule, and number of rounds. Members claim their own contributions after the whole circle completes.</p>
        <div className="home-actions"><Link className="button-primary" href="/savings/create">Create a savings circle <UiIcon as={ArrowUpRight} size={16} /></Link><Link className="button-quiet" href="/savings">Explore circles</Link></div>
      </div>
      <div className="home-art" aria-hidden="true">
        <div className="home-brush home-brush-lavender" />
        <div className="home-brush home-brush-yellow" />
        <div className="home-brush home-brush-cream" />
        <div className="home-brush home-brush-lavender-light" />
        <Image className="home-art-logo" src="/brand-coin.png" alt="" width={512} height={512} />
      </div>
    </section>

    <section className="home-proof" aria-label="Project information"><article><span>01</span><h2>Rules everyone can see</h2><p>Contributions, frequency, members, and payout rules are stored in a Stellar smart contract.</p></article><article><span>02</span><h2>You approve every action</h2><p>Your wallet signs each transaction. Cuotia never receives or stores your private keys.</p></article><Link className="apy-card" href="/how-it-works#earn"><span>03</span><h2>Optional Writz Earn</h2><span className="apy-card-kicker">Current vault APY</span><strong>{apy || <span className="skeleton-block apy-card-skeleton" aria-label="Loading APY" />}</strong><span className="earn-card-link">How circle Earn works <UiIcon as={ArrowRight} size={15} /></span></Link></section>

    <section className="home-next"><div><h2>A clearer way for your group to save together.</h2></div><div className="home-next-actions"><Link href="/how-it-works">See how it works <UiIcon as={ArrowUpRight} size={15} /></Link><Link href="/savings">Browse savings circles <UiIcon as={ArrowUpRight} size={15} /></Link></div></section>
  </div>;
}
