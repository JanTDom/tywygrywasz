# ADR 0003: Konto, sesja i trwała synchronizacja

## Decyzja

Konto TyWygrywasz.pl ma osobne hasło od hasła lokalnego sejfu. API przechowuje nazwę,
e-mail, scrypt password hash z losową solą oraz hash losowego tokenu sesji. Przeglądarka
otrzymuje tylko HttpOnly cookie sesji i osobny token double-submit CSRF.

W środowisku wdrożonym adapter zapisuje konta, sesje i zaszyfrowane koperty synchronizacji
w PostgreSQL przez server-only Supabase service role. Tabele mają włączone RLS i nie mają
grantów dla ról publicznych. Serwer nie zna hasła sejfu ani czytelnej treści dokumentów.

W środowisku lokalnym bez zmiennych Supabase działa pamięciowy fallback potrzebny do
offline development i testów. Nie jest on warstwą trwałości produkcyjnej.

## Granice

Oryginalne pliki DOC/RTF/TXT/PDF/JPG/PNG, OCR, lokalny indeks, szkice i klucze pozostają
na urządzeniu. Endpoint `/api/workspace` jest mostem wyłącznie dla lokalnego Node.js;
na Vercel zwraca `410`, ponieważ filesystem funkcji jest efemeryczny i nie jest dyskiem
użytkownika. Produkcja korzysta z importu przeglądarkowego/local-first.

Przed użyciem z realnymi danymi trzeba dodać weryfikację e-mail, reset hasła, rate limiting,
rotację sesji, monitoring bez PII i kontrolę wersji (CAS) kopert synchronizacji.
