# Pamięć projektu TyWygrywasz.pl

Stan wydania: 6 października 2026 r.; końcowy przegląd publikacji: 7 października 2026 r. Ten dokument porządkuje ustalenia z rozmowy, decyzje projektowe, wykonane prace i otwarte zadania. Nie zawiera kluczy API, tokenów, haseł ani wartości sekretów.

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

Każdy użytkownik może założyć własne konto, zalogować się i zarządzać ustawieniami. Konto służy do tożsamości i opcjonalnej synchronizacji. Domyślnie jedno podane hasło służy dwóm celom: trafia do serwera przy operacji konta i lokalnie zabezpiecza kopertę osobnego klucza sejfu. Klucz i koperta pozostają na urządzeniu. Dedykowane lokalne odblokowanie nie wysyła hasła sejfu ani klucza; reset hasła konta nie zmienia tej koperty. Nie opisuj tego przebiegu jako dwóch niezależnie wybieranych haseł.

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

Zwykły przebieg aplikacji korzysta z importu przeglądarkowego i szyfrowanego IndexedDB. Kolekcje sprawy są lokalnymi metadanymi. `/api/workspace` pozostaje mostem wyłącznie deweloperskim; odmawia pracy przy `NODE_ENV=production` i na Vercel. UI nie przesyła do niego dokumentów.

Domyślnie lokalnie zostają: oryginały, OCR, nazwy, prywatny indeks, miniatury, notatki, szkice, hashe prywatne i klucze. Szyfrowanie chroni zamknięty sejf i zaszyfrowane rekordy, lecz nie chroni odblokowanej przeglądarki, złośliwego kodu ani zainfekowanego komputera. Użytkownik otrzymuje informację o backupie i ograniczeniach.

### AI i Gemini

Gemini jest opcjonalnym adapterem demonstracyjnym bez transportu produkcyjnego; obecny kod odmawia wywołania chmurowego. Docelowa operacja chmurowa wymaga wskazania celu, odbiorcy, dokładnego zakresu, podglądu payloadu i świadomej zgody. Cofnięcie zgody ma blokować kolejne wysyłki, ale nie oznacza usunięcia danych już przetworzonych przez usługę zewnętrzną.

## 4. Zaimplementowane obszary

### Domena i lokalny przebieg

- `src/domain/vault.ts` — lokalny sejf, wersje i integralność.
- `src/domain/browser-storage.ts` — lokalna warstwa przechowywania przeglądarki.
- `src/domain/disk-manager.ts` — interfejs importu i ponownego wskazania pliku; serwerowy most katalogu jest wyłącznie deweloperski.
- `src/domain/crypto.ts` — szyfrowanie sejfu i backup.
- `src/domain/ocr-engine.ts`, `extractor.ts`, `intelligent-classifier.ts` — lokalny OCR i regułowe propozycje pól oraz klasyfikacji; tekst dokumentu jest niezaufanym materiałem, a deklaracja odporności na wszystkie rodzaje prompt injection nie wynika z tych testów.
- `src/domain/case-analysis.ts`, `legal-knowledge.ts` — sprawa, ustalenia, źródła i analiza.
- `src/domain/deadlines.ts`, `action-schedule.ts` — wyliczanie terminów i kolejnych działań.
- `src/domain/letter-engine.ts` — projekty pism, wersje i checklista.
- `src/domain/redaction-engine.ts` — prototyp propozycji redakcji na danych syntetycznych; nie zapewnia sprawdzonej redakcji eksportowanych oryginałów.
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
- Użytkownik 7 października wyraźnie zatwierdził publikację kodu oraz przełączenie obu domen. GitHub connector wykonał fast-forward `main` z `4165c4ca` do kodu `9c9ce03`; osobny push dokumentacji `87799f5` został potwierdzony odczytem zdalnej gałęzi. Dokumentacja jest publikowana oddzielnie od niezmiennego kodu aplikacji, więc historyczny odczyt SHA nie stanowi stałego adresu bieżącego `main`.
- Kod wydania: `9c9ce03cd460e51b18f88dd44706c8d36aadd9df`, obejmujący `f3671c24aac0bc30cfe74b0040a21cc13d110ed0`, nowe przebiegi i trzy poprawki MEDIUM po audycie.
- Wdrożenie Vercel `dpl_CS3SG1kj6xVv77kieymcPw2RtW4u`: `READY`, Node 24, [zweryfikowany adres wydania](https://tywygrywasz-6f7upj9fx-macieto.vercel.app). Zdalne E2E: 15/15 w 59,8 s, w tym rzeczywiste dwa konta Supabase, sesje i synchronizacja; użyto danych syntetycznych, bez wysyłania poczty. Po commicie wydania nie zmieniono aplikacji ani harnessu.
- Autoryzowana promocja sprawdzonego wdrożenia `dpl_CS3SG1kj6xVv77kieymcPw2RtW4u` zakończyła się sukcesem. Automatyczne wdrożenie dokumentacji `87799f5` następnie przejęło aliasy: podczas kontroli obie domeny wskazywały `dpl_FHgKr1goBVudWXoohffhE9gvLP4T`, `READY`, z tą samą implementacją aplikacji `9c9ce03`. Ostateczne przypisanie po końcowej publikacji dokumentacji będzie zachowane w osobnym artefakcie weryfikacji.
- Historyczne sprawdzenie wcześniejszej produkcji potwierdziło `/`, `/kontakt`, `/regulamin`, `/polityka-prywatnosci`, `/kup` i endpoint konfiguracji płatności; nie jest to test nowego wydania na własnej domenie.
- [tywygrywasz.pl](https://tywygrywasz.pl/) i [www.tywygrywasz.pl](https://www.tywygrywasz.pl/) przeszły publiczny HTTP smoke 14/14: siedem ścieżek na każdej domenie, status 200, bez przekierowań, HTML i zasoby Next. Rzeczywiste endpointy pokazują `emailCodesAvailable: false` i `ready: false` płatności. Browser na `tywygrywasz.pl`: 3/3 w 18,9 s, obejmujące rzeczywisty lokalny OCR/crypto/IDB/backup/reload/relink, mobile recovery z mockowanym capabilities oraz wydruk z przechwyconym wywołaniem drukarki; bez realnych kont i sieciowych żądań mutujących.
- Status GitHub `Vercel: success` potwierdza wdrożenie Vercel. Osobno [GitHub Actions dla push 87799f5](https://github.com/JanTDom/tywygrywasz/actions/runs/37585037326) zakończyło się `SUCCESS`. Po teście adresu wydania usunięto dokładnie dwa syntetyczne konta oraz tymczasowy plik cookie.
- Wyniki dzisiejszej walidacji i granice testów opisuje `docs/IMPLEMENTATION_STATUS.md`.
- `npm audit --omit=dev` z 6 października: zero zgłoszonych podatności zależności produkcyjnych. Pełny audit także pokazuje zero zgłoszeń po migracji Tailwind 4.3.3 i resolvera pluginu ESLint Next. Warstwa zgodności zachowuje tokeny wyglądu v3; minimalny browser to Safari 16.4+, Chrome 111+ lub Firefox 128+.

## 6. Płatności — stan i następne kroki

Sprzedaż jest celowo wyłączona. Publiczna konfiguracja nie ma ceny oferty ani technicznych danych P24, więc endpoint raportuje brak konfiguracji zamiast uruchamiać niepełny checkout. Cena 69 zł z KOD TALENTU należy do oferty TWÓJ KOD i nie została bez zgody przeniesiona do TyWygrywasz.

Migracje są już zastosowane w docelowym Supabase `tywygrywasz` (`aueatowylwgcgpjdpqdz`), w tym `payment_orders`: zweryfikowano sześć tabel z RLS, uprawnienia serwerowe i pięć RPC z `security invoker`. Kontrola nie wykazała WARN ani ERROR. Nie oznacza to skonfigurowania ani wykonania płatności P24.

Przed pierwszą płatnością trzeba:

1. ustalić cenę i dokładny zakres oferty TyWygrywasz;
2. ustawić sekrety P24 i publiczne URL-e Production/Preview w Vercel;
3. skonfigurować webhook i przejść płatność sandbox;
4. przejrzeć regulamin, politykę prywatności, zasady odstąpienia i reklamację;
5. powtórzyć testy checkoutu, webhooka, weryfikacji i izolacji kont.

Nie wpisuj wartości sekretów do tego dokumentu. Dane przekazane kiedyś w rozmowie nie są pamięcią produkcyjną; jeśli któryś klucz był użyty poza bezpiecznym panelem, należy go obrócić.

## 7. Otwarty backlog

- Migracje konta i płatności są zastosowane oraz zweryfikowane w docelowym Supabase. Pozostaje zewnętrzna konfiguracja zweryfikowanego nadawcy i sekretu Resend oraz sprawdzenie dostarczenia kodów. Brak poczty nie blokuje rejestracji; adres pozostaje niepotwierdzony, a UI pokazuje niedostępność wysyłki.
- Przy kolejnych wdrożeniach powtarzać kontrolę własnych domen i rozszerzać scenariusze wraz ze zmianami produktu. IndexedDB, pełna kopia, odtworzenie, lokalny OCR oraz cykl konta mają implementację i wyniki lokalne oraz zdalne opisane w `IMPLEMENTATION_STATUS.md`.
- Usunąć otwarte LOW dotyczące ujawniania istnienia konta w rejestracji przez rzeczywiste potwierdzenie skrzynki lub ograniczenie dostępu. Ujednolicenie komunikatu błędu nie usuwa informacji ujawnianej przez wydanie sesji; nie wykazano odczytu dokumentów ani przejęcia konta w tym wyniku.
- Rozszerzać procedury dopiero po zebraniu właściwych źródeł i testach: informacja publiczna, skargi, petycje, konsument, umowy, podatki/ZUS.
- Rozszerzać obecny browser canary o nowe przepływy wraz z ich dodawaniem. Import/OCR/backup/restore/reload/relink są sprawdzane na syntetycznych plikach.
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
- `f3671c24` — niezmienna baza pełnego tekstowego skanu `src` z 6 października.
- `9c9ce03` — kod wydania z pełnym lokalnym przebiegiem, trzema poprawkami MEDIUM, izolacją stanu synchronizacji właściciela i poprawionym opisem prywatności.

## 9. Jak zaczynać następną sesję

Powiedz agentowi: „Przeczytaj `PROJECT.md`, `docs/PROJECT_MEMORY.md`, `AGENTS.md` i dokument odpowiadający zadaniu. Sprawdź stan repozytorium i nie kopiuj sekretów.” Następnie wskaż konkretny etap backlogu albo plik. Każdą nową decyzję, która zmienia prywatność, model danych, płatności lub zakres produktu, dopisz tutaj i — jeśli to decyzja architektoniczna — jako osobny ADR.

## 10. Domknięcie sejfu, OCR i konta — 6 października 2026

Dodano pełną szyfrowaną kopię z oryginałami, lokalną kopertę klucza i blokadę sejfu, jawne rozwiązywanie konfliktów synchronizacji z punktem powrotu, weryfikację ponownie wskazanego oryginału, Tesseract pol/eng i PDF.js z zasobami same-origin, rzeczywisty podział PDF na pochodne, potwierdzanie adresu, reset hasła i odwołanie sesji. Kontekst dokumentu oraz wskazówki pisma pozostają opcjonalne i prywatne. Wydruk ma osobny dokument zawierający wyłącznie wybrany projekt. Zmiana konta blokuje poprzedni sejf przed uwierzytelnieniem; błąd klucza lub manifestu nie odsłania wcześniejszych danych.

Decyzje: `0004-account-recovery.md`, `0005-portable-backup-and-local-unlock.md`, `0011-local-ocr-pdf-provenance.md`. Numery starszych ADR pozostawiono bez zmiany nazw i odnośników.

Dalsze poprawki z 6 października: IDB oddzielone dla pary właściciel/sejf, jednorazowa migracja bez usuwania starszych szyfrogramów, epoch odrzucający spóźnione operacje po zmianie konta, walidacja przynależności wersji dokumentu w kopii oraz zapis manifestu kończony przed powrotem z częściowego importu. Hybrydowe PDF odczytują również skan pod cyfrowym nagłówkiem. Formularze mają przewijanie na telefonach. Konfiguracja deploymentu wyklucza lokalne sprawy, sekrety i artefakty testowe. ADR 0012 opisuje namespace oryginałów. ADR 0013 jest zintegrowany: wszystkie operacje punktu powrotu i checkpointu synchronizacji są rozdzielone według właściciela i sejfu, także przy odtworzeniu kopii z tym samym `vaultId` na innym koncie.

Odrzucane są opóźnione odpowiedzi weryfikacji i resetu po zmianie konta lub zamknięciu panelu. Blokada, wylogowanie i bezpośrednia zmiana właściciela usuwają prywatny stan wyszukiwania i formularzy. Poprawiono opis hasła konta oraz lokalnej koperty, rzeczywistych ustawień CSRF i czytelnych danych zamówienia na serwerze. Gemini, redakcja eksportu i PURDE pozostają prototypami; PURDE nie potwierdza skutecznego doręczenia.

## 11. Zweryfikowane wydanie i skan bezpieczeństwa

Walidacja lokalna kodu `9c9ce03`: lint, typecheck, build i 145 testów w 30 plikach przechodzą. Zweryfikowano 14 lokalnych scenariuszy Chromium: 13 w pierwszym przebiegu oraz OCR w ponownym przebiegu po dostosowaniu selektora do remount. Nie było błędu źródłowego aplikacji; bajty odzyskanych PNG i PDF zostały porównane. Lokalne odpowiedzi konta, synchronizacji i poczty są mockowane; kryptografia, IndexedDB i OCR są rzeczywiste. Zdalny przebieg 15/15 obejmuje rzeczywiste konta Supabase, sesje i synchronizację. Realna poczta i P24 nie są skonfigurowane ani sprawdzone.

Najnowszy natywny skan `7b3d2dd4-8bbb-46d5-afac-7e1a3d9b51c2` został zakończony i zapieczętowany dla niezmiennego `f3671c24`. Cały tekstowy zakres `src` obejmował 78 plików przeczytanych w całości, z wyłączeniem binarnej ikony; wykonano niezależny baseline i osobną kontrolę granic właściciela. Raport zachowuje trzy MEDIUM i jedno LOW dla tej bazy. Trzy MEDIUM poprawiono w `9c9ce03`, sprawdzono niezależnie w źródłach i w pięciu regresjach browser. LOW rejestracji pozostaje otwarte. Weryfikacja poprawek nie jest ponownym pełnym skanem wydania, a skan nie jest certyfikacją bezpieczeństwa lub prawa. Starszy częściowy skan jest wynikiem historycznym.

Dowody: [zapieczętowany raport](/Users/macbookpro/.codex/state/plugins/codex-security/scans/URZAD/f3671c24aac0bc30cfe74b0040a21cc13d110ed0_20261006T213024Z_xrt9n_6p/report.md) oraz [osobna weryfikacja poprawek](/Users/macbookpro/.codex/state/plugins/codex-security/scans/URZAD/artifacts-3d5e7d22b72f7e1eaeea1fb5c4c3f084dae8f0b3a8654bb40711d666aa6b3d3f/artifacts/09_release/9c9ce03-postfix-verification.json).

Natywny pomiar pięciu wątków: 17 918 786 tokenów łącznie, 17 819 310 wejściowych, w tym 16 912 896 z cache. Wielokrotne przekazywanie kontekstu wchodzi do licznika; nie jest to liczba unikalnych tokenów kodu ani koszt pieniężny. Uprawnienia do funkcji Daybreak są nadawane przez usługę i nie da się ich uzyskać zmianą kodu projektu.
