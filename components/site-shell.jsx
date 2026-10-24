'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, CircleAlert, Menu, Wallet, X } from 'lucide-react';
import { useCuotia } from './app-provider.jsx';
import { WalletGateSkeleton } from './loading-skeletons.jsx';
import UiIcon from './ui-icon.jsx';

const navigation = [
  { href: '/savings', label: 'Savings circles', compact: 'Savings' },
  { href: '/how-it-works', label: 'How it works', compact: 'Guide' },
];

function shortAddress(address) {
  return address ? `${address.slice(0, 5)}…${address.slice(-5)}` : '';
}

export default function SiteShell({ children }) {
  const pathname = usePathname();
  const { walletAddress, walletBusy, walletReady, toast, dismissToast, connectWallet, disconnectWallet } = useCuotia();
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
      <Link className="brand" href="/" aria-label="Cuotia home"><Image className="brand-logo" src="/brand-nav.png" alt="" width={512} height={512} /><span className="brand-label">Cuotia<span className="brand-dot">.</span></span></Link>
      <button
        ref={mobileMenuButtonRef}
        className={`mobile-menu-toggle${mobileMenuOpen ? ' is-open' : ''}`}
        type="button"
        aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={mobileMenuOpen}
        aria-controls="main-navigation"
        onClick={() => setMobileMenuOpen((open) => !open)}
      ><UiIcon as={mobileMenuOpen ? X : Menu} size={20} /></button>
      <nav id="main-navigation" ref={mobileNavigationRef} className={mobileMenuOpen ? 'mobile-open' : ''} aria-label="Main navigation">{navigation.map(({ href, label, compact }) => {
        const active = pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
        return <Link key={href} aria-current={active ? 'page' : undefined} className={active ? 'is-active' : ''} href={href} onClick={() => setMobileMenuOpen(false)}><span className="nav-label-full">{label}</span><span className="nav-label-compact">{compact}</span></Link>;
      })}</nav>
      <div className="topbar-actions">{walletAddress ? <details className="wallet-menu" ref={walletMenuRef}>
        <summary className="wallet-button connected"><span className="wallet-status-dot" aria-hidden="true" />{shortAddress(walletAddress)}<UiIcon as={ChevronDown} className="wallet-menu-chevron" size={14} /></summary>
      <div className="wallet-menu-popover"><p className="wallet-menu-network">Stellar Testnet</p><Link href="/dashboard" onClick={closeWalletMenu}>Dashboard</Link><Link href="/savings/create" onClick={closeWalletMenu}>Create a savings circle</Link><button type="button" onClick={disconnectWallet}>Disconnect wallet</button></div>
      </details> : <button className="wallet-button" disabled={walletBusy} onClick={toggleWallet}>{walletBusy ? 'Connecting…' : 'Connect wallet'}</button>}</div>
    </div></header>
    <main className="page-main app-shell">{walletRequired && !walletReady ? <WalletGateSkeleton /> : walletRequired && !walletAddress ? <section className="page-state wallet-gate"><span className="empty-symbol"><UiIcon as={Wallet} size={34} /></span><h1>Connect your account to continue.</h1><p>The dashboard and circle creation are tied to a Stellar address. Connecting only shares your public address; every transaction still requires your signature.</p><button className="button-primary" disabled={walletBusy} onClick={() => connectWallet().catch(() => {})}>{walletBusy ? 'Connecting…' : 'Connect wallet'}</button><Link className="button-quiet" href="/savings">Back to savings circles</Link></section> : children}</main>
    <footer className="site-footer"><div className="site-footer-inner app-shell"><Link className="brand footer-brand" href="/" aria-label="Cuotia home"><Image className="brand-logo" src="/brand-mark.png" alt="" width={512} height={512} /></Link><p>Stellar Testnet prototype. Do not use real funds.</p><div><Link href="/how-it-works">How it works</Link><Link href="/savings">Savings circles</Link></div></div></footer>
    {toast && <div className="toast-viewport" aria-live={toast.type === 'error' ? 'assertive' : 'polite'}>
      <div className={`toast-card toast-${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'} key={toast.id}>
        <span className="toast-mark"><UiIcon as={toast.type === 'error' ? CircleAlert : CheckCircle2} size={19} /></span>
        <p>{toast.message}</p>
        <button type="button" onClick={dismissToast} aria-label="Dismiss notification"><UiIcon as={X} size={17} /></button>
      </div>
    </div>}
  </div>;
}
