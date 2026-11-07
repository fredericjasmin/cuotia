import './globals.css';
import { AppProvider } from '../components/app-provider.jsx';
import SiteShell from '../components/site-shell.jsx';
import { CavosWalletProvider } from '../components/cavos-wallet-provider.jsx';
import { I18nProvider } from '../components/i18n-provider.jsx';

export const metadata = {
  title: 'Cuotia - círculos de ahorro en grupo',
  description: 'Cuotia ayuda a los grupos a ahorrar juntos con reglas de aporte compartidas y retiros individuales.',
};

export default function RootLayout({ children }) {
  return <html lang="es" data-scroll-behavior="smooth">
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    </head>
    <body><I18nProvider><CavosWalletProvider><AppProvider><SiteShell>{children}</SiteShell></AppProvider></CavosWalletProvider></I18nProvider></body>
  </html>;
}
