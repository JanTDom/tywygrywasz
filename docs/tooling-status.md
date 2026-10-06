# Stan narzędzi i środowiska deweloperskiego

Stan wydania: 6 października 2026 r.; końcowy przegląd publikacji: 7 października 2026 r.

| Narzędzie | Wersja | Zakres | Status | Wykonane sprawdzenie | Wymagane dane dostępowe | Użyty zamiennik / uwaga |
|---|---|---|---|---|---|---|
| Node.js | v24.14.0 | Środowisko wykonawcze JavaScript / TypeScript | Dostępne | `node -v` | Brak | Brak |
| npm | 11.17.0 | Menedżer pakietów | Dostępne | `npm -v` | Brak | Brak |
| Git | 2.50.1 | Kontrola wersji | Zainicjowane | `git --version`, `git status` | Brak | Brak |
| Context7 MCP | nd. | Dokumentacja bibliotek | Wyłączone (zgodnie ze zleceniem) | Zbadano `mcp_config.example.json` | Opcjonalny token | Oficjalna dokumentacja i lokalne typy |
| Gemini API | nd. | Chmurowa analiza i generowanie | Wyłączone (zgodnie ze zleceniem) | Zweryfikowano brak klucza i wymóg pracy bez AI | Opcjonalny klucz API w chmurze | Tryb bez AI / jawny mock syntetyczny |
| MCP (ogólne) | nd. | Zewnętrzne integracje agenta | Wyłączone (zgodnie ze zleceniem) | Zgodność ze zleceniem użytkownika | Brak | Narzędzia wbudowane i lokalny CLI |
| Prawdziwe dokumenty | nd. | Dane wejściowe | Niedozwolone (zgodnie ze zleceniem) | Zgodność z zaleceniem izolacji danych poufnych | Brak | Zestaw syntetycznych dokumentów i zdarzeń testowych |
| Test runner | Vitest 5.0.3 | Testy jednostkowe i integracyjne | Dostępne | `npm test` — 30 plików / 145 testów | Brak | Konfiguracja zeruje odziedziczone dane usług produkcyjnych |
| ESLint | 10.12.0 | Kontrola kodu TypeScript | Dostępne | `npm run lint` — bez błędów i ostrzeżeń | Brak | Flat config + typescript-eslint 8.71.1 |
| Playwright | 1.63.0 | Przebiegi Chromium | Dostępne | 14 lokalnych scenariuszy zweryfikowanych: 13 zbiorczo + 1 powtórzony OCR; zdalnie 15/15 w 59,8 s | Dla testu zdalnego: wskazane środowisko Supabase | Własny profil i lokalny serwer port 3100; zdalnie dane syntetyczne i rzeczywiste dwa konta |
| Tesseract / core | 7.0.0 | OCR lokalny pol/eng | Działa w aplikacji | PNG i obrazowy PDF rozpoznane w Chromium przy produkcyjnym CSP | Brak | Worker, WASM i słowniki z tego samego pochodzenia |
| PDF.js / pdf-lib | 6.4.299 / 1.17.1 | Tekst, raster, geometria, podgląd i podział PDF | Działa w aplikacji | Realne PDF, integralność oryginału, pochodna z wybranych stron | Brak | Zasoby kopiowane przez predev/prebuild |
| Resend | transport HTTPS | Kody konta | Adapter zaimplementowany; produkcyjna poczta nieskonfigurowana | Test transportu mock + lokalne testy RPC PostgreSQL | Zweryfikowany nadawca i serwerowy klucz | Realne dostarczenie e-maila pozostaje do sprawdzenia po konfiguracji; testy zdalne nie wysyłały poczty |
| Supabase | PostgreSQL / API | Konta, sesje i szyfrowane koperty | Migracje zastosowane | 6 tabel z RLS, uprawnienia serwerowe, 5 RPC `security invoker`; kontrola bez WARN/ERROR; rzeczywisty zdalny test dwóch właścicieli | Dane serwerowe w bezpiecznej konfiguracji | Kontrola katalogu i uprawnień nie oznacza odczytu prywatnych rekordów |
| Vercel | Node 24 | Wdrożenie wydania `9c9ce03` | `READY`, E2E 15/15 | `dpl_CS3SG1kj6xVv77kieymcPw2RtW4u` na zweryfikowanym adresie wydania | Istniejące uprawnienia projektu | Promocja na domenę produkcyjną niewykonana; wymaga wyraźnej zgody po odrzuceniu przez automatyczny przegląd |
| Przelewy24 | adapter HTTPS | Checkout i weryfikacja zamówienia | Produkcja nieskonfigurowana | Testy adaptera i odmowy niepełnego checkoutu; tabela zamówień zastosowana | Sekrety P24, URL-e i cena oferty | Nie wykonano rzeczywistej płatności ani testu sandbox |

## Instrukcje Codex

Skille domenowe projektu pozostają w `.agents/skills/` i obejmują: `setup-project-tools`,
`local-document-vault`, `polish-legal-research`, `procedural-deadlines`,
`draft-citizen-letter`, `build-citizen-webapp`, `integrate-gemini` oraz
`verify-citizen-flow`.

Do globalnego katalogu Codex doinstalowano z oficjalnego repozytorium OpenAI:

| Instrukcja | Zakres | Status / granica |
|---|---|---|
| `pdf` | Odczyt, inspekcja i weryfikacja plików PDF | Dostępna; używać na danych syntetycznych lub lokalnych |
| `playwright` | Powtarzalne testy przeglądarkowe | Dostępna; profil testowy i lokalny serwer |
| `playwright-interactive` | Interaktywny przegląd UI | Dostępna; bez portali produkcyjnych |
| `security-best-practices` | Przegląd zależności, granic danych i zabezpieczeń | Dostępna; nie zastępuje audytu bezpieczeństwa |
| `security-threat-model` | Modelowanie zagrożeń i scenariuszy nadużyć | Dostępna; bez danych prawdziwych osób |
| `gh-fix-ci` | Diagnoza i naprawa nieudanych przebiegów CI | Dostępna przez istniejący GitHub; bez publikowania zmian bez autoryzacji |
| `gh-address-comments` | Obsługa uwag do przeglądów kodu | Dostępna przez istniejący GitHub; tylko repozytorium projektu |

## Integracje zewnętrzne

GitHub i Vercel są już dostępne w środowisku. `Codex Security` jest zainstalowany
(wersja `0.1.31`) i widoczny w katalogu jako aktywna wtyczka. GitHub jest połączony
i może dostarczać repozytorium do skanu; opcjonalny Linear pozostaje niepołączony,
a zależność Atlassian nie ma jednoznacznego dodatku. Skany uruchamiaj na kodzie
projektu i danych syntetycznych, bez udostępniania sejfu dokumentów.

Nie dodano konektorów prywatnej poczty, kalendarza, dysków chmurowych, komunikatorów ani analityki treści. Poczta kodów konta to odrębny adapter serwerowy Resend, bez danych sejfu. Zdalny OCR jest zbędny: aplikacja używa lokalnego workera. Gemini nadal ma adapter demonstracyjny bez transportu produkcyjnego; nie uruchomiono wysyłki dokumentów. Ogólne MCP i Context7 w przykładowej konfiguracji projektu pozostają wyłączone; wtyczka Codex Security służy narzędziom agenta, nie produkcyjnej aplikacji.

## Weryfikacja bieżących zmian

Zdalny `main` pozostaje na `4165c4ca56b32c35503daaedae5c2675376c2d5a`: push HTTPS nie przeszedł z powodu brakującego zakresu tokena do zmian workflow. Nie wykonano alternatywnego przesunięcia gałęzi ani przełączenia domeny. Domena produkcyjna nadal używa `dpl_8EqbCCtpkhhTh2LtNgTaRy9WZWFH`. Dokładnie dwa syntetyczne konta z przebiegu zdalnego i tymczasowy plik cookie usunięto po testach.

Kod wydania: `9c9ce03cd460e51b18f88dd44706c8d36aadd9df`. Node 24.14.0, Chromium Playwright, Next 15.5.27, React 19.3.0. Lint, typecheck, 145 testów w 30 plikach i build przechodzą. Zweryfikowano 14 lokalnych scenariuszy browser: 13 w przebiegu zbiorczym i ponowny przebieg OCR po dopasowaniu selektora testowego do remount. Bajty pobranych PNG i PDF sprawdzono; początkowy błąd selektora nie był błędem aplikacji. Scenariusze obejmują lokalny OCR/backup/restore/relink, odtworzenie kopii A na koncie B bez zmiany IDB i punktów synchronizacji A, częściowy import, brakujący szyfrogram, konflikty synchronizacji, zmianę konta, spóźnioną weryfikację/reset, usuwanie prywatnego stanu po blokadzie/wylogowaniu/zmianie właściciela, dialog mobilny i osobny dokument wydruku. Odpowiedzi auth/sync oraz transport poczty w lokalnych scenariuszach są mockowane; kryptografia, przechowywanie i OCR są rzeczywiste.

Na [adresie wydania Vercel](https://tywygrywasz-6f7upj9fx-macieto.vercel.app) przeszło 15/15 scenariuszy w 59,8 s, w tym test rzeczywistych dwóch kont Supabase, sesji i synchronizacji. Po commicie aplikacji nie zmieniono źródeł ani harnessu. Deployment `dpl_CS3SG1kj6xVv77kieymcPw2RtW4u` jest `READY`. Domena produkcyjna nie została przełączona: automatyczny przegląd zgody odrzucił `vercel promote`, ponieważ wymaga wyraźnej autoryzacji tej zmiany. CI zawiera etapy lokalne, w tym Chromium na produkcyjnym buildzie; wykonanie konkretnego przebiegu CI należy potwierdzać osobno.

Oficjalny plugin ESLint Next 15.5.27 jest aktywny, a build nie zgłasza już jego braku. Pełny `npm audit` oraz wariant `--omit=dev` pokazują zero podatności. Tailwind 4.3.3 używa warstwy zgodności tokenów v3; resolver pluginu Next jest zamieniony na tinyglobby 0.2.17. Nowy minimalny browser: Safari 16.4+, Chrome 111+, Firefox 128+.

Wynik i granice skanu Codex Security oraz konfigurację wymaganą przed produkcją dokumentuje `IMPLEMENTATION_STATUS.md`. Dostęp konta do chronionych funkcji Daybreak jest uprawnieniem usługi, nie ustawieniem możliwym do nadania przez kod projektu.

Codex Security 0.1.31: najnowszy natywny skan `7b3d2dd4-8bbb-46d5-afac-7e1a3d9b51c2` został zakończony i zapieczętowany dla niezmiennego `f3671c24aac0bc30cfe74b0040a21cc13d110ed0`. Zakres: wszystkie 78 plików tekstowych `src`, przeczytane w całości, z wyłączeniem binarnej ikony; niezależny baseline i osobny przegląd granic właściciela. Trzy MEDIUM poprawiono w wydaniu `9c9ce03`, niezależnie sprawdzono w źródłach i pięciu regresjach browser. LOW ujawniania istnienia konta przez rejestrację pozostaje otwarte i wymaga potwierdzenia skrzynki lub ograniczenia dostępu, a nie samej zmiany komunikatu błędu. Weryfikacja poprawek nie jest nowym pełnym skanem. Starszy częściowy skan `a7f9b04e-d31f-4888-9af3-b2bb3caece5c` jest historyczny.

Dowody: [raport skanu](/Users/macbookpro/.codex/state/plugins/codex-security/scans/URZAD/f3671c24aac0bc30cfe74b0040a21cc13d110ed0_20261006T213024Z_xrt9n_6p/report.md), [weryfikacja poprawek](/Users/macbookpro/.codex/state/plugins/codex-security/scans/URZAD/artifacts-3d5e7d22b72f7e1eaeea1fb5c4c3f084dae8f0b3a8654bb40711d666aa6b3d3f/artifacts/09_release/9c9ce03-postfix-verification.json). Pomiar pięciu wątków skanu: 17 918 786 tokenów łącznie, 17 819 310 wejściowych, w tym 16 912 896 z cache; zawiera powtarzany kontekst i nie oznacza unikalnych tokenów kodu ani kosztu pieniężnego.
