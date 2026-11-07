'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, ChevronDown, CircleAlert, Menu, Wallet, X } from 'lucide-react';
import { useCuotia } from './app-provider.jsx';
import { WalletButtonSkeleton, WalletGateSkeleton } from './loading-skeletons.jsx';
import UiIcon from './ui-icon.jsx';
import { useI18n } from './i18n-provider.jsx';
import { LOCALES } from '../lib/i18n.mjs';

const navigation = [
  { href: '/savings', label: 'nav.savings', compact: 'nav.savingsCompact' },
  { href: '/how-it-works', label: 'nav.how', compact: 'nav.howCompact' },
];

// Inline SVG flags: emoji flags do not render on Windows.
function FlagES() {
  return <svg className="flag" viewBox="0 0 3 2" aria-hidden="true"><rect width="3" height="2" fill="#AA151B" /><rect y="0.5" width="3" height="1" fill="#F1BF00" /></svg>;
}

function FlagUS() {
  return <svg className="flag" viewBox="0 0 19 13" aria-hidden="true"><rect width="19" height="13" fill="#FFFFFF" />{[0, 2, 4, 6, 8, 10, 12].map((y) => <rect key={y} y={y} width="19" height="1" fill="#B22234" />)}<rect width="7.6" height="7" fill="#3C3B6E" /></svg>;
}

function FlagFR() {
  return <svg className="flag" viewBox="0 0 3 2" aria-hidden="true"><rect width="1" height="2" fill="#002654" /><rect x="1" width="1" height="2" fill="#FFFFFF" /><rect x="2" width="1" height="2" fill="#CE1126" /></svg>;
}

// Native names: each language is listed in its own language.
const LANGUAGE_OPTIONS = {
  es: { name: 'Español', Flag: FlagES },
  en: { name: 'English', Flag: FlagUS },
  fr: { name: 'Français', Flag: FlagFR },
};

function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n();
  const menuRef = useRef(null);
  const current = LANGUAGE_OPTIONS[locale] || LANGUAGE_OPTIONS.es;

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return undefined;
    function closeOnOutsideClick(event) {
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    }
    function closeOnEscape(event) {
      if (event.key !== 'Escape' || !menu.open) return;
      menu.open = false;
      menu.querySelector('summary')?.focus();
    }
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  function choose(code) {
    setLocale(code);
    if (menuRef.current) menuRef.current.open = false;
  }

  return <details className="language-menu" ref={menuRef}>
    <summary aria-label={`${t('lang.label')}: ${current.name}`} title={t('lang.label')}><current.Flag /><span className="language-code">{locale.toUpperCase()}</span><UiIcon as={ChevronDown} className="wallet-menu-chevron" size={14} /></summary>
    <div className="language-menu-popover" role="menu" aria-label={t('lang.label')}>
      {LOCALES.filter((code) => LANGUAGE_OPTIONS[code]).map((code) => {
        const { name, Flag } = LANGUAGE_OPTIONS[code];
        return <button key={code} type="button" role="menuitemradio" aria-checked={locale === code} lang={code} className={locale === code ? 'is-active' : ''} onClick={() => choose(code)}><Flag /><span>{name}</span>{locale === code && <UiIcon as={Check} className="language-check" size={15} />}</button>;
      })}
    </div>
  </details>;
}

function shortAddress(address) {
  return address ? `${address.slice(0, 5)}…${address.slice(-5)}` : '';
}

export default function SiteShell({ children }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { walletAddress, walletBusy, walletReady, toast, dismissToast, connectWallet, connectCavosWallet, cavosEnabled, disconnectWallet } = useCuotia();
  const walletRequired = pathname === '/dashboard';
  const walletMenuRef = useRef(null);
  const mobileMenuButtonRef = useRef(null);
  const mobileNavigationRef = useRef(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(dismissToast, 5200);
    return () => window.clearTimeout(timeout);
  }, [toast, dismissToast]);

  useEffect(() => {
    const menu = walletMenuRef.current;
    if (!menu) return undefined;

    function closeOnOutsideClick(event) {
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    }

    function closeOnEscape(event) {
      if (event.key !== 'Escape' || !menu.open) return;
      menu.open = false;
      menu.querySelector('summary')?.focus();
    }

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [walletAddress]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;

    function closeOnOutsideClick(event) {
      if (mobileNavigationRef.current?.contains(event.target) || mobileMenuButtonRef.current?.contains(event.target)) return;
      setMobileMenuOpen(false);
    }

    function closeOnEscape(event) {
      if (event.key !== 'Escape') return;
      setMobileMenuOpen(false);
      mobileMenuButtonRef.current?.focus();
    }

    const desktopViewport = window.matchMedia('(min-width: 621px)');
    const closeOnDesktop = () => {
      if (desktopViewport.matches) setMobileMenuOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    desktopViewport.addEventListener('change', closeOnDesktop);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
      desktopViewport.removeEventListener('change', closeOnDesktop);
    };
  }, [mobileMenuOpen]);

  async function toggleWallet() {
    if (walletAddress) await disconnectWallet();
    else await connectWallet().catch(() => {});
  }

  function closeWalletMenu(event) {
    event.currentTarget.closest('details')?.removeAttribute('open');
  }

  return <div className="site-layout">
    <header className="site-header"><div className="topbar app-shell">
      <Link className="brand" href="/" aria-label={t('shell.homeAria')}><Image className="brand-logo" src="/brand-nav.png" alt="" width={512} height={512} /><span className="brand-label">Cuotia<span className="brand-dot">.</span></span></Link>
      <button
        ref={mobileMenuButtonRef}
        className={`mobile-menu-toggle${mobileMenuOpen ? ' is-open' : ''}`}
        type="button"
        aria-label={mobileMenuOpen ? t('shell.closeMenu') : t('shell.openMenu')}
        aria-expanded={mobileMenuOpen}
        aria-controls="main-navigation"
        onClick={() => setMobileMenuOpen((open) => !open)}
      ><UiIcon as={mobileMenuOpen ? X : Menu} size={20} /></button>
      <nav id="main-navigation" ref={mobileNavigationRef} className={mobileMenuOpen ? 'mobile-open' : ''} aria-label={t('shell.mainNav')}>{navigation.map(({ href, label, compact }) => {
        const active = pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
        return <Link key={href} aria-current={active ? 'page' : undefined} className={active ? 'is-active' : ''} href={href} onClick={() => setMobileMenuOpen(false)}><span className="nav-label-full">{t(label)}</span><span className="nav-label-compact">{t(compact)}</span></Link>;
      })}<div className="nav-language"><span>{t('lang.label')}</span><LanguageSwitch /></div></nav>
      <div className="topbar-actions"><LanguageSwitch />{!walletReady ? <WalletButtonSkeleton /> : walletAddress ? <details className="wallet-menu" ref={walletMenuRef}>
        <summary className="wallet-button connected"><span className="wallet-status-dot" aria-hidden="true" />{shortAddress(walletAddress)}<UiIcon as={ChevronDown} className="wallet-menu-chevron" size={14} /></summary>
      <div className="wallet-menu-popover"><p className="wallet-menu-network">Stellar Testnet</p><Link href="/dashboard" onClick={closeWalletMenu}>{t('shell.dashboard')}</Link><Link href="/savings/create" onClick={closeWalletMenu}>{t('shell.createCircle')}</Link><button type="button" onClick={disconnectWallet}>{t('shell.disconnect')}</button></div>
      </details> : <details className="wallet-menu connect-wallet-menu" ref={walletMenuRef}>
        <summary className="wallet-button">{walletBusy ? t('wallet.connecting') : t('wallet.connect')}<UiIcon as={ChevronDown} className="wallet-menu-chevron" size={14} /></summary>
        <div className="wallet-menu-popover">
          <button type="button" disabled={walletBusy} onClick={(event) => { closeWalletMenu(event); toggleWallet(); }}>{t('wallet.browser')}</button>
          <button type="button" disabled={walletBusy || !cavosEnabled} onClick={(event) => { closeWalletMenu(event); connectCavosWallet().catch(() => {}); }}>{t('wallet.cavos')}</button>
        </div>
      </details>}</div>
    </div></header>
    <main className="page-main app-shell">{walletRequired && !walletReady ? <WalletGateSkeleton /> : walletRequired && !walletAddress ? <section className="page-state wallet-gate"><span className="empty-symbol"><UiIcon as={Wallet} size={34} /></span><h1>{t('gate.title')}</h1><p>{t('gate.body')}</p><button className="button-primary" disabled={walletBusy} onClick={() => connectWallet().catch(() => {})}>{walletBusy ? t('wallet.connecting') : t('wallet.browser')}</button>{cavosEnabled && <button className="button-secondary" disabled={walletBusy} onClick={() => connectCavosWallet().catch(() => {})}>{t('wallet.cavos')}</button>}<Link className="button-quiet" href="/savings">{t('gate.back')}</Link></section> : children}</main>
    <footer className="site-footer"><div className="site-footer-inner app-shell"><Link className="brand footer-brand" href="/" aria-label={t('shell.homeAria')}><Image className="brand-logo" src="/brand-mark.png" alt="" width={512} height={512} /></Link><p>{t('shell.footerNote')}</p><div><Link href="/how-it-works">{t('nav.how')}</Link><Link href="/savings">{t('nav.savings')}</Link></div></div></footer>
    {toast && <div className="toast-viewport" aria-live={toast.type === 'error' ? 'assertive' : 'polite'}>
      <div className={`toast-card toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'} key={toast.id}>
        <span className="toast-mark"><UiIcon as={toast.type === 'error' ? CircleAlert : CheckCircle2} size={19} /></span>
        <p>{toast.message}</p>
        <button type="button" onClick={dismissToast} aria-label={t('shell.dismissToast')}><UiIcon as={X} size={17} /></button>
      </div>
    </div>}
  </div>;
}
