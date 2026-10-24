import './globals.css';
import { AppProvider } from '../components/app-provider.jsx';
import SiteShell from '../components/site-shell.jsx';

export const metadata = {
  title: 'Cuotia - community savings circles',
  description: 'Cuotia helps groups save together through shared contribution rules and individual claims.',
};

export default function RootLayout({ children }) {
  return <html lang="en" data-scroll-behavior="smooth">
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    </head>
    <body><AppProvider><SiteShell>{children}</SiteShell></AppProvider></body>
  </html>;
}
