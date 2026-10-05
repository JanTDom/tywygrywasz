'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Check, CreditCard, FileCheck2, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react';
import { formatGrossPrice, normalizePublicCommerceConfig, type PublicCommerceConfig } from '@/domain/commerce-config';

type Profile = { id: string; name: string; email: string };

type LoadState = { profile: Profile | null; config: PublicCommerceConfig | null; loading: boolean; error: string | null };

export function BuyClient() {
  const [state, setState] = useState<LoadState>({ profile: null, config: null, loading: true, error: null });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [consentDigital, setConsentDigital] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/auth/me', { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(8000) }).then(async (response) => response.ok ? (await response.json()).user as Profile : null).catch(() => null),
      fetch('/api/payments/config', { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(8000) }).then(async (response) => response.ok ? normalizePublicCommerceConfig(await response.json()) : null).catch(() => null),
    ]).then(([profile, config]) => {
      if (!cancelled) setState({ profile, config, loading: false, error: config ? null : 'Nie udało się odczytać konfiguracji oferty.' });
    });
    return () => { cancelled = true; };
  }, []);

  async function handleCheckout(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!state.profile || !state.config?.ready || !termsAccepted || !privacyAccepted || !consentDigital) return;
    setBusy(true); setCheckoutError(null);
    try {
      const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'include', cache: 'no-store' });
      const csrf = csrfResponse.ok ? (await csrfResponse.json()).csrfToken as string : '';
      const response = await fetch('/api/payments/checkout', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ consentTerms: true, privacyAccepted: true, consentDigital: true }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.paymentUrl) throw new Error(result.error || 'Nie udało się rozpocząć płatności.');
      window.location.assign(result.paymentUrl as string);
    } catch (error) {
      setCheckoutError(error instanceof Error ? error.message : 'Nie udało się rozpocząć płatności.');
      setBusy(false);
    }
  }

  if (state.loading) return <div className="commerce-card commerce-loading" aria-live="polite">Ładuję bezpieczne informacje o ofercie…</div>;
  if (!state.profile) return <div className="commerce-card commerce-guard"><LockKeyhole className="commerce-guard-icon" size={32} /><h2>Najpierw zaloguj się do swojego konta</h2><p>Płatność jest przypisana do konta, które będzie mogło korzystać z aktywowanej usługi. Dokumenty z Twojego sejfu nie są wysyłane do formularza płatności.</p><Link className="commerce-submit commerce-submit-link" href="/">Wróć do aplikacji i zaloguj się</Link></div>;

  const config = state.config;
  const ready = Boolean(config?.ready);
  return <div className="commerce-grid">
    <section className="commerce-card">
      <div className="commerce-section-label"><Sparkles size={15} /> CO OTRZYMUJESZ</div>
      <h2>{config?.offer.name || 'TyWygrywasz — plan sprawy'}</h2>
      <p>{config?.offer.description || 'Jedno miejsce do spokojnego prowadzenia sprawy.'}</p>
      <div className="commerce-benefits">
        {[
          ['Porządek w jednej sprawie', 'Dokumenty, wiele instytucji i terminy pozostają w jednym planie.'],
          ['Następny krok zamiast chaosu', 'Ty zatwierdzasz informacje, a aplikacja pomaga przejść od faktu do działania.'],
          ['Prywatność jako ustawienie domyślne', 'Pliki i OCR zostają lokalnie w szyfrowanym sejfie na Twoim urządzeniu.'],
        ].map(([title, copy]) => <div className="commerce-benefit" key={title}><span className="commerce-icon"><Check size={17} /></span><span><strong>{title}</strong><span>{copy}</span></span></div>)}
      </div>
      <p className="commerce-note" style={{ marginTop: 24 }}><ShieldCheck size={14} style={{ verticalAlign: 'text-bottom', marginRight: 5 }} /> Konto i techniczne dane płatności są obsługiwane oddzielnie od lokalnego sejfu dokumentów.</p>
    </section>
    <section className="commerce-card" aria-labelledby="checkout-title">
      <div className="commerce-section-label"><CreditCard size={15} /> PŁATNOŚĆ</div>
      <h2 id="checkout-title">Uruchom dostęp</h2>
      <div className="commerce-price"><small>{config?.offer.billingLabel || 'Cena brutto'}</small><strong>{formatGrossPrice(config?.offer.priceGrossPln ?? null)}</strong></div>
      {ready ? <form className="commerce-form" onSubmit={handleCheckout}>
        <div className="commerce-account-line"><span>Zakup dla konta</span><strong>{state.profile.email}</strong></div>
        <label className="commerce-check"><input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} required /> <span>Akceptuję <Link href="/regulamin">regulamin</Link>.</span></label>
        <label className="commerce-check"><input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} required /> <span>Zapoznałem(-am) się z <Link href="/polityka-prywatnosci">polityką prywatności</Link>.</span></label>
        <label className="commerce-check"><input type="checkbox" checked={consentDigital} onChange={(event) => setConsentDigital(event.target.checked)} required /> <span>Proszę o rozpoczęcie świadczenia cyfrowego po potwierdzeniu płatności. Informacje o odstąpieniu i wyjątkach są opisane w regulaminie.</span></label>
        {checkoutError && <div className="commerce-status error" role="alert">{checkoutError}</div>}
        <button className="commerce-submit" disabled={busy || !termsAccepted || !privacyAccepted || !consentDigital} type="submit">{busy ? 'Łączenie z Przelewy24…' : 'Przejdź do bezpiecznej płatności'}</button>
        <div className="commerce-methods" aria-label="Obsługiwane metody płatności">{(config?.paymentMethods || ['BLIK', 'karty płatnicze', 'szybkie przelewy']).map((method) => <span key={method}>{method}</span>)}</div>
        <p className="commerce-note">Płatność realizuje Przelewy24. Po powrocie potwierdzimy status po stronie serwera. Nie podajesz tu danych karty.</p>
      </form> : <div className="commerce-status"><strong>Sprzedaż jest jeszcze przygotowywana.</strong><p>Formularz zostanie włączony po uzupełnieniu danych sprzedawcy, ceny brutto i kluczy Przelewy24. Ta strona nie przyjmuje teraz płatności.</p>{config?.missing?.length ? <ul className="commerce-disabled-list">{config.missing.slice(0, 5).map((item) => <li key={item}>{item}</li>)}</ul> : null}</div>}
    </section>
  </div>;
}
