# Pamięć projektu TyWygrywasz.pl

Stan opracowania: 6 października 2026 r. Ten dokument porządkuje ustalenia z rozmowy, decyzje projektowe, wykonane prace i otwarte zadania. Nie zawiera kluczy API, tokenów, haseł ani wartości sekretów.

## 1. Intencja użytkownika

Użytkownik chce stworzyć premium serwis dla osób prowadzących sprawy z urzędami i innymi instytucjami. Serwis ma zagrzewać do działania, ale mówić prostym językiem i nie udawać kancelarii ani automatycznego pełnomocnika. Najważniejszy efekt to przejście od rozproszonych dokumentów do uporządkowanego planu: fakty → dokumenty → instytucje → terminy → następny krok → projekt pisma → potwierdzenie.

Serwis ma być wyraźnie lepszy dla laika niż ogólny czat AI, ponieważ pracuje na jego uporządkowanym, wersjonowanym materiale, pilnuje źródeł, terminów, ról instytucji, brakujących faktów i historii dowodów. Czat może pomóc w języku, ale nie zastępuje modelu sprawy, lokalnego sejfu, osi czasu, źródeł i kontroli użytkownika.

## 2. Ustalenia marki i strony publicznej

### Nazwa i nawigacja

- Widoczna nazwa marki: **TyWygrywasz.pl**. Nazwa robocza „Obywatel” ma nie pojawiać się użytkownikowi jako nazwa produktu.
- Kliknięcie logo zawsze wraca do strony głównej.
- Dostarczony znak graficzny TyWygrywasz jest używany w logo.
- Tarcza z logo jest używana jako favicon i ikona aplikacji w niezmienionej formie.

### Kierunek wizualny

- Strona ma być premium, dynamiczna, czytelna i motywująca, bez ciężkich czarnych ramek.
- Najważniejszy komunikat „do czego służy TyWygrywasz?” ma być widoczny od razu, przed przewinięciem.
- Główny przycisk rozpoczęcia sprawy ma być łatwy do znalezienia.
- Górny poziomy pasek ma dynamicznie tłumaczyć mechanizm: dokument → kontekst → działanie. Animowany dokument zatrzymuje się dokładnie nad odpowiednią ikoną etapu; geometria pauz została dostrojona dla małych i dużych ekranów.
- Tekst jest składany tak, aby nie zostawiać wdów i sierot. Zmiana została zapisana w historii Git jako `e5995a5`.
- Główne zdjęcie pokazuje trzy osoby idące przed tablicą Urzędu m.st. Warszawy. Zdjęcie pary przy komputerze wzmacnia komunikat o wspólnym uporządkowaniu sprawy. Pozostałe zdjęcia wspierają sceny pracy z dokumentami.
- Pasek i sekcje mają pokazywać spokojny plan działania, lokalną prywatność i gotowość do wykonania następnego kroku.

### Użyte materiały

W repozytorium znajdują się przygotowane warianty obrazów w `public/images/` oraz logo w `public/tywygrywasz-logo.png` i tarcza w `public/tywygrywasz-shield.png`. Główne obrazy to `sprawa-warszawa-*`, `wspolny-krok-*`, `spokojny-plan-*` i `porzadek-dokumenty-*`.

## 3. Wymagania użytkowe

### Konto

Każdy użytkownik może założyć własne konto, zalogować się i zarządzać ustawieniami. Konto służy do tożsamości i opcjonalnej synchronizacji struktury; odblokowanie lokalnego sejfu ma osobny klucz i nie może być utożsamiane z hasłem konta.

### Dokumenty

Użytkownik może tworzyć, importować, porządkować, przeglądać i eksportować dokumenty w formatach:

- DOC,
- RTF,
- TXT,
- PDF,
- JPG,
- PNG.

Nie wolno nadpisywać oryginału. Odczyt OCR, poprawa, projekt pisma, eksport i redakcja są osobnymi wersjami z pochodzeniem i hashem oryginału.

### Wiele instytucji

Jedna sprawa może mieć wiele instytucji, organów, firm, pełnomocników, świadków i innych stron. Każda instytucja ma własne role, kanał/adres, właściwość, sygnatury i źródła. Korespondencja, dokumenty, terminy i działania wskazują konkretną instytucję. Klasyfikator nie przypisuje dokumentu automatycznie do pierwszej sprawy, gdy pasuje do kilku.

Szczegół decyzji: [ADR 0004](decisions/0004-multiple-institutions-per-case.md).

### Lokalny dysk i sejf

Projekt ma obsługiwać rzeczywiste pliki użytkownika i czytelną strukturę katalogów sprawy. W lokalnym środowisku `/api/workspace` działa jako most Node.js do wybranego katalogu. Na Vercel filesystem funkcji jest efemeryczny, dlatego produkcja korzysta z importu przeglądarkowego/local-first, a nie z udawania stałego dysku serwera.

Domyślnie lokalnie zostają: oryginały, OCR, nazwy, prywatny indeks, miniatury, notatki, szkice, hashe prywatne i klucze. Szyfrowanie chroni zamknięty sejf i zaszyfrowane rekordy, lecz nie chroni odblokowanej przeglądarki, złośliwego kodu ani zainfekowanego komputera. Użytkownik otrzymuje informację o backupie i ograniczeniach.

### AI i Gemini

Gemini jest opcjonalnym adapterem. Tryb lokalny nie powinien wysyłać dokumentów. Operacja chmurowa wymaga wskazania celu, odbiorcy, dokładnego zakresu, podglądu payloadu i świadomej zgody. Cofnięcie zgody blokuje kolejne wysyłki, ale nie udaje usunięcia danych już przetworzonych przez usługę zewnętrzną.

## 4. Zaimplementowane obszary

### Domena i lokalny przebieg

- `src/domain/vault.ts` — lokalny sejf, wersje i integralność.
- `src/domain/browser-storage.ts` — lokalna warstwa przechowywania przeglądarki.
- `src/domain/disk-manager.ts` — obsługa wybranego katalogu/pliku i wykrywanie zmian.
- `src/domain/crypto.ts` — szyfrowanie sejfu i backup.
- `src/domain/ocr-engine.ts`, `extractor.ts`, `intelligent-classifier.ts` — OCR, propozycje pól i klasyfikacja z ochroną przed prompt injection.
- `src/domain/case-analysis.ts`, `legal-knowledge.ts` — sprawa, ustalenia, źródła i analiza.
- `src/domain/deadlines.ts`, `action-schedule.ts` — wyliczanie terminów i kolejnych działań.
- `src/domain/letter-engine.ts` — projekty pism, wersje i checklista.
- `src/domain/redaction-engine.ts` — redakcja danych przed publikacją/przekazaniem.
- `src/domain/sync-engine.ts` — szyfrowane koperty synchronizacji.
- `src/domain/auth-store.ts` — konto, sesja i warstwa Supabase z pamięciowym fallbackiem do developmentu.

### Widoki aplikacji

Główna aplikacja w `src/app/page.tsx` i widoki w `src/components/views/` obejmują m.in. Dziś, sprawy, dokumenty z dysku, skrzynkę do uporządkowania, oś czasu, dowody, pisma, plan działania, źródła prawa i backup/prywatność.

### Konto i synchronizacja

Trasy konta znajdują się w `src/app/api/auth/`. Produkcja używa server-only klienta Supabase do kont, sesji i zaszyfrowanych kopert. RLS i brak grantów publicznych są częścią migracji. Pamięciowy fallback nie jest trwałością produkcyjną.

### Przelewy24 i dokumenty handlowe

Dodane są:

- `/kup`,
- `/platnosc`, `/platnosc/powrot`,
- `/api/payments/config`, `/checkout`, `/status`, `/webhook`,
- `/regulamin`, `/polityka-prywatnosci`, `/kontakt`,
- `src/domain/payments.ts`, `src/domain/commerce-config.ts`,
- `supabase/migrations/20261005113000_payment_orders.sql`.

Backend rejestruje `pending`, generuje podpis SHA-384, sprawdza webhook, kwotę, walutę, merchant/pos i wykonuje weryfikację P24 przed oznaczeniem zamówienia jako `paid`. Checkout fail-closed nie udaje płatności, gdy brakuje konfiguracji.

### Dane firmy i kontakt

Uzgodniony publiczny kontakt:

- **Multinewsroom Jan Domaniewski**,
- **NIP: 5252189241**,
- **REGON: 147154574**,
- **kontakt@tywygrywasz.pl**.

Strona Kontakt pokazuje nazwę, NIP, REGON i e-mail, bez adresu ulicy. Regulamin pokazuje pełną identyfikację wraz z adresem: **ul. Barcickiej 44, 01-839 Warszawa**. Stopka pokazuje nazwę, NIP, REGON, e-mail i copyright Multinewsroom. Dane identyfikacyjne zostały zweryfikowane względem [regulaminu kodtalentu.pl](https://www.kodtalentu.pl/regulamin.html); produktu, ceny 69 zł ani jego opisów nie skopiowano do TyWygrywasz.

## 5. Stan wdrożenia

- Repozytorium docelowe: [JanTDom/tywygrywasz](https://github.com/JanTDom/tywygrywasz), `main`.
- Ostatni zapisany commit w chwili utworzenia pamięci: `93939c8` (`Match verified seller address spelling`).
- Produkcja: [https://tywygrywasz.pl/](https://tywygrywasz.pl/), Vercel, ostatni wdrożony deployment zakończony statusem `READY`.
- Potwierdzone ścieżki produkcyjne: `/`, `/kontakt`, `/regulamin`, `/polityka-prywatnosci`, `/kup` i endpoint konfiguracji płatności odpowiadają.
- Ostatnia walidacja kodu: `npm run typecheck`, `npm test -- --run` — 23 pliki i 93 testy, `npm run build` — przechodzą.
- Podczas builda Vercel zgłasza istniejące ostrzeżenie o 5 podatnościach wysokiego poziomu w zależnościach. Nie wykonano automatycznego `npm audit fix --force`, aby nie wprowadzić niezweryfikowanych zmian.

## 6. Płatności — stan i następne kroki

Sprzedaż jest celowo wyłączona. Publiczna konfiguracja nie ma ceny oferty ani technicznych danych P24, więc endpoint raportuje brak konfiguracji zamiast uruchamiać niepełny checkout. Cena 69 zł z KOD TALENTU należy do oferty TWÓJ KOD i nie została bez zgody przeniesiona do TyWygrywasz.

Przed pierwszą płatnością trzeba:

1. ustalić cenę i dokładny zakres oferty TyWygrywasz;
2. zastosować migrację `20261005113000_payment_orders.sql` w właściwym projekcie Supabase;
3. ustawić sekrety P24 i publiczne URL-e Production/Preview w Vercel;
4. skonfigurować webhook i przejść płatność sandbox;
5. przejrzeć regulamin, politykę prywatności, zasady odstąpienia i reklamację;
6. powtórzyć testy checkoutu, webhooka, weryfikacji i izolacji kont.

Nie wpisuj wartości sekretów do tego dokumentu. Dane przekazane kiedyś w rozmowie nie są pamięcią produkcyjną; jeśli któryś klucz był użyty poza bezpiecznym panelem, należy go obrócić.

## 7. Otwarty backlog

- Dokończyć trwałą warstwę IndexedDB/OPFS i testy odtwarzania na czystym profilu.
- Dodać weryfikację e-mail, reset hasła, rate limiting, rotację sesji i monitoring bez PII.
- Dokończyć lokalny OCR w workerze z polskim słownikiem i podglądem fragmentów.
- Rozszerzać procedury dopiero po zebraniu właściwych źródeł i testach: informacja publiczna, skargi, petycje, konsument, umowy, podatki/ZUS.
- Dodać test sieciowy wykrywający wysyłkę canary PII z dokumentów, nazw, OCR, dat, indeksu i szkiców.
- Przejść ręczny audyt dostępności WCAG 2.2 AA, klawiatury, mobile i druku.
- Przeprowadzić przegląd prawny przed włączeniem sprzedaży.

## 8. Historia ważnych decyzji i zmian

- `1006aa4` — nazwa widoczna zmieniona na TyWygrywasz.
- `e635785` — wiele instytucji w jednej sprawie.
- `3727e48` — lokalny sejf i przepływ sprawy.
- `a0ef200` — zdjęcia redakcyjne na stronie.
- `e5bfb11` — jasna wartość produktu i prywatność.
- `8177eb5` — cel produktu nad pierwszym ekranem.
- `d52b946` — animowany walkthrough produktu.
- `e5995a5` — ochrona przed wdowami i sierotami.
- `b51dd12`, `4018b65`, `2132b91`, `446761a`, `971337c`, `d8f8400` — kolejne strojenie hero, paska obrony i animacji dokumentu.
- `3b058df` — przygotowanie płatności P24 i dokumentów prawnych.
- `ce9b59d`, `a61b57b`, `93a0012`, `93939c8` — dane firmy, kontakt, stopka i zgodny zapis adresu.

## 9. Jak zaczynać następną sesję

Powiedz agentowi: „Przeczytaj `PROJECT.md`, `docs/PROJECT_MEMORY.md`, `AGENTS.md` i dokument odpowiadający zadaniu. Sprawdź stan repozytorium i nie kopiuj sekretów.” Następnie wskaż konkretny etap backlogu albo plik. Każdą nową decyzję, która zmienia prywatność, model danych, płatności lub zakres produktu, dopisz tutaj i — jeśli to decyzja architektoniczna — jako osobny ADR.
