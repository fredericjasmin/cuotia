'use client';

import Link from 'next/link';
import { WritzEarnSection } from './writz-earn-section.jsx';

export function HowItWorksPage() {
  return <div className="content-page info-page"><h1>How a Cuotia savings circle works.</h1><p className="info-lead">In the savings version, every member contributes the same agreed amount each period. Nobody receives an early payout; after all rounds, each person claims their own contributions.</p>
    <div className="steps-grid"><article><span>01</span><h2>Connect your wallet</h2><p>Your wallet identifies your Stellar account. Cuotia only receives your public address; your keys stay in your wallet.</p></article><article><span>02</span><h2>Set the shared rules</h2><p>Choose each person’s contribution, weekly, biweekly, or monthly frequency, number of rounds, members, and whether to propose optional Writz Earn.</p></article><article><span>03</span><h2>Contribute each round</h2><p>Each member connects their own wallet and signs the contribution. Earn circles require every member’s separate consent before the first payment.</p></article><article><span>04</span><h2>Claim at the end</h2><p>After the last round is paid, every member claims individually. If a round remains incomplete three days after its due date, anyone can cancel; members claim their own recorded value.</p></article></div>
    <section className="info-callout"><div><h2>What connecting a wallet means</h2><p>Connecting only shares your public address with the website. Any action that changes funds or rules requires a separate signature. Never share your secret recovery phrase. This version runs on Stellar Testnet and is not for real funds. Standard circles use Circle Testnet USDC; Writz Earn circles use Blend Testnet USDC — two different Stellar assets that share the USDC name.</p></div><Link className="button-secondary" href="/savings">Browse savings circles</Link></section>
    <WritzEarnSection />
  </div>;
}
