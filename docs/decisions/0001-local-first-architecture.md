# ADR 0001: Architektura lokalnego sejfu i przepływu spraw (Local-First MVP)

## Kontekst

Aplikacja „TyWygrywasz.pl” wspiera użytkowników w prowadzeniu spraw urzędowych i działań w interesie społecznym w Polsce.
Zgodnie z wymaganiami kardynalnymi zawartymi w `AGENTS.md` oraz `docs/PRIVACY.md`:
1. Dokumenty, OCR, ekstrakcje, prywatne indeksy, szkice i klucze muszą pozostać wyłącznie na urządzeniu użytkownika.
2. Domyślny tryb nie może przesyłać żadnych danych ani ich pochodnych do chmury.
3. Terminy procesowe muszą być wyliczane deterministycznie przez sprawdzalny moduł reguł (np. art. 57 KPA z uwzględnieniem dni wolnych i świąt państwowych w Polsce), a nie przez model językowy.
4. AI (Gemini) oraz integracje MCP pozostają w pierwszym etapie wyłączone; aplikacja musi działać w pełni autonomicznie w trybie lokalnym.
5. Oryginały dowodów są niezmienne (niemutowalne). Wszelkie korekty i pochodne tworzą nowe wersje powiązane z hashem oryginału (SHA-256).

## Decyzja

1. **Stos technologiczny:**
   - Język: TypeScript (tryb strict, zero `any`).
   - Framework UI: Next.js (App Router) / React z Tailwind CSS.
   - Szyfrowanie i integralność: Standardowe Web Cryptography API (AES-GCM-256 z PBKDF2/SHA-256 dla klucza głównego i HMAC-SHA-256/SHA-256 dla integralności).
   - Testy: Vitest do deterministycznych testów jednostkowych, integracyjnych i testów szczelności prywatności (wykrywanie canary PII).

2. **Warstwa domenowa (Domain-Driven Design):**
   - Oddzielenie czystej logiki biznesowej od I/O i komponentów UI.
   - Moduły:
     - `Case`: Sprawa administracyjna (ID, cel, tryb, organ, status, braki, następny krok).
     - `DocumentVault`: Sejf dokumentów (trwałe ID, niemutowalne bajty oryginału, wersje, relacje, typy MIME, hashe SHA-256).
     - `FieldExtractor`: Ekstrakcja i statusy pól (`unknown`, `proposed`, `confirmed`, `disputed`), z zachowaniem lokalizacji w dokumencie.
     - `DeadlineEngine`: Deterministyczny kalkulator terminów według prawa polskiego (KPA art. 57, e-Doręczenia, polskie dni ustawowo wolne od pracy, przesunięcie z sobót i niedziel, obsługa braku daty `unknown`).
     - `LegalDossier`: Baza zweryfikowanych źródeł (ELI/ISAP), powiązania twierdzeń z jednostkami redakcyjnymi aktów, orzecznictwo i kontrargumenty.
     - `LetterDraft`: Generator projektów pism z edycją, checklistą weryfikacyjną, dołączaniem dowodów i eksportem do formatu tekstowego/druku bez auto-wysyłki.
     - `BackupRestore`: Generowanie zaszyfrowanego kontenera sejfu i weryfikacja odtworzenia na czystym profilu z kontrolą sum kontrolnych.

3. **Bezpieczeństwo i prywatność:**
   - Żadne dane sprawy nie są transmitowane przez sieć.
   - Testy automatyczne weryfikują brak zapytań sieciowych i wycieku danych testowych.
   - Treści dokumentów traktowane są wyłącznie jako niezaufane dane (ochrona przed prompt injection).

## Konsekwencje

- Aplikacja działa całkowicie offline w przeglądarce.
- Użytkownik zachowuje pełną kontrolę nad dowodami i pismami.
- Brak ryzyka wycieku danych do zewnętrznych modeli AI przed świadomą autoryzacją użytkownika.
