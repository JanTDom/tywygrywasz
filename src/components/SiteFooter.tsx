import Link from 'next/link';
import { LockKeyhole, Mail, ShieldCheck } from 'lucide-react';

export function SiteFooter() {
  return (
    <footer className="site-footer" aria-label="Stopka serwisu">
      <div className="site-footer-inner">
        <div className="site-footer-brand">
          <Link className="site-footer-logo" href="/" aria-label="TyWygrywasz.pl — strona główna">
            <img src="/tywygrywasz-logo.png" alt="TyWygrywasz.pl" />
          </Link>
          <p>Spokojny plan działania w sprawach, w których trzeba pilnować faktów, pism i terminów.</p>
          <div className="site-footer-trust"><LockKeyhole size={14} /> Dokumenty pozostają na Twoim urządzeniu</div>
        </div>
        <div className="site-footer-column">
          <h2>Serwis</h2>
          <Link href="/kup">Oferta i płatność</Link>
          <Link href="/kontakt">Kontakt</Link>
          <Link href="/">Strona główna</Link>
        </div>
        <div className="site-footer-column">
          <h2>Informacje</h2>
          <Link href="/regulamin">Regulamin</Link>
          <Link href="/polityka-prywatnosci">Polityka prywatności</Link>
          <Link href="/kontakt"><Mail size={14} /> Kontakt i reklamacje</Link>
        </div>
        <div className="site-footer-note">
          <ShieldCheck size={19} />
          <p>TyWygrywasz pomaga porządkować informacje i przygotować następny krok. Nie zastępuje porady prawnej ani decyzji użytkownika.</p>
        </div>
      </div>
      <div className="site-footer-bottom">
        <span>© 2026 Multinewsroom. Wszelkie prawa zastrzeżone.</span>
        <span>Opłaty obsługuje Przelewy24 po uruchomieniu sprzedaży.</span>
      </div>
    </footer>
  );
}
