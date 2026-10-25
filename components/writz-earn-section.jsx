'use client';

import { ExternalLink } from 'lucide-react';
import UiIcon from './ui-icon.jsx';
import { useWritzApy } from './use-writz-apy.jsx';

export function WritzEarnSection() {
  const { apy, updatedAt } = useWritzApy();

  return <section className="writz-earn-section" id="earn" aria-labelledby="earn-reference-title">
    <div className="writz-earn-heading"><div><h2 id="earn-reference-title">Optional Writz Earn for a circle</h2><p>The organizer can propose Earn when creating a circle. Every member must review and accept before the first contribution.</p></div></div>
    <div className="earn-summary">
      <div className="earn-summary-main"><span className="circle-meta">Current vault APY reference</span><strong className="earn-apy-value">{apy ? apy : <span className="skeleton-block apy-skeleton" aria-label="Loading APY" />}</strong><p>This is the Writz Testnet vault's reported APY. It changes and is not a promise of the circle's return.</p>{updatedAt && <p className="earn-checked-at">Updated: <time dateTime={updatedAt}>{new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(updatedAt))}</time></p>}</div>
      <div className="earn-position"><span>Writz Earn vault</span><strong>Writz Earn · USDC</strong><small>The vault currently uses Blend Testnet USDC underneath. Circle USDC is not accepted by this vault.</small><a className="button-quiet earn-refresh" href="https://testnet.blend.capital" target="_blank" rel="noreferrer">Get the required Testnet USDC <UiIcon as={ExternalLink} size={14} /></a></div>
    </div>
    <p className="earn-asset-note">Writz Earn is the yield product integrated into Cuotia. Its Testnet vault accepts Blend USDC and routes deposits to its Blend lending strategy; that token is an underlying requirement of Writz Earn, not a separate Cuotia savings product. Cuotia tracks each member’s Writz vault shares. At completion or cancellation, each member claims the value those shares recover. It may be less than contributed, and withdrawals can be delayed if the vault strategy cannot unwind. Circle USDC remains available for circles without Earn.</p>
    <div className="earn-details">
      <article><span>01</span><h3>Everyone decides</h3><p>Earn stays off unless the organizer selects it and each member accepts the same terms before contributing.</p></article>
      <article><span>02</span><h3>Shares stay accounted for</h3><p>The circle contract holds the vault shares and tracks them per member. Each member claims their own share at the end.</p></article>
      <article><span>03</span><h3>Yield and principal can vary</h3><p>The APY is a changing reference, not a guarantee. Vault fees, losses, and withdrawal delays can affect claims.</p></article>
    </div>
  </section>;
}
