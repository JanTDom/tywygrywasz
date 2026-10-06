# ADR 0002: Rzeczywista obsługa dysku lokalnego, modułowe procedury i relacyjny model dowodowy

## Kontekst

Zgodnie z rozszerzonymi wymaganiami projektu „TyWygrywasz.pl”, aplikacja ma prowadzić zwykłego człowieka nie tylko przez sprawy urzędowe, lecz również przez:
- spory konsumenckie i reklamacje wobec firm;
- spory wynikające z umów z osobami fizycznymi i przedsiębiorcami;
- wnioski o informację publiczną, petycje i skargi;
- działania w interesie społecznym.

Kluczowym wymaganiem jest **rzeczywista struktura plików i katalogów na dysku użytkownika**:
- Dokumenty nie mogą być ukryte wyłącznie w bazie przeglądarki.
- Struktura widoczna w aplikacji musi bezpośrednio odzwierciedlać czytelną organizację katalogów na dysku komputera:
  ```
  Moje_sprawy/
    Do_uporzadkowania/
    S-0001_Nazwa_sprawy/
      00_Plan_i_opis/
      01_Otrzymane/
      02_Wyslane/
      03_Dowody/
      04_Potwierdzenia/
      05_Projekty_pism/
      06_Prawo_i_analizy/
      07_Wynik_sprawy/
  ```
- Aplikacja musi wykrywać zmiany na dysku dokonane poza nią (dodanie, przeniesienie, usunięcie, zmiana nazwy), zachowując integralność niemutowalnych dowodów i sum kontrolnych SHA-256.

## Decyzja

1. **Podwójny model dostępu do dysku (Dual Disk Architecture):**
   - **Serwerowy most lokalny (`/api/workspace`):** Gdy aplikacja działa lokalnie na maszynie użytkownika (Next.js Node runtime), ma bezpośredni dostęp do wybranego katalogu roboczego (np. `/Users/.../Moje_sprawy` lub `./workspace`). Zapewnia to natywną obsługę systemu plików, skanowanie, wykrywanie zmian zewnętrznych, tworzenie katalogów i bezpieczne operacje plikowe.
   - **Klient przeglądarkowy:** Wykorzystuje interfejs API lokalnego mostu oraz opcjonalnie File System Access API przeglądarki, prezentując rzeczywistą ścieżkę do pliku na dysku.

2. **Modułowa obsługa procedur i sporów:**
   - Procedura administracyjna (`administrative`): KPA, odwołania, 14 dni, właściwość instancyjna.
   - Informacja publiczna (`public_information`): Ustawa o dostępie do informacji publicznej, 14 dni, bezczynność, ponaglenie, skarga do WSA.
   - Spory konsumenckie i reklamacje (`consumer_dispute`): Ustawa o prawach konsumenta, Kodeks cywilny (rękojmia), 14 dni na odpowiedź pod rygorem uznania reklamacji.
   - Spory umowne (`contract_dispute`): Kodeks cywilny art. 471 i nast., wezwanie przedsądowe do wykonania umowy / zapłaty, odsetki ustawowe.
   - Skargi i petycje (`complaint_or_petition`): Dział VIII KPA, Ustawa o petycjach.
   - Sprawy społeczne (`social_interest`): Osobny obieg z redakcją danych i anonimizacją.

3. **Inteligentny klasyfikator i skrzynka „Do uporządkowania”:**
   - Nowe dokumenty bez jednoznacznego przypisania trafiają do `Do_uporzadkowania/`.
   - Analizator heurystyczny rozpoznaje sygnatury, strony, kwoty, daty i relacje („odpowiada na”, „załącznik do”, „potwierdza złożenie”, „potwierdza doręczenie”).
   - Użytkownik otrzymuje jedno proste pytanie decyzyjne zamiast wymuszania procedury.
   - Wszystkie operacje przenoszenia i porządkowania posiadają historię oraz możliwość natychmiastowego cofnięcia (Undo).

4. **Bezpieczeństwo i prywatność:**
   - Wszystkie pliki i analizy pozostają lokalnie.
   - Ewentualne wywołania chmurowe Gemini są domyślnie wyłączone; wymagają jawnego okna podglądu dokładnego payloadu (Disclosure Modal) z możliwością anonimizacji/redakcji przed wysłaniem.
   - Treść plików traktowana jest wyłącznie jako niezaufane dane (odporność na prompt injection).
