# TyWygrywasz.pl — pakiet projektu

Nazwa aplikacji: **TyWygrywasz.pl**. Rynek i jurysdykcja robocza: Polska. Pakiet jest instrukcją budowy, a nie gotową aplikacją lub zweryfikowaną bazą prawa. Nie instaluje narzędzi, nie aktywuje usług i nie zawiera kluczy API.

## Jak użyć

1. Rozpakuj pakiet. Otwórz katalog `antigravity-obywatel` jako projekt w Google Antigravity. Możesz też przenieść jego zawartość do nowego repozytorium. Zachowaj ukryty katalog `.agents`.
2. W istniejącym projekcie najpierw połącz reguły z obecnym `AGENTS.md`; nie nadpisuj konfiguracji i kodu.
3. Sprawdź, czy Antigravity widzi `AGENTS.md` i osiem skilli w `.agents/skills`. Bieżąca dokumentacja Google opisuje te lokalizacje: [reguły](https://www.antigravity.google/docs/rules), [skille](https://www.antigravity.google/docs/skills). Sprawdź zgodność z zainstalowaną wersją.
4. Wklej poniższy prompt do rozmowy w tym projekcie. Narzędzia i MCP przygotuje skill `setup-project-tools`, zgodnie z dostępnymi uprawnieniami. Plik `mcp_config.example.json` jest przykładem, a nie aktywną konfiguracją.
5. Zaczynaj od danych syntetycznych. Dokumenty prawdziwych osób nie są potrzebne do budowy ani testowania aplikacji.

## Dwa poziomy prywatności

Rekomendowany MVP to **tryb lokalny bez synchronizacji sprawy**: serwer
ma publiczny korpus prawa, wersje aplikacji i reguły, a prywatna struktura
sprawy zostaje na urządzeniu. Jeśli konto ma pokazywać strukturę na wielu
urządzeniach, dodaj dopiero później **opcjonalną synchronizację E2EE**.
Serwer dostaje wtedy zaszyfrowane rekordy bez klucza, lecz nadal widzi
konto, IP, czas połączenia, rozmiar i częstotliwość zmian. Nie przedstawiaj
tego jako całkowitej niewidoczności. Oryginały i OCR nadal nie opuszczają
urządzenia bez osobnej zgody.

## Prompt startowy — skopiuj do Antigravity

```text
Zbuduj aplikację webową „TyWygrywasz.pl” według AGENTS.md, docs/ i skilli
w .agents/skills. Pomagamy zwykłym ludziom świadomie prowadzić własne
sprawy z urzędami i działać w interesie społecznym w Polsce.

Najważniejsze wymagania:
1. Lokalny, uporządkowany sejf dokumentów. Oryginały, OCR, prywatny
   indeks wyszukiwania, szkice i klucze pozostają na urządzeniu użytkownika.
   Każdy dokument ma trwały identyfikator, wersję, pochodzenie, hash,
   powiązanie ze sprawą i stronami źródłowymi. Nigdy nie nadpisuj oryginału.
2. Serwer dostarcza publiczną wiedzę prawną i reguły prowadzenia spraw.
   Synchronizuje prywatną strukturę spraw wyłącznie w postaci szyfrowanej
   po stronie klienta. Nie przechowuje czytelnych nazw dokumentów, OCR,
   opisów spraw, prywatnych hashy ani kluczy odszyfrowujących.
3. Dogłębna analiza prawna: aktualne i historyczne wersje przepisów,
   przepisy szczególne i przejściowe, właściwość organu, orzecznictwo,
   argumenty przeciwne oraz jawne braki wiedzy. Każda istotna teza ma
   sprawdzone źródło i datę właściwego stanu prawnego.
4. Gemini API jest opcjonalne. Zaimplementuj adapter, tryb bez AI i mock.
   Chmurowa analiza wymaga podglądu dokładnego zakresu wysyłki i zgody
   na konkretną operację. Nigdy nie nazywaj jej analizą wyłącznie lokalną.
5. Prosty polski język, działanie na telefonie, obsługa klawiaturą,
   dostępność, możliwość wydruku oraz odtworzenia sejfu z kopii zapasowej.
6. Terminy wylicza sprawdzalny moduł reguł. Nie zgaduj doręczenia,
   procedury ani właściwości. Brak danych blokuje pewną rekomendację,
   ale nie blokuje uporządkowania dokumentów i zebrania brakujących faktów.
7. Użytkownik TyWygrywasz zatwierdza pisma, podpisuje i składa je w odpowiednim kanale.
   Publikacja społeczna jest odrębną czynnością z anonimizacją i zgodą.

Najpierw przeczytaj pakiet i sprawdź dostępne narzędzia oraz wersje.
Użyj setup-project-tools. Zaproponuj i zapisz krótki plan implementacji,
model danych, przepływy prywatności oraz decyzje architektoniczne.
Następnie realizuj plan do działającego lokalnie MVP; nie kończ na makiecie.
Jeżeli decyzja może być odwrócona, wybierz rozsądny wariant i zapisz założenie.
Brak klucza Gemini nie może zatrzymać sejfu, osi czasu, źródeł i szablonów.

Pierwszy kompletny przebieg: utworzenie sprawy → lokalny import dokumentu
→ weryfikacja OCR i dat → dossier prawne ze źródłami → plan działań
→ edytowalny projekt pisma → lokalny eksport → dodanie potwierdzenia
złożenia → backup i odtworzenie na nowym profilu przeglądarki.

Kieruj się docs/ACCEPTANCE.md. Sprawdź funkcjonalność, dostępność,
poprawność cytowań i ruch sieciowy pod kątem wycieku dokumentów.
Rozróżnij wyniki sprawdzone od niesprawdzonych. Gdy realne usługi są
niedostępne, użyj jawnego mocka; nie udawaj realnej integracji.
Na końcu podaj sposób uruchomienia, wykonane testy, działające funkcje,
ograniczenia oraz to, co wymaga danych dostępowych lub oceny prawnika.
Nie publikuj aplikacji, nie uruchamiaj płatnych usług i nie wysyłaj pism
bez odrębnego upoważnienia do danej czynności.
```

## Zawartość

| Plik / skill | Cel |
|---|---|
| `AGENTS.md` | Stałe zasady projektu i wybór skilli |
| `docs/PRODUCT.md` | Użytkownicy, zakres MVP i etapy rozwoju |
| `docs/PRIVACY.md` | Dokumenty lokalnie, szyfrowana struktura, backup |
| `docs/LEGAL_KNOWLEDGE.md` | Dogłębna i weryfikowalna wiedza prawna |
| `docs/DATA_MODEL.md` | Dokumenty, sprawy, zdarzenia i źródła |
| `docs/TOOLS.md` | Narzędzia agenta oraz usługi aplikacji |
| `docs/ACCEPTANCE.md` | Kryteria gotowości i testy istotnych ryzyk |
| `docs/SOURCES.md` | Oficjalne źródła i dokumentacja |
| `QUICKSTART.md` | Krótkie kroki uruchomienia pakietu |
| `setup-project-tools` | Rozpoznanie środowiska i przygotowanie narzędzi |
| `local-document-vault` | Import, OCR, porządek, wersje i wyszukiwanie |
| `polish-legal-research` | Badanie przepisów, orzeczeń i wariantów działania |
| `procedural-deadlines` | Weryfikacja i deterministyczne liczenie terminów |
| `draft-citizen-letter` | Pisanie pism na podstawie potwierdzonych faktów |
| `build-citizen-webapp` | Implementacja aplikacji i architektury prywatności |
| `integrate-gemini` | Opcjonalne AI z kontrolą zakresu danych |
| `verify-citizen-flow` | Sprawdzenie całego przebiegu i granic prywatności |

## Ważna decyzja produktowa

Dokumenty lokalnie to rekomendowany wariant domyślny. Sama lokalizacja
pliku nie gwarantuje prywatności: treść może wyciec przez OCR w chmurze,
zapytanie do modelu, logi, analitykę lub złośliwy kod w przeglądarce.
Dlatego pakiet wymaga kontroli całego przepływu danych i testów sieciowych.
Gemini w chmurze widzi wysłaną treść; szyfrowanie sejfu tego nie zmienia.

Przygotowano 4 października 2026 r. Źródła i wymagania usług sprawdzaj
ponownie podczas implementacji. Pakiet nie przesądza technologii wdrożenia.
