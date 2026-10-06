# Architektura prywatności: dokumenty lokalnie

## Granice danych

Domyślny wariant MVP działa **bez synchronizacji prywatnej sprawy**. Konto
nie jest serwerowym sejfem. Serwer udostępnia publiczne zasoby aplikacji
i może przechować zaszyfrowaną strukturę tylko po osobnym wyborze użytkownika.
Opcjonalne E2EE synchronizuje strukturę, gdy użytkownik świadomie wybierze
wygodę wielu urządzeń; oryginalne pliki przenosi pełna kopia lokalna.
Nie używaj szyfrowania tylko do marketingowego hasła: dostawca nadal może
widzieć identyfikator konta, adres IP, rozmiar i czas szyfrogramu. Przyjmij
to jako osobno opisaną granicę prywatności.

| Warstwa | Przechowuje | Zasady |
|---|---|---|
| Urządzenie użytkownika | Oryginały, OCR, miniatury, indeks, prywatne metadane, szkice, klucze | Szyfrowany sejf, kontrola dostępu lokalnego, jawny backup |
| Serwer aplikacji | Publiczne przepisy, źródła, wzorce i reguły; zaszyfrowana struktura spraw | Bez klucza do danych sprawy i bez czytelnego OCR |
| Konto i infrastruktura | Minimum danych logowania, techniczne identyfikatory i metadane połączenia | Minimalna retencja, brak treści spraw w logach; jawny opis ograniczeń |
| Płatności — po uruchomieniu | Dane zamówienia i konta opisane poniżej | Czytelna warstwa serwera i Przelewy24, bez dokumentów i OCR |
| Chmurowe AI — opcja | Wyłącznie zakres zatwierdzony dla danej operacji | Podgląd, odbiorca, cel, zasady retencji i informacja o przekazaniu danych |
| Publiczna publikacja — opcja | Odrębny, zatwierdzony materiał | Redakcja danych i kontrola każdej publikowanej wersji |

Zaszyfruj po stronie klienta także tytuł sprawy, urząd, sygnaturę, daty,
prywatne hashe, nazwy dokumentów, relacje, notatki i szczegółowy audyt.
Serwer zna niezbędne ID rekordu, wersję szyfrogramu i stan technicznej
synchronizacji; minimalizuj ujawnione rozmiary i czas modyfikacji, a pozostałe
ujawnienia opisz. Publiczne reguły postępowania nie potrzebują szyfrowania.

## Lokalny sejf w aplikacji webowej

Przeglądarka nie otrzymuje swobodnego dostępu do dysku. Użytkownik wybiera
plik lub katalog i nadaje zakres dostępu. Wspieraj File System Access API
tylko po wykryciu możliwości i uprawnień; nie zakładaj identycznej obsługi
we wszystkich przeglądarkach i na telefonie. Nie zapisuj pełnej ścieżki
użytkownika na serwerze. Ponowne otwarcie może wymagać ponownego wskazania
pliku lub katalogu; sprawdź hash, zanim zwiążesz go z istniejącym rekordem.

Wariant zgodny z szerszą grupą przeglądarek: lokalny import przez wybór
plików, zaszyfrowane OPFS/IndexedDB oraz eksport przenośnego sejfu.
Pamięć przeglądarki może zostać usunięta. Żądanie persistent storage nie
gwarantuje backupu ani ochrony przed ręcznym czyszczeniem profilu.
Utrata lokalnego pliku nie może być ukryta przez istniejącą metadaną.

Krótki kontekst wpisany przy imporcie dokumentu oraz wskazówki przy projekcie
pisma są prywatnymi notatkami roboczymi. Interfejs oznacza je jako niepotwierdzone
twierdzenia użytkownika; nie są automatycznie dodawane do OCR, cytowań ani
eksportowanej treści pisma. Import tworzy lokalną propozycję uporządkowania,
ale decyzję o przypisaniu dokumentu podejmuje użytkownik.

Pobranie/zapis oryginału oznacza zachowanie jego bajtów, także gdy sejf
przechowuje je jako szyfrogram. Nie „poprawiaj” PDF i nie usuwaj jego podpisu.
Przechowywanie istniejących dokumentów poza sejfem nie szyfruje ich automatycznie;
powiedz użytkownikowi, które kopie są chronione szyfrowaniem aplikacji.

OCR i ekstrakcję PDF uruchamiaj lokalnie, najlepiej w workerze. Biblioteki,
modele i zasoby językowe pobierane przez aplikację nie mogą otrzymywać treści
dokumentu. Wrażliwe indeksy, embeddings, miniatury i cache traktuj jak oryginały.
Zdalne embeddings także są przekazaniem danych i wymagają odrębnej zgody.

## Klucze, backup i wiele urządzeń

Wybierz utrzymywaną bibliotekę i standardowe szyfrowanie uwierzytelnione.
Przeanalizuj generowanie nonce, KDF, przechowywanie kluczy i blokadę sejfu.
Nie buduj własnego algorytmu. Oddziel logowanie do konta od odblokowania
sejfu: reset hasła do konta nie daje serwerowi prawa ani możliwości odczytu.

Zaprojektuj klucz odzyskiwania i zaszyfrowany eksport, sprawdź odtworzenie
na czystym profilu. Pokaż stan ostatniego backupu. Bez klucza i backupu
administrator nie odzyska lokalnych danych; komunikuj to podczas tworzenia
sejfu. Dostęp z drugiego urządzenia wymaga odtworzenia lub jawnego transferu.
Sama synchronizacja struktury nie przenosi oryginałów.

W MVP synchronizuj wyłącznie zaszyfrowaną strukturę. Szyfrowany backup
dokumentów w chmurze to możliwy kolejny, wyraźnie opcjonalny moduł,
z osobnym zakresem i testami — nie uruchamiaj go po cichu.
Konflikty wersji przechowuj, przedstawiaj użytkownikowi i rozwiązuj bez
cichego nadpisania dowodu, daty lub pisma. Usuń także pochodne, indeksy,
cache i przyszłe synchronizacje, gdy użytkownik usuwa dokument.

## Realne ograniczenia i kontrola

Szyfrowanie chroni zamknięty sejf i dane przechowywane na serwerze. Kod
aplikacji w odblokowanej przeglądarce ma dostęp do odczytywanych danych.
XSS, przejęcie dostarczanej aplikacji, złośliwa aktualizacja lub zainfekowany
komputer nadal mogą je ujawnić. Nie reklamuj „100% prywatności”.
Ogranicz skrypty zewnętrzne, CSP, zależności i telemetrię; przypnij wersje,
stosuj kontrolę aktualizacji i przegląd bezpieczeństwa. Wyeliminuj session
replay i analitykę treści sejfu. Bardziej wymagający użytkownicy mogą później
wybrać audytowalny klient desktopowy działający offline.

Test sieciowy ma obejmować pliki, treść OCR, nazwy, daty, wyszukiwanie,
embeddings, raporty błędów i generowanie pism. Zablokuj przesyłanie tych
danych w trybie lokalnym. Nie wystarczy sprawdzić brak endpointu upload.

Interfejs pokazuje trzy osobne stany: **tylko na tym urządzeniu**,
**synchronizowana zaszyfrowana struktura**, **wybrany zakres przekazany do AI**.
Serwer nie policzy prywatnych terminów z szyfrogramu. W MVP przypomnienia
są lokalne po otwarciu aplikacji; nie obiecuj alarmu przy zamkniętej przeglądarce.
Opcjonalny kalendarz/serwerowe przypomnienia wymagają własnego modelu ujawnień.

## Wykonany przebieg lokalny (2026-10-06)

Nowy sejf zapisuje w localStorage kopertę klucza opakowaną hasłem, a nie czytelny klucz odzyskiwania. Tryb bez konta używa hasła wybranego lokalnie. W domyślnym przebiegu konta hasło rejestracji/logowania trafia do API i jednocześnie początkowo opakowuje lokalny klucz sejfu; zwykłe logowanie może nim odblokować kopertę. Rozdzielenie funkcji konta i sejfu nie oznacza tu dwóch różnych haseł. API zapisuje skrót hasła konta z solą, ale nie otrzymuje klucza ani jego lokalnej koperty.

Migracja wcześniejszego surowego klucza usuwa go dopiero po poprawnym odczycie manifestu i zapisaniu koperty. Odblokowanie i blokada są osobnymi czynnościami. Reset hasła konta pozostawia kopertę bez zmiany. Osobny przycisk „Odblokuj lokalny sejf” używa dotychczasowego hasła sejfu lub klucza TWY bez wysyłania ich do API. Odtworzenie pełnej kopii ustawia jej hasło jako hasło lokalnego odblokowania; synchronizacja używa odrębnego hasła wpisanego w jej panelu. Pobranie klucza odzyskiwania jest jawnym eksportem sekretu, który użytkownik powinien przechowywać osobno.

Pełna kopia `tywygrywasz-portable-vault` 2.0 zawiera zaszyfrowane metadane i uwierzytelniony komplet szyfrogramów oryginałów. Odtwarzanie zastępuje bieżący sejf dopiero po walidacji całości i jawnym wyborze użytkownika; zachowanie potrzebnej wcześniejszej zawartości wymaga jej eksportu. Synchronizacja przenosi tylko strukturę. Rozbieżne wersje wymagają decyzji i szyfrowanego punktu powrotu.

Tesseract, słowniki pol/eng i worker PDF.js są zasobami aplikacji z tego samego pochodzenia. Treść jest przetwarzana lokalnie. Nowy podział PDF zachowuje oryginał i zapisuje pochodzenie oraz zakres stron osobnego pliku. Podświetlenia pochodzą z rzeczywistej geometrii OCR/PDF; po ręcznej korekcie tekstu poprzednia geometria nie jest przypisywana nowym słowom.

Poczta konta ma serwerowy adapter Resend. Po jego skonfigurowaniu dostawca otrzymuje adres e-mail, jednorazowy kod, cel i termin ważności, bez danych sejfu. Konto, daty weryfikacji, sesje i techniczne limity połączeń są czytelną warstwą serwera; trwały limit IP zapisuje HMAC, nie treść sprawy. Konfiguracja nadawcy i migracja bazy są warunkiem pracy tej usługi. Szczegóły i okresy ważności opisuje ADR odzyskiwania konta. W bieżącej produkcji poczta nie jest jeszcze skonfigurowana; dostępność kodów jest jawna w interfejsie, a rejestracja może pozostawić adres niepotwierdzony.

Warstwa płatności po uruchomieniu zapisuje w `payment_orders` czytelne dane: powiązanie z kontem, e-mail, identyfikator sesji płatności, kwotę, walutę, identyfikatory merchant/POS, status, token i numer transakcji P24 oraz czas utworzenia i potwierdzenia płatności. Przelewy24 otrzymuje e-mail i metadane transakcji, w tym opis oferty oraz skonfigurowane adresy powrotu i webhooka. Token P24 trafia także do adresu przekierowania na stronę operatora; nie jest kluczem API ani kluczem sejfu. Dokumenty, OCR i prywatne metadane spraw nie są wysyłane w tym przebiegu. W bieżącej produkcji Przelewy24 nie jest jeszcze skonfigurowane i checkout pozostaje niedostępny. Nie wykonano rzeczywistej płatności ani dostawy kodu e-mail w ramach tego wydania.
