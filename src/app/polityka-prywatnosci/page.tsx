import { CommerceLayout } from '@/components/CommerceLayout';
import { getPublicCommerceConfig } from '@/domain/commerce-config';

export default function PrivacyPage() {
  const config = getPublicCommerceConfig();
  return <CommerceLayout eyebrow="Dokumenty serwisu" title="Polityka prywatności" lead="Najprościej: Twoje dokumenty zostają na Twoim urządzeniu. Konto i płatność mają osobny, opisany zakres danych.">
    <article className="commerce-legal"><div className="commerce-card">
      <div className="commerce-privacy-callout"><strong>Co zostaje lokalnie?</strong><span>Pliki DOC, RTF, TXT, PDF, JPG i PNG, ich OCR, nazwy, indeks i klucze sejfu.</span><strong>Co może trafić na serwer?</strong><span>Dane konta, techniczne metadane sesji oraz — tylko po świadomym wyborze — zaszyfrowana struktura synchronizacji. Przelewy24 otrzymuje dane potrzebne do obsługi płatności, nie treść dokumentów.</span></div>
      <h2>1. Administrator i zakres</h2>
      <p>Administratorem danych jest {config.seller.name}, {config.seller.address}, NIP {config.seller.taxId}{config.seller.regon ? `, REGON ${config.seller.regon}` : ''}. Kontakt: <a className="commerce-inline-link" href={`mailto:${config.seller.email}`}>{config.seller.email}</a>. Dane administratora są też widoczne na stronie kontaktu i w regulaminie.</p>
      <h2>2. Konto</h2>
      <p>Do konta potrzebujemy minimalnych danych logowania, takich jak imię wyświetlane w aplikacji i adres e-mail. Hasło jest przetwarzane przez bezpieczną warstwę uwierzytelniania. Nie zapisujemy treści sprawy w logach aplikacji.</p>
      <p>Serwer przechowuje także stan potwierdzenia adresu, sesje oraz techniczne dane potrzebne do ograniczania prób logowania. Potwierdzenie e-maila i odzyskanie hasła korzystają z poczty Resend: dostawca otrzymuje adres konta, jednorazowy kod, jego cel i termin ważności. Nie otrzymuje dokumentów, nazw plików, notatek ani klucza sejfu.</p>
      <h2>3. Dokumenty i szyfrowanie</h2>
      <p>Importowane dokumenty są przechowywane w magazynie przeglądarki użytkownika i chronione kluczem sejfu. Szyfrowanie chroni dane przechowywane po zamknięciu sejfu, ale nie obiecuje ochrony przed złośliwym kodem na odblokowanym urządzeniu, przejęciem sesji ani utratą lokalnej pamięci. Dlatego aplikacja udostępnia eksportowany, zaszyfrowany backup.</p>
      <p>Pełna kopia obejmuje także oryginalne pliki. Hasło konta i dostęp do sejfu są oddzielne: reset hasła konta nie odblokowuje dokumentów. Lokalny sejf wymaga swojego dotychczasowego hasła lub klucza odzyskiwania. OCR zdjęć i skanów oraz odczyt PDF odbywają się na urządzeniu użytkownika.</p>
      <h2>4. Synchronizacja i usługi zewnętrzne</h2>
      <p>Synchronizacja jest odrębną, świadomą czynnością. Serwer może widzieć techniczne ID rekordu, wersję szyfrogramu, rozmiar i czas połączenia, ale nie ma klucza do czytania zaszyfrowanej sprawy. Zewnętrzne AI nie otrzymuje dokumentów w trybie lokalnym. Przekazanie zakresu danych wymaga osobnego podglądu i zgody.</p>
      <h2>5. Płatności</h2>
      <p>Jeżeli sprzedaż zostanie uruchomiona, dane potrzebne do płatności zostaną przekazane operatorowi Przelewy24. TyWygrywasz przechowuje minimalny identyfikator sesji i status transakcji. Szczegóły operatora i aktualne dane sprzedawcy pojawią się przed płatnością.</p>
      <h2>6. Twoje prawa</h2>
      <p>Możesz poprosić o dostęp, sprostowanie, usunięcie lub ograniczenie danych konta zgodnie z właściwymi przepisami. Usunięcie lokalnego sejfu wykonujesz na swoim urządzeniu; przed tym krokiem pobierz backup, jeśli chcesz zachować dokumenty.</p>
      <p className="commerce-note">Wersja dokumentu: 6 października 2026. {config.seller.email ? <>Kontakt w sprawach prywatności: <a className="commerce-inline-link" href={`mailto:${config.seller.email}`}>{config.seller.email}</a>.</> : 'Kontakt zostanie uzupełniony przed uruchomieniem sprzedaży.'}</p>
    </div></article>
  </CommerceLayout>;
}
