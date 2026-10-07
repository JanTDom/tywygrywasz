# Domknięcie ograniczeń lokalnego sejfu i konta

Publikacja i kontrola produkcji: 7 października 2026. Użytkownik wyraźnie zatwierdził publikację kodu oraz przełączenie `tywygrywasz.pl` i `www.tywygrywasz.pl`. Kod aplikacji `9c9ce03` został opublikowany w `JanTDom/tywygrywasz` przez fast-forward `main`; dokumentację opublikowano osobno w `87799f5`, co potwierdził odczyt zdalnej gałęzi. Promocja sprawdzonego wdrożenia `dpl_CS3SG1kj6xVv77kieymcPw2RtW4u` zakończyła się sukcesem. Push dokumentacji uruchomił automatyczny deployment `dpl_FHgKr1goBVudWXoohffhE9gvLP4T`, który podczas kontroli obsługiwał obie domeny i miał `READY`, z niezmienioną implementacją `9c9ce03`. To historyczny stan aliasów z kontroli; ostateczne przypisanie po końcowej publikacji dokumentacji będzie zapisane w osobnym artefakcie weryfikacji. [GitHub Actions dla push 87799f5](https://github.com/JanTDom/tywygrywasz/actions/runs/37585037326) zakończyło się `SUCCESS`, niezależnie od statusu `Vercel: success`. Dwa syntetyczne konta z testu zdalnego i tymczasowy plik cookie usunięto po kontroli.

Stan kodu wydania: 6 października 2026. Kod wydania: `9c9ce03cd460e51b18f88dd44706c8d36aadd9df`, obejmujący wcześniejszy `f3671c24aac0bc30cfe74b0040a21cc13d110ed0` i poprawki po audycie. Wdrożenie Vercel `dpl_CS3SG1kj6xVv77kieymcPw2RtW4u` ma stan `READY` i używa Node 24: [zweryfikowana wersja wydania](https://tywygrywasz-6f7upj9fx-macieto.vercel.app). Wszystkie 15 zdalnych scenariuszy przeszło w 59,8 s, w tym test dwóch rzeczywistych kont Supabase, sesji i synchronizacji. Nie zmieniono kodu aplikacji ani harnessu po tym commicie. Osobna publiczna kontrola obu domen potwierdziła 14/14 odpowiedzi HTTP 200 bez przekierowań, HTML i zasoby Next; na `tywygrywasz.pl` dodatkowo przeszły trzy scenariusze browser w 18,9 s. Szczegółowe kryteria i granice tych wyników: [ACCEPTANCE.md](ACCEPTANCE.md).

## Zaimplementowane i sprawdzone

- Pełna szyfrowana kopia 2.0 z oryginalnymi bajtami i metadanymi; walidacja całości przed odtworzeniem, atomowy zapis IDB, ścieżka rollback. Stare kopie manifestu oznaczają brak oryginałów.
- Lokalna koperta klucza chroniona hasłem, migracja wcześniejszego czytelnego klucza, jawna blokada sejfu i eksport klucza odzyskiwania. Po resecie konta osobne odblokowanie sejfu starym hasłem lub TWY, bez ponownego przesyłania go do auth API.
- Lokalny OCR Tesseract pol/eng i PDF.js; rzeczywiste strony i geometria, podgląd oryginału, osobny hash OCR, realny podział PDF na pochodne. Workery i słowniki są zasobami same-origin.
- Brakujący lub zmieniony oryginał widoczny w UI; ponowne wskazanie wymaga zgodnych bajtów, rozmiaru i SHA-256. Może naprawić również uszkodzony szyfrogram przy niezależnie zgodnym oryginale.
- Konflikt synchronizacji wymaga wyboru użytkownika i zachowuje zaszyfrowany punkt powrotu; CAS odrzuca wyścig zapisu. Synchronizacja struktury nie przenosi oryginałów.
- Weryfikacja adresu, jednorazowy reset hasła, odwołanie sesji, rotacja CSRF i credential_version; trwałe atomowe RPC i limity częstotliwości, adapter Resend.
- Zmiana konta najpierw blokuje wcześniejszy sejf. Błędne hasło lub manifest nie udostępniają wcześniejszych danych ani nie nadpisują istniejącej kopii.
- Limit body liczony w trakcie odczytu strumienia. Most plikowy Node odmawia pracy w każdej produkcji. UI działa na szyfrowanych danych przeglądarki.
- Opcjonalny kontekst dokumentu i wskazówki pisma zachowane jako prywatne, niepotwierdzone notatki. Wydruk obejmuje tylko wybrany projekt; układ przycisków dokumentów uporządkowany.
- Lint bez błędów i ostrzeżeń, typecheck, 30 plików / 145 testów i build — przechodzą. Zweryfikowano 14 lokalnych scenariuszy Chromium na produkcyjnym buildzie: 13 w przebiegu zbiorczym i scenariusz OCR po poprawieniu selektora testowego. Porównano oryginalne bajty PNG i PDF. Początkowe niedopasowanie selektora po prawidłowym remount nie było błędem kodu aplikacji. Oddzielny test rzeczywistych kont wymaga wskazanego zdalnego środowiska, dlatego lokalnie jest pomijany. CI zawiera lint i browser E2E. Vitest nie dziedziczy kluczy usług produkcyjnych.

## Implementacja, test i mock

OCR, PDF, Web Crypto, IDB, pełne odtworzenie oraz relink działają w realnej przeglądarce. Testy domeny i HTTP auth/sync używają izolowanego backendu pamięciowego; lokalne browser scenariusze konta i opóźnionych odpowiedzi auth/sync/recovery używają mocków. Test wydruku przechwytuje wywołanie dialogu drukarki. Test SQL recovery RPC uruchomiono w lokalnym silniku PostgreSQL PGlite na syntetycznych kontach. Migracje zostały również zastosowane w docelowym Supabase; osobna kontrola katalogu potwierdziła uprawnienia i RPC bez odczytu prywatnych wierszy. Resend ma rzeczywisty adapter HTTPS i testowaną strukturę wysyłki, ale transport sieciowy jest mockowany w testach; nie wysłano realnego kodu.

Gemini pozostaje adapterem bez produkcyjnego transportu. Podgląd redakcji używa syntetycznej próbki; brak pełnej redakcji warstw PDF i integracji publikacji. Rejestr wysłania jest ręczny, a tekstowy walidator przykładowego UPO nie sprawdza podpisu zaufanego wystawcy. Wbudowany katalog źródeł i szablony nie zastępują aktualnego researchu oraz oceny prawnej.

## Codex Security

Najnowszy natywny skan wtyczki 0.1.31: `7b3d2dd4-8bbb-46d5-afac-7e1a3d9b51c2`. Zakończony, zweryfikowany i zapieczętowany raport dotyczy niezmiennego commita `f3671c24aac0bc30cfe74b0040a21cc13d110ed0`, wyłącznie zakresu `src`. Wszystkie 78 plików tekstowych zostały przeczytane w całości; wyłączono binarną ikonę `src/app/icon.png`. Wykonano niezależny baseline i osobną analizę granic właściciela. Dokumentacja, migracje, konfiguracja i zależności były kontekstem architektury, nie pełnym dodatkowym zakresem skanu. Starszy częściowy skan `a7f9b04e-d31f-4888-9af3-b2bb3caece5c` jest historyczny i nie zastępuje tego wyniku.

| Wynik skanu f3671c2 | Stan w kodzie 9c9ce03 |
|---|---|
| MEDIUM: spóźnione odświeżenie profilu po weryfikacji e-maila może zmienić właściciela aktywnego manifestu | Poprawione: sprawdzanie epoch i ID właściciela, anulowanie odmontowanego panelu, ochrona autosave. Niezależna kontrola źródeł i regresje przeglądarkowe potwierdzają poprawkę |
| MEDIUM: formularze i wyszukiwanie zachowują prywatny stan po blokadzie lub zmianie konta | Poprawione: natychmiastowe czyszczenie stanu oraz odmontowanie prywatnych widoków według właściciela, sejfu i generacji. Sprawdzone w przeglądarce |
| MEDIUM: punkt powrotu i baza synchronizacji współdzielą przestrzeń przy takim samym vaultId | Poprawione: klucze zawierają parę właściciel/sejf, stare wpisy pozostają nietknięte. Testy domeny i browser sprawdzają zachowanie danych innych właścicieli |
| LOW: rejestracja ujawnia istnienie konta dla podanego e-maila | Pozostaje otwarte. Inny tekst lub status błędu nie usuwa sygnału wynikającego z natychmiastowego utworzenia konta/sesji. Pełna naprawa wymaga potwierdzenia dostępu do skrzynki lub innego ograniczenia dostępu; produkcyjna poczta nie jest skonfigurowana |

Trzy poprawki MEDIUM w `9c9ce03` mają niezależną kontrolę kodu i pięć regresji browser. Nie zmieniono zapieczętowanego raportu, który nadal zachowuje cztery wyniki dla wcześniejszego commita. To weryfikacja poprawek, a nie ponowny pełny skan całego wydania. Brak uprawnienia konta do chronionych funkcji Daybreak pozostaje uprawnieniem usługi, którego nie nadaje kod aplikacji.

Raport: [report.md](/Users/macbookpro/.codex/state/plugins/codex-security/scans/URZAD/f3671c24aac0bc30cfe74b0040a21cc13d110ed0_20261006T213024Z_xrt9n_6p/report.md).
Osobna weryfikacja poprawek i wydania: [9c9ce03-postfix-verification.json](/Users/macbookpro/.codex/state/plugins/codex-security/scans/URZAD/artifacts-3d5e7d22b72f7e1eaeea1fb5c4c3f084dae8f0b3a8654bb40711d666aa6b3d3f/artifacts/09_release/9c9ce03-postfix-verification.json).

## Wymagane przed produkcją

1. Migracje `payment_orders` i `account_recovery` zastosowano 6 października w docelowym Supabase `tywygrywasz` (`aueatowylwgcgpjdpqdz`). Katalog PostgreSQL potwierdza RLS na sześciu tabelach, brak SELECT dla anon/authenticated, CRUD dla service_role oraz pięć RPC invoker z pustym search_path i EXECUTE wyłącznie dla service_role. Advisor nie wskazał WARN/ERROR; sześć INFO „RLS enabled no policy” jest zamierzone dla tabel obsługiwanych wyłącznie przez serwer. [Wyjaśnienie advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
2. Skonfigurować serwerowe `AUTH_EMAIL_TRANSPORT`, `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, `APP_URL` (HTTPS) i zweryfikowaną domenę nadawcy; sprawdzić dostarczenie kodu oraz reset na kontach testowych. Wartości sekretów wpisuje się w panelu środowiska, nie w dokumentacji lub czacie.
3. Przy zmianie reverse proxy zapewnić nadpisywanie nagłówka adresu klienta. Obie domeny zostały sprawdzone na Vercel; konfiguracja dowolnego własnego proxy nie jest dowiedziona tym testem.
4. Skonfigurować i sprawdzić Przelewy24 przed włączeniem sprzedaży. Baza zamówień jest gotowa, ale brak kluczy/oferty nadal blokuje checkout.
5. Zaprojektować pełne usunięcie LOW ujawniania istnienia konta przez rejestrację, z potwierdzeniem dostępu do skrzynki lub inną rzeczywistą granicą dostępu. Nie deklarować naprawy przez ujednolicenie komunikatu.

`npm audit` i `npm audit --omit=dev`: zero zgłoszeń. Tailwind zaktualizowano do 4.3.3 z warstwą zgodności wyglądu; oficjalny plugin ESLint Next 15.5.27 używa utrzymywanego resolvera tinyglobby 0.2.17. Nie ukrywano alertów. Tailwind 4 wymaga Safari 16.4+, Chrome 111+ lub Firefox 128+.

Pełna kopia nie gwarantuje odzyskania danych bez jej hasła. Zamknięcie sejfu nie gwarantuje usunięcia wszystkich kopii z pamięci procesu JavaScript. Przechowywanie danych lokalnie i szyfrowanie nie dają ochrony przed przejętą odblokowaną przeglądarką lub złośliwą aktualizacją aplikacji.

Natywny pomiar najnowszego skanu obejmuje pięć wątków: 17 918 786 tokenów łącznie, 17 819 310 wejściowych, w tym 16 912 896 z cache. Licznik uwzględnia wielokrotnie podawany kontekst. Nie jest liczbą unikalnych tokenów kodu ani pomiarem kosztu pieniężnego.

## Końcowe poprawki przed wydaniem

Przestrzeń IDB uwzględnia właściciela oraz vaultId. Migracja kopiuje starsze szyfrogramy bez usuwania źródła. Restore na B nie może zastąpić magazynu A; celowo pusta kopia nie wznawia migracji. Epoch właściciela odrzuca spóźnione sync/restore/unlock po blokadzie lub zmianie konta. Backup waliduje właściciela wersji aktywnej i nadrzędnej. Częściowe powodzenie importu/podziału odświeża manifest również po błędzie kolejnego pliku. Niedostępny szyfrogram kończy loading podglądu. Hybrydowy PDF z rastrem przechodzi OCR mimo cyfrowego nagłówka. Dialogi konta/importu mają ograniczoną wysokość i przewijanie. `.vercelignore` usuwa z uploadu zawartość lokalnego katalogu spraw, konfigurację agenta, sekrety środowiska i artefakty testowe; OCR/PDF jest odtwarzany przez prebuild z lockfile.

Brak mailera nie blokuje samej rejestracji ani lokalnego sejfu. Nowe konto pozostaje niepotwierdzone. Publiczny endpoint capabilities zwraca tylko dostępność kodów; UI nie oferuje wysyłki przy braku konfiguracji, a API resetu/weryfikacji odpowiada 503 przed sprawdzeniem skrzynki. Już otrzymany ważny kod można nadal zużyć.

ADR 0013 opisuje zintegrowane nazwy punktu powrotu i bazy synchronizacji dla pary właściciel/sejf. Końcowe poprawki usuwają także spóźnione callbacki odzyskiwania konta oraz stan prywatnych formularzy i wyszukiwania po blokadzie. Dokumentacja i publiczna polityka prywatności opisują początkowe użycie hasła konta do opakowania lokalnego klucza oraz pełny czytelny zakres danych zamówienia; nie obiecują dwóch odrębnych haseł ani przechowywania wyłącznie ID/statusu płatności.
