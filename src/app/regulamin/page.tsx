import { CommerceLayout } from '@/components/CommerceLayout';
import { getPublicCommerceConfig, formatGrossPrice } from '@/domain/commerce-config';

export default function TermsPage() {
  const config = getPublicCommerceConfig();
  const sellerReady = Boolean(config.seller.name && config.seller.address && config.seller.taxId && config.seller.email);
  return <CommerceLayout eyebrow="Dokumenty serwisu" title="Regulamin TyWygrywasz" lead="Prosto opisujemy, jak działa aplikacja, konto, płatność i odpowiedzialność za własne decyzje.">
    <article className="commerce-legal"><div className="commerce-card">
      {!sellerReady && <div className="commerce-status"><strong>Wersja przygotowawcza.</strong> Dane identyfikacyjne sprzedawcy i cena zostaną uzupełnione przed uruchomieniem sprzedaży. Do tego czasu oferta pozostaje wyłączona.</div>}
      <h2>1. Usługodawca i zakres serwisu</h2>
      {sellerReady ? <p>Serwis TyWygrywasz.pl prowadzi {config.seller.name} (działalność gospodarcza), z siedzibą pod adresem: {config.seller.address}. NIP: {config.seller.taxId}{config.seller.regon ? `, REGON: ${config.seller.regon}` : ''}. Kontakt: <a className="commerce-inline-link" href={`mailto:${config.seller.email}`}>{config.seller.email}</a>.</p> : <p>Pełne dane usługodawcy zostaną opublikowane przed rozpoczęciem sprzedaży.</p>}
      <p>TyWygrywasz jest narzędziem do porządkowania dokumentów, spraw, instytucji i terminów. Pomaga przygotować informacje i kolejny krok. Nie udziela porady prawnej, nie zastępuje pełnomocnika i nie podejmuje decyzji za użytkownika.</p>
      <h2>2. Konto i lokalny sejf</h2>
      <p>Konto służy do uwierzytelnienia i obsługi ustawień. Oryginały dokumentów, OCR, prywatny indeks i klucze pozostają w lokalnym, szyfrowanym sejfie przeglądarki. Opcjonalna synchronizacja może obejmować wyłącznie zaszyfrowaną strukturę, bez klucza odczytu po stronie serwera.</p>
      <h2>3. Oferta i płatność</h2>
      <p>Przed uruchomieniem zamówienia użytkownik zobaczy aktualną nazwę usługi, zakres, cenę brutto i sposób płatności. Płatności są przekierowywane do Przelewy24. Zawarcie umowy i aktywacja następują po prawidłowym potwierdzeniu transakcji po stronie serwera.</p>
      <p>Konfiguracja publiczna: <strong>{config.offer.name}</strong>; cena: <strong>{formatGrossPrice(config.offer.priceGrossPln)}</strong>. Jeżeli widzisz „Cena w przygotowaniu”, sprzedaż jest wyłączona.</p>
      <h2>4. Zasady korzystania</h2>
      <p>Użytkownik odpowiada za prawdziwość wprowadzonych informacji, zabezpieczenie hasła i klucza odzyskiwania oraz sprawdzenie każdego projektu pisma przed użyciem. Nie wolno wykorzystywać serwisu do działań bezprawnych ani udostępniać cudzych dokumentów bez podstawy.</p>
      <h2>5. Reklamacje i kontakt</h2>
      <p>Problem techniczny lub reklamację opisz na stronie <a className="commerce-inline-link" href="/kontakt">kontaktu</a>, podając datę i opis zdarzenia bez przesyłania treści wrażliwych, jeśli nie jest to konieczne. Odpowiedź otrzymasz na adres przypisany do konta.</p>
      <p className="commerce-note">Sprzedaż zostanie uruchomiona po opublikowaniu ceny brutto usługi i skonfigurowaniu bezpiecznej obsługi płatności Przelewy24.</p>
    </div></article>
  </CommerceLayout>;
}
