'use client';

import { useI18n } from './i18n-provider.jsx';

function SkeletonBlock({ className = '' }) {
  return <span className={`skeleton-block ${className}`} aria-hidden="true" />;
}

export function CircleCardSkeleton({ compact = false }) {
  return <div className={`circle-card circle-card-skeleton${compact ? ' compact' : ''}`} aria-hidden="true">
    <div className="skeleton-circle-heading"><div className="skeleton-circle-copy"><SkeletonBlock className="skeleton-meta" /><SkeletonBlock className="skeleton-title" /><SkeletonBlock className="skeleton-description" /></div><SkeletonBlock className="skeleton-round" /></div>
    <SkeletonBlock className="skeleton-progress" />
    <div className={`skeleton-stats${compact ? ' compact' : ''}`}>
      {Array.from({ length: compact ? 2 : 3 }, (_, index) => <div key={index}><SkeletonBlock className="skeleton-stat-label" /><SkeletonBlock className="skeleton-stat-value" /></div>)}
    </div>
    {!compact && <><SkeletonBlock className="skeleton-date" /><div className="skeleton-members">{[0, 1, 2].map((item) => <div key={item}><SkeletonBlock className="skeleton-avatar" /><SkeletonBlock className="skeleton-member-name" /><SkeletonBlock className="skeleton-status" /></div>)}</div><SkeletonBlock className="skeleton-action" /></>}
    {compact && <SkeletonBlock className="skeleton-action" />}
  </div>;
}

export function CircleCollectionSkeleton({ compact = false }) {
  const { t } = useI18n();
  return <div className="circle-list" aria-busy="true" aria-label={t('loading.circles')}>
    {[0, 1, 2, 3].map((item) => <CircleCardSkeleton key={item} compact={compact} />)}
  </div>;
}

export function CircleDetailSkeleton() {
  const { t } = useI18n();
  return <div className="circle-detail-skeleton" aria-busy="true" aria-label={t('loading.circleDetails')}>
    <CircleCardSkeleton />
    <section className="circle-activity circle-activity-skeleton" aria-hidden="true"><SkeletonBlock className="skeleton-activity-heading" />{[0, 1, 2].map((item) => <div className="skeleton-activity-row" key={item}><SkeletonBlock className="skeleton-activity-label" /><SkeletonBlock className="skeleton-activity-link" /><SkeletonBlock className="skeleton-activity-date" /></div>)}</section>
  </div>;
}

export function ActivitySkeleton() {
  return <ol className="activity-skeleton" aria-hidden="true">{[0, 1, 2].map((item) => <li key={item}><SkeletonBlock className="skeleton-activity-label" /><SkeletonBlock className="skeleton-activity-link" /><SkeletonBlock className="skeleton-activity-date" /></li>)}</ol>;
}

export function WalletGateSkeleton() {
  const { t } = useI18n();
  return <div className="page-state wallet-gate wallet-gate-skeleton" aria-busy="true" aria-label={t('wallet.restoring')}>
    <SkeletonBlock className="skeleton-gate-icon" /><SkeletonBlock className="skeleton-gate-title" /><SkeletonBlock className="skeleton-gate-copy" /><SkeletonBlock className="skeleton-gate-action" />
  </div>;
}

export function WalletButtonSkeleton() {
  const { t } = useI18n();
  return <span className="wallet-button-skeleton skeleton-block" role="status" aria-label={t('wallet.restoring')} />;
}
