# Kryteria akceptacyjne

Sprawdzaj zachowanie, nie samą obecność funkcji. Używaj syntetycznych
dokumentów ze znanymi wynikami. Przy funkcjach prawnych zapisz właściwą
wersję przepisu i ocenę osoby z kompetencją prawną.

| Scenariusz | Wymagany rezultat |
|---|---|
| Import, OCR, wyszukiwanie i projekt pisma w trybie lokalnym | Monitorowany ruch sieciowy nie ujawnia bajtów, OCR, nazw, pól, embeddings ani zapytań prywatnego indeksu |
| Kontekst dokumentu i wskazówki pisma | Opcjonalne notatki są oznaczone jako niepotwierdzone, zachowane w lokalnym manifeście i pominięte w eksporcie pisma |
| Synchronizacja struktury | Serwer otrzymuje szyfrogram; treści sprawy nie da się odczytać z bazy, logów i API bez klucza klienta |
| Awaria / czyszczenie profilu | Wcześniej przygotowany backup odtwarza dokumenty, relacje, wersje i klucze na czystym profilu; hashe zgadzają się |
| Reset hasła konta | Nie odblokowuje sejfu; interfejs pokazuje niezależne odzyskanie klucza |
| Brak lokalnego pliku / cofnięte uprawnienie | Aplikacja pokazuje niedostępny dokument i pozwala wskazać go ponownie; nie udaje odczytu |
| Zmiana urządzenia | Synchronizacja samej struktury nie udaje przeniesienia dokumentów; restore jest wyraźną operacją |
| Duplikat i nowy skan | Dokładny duplikat wykryty; podobny skan nie jest automatycznie skasowany |
| Niska jakość OCR | Pola krytyczne pozostają propozycją; użytkownik widzi oryginał, stronę i możliwość korekty |
| Brak daty doręczenia | Termin ma stan unknown, bez zmyślonego odliczania; jest instrukcja zdobycia daty i pilnej weryfikacji gdy potrzebna |
| Błędne / niepełne pouczenie | Analiza wykrywa problem lub niepewność zamiast bezwarunkowo kopiować pouczenie |
| Zmiana prawa | Analiza wybiera właściwą wersję i sprawdza przepisy przejściowe; stare pisma zachowują snapshot |
| Zmyślony cytat / nieistniejący wyrok | Walidator odrzuca cytowanie; brak źródła nie zamienia się w pewną rekomendację |
| Dwa rozbieżne orzeczenia | Dossier pokazuje rozbieżność, relewantność i warunkowe wnioski |
| Gemini bez klucza / timeout / limit | Sejf i szablony działają; brak ukrytej zmiany dostawcy lub wysyłki większego zakresu |
| Wybrane fragmenty do Gemini | Wyświetlany podgląd odpowiada faktycznemu payloadowi; nowe fragmenty lub odbiorca wymagają nowej zgody |
| Wycofanie zgody | Brak kolejnych wysyłek; rejestr pokazuje operację już wykonaną i realny stan usunięcia kopii |
| Prompt injection w PDF lub źródle | Treść nie uruchamia narzędzia, nie zmienia reguł i nie wysyła danych |
| Eksport pisma | Polskie znaki, poprawne strony, załączniki i źródła; projekt ma właściwy status i nie jest oznaczony jako wysłany |
| Ręczne zgłoszenie wysłania | Odróżnione od dowodu złożenia i doręczenia; błędne/niedopasowane potwierdzenie nie potwierdza sprawy |
| Publikacja społeczna | Powstaje osobna zredagowana kopia; redakcja usuwa tekst, metadane i ukryte warstwy, nie tylko rysuje prostokąt |
| Konto A próbuje odczytać dane B | Autoryzacja serwerowa odrzuca; zgadywanie ID i dostępu do synchronizacji nie omija izolacji |
| Równoległa edycja offline | Konflikt jest zachowany i widoczny; dowód lub data nie są po cichu nadpisane |
| Klawiatura / telefon / czytnik | Przejście intake → pismo → backup wykonalne; właściwy focus, etykiety i komunikaty błędów |
| Zamknięta przeglądarka | Brak obietnicy ciągłego monitorowania terminów w MVP; użytkownik zna ograniczenie przypomnień |

Uruchom lint/typecheck/build i istotne testy jednostkowe/integracyjne/E2E
w skali odpowiadającej zmianie. Testy terminów wymagają przypadków brzegowych
i oczekiwanych wyników ustalonych niezależnie od implementacji: weekend,
święto, zmiana roku, miesiące, doręczenie elektroniczne, brak i korekta daty.
Nie kopiuj logiki kodu do testu jako oczekiwanego wyniku.

Raport końcowy zawiera środowisko, wersje, sprawdzone scenariusze, wyniki,
pozostałe ograniczenia i wykryte ujawnienia danych. Przed publicznym startem
z danymi realnych osób potrzebne są przegląd bezpieczeństwa, ocena przyjętych
reguł prawnych i właściwe dokumenty ochrony danych. Nie zastępuj tego
pozytywną opinią drugiego modelu.

## Wyniki wykonania — 2026-10-06

Środowisko: Node 24.14.0, Next 15.5.27, Chromium Playwright 1.63.0, dane syntetyczne. `npm run lint`, `npm run typecheck`, `npm test` (29 plików, 129 testów), `npm run build` i `E2E_PRODUCTION=1 npm run test:e2e` (9/9; oddzielny test zdalny pominięty) przechodzą. `git diff --check` jest czysty.

| Wykonany scenariusz | Wynik i granica zapewnienia |
|---|---|
| PNG i obrazowy PDF → OCR pol/eng → podgląd | Rzeczywisty Tesseract, PDF.js i Chromium; własne workery, produkcyjne CSP, poprawne bajty pobranego oryginału |
| Pełny backup → czysty profil → reload → odblokowanie | Dwa szyfrowane oryginały odtworzone i porównane bajt po bajcie; prywatny kontekst zachowany |
| Utrata rekordów IDB → ponowne wskazanie | Zmienione bajty odrzucone, właściwy plik przywrócony i porównany |
| Canary całego lokalnego przebiegu | Oba konteksty browser monitorowane podczas importu/OCR/eksportu/odtwarzania/reload/relink; zero wykrytych wycieków canary, obcych odbiorców i żądań mutujących |
| Błąd klucza / uszkodzony manifest po zmianie konta | Wcześniejszy sejf ukryty, istniejące zapisy zachowane; odpowiedź logowania jest mockowana |
| Odtworzenie kopii A na koncie B | Rzeczywiste przestrzenie IDB: bajty A pozostają niezmienione, dokument B jest czytelny po odtworzeniu; odpowiedzi kont są mockowane |
| Częściowo udany import / niedostępny szyfrogram | Pierwszy plik zachowany po błędzie drugiego i przeładowaniu strony; uszkodzony szyfrogram kończy loading podglądu |
| Spóźniony konflikt po zmianie właściciela | Dwa warianty opóźnienia auth/sync: dane i konflikt wcześniejszego właściciela nie są dostępne po zmianie konta; odpowiedzi serwera mockowane |
| Telefon i brak usługi kodów | Dialog konta przewija się przy 390×650; brak mailera jest jawny i nie udaje wysyłki kodu |
| Wydruk wybranego pisma | Rzeczywisty UI i osobny iframe zawierają wyłącznie formatowany projekt; prywatne wskazówki nie występują. Wywołanie dialogu drukarki przechwycone przez test |
| Izolacja kont, CAS, CSRF, recovery | Rzeczywiste handlery HTTP i pamięciowy backend testowy; lokalny test SQL RPC w PGlite sprawdza role, replay, wygaśnięcie i sesje. Migracje zastosowano także w docelowym Supabase; kontrola katalogu potwierdziła RLS, role i RPC, bez odczytu prywatnych wierszy |
| Niepełna / uszkodzona kopia, quota, rollback | Testy domeny i pamięciowego backendu; browser E2E potwierdza zwykłą transakcję IDB, nie symuluje awarii dysku ani wszystkich błędów localStorage |
| Podział PDF i korekta OCR | Realny PDF-lib tworzy wybrane strony z osobnym pochodzeniem, oryginał zachowany. Korekta nie dziedziczy geometrii zmienionego tekstu |

Nie przeprowadzono realnej płatności, podpisu, złożenia pisma, doręczenia e-maila ani publikacji danych. Katalog prawa, redakcja próbki i adapter Gemini nie są dowodem aktualności prawa, pełnej anonimizacji PDF lub działającej usługi AI. Pełne kryteria powyżej pozostają wymaganiami do spełnienia przy uruchamianiu kolejnych funkcji. Bieżący zakres i przygotowanie produkcji opisuje `IMPLEMENTATION_STATUS.md`.
