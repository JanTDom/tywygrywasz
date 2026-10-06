# ADR 0004: Potwierdzanie e-maila i odzyskiwanie konta

## Decyzja

Konto otrzymuje pole `email_verified_at`. Jednorazowe kody są generowane z 32
losowych bajtów przez Node Crypto. Baza przechowuje tylko SHA-256 kodu, identyfikator
konta, cel i czas ważności. Potwierdzenie adresu wymaga własnej zalogowanej sesji;
kod resetu pozwala tylko zmienić hasło wskazanego konta. Kod potwierdzenia trwa
24 godziny, kod resetu 30 minut. Ponowne wydanie kodu po 60 sekundach unieważnia
poprzedni kod tego samego celu.

RPC PostgreSQL blokują wiersz konta, a zużycie kodu, zapis hasła i odwołanie sesji
wykonują w jednej transakcji. Reset odwołuje wszystkie sesje oraz kody danego
konta. `credential_version` blokuje utworzenie sesji ze starych poświadczeń,
gdy równoległy reset już zmienił hasło. Oddzielny przycisk odwołuje wszystkie
pozostałe sesje i rotuje token bieżącej sesji oraz CSRF. Ponowne logowanie rotuje
bieżącą sesję. Funkcje używają `security invoker`, mają pusty `search_path`,
a `EXECUTE` jest dostępne wyłącznie dla `service_role`.

## Poczta i granica prywatności

Adapter Resend korzysta z `AUTH_EMAIL_TRANSPORT=resend`, `RESEND_API_KEY`,
`AUTH_EMAIL_FROM` i `APP_URL` wskazującego HTTPS. Weryfikacja domeny nadawcy
odbywa się u dostawcy. Sekrety są wyłącznie serwerowe. API nie zwraca kodów
ani odpowiedzi dostawcy i nie zapisuje ich w logu. Wiadomość zawiera adres
konta, jednorazowy kod, cel i datę wygaśnięcia. Nie otrzymuje dokumentów,
nazw plików, notatek, hasła ani klucza sejfu. Kod jest wklejany w panelu;
nie jest umieszczany w URL.

Żądanie resetu zwraca ten sam komunikat dla istniejących i nieistniejących
kont. W produkcji wyszukanie skrzynki i wysyłka odbywają się przez Next.js
`after`, po przygotowaniu odpowiedzi, aby opóźnienie dostawcy nie wskazywało
istnienia konta. Brak konfiguracji daje 503 w żądaniu wysyłki kodu przed sprawdzeniem skrzynki. Sama rejestracja i logowanie pozostają dostępne z trwałą bazą: adres pozostaje niepotwierdzony, a publiczne capabilities ujawnia wyłącznie dostępność kodów. UI pokazuje niedostępność wysyłki; nie udaje wysłania kodu ani potwierdzenia adresu.
Niepowodzenie wysyłki unieważnia wydany kod. Użytkownik może ponowić żądanie.
API ma ochronę CSRF, limit liczby prób na instancji, atomowy limit wspólny
w PostgreSQL i trwały cooldown kodu dla konta. Klucz limitu jest HMAC adresu
technicznego połączenia i zakresu endpointu; baza nie otrzymuje czytelnego
adresu IP ani e-maila. HMAC używa `AUTH_RATE_LIMIT_SECRET` lub serwerowego
klucza service role. Nieaktualne kubełki są usuwane po dobie. Reverse proxy
musi dostarczać zaufany nagłówek adresu klienta; globalny WAF może stanowić
dodatkową ochronę infrastruktury.

`AUTH_EMAIL_TRANSPORT=memory` działa wyłącznie w testach Vitest; nie istnieje
produkcyjny endpoint zwracający testowe kody. Zamiast cichego fallbacku kont
do pamięci, produkcja wymaga konfiguracji trwałej bazy.

## Sejf pozostaje oddzielny

Reset hasła konta nie czyta i nie zmienia żadnej koperty szyfrowania sejfu.
Nowe hasło nie odblokowuje klucza opakowanego starym hasłem. Interfejs wymaga
osobnego klucza odzyskiwania i kopii zapasowej; serwer nie może ich odzyskać.
Ponowne opakowanie lokalnego klucza wymaga wcześniejszego odblokowania przez
użytkownika, a nie samego udanego resetu.

## Weryfikacja

`tests/account-recovery.test.ts` sprawdza izolację, powtórne użycie, wygaśnięcie,
równoległe zużycie, reset wszystkich sesji, rotację oraz jednakową odpowiedź
resetu. `supabase/tests/account_recovery.sql` uruchamia rzeczywiste RPC na
syntetycznych kontach w transakcji z rollbackiem i sprawdza zakaz roli `anon`.
Migrację trzeba zastosować do docelowej bazy przed uruchomieniem nowych API;
konfiguracja poczty nie jest dowodem faktycznego doręczenia do skrzynki.

Dokumentację adaptera sprawdzono 6 października 2026:
[Supabase RPC](https://supabase.com/docs/reference/javascript/rpc),
[Next.js after](https://nextjs.org/docs/app/api-reference/functions/after),
[Resend Send Email](https://resend.com/docs/api-reference/emails/send-email).
