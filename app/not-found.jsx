import Link from 'next/link';

export default function NotFound() {
  return <section className="page-state"><span className="empty-symbol">404</span><h1>We couldn’t find this page.</h1><p>The circle or route you’re looking for does not exist.</p><Link className="button-primary" href="/savings">Browse savings circles</Link></section>;
}
