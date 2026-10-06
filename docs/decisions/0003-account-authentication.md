# ADR 0003: Konto, sesja i trwała synchronizacja

## Decyzja

Logowanie do konta i odblokowanie sejfu pełnią osobne funkcje, ale obecny domyślny
przebieg nie tworzy dwóch różnych haseł. Przy rejestracji lub logowaniu hasło konta
trafia do API. To samo hasło jest początkowo używane w przeglądarce do opakowania
lokalnego klucza sejfu; przy zwykłym logowaniu może też odblokować jego kopertę.
API przechowuje nazwę, e-mail, skrót scrypt hasła z losową solą oraz hash losowego
tokenu sesji. Przeglądarka otrzymuje HttpOnly cookie sesji i osobny token
double-submit CSRF. Nie należy opisywać tego przebiegu jako niezależnych haseł
ani twierdzić, że hasło użyte do pierwszego opakowania klucza nigdy nie trafia
do serwera.

Klucz sejfu i jego koperta pozostają na urządzeniu. Reset hasła konta nie czyta
ani nie zmienia koperty; nowe hasło konta nie otwiera klucza opakowanego starym
hasłem. Osobna czynność „Odblokuj lokalny sejf” używa dotychczasowego hasła lub
klucza odzyskiwania TWY wyłącznie lokalnie, bez przesyłania ich do API.
Odtworzenie pełnej kopii ustawia hasło kopii jako hasło lokalnego odblokowania.
Synchronizacja ma odrębne pole hasła szyfrowania, którego API nie otrzymuje.

W środowisku wdrożonym adapter zapisuje konta, sesje i zaszyfrowane koperty synchronizacji
w PostgreSQL przez server-only Supabase service role. Tabele mają włączone RLS i nie mają
grantów dla ról publicznych. API otrzymuje hasło konta, lecz nie otrzymuje klucza
sejfu, jego lokalnej koperty ani czytelnej treści dokumentów w tym przebiegu.

W środowisku lokalnym bez zmiennych Supabase działa pamięciowy fallback potrzebny do
offline development i testów. Nie jest on warstwą trwałości produkcyjnej.

## Granice

Oryginalne pliki DOC/RTF/TXT/PDF/JPG/PNG, OCR, lokalny indeks, szkice i klucze pozostają
na urządzeniu. Endpoint `/api/workspace` jest mostem wyłącznie dla lokalnego Node.js;
na Vercel i w każdym środowisku `NODE_ENV=production` zwraca `410`. Dostępny most
deweloperski zapisuje pliki jawnie w `process.cwd()/Moje_sprawy/<user.id>`; nie jest
tym samym co szyfrowany magazyn przeglądarki. Produkcja korzysta z importu
przeglądarkowego/local-first.

CSRF sprawdza pochodzenie żądania oraz opcjonalną listę `APP_ORIGINS`, a jeśli ta
jest pusta — `NEXT_PUBLIC_SITE_URL`. `NEXT_PUBLIC_APP_URL` nie jest ustawieniem
tego sprawdzenia. W produkcji wymagane są nagłówki Origin i Sec-Fetch-Site oraz
zgodny token z cookie i nagłówka. Konfiguracja zaufanego reverse proxy pozostaje
odrębnym warunkiem wdrożenia.

Weryfikacja e-maila, reset hasła, limity prób, rotacja sesji i CAS synchronizacji
są zaimplementowane. Adapter poczty wymaga osobnej konfiguracji Resend i domeny
nadawcy; samo działanie konta nie oznacza dostępności wysyłki kodów. W bieżącej
produkcji nie skonfigurowano jeszcze poczty ani Przelewy24. Ich uruchomienie
i rzeczywista dostawa kodu/płatność wymagają osobnej weryfikacji.
