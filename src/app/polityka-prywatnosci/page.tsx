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
      <p>Do konta potrzebujemy imienia wyświetlanego w aplikacji i adresu e-mail. Przy rejestracji lub logowaniu hasło konta trafia do serwera w celu utworzenia konta albo sprawdzenia logowania. Serwer zapisuje skrót hasła z losową solą. Nie zapisujemy treści sprawy w logach aplikacji.</p>
      <p>Serwer przechowuje także stan potwierdzenia adresu, sesje oraz techniczne dane potrzebne do ograniczania prób logowania. Obsługa kodów potwierdzenia i odzyskania hasła jest przygotowana dla poczty Resend i wymaga konfiguracji nadawcy. Po jej uruchomieniu dostawca otrzyma adres konta, jednorazowy kod, jego cel i termin ważności. Nie otrzyma dokumentów, nazw plików, notatek ani klucza sejfu. Przy braku konfiguracji aplikacja pokazuje niedostępność kodów.</p>
      <h2>3. Dokumenty i szyfrowanie</h2>
      <p>Importowane dokumenty są przechowywane w magazynie przeglądarki użytkownika i chronione kluczem sejfu. Szyfrowanie chroni dane przechowywane po zamknięciu sejfu, ale nie obiecuje ochrony przed złośliwym kodem na odblokowanym urządzeniu, przejęciem sesji ani utratą lokalnej pamięci. Dlatego aplikacja udostępnia eksportowany, zaszyfrowany backup.</p>
      <p>Pełna kopia obejmuje także oryginalne pliki. Przy tworzeniu sejfu dla konta aplikacja początkowo używa hasła konta również do ochrony klucza sejfu na urządzeniu. Logowanie i ochrona klucza pełnią osobne funkcje, choć wtedy używają tego samego hasła. Klucz i jego zaszyfrowana koperta pozostają lokalnie.</p>
      <p>Reset hasła konta nie zmienia tej koperty i nie odblokowuje dokumentów. Po resecie użyj osobnego przycisku „Odblokuj lokalny sejf” oraz dotychczasowego hasła sejfu lub klucza odzyskiwania. W tej czynności dotychczasowe hasło i klucz nie są wysyłane do serwera. OCR zdjęć i skanów oraz odczyt PDF odbywają się na urządzeniu użytkownika.</p>
      <h2>4. Synchronizacja i usługi zewnętrzne</h2>
      <p>Synchronizacja jest odrębną, świadomą czynnością. Serwer może widzieć techniczne ID rekordu, wersję szyfrogramu, rozmiar i czas połączenia, ale nie ma klucza do czytania zaszyfrowanej sprawy. Zewnętrzne AI nie otrzymuje dokumentów w trybie lokalnym. Przekazanie zakresu danych wymaga osobnego podglądu i zgody.</p>
      <h2>5. Płatności</h2>
      <p>Sprzedaż wymaga skonfigurowania oferty i Przelewy24. Po jej uruchomieniu operator otrzyma adres e-mail konta oraz dane potrzebne do obsługi transakcji, w tym kwotę, walutę, opis oferty i identyfikator sesji płatności.</p>
      <p>TyWygrywasz zapisuje na serwerze dane zamówienia powiązane z kontem: adres e-mail, identyfikator sesji płatności, kwotę i walutę, identyfikatory sprzedawcy i punktu płatności, token oraz numer transakcji Przelewy24, status, czas utworzenia zamówienia i czas potwierdzenia płatności. Są to czytelne dane serwera. Dokumenty i OCR z sejfu nie są częścią tych danych. Dane karty podajesz u operatora płatności.</p>
      <h2>6. Twoje prawa</h2>
      <p>Możesz poprosić o dostęp, sprostowanie, usunięcie lub ograniczenie danych konta zgodnie z właściwymi przepisami. Usunięcie lokalnego sejfu wykonujesz na swoim urządzeniu; przed tym krokiem pobierz backup, jeśli chcesz zachować dokumenty.</p>
      <p className="commerce-note">Wersja dokumentu: 6 października 2026. {config.seller.email ? <>Kontakt w sprawach prywatności: <a className="commerce-inline-link" href={`mailto:${config.seller.email}`}>{config.seller.email}</a>.</> : 'Kontakt zostanie uzupełniony przed uruchomieniem sprzedaży.'}</p>
    </div></article>
  </CommerceLayout>;
}
