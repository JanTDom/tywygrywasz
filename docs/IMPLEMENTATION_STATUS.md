# Domknięcie ograniczeń lokalnego sejfu i konta

Stan: 6 października 2026. Zmiany zaimplementowane w katalogu roboczym; nie opublikowano ich nowym wdrożeniem. Szczegółowe kryteria i wyniki: [ACCEPTANCE.md](ACCEPTANCE.md).

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
- Lint bez błędów i ostrzeżeń, typecheck, 29 plików / 129 testów, build i 9 scenariuszy Chromium na produkcyjnym buildzie — przechodzą. Dziesiąty test wymaga jawnie wskazanego zdalnego środowiska i kont syntetycznych, dlatego lokalnie jest pomijany. CI zawiera lint i browser E2E. Vitest nie dziedziczy kluczy usług produkcyjnych.

## Implementacja, test i mock

OCR, PDF, Web Crypto, IDB, pełne odtworzenie oraz relink działają w realnej przeglądarce. Testy domeny i HTTP auth/sync używają izolowanego backendu pamięciowego. Test SQL recovery RPC uruchomiono w lokalnym silniku PostgreSQL PGlite na syntetycznych kontach, bez zmian w bazie docelowej. Testy dwóch błędów przełączenia konta mockują odpowiedź logowania; test wydruku przechwytuje wywołanie dialogu drukarki. Resend ma rzeczywisty adapter HTTPS i testowaną strukturę wysyłki, ale transport sieciowy jest mockowany w testach; nie wysłano realnego kodu.

Gemini pozostaje adapterem bez produkcyjnego transportu. Podgląd redakcji używa syntetycznej próbki; brak pełnej redakcji warstw PDF i integracji publikacji. Rejestr wysłania jest ręczny, a tekstowy walidator przykładowego UPO nie sprawdza podpisu zaufanego wystawcy. Wbudowany katalog źródeł i szablony nie zastępują aktualnego researchu oraz oceny prawnej.

## Codex Security

Zakończono rzeczywisty standardowy skan w zainstalowanej wtyczce 0.1.31: `a7f9b04e-d31f-4888-9af3-b2bb3caece5c`. Natywny raport, findings, manifest i coverage zostały zweryfikowane, zapieczętowane i zindeksowane. Zakres jest częściowy: sprawdzono 127 plików kodu/testów/konfiguracji, a wyłączenia i brak świeżego niezależnego baseline są jawne. Treść katalogu roboczego zmieniała się podczas poprawek; raport zachowuje pierwotny snapshot i zawiera tę uwagę. Nie jest certyfikacją niezmiennego końcowego commita. Problemy dotyczące zmiany konta, mostu plikowego, limitu strumienia i wydruku zostały poprawione i sprawdzone; nie pozostawiono ich jako niezweryfikowanych zgłoszeń. Brak uprawnienia konta do Daybreak ogranicza chronione funkcje usługi. Dostęp może nadać dostawca; kod aplikacji tego nie zmienia.

## Wymagane przed produkcją

1. Migracje `payment_orders` i `account_recovery` zastosowano 6 października w docelowym Supabase `tywygrywasz` (`aueatowylwgcgpjdpqdz`). Katalog PostgreSQL potwierdza RLS na sześciu tabelach, brak SELECT dla anon/authenticated, CRUD dla service_role oraz pięć RPC invoker z pustym search_path i EXECUTE wyłącznie dla service_role. Advisor nie wskazał WARN/ERROR; sześć INFO „RLS enabled no policy” jest zamierzone dla tabel obsługiwanych wyłącznie przez serwer. [Wyjaśnienie advisor](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
2. Skonfigurować serwerowe `AUTH_EMAIL_TRANSPORT`, `RESEND_API_KEY`, `AUTH_EMAIL_FROM`, `APP_URL` (HTTPS) i zweryfikowaną domenę nadawcy; sprawdzić dostarczenie kodu oraz reset na kontach testowych. Wartości sekretów wpisuje się w panelu środowiska, nie w dokumentacji lub czacie.
3. Wdrożyć ten katalog roboczy i powtórzyć kontrolę na docelowym pochodzeniu. Reverse proxy musi nadpisywać nagłówek adresu klienta; konfiguracja dowolnego własnego proxy nie jest dowiedziona testem Vercel.

`npm audit` i `npm audit --omit=dev`: zero zgłoszeń. Tailwind zaktualizowano do 4.3.3 z warstwą zgodności wyglądu; oficjalny plugin ESLint Next 15.5.27 używa utrzymywanego resolvera tinyglobby 0.2.17. Nie ukrywano alertów. Tailwind 4 wymaga Safari 16.4+, Chrome 111+ lub Firefox 128+.

Pełna kopia nie gwarantuje odzyskania danych bez jej hasła. Zamknięcie sejfu nie gwarantuje usunięcia wszystkich kopii z pamięci procesu JavaScript. Przechowywanie danych lokalnie i szyfrowanie nie dają ochrony przed przejętą odblokowaną przeglądarką lub złośliwą aktualizacją aplikacji.

Raport lokalny: `/Users/macbookpro/.codex/state/plugins/codex-security/scans/URZAD/4165c4ca56b32c35503daaedae5c2675376c2d5a_20261006T174200Z_qb_57qac/report.md`. Workbench po finalizacji udostępnił pomiar dla jednego wątku: 16 379 077 tokenów łącznie, 15 895 808 wejściowych z cache, 67 946 wyjściowych (w tym 24 093 reasoning). Jest to licznik wejść/wyjść wątku z powtórzonym kontekstem, nie liczba unikalnych tokenów kodu ani pełny pomiar zespołu. Adnotacja o niedostępnym pomiarze w materiale roboczym została zapisana przed finalizacją.

## Końcowe poprawki przed wydaniem

Przestrzeń IDB uwzględnia właściciela oraz vaultId. Migracja kopiuje starsze szyfrogramy bez usuwania źródła. Restore na B nie może zastąpić magazynu A; celowo pusta kopia nie wznawia migracji. Epoch właściciela odrzuca spóźnione sync/restore/unlock po blokadzie lub zmianie konta. Backup waliduje właściciela wersji aktywnej i nadrzędnej. Częściowe powodzenie importu/podziału odświeża manifest również po błędzie kolejnego pliku. Niedostępny szyfrogram kończy loading podglądu. Hybrydowy PDF z rastrem przechodzi OCR mimo cyfrowego nagłówka. Dialogi konta/importu mają ograniczoną wysokość i przewijanie. `.vercelignore` usuwa z uploadu zawartość lokalnego katalogu spraw, konfigurację agenta, sekrety środowiska i artefakty testowe; OCR/PDF jest odtwarzany przez prebuild z lockfile.

Brak mailera nie blokuje samej rejestracji ani lokalnego sejfu. Nowe konto pozostaje niepotwierdzone. Publiczny endpoint capabilities zwraca tylko dostępność kodów; UI nie oferuje wysyłki przy braku konfiguracji, a API resetu/weryfikacji odpowiada 503 przed sprawdzeniem skrzynki. Już otrzymany ważny kod można nadal zużyć.
