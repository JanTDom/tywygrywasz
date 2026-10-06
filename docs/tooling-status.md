# Stan narzędzi i środowiska deweloperskiego

Stan na dzień: 6 października 2026 r.

| Narzędzie | Wersja | Zakres | Status | Wykonane sprawdzenie | Wymagane dane dostępowe | Użyty zamiennik / uwaga |
|---|---|---|---|---|---|---|
| Node.js | v24.14.0 | Środowisko wykonawcze JavaScript / TypeScript | Dostępne | `node -v` | Brak | Brak |
| npm | 11.17.0 | Menedżer pakietów | Dostępne | `npm -v` | Brak | Brak |
| Git | 2.50.1 | Kontrola wersji | Zainicjowane | `git --version`, `git status` | Brak | Brak |
| Context7 MCP | nd. | Dokumentacja bibliotek | Wyłączone (zgodnie ze zleceniem) | Zbadano `mcp_config.example.json` | Opcjonalny token | Oficjalna dokumentacja i lokalne typy |
| Gemini API | nd. | Chmurowa analiza i generowanie | Wyłączone (zgodnie ze zleceniem) | Zweryfikowano brak klucza i wymóg pracy bez AI | Opcjonalny klucz API w chmurze | Tryb bez AI / jawny mock syntetyczny |
| MCP (ogólne) | nd. | Zewnętrzne integracje agenta | Wyłączone (zgodnie ze zleceniem) | Zgodność ze zleceniem użytkownika | Brak | Narzędzia wbudowane i lokalny CLI |
| Prawdziwe dokumenty | nd. | Dane wejściowe | Niedozwolone (zgodnie ze zleceniem) | Zgodność z zaleceniem izolacji danych poufnych | Brak | Zestaw syntetycznych dokumentów i zdarzeń testowych |
| Test runner | Vitest 5.0.3 | Testy jednostkowe i integracyjne | Dostępne | `npm test` — 29 plików / 129 testów | Brak | Konfiguracja zeruje odziedziczone dane usług produkcyjnych |
| ESLint | 10.12.0 | Kontrola kodu TypeScript | Dostępne | `npm run lint` — bez błędów i ostrzeżeń | Brak | Flat config + typescript-eslint 8.71.1 |
| Playwright | 1.63.0 | Przebiegi Chromium | Dostępne | `E2E_PRODUCTION=1 npm run test:e2e` — 9/9; 1 test zdalny pominięty | Brak | Własny profil i lokalny serwer port 3100 |
| Tesseract / core | 7.0.0 | OCR lokalny pol/eng | Działa w aplikacji | PNG i obrazowy PDF rozpoznane w Chromium przy produkcyjnym CSP | Brak | Worker, WASM i słowniki z tego samego pochodzenia |
| PDF.js / pdf-lib | 6.4.299 / 1.17.1 | Tekst, raster, geometria, podgląd i podział PDF | Działa w aplikacji | Realne PDF, integralność oryginału, pochodna z wybranych stron | Brak | Zasoby kopiowane przez predev/prebuild |
| Resend | transport HTTPS | Kody konta | Adapter zaimplementowany | Test transportu mock + lokalne testy RPC PostgreSQL | Zweryfikowany nadawca i serwerowy klucz | Realne dostarczenie e-maila pozostaje do sprawdzenia po konfiguracji |

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

Node 24.14.0, Chromium Playwright, Next 15.5.27, React 19.3.0. Lint, typecheck, 129 testów i build przechodzą. Dziewięć testów browser obejmuje realny lokalny OCR/backup/restore/relink, odtworzenie kopii A na koncie B bez zmiany IDB A, zapis po częściowo udanym imporcie, niedostępny szyfrogram, dwa opóźnienia konfliktu synchronizacji, dwa błędy zmiany konta, dialog mobilny oraz przechwycenie osobnego dokumentu wydruku. Odpowiedzi auth/sync w lokalnych scenariuszach są mockowane. Oddzielny test rzeczywistych kont jest jawnie uruchamiany na wybranym zdalnym środowisku. CI wykonuje etapy lokalne, w tym Chromium na produkcyjnym buildzie. Oficjalny plugin ESLint Next 15.5.27 jest aktywny, a build nie zgłasza już jego braku. Pełny `npm audit` oraz wariant `--omit=dev` pokazują zero podatności. Tailwind 4.3.3 używa warstwy zgodności tokenów v3; resolver pluginu Next jest zamieniony na tinyglobby 0.2.17. Nowy minimalny browser: Safari 16.4+, Chrome 111+, Firefox 128+.

Wynik i granice skanu Codex Security oraz konfigurację wymaganą przed produkcją dokumentuje `IMPLEMENTATION_STATUS.md`. Dostęp konta do chronionych funkcji Daybreak jest uprawnieniem usługi, nie ustawieniem możliwym do nadania przez kod projektu.

Codex Security: standardowy skan `a7f9b04e-d31f-4888-9af3-b2bb3caece5c` zakończony, raport dostępny. Zakres częściowy z wyłączeniami i uwagą o zmianie worktree podczas napraw; 127 zweryfikowanych plików. Szczegóły pomiaru tokenów i granic niezależności: `IMPLEMENTATION_STATUS.md`.
