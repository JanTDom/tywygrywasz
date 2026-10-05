# Płatności Przelewy24

Integracja jest przygotowana po stronie serwera, ale pozostaje wyłączona, dopóki nie zostaną uzupełnione wszystkie dane sprzedawcy, oferta i klucze P24. Brak konfiguracji kończy żądanie kodem `503`; aplikacja nie zapisuje zamówienia do pamięci procesu i nie udaje udanej płatności.

## Zmienne środowiskowe

Ustaw jako sekrety w Vercel (Production i Preview, gdy testujesz sandbox):

| Zmienna | Znaczenie |
| --- | --- |
| `P24_MERCHANT_ID` | ID sprzedawcy z panelu P24 |
| `P24_POS_ID` | login/ID punktu płatności |
| `P24_CRC` | klucz CRC do sum kontrolnych |
| `P24_API_KEY` | klucz API/reporting key do Basic Auth |
| `P24_ENV` | `sandbox` albo `production` (domyślnie production) |
| `P24_AMOUNT_GROSZ` | cena brutto w groszach, np. `6900` |
| `P24_OFFER_NAME` | nazwa konkretnej oferty |
| `P24_SELLER_NAME` | pełna nazwa sprzedawcy |
| `P24_SELLER_EMAIL` | adres obsługi płatności/reklamacji |
| `P24_RETURN_URL` | publiczny adres powrotu po P24 |
| `P24_STATUS_URL` | `https://tywygrywasz.pl/api/payments/webhook` |

Kwota zawsze pochodzi z serwera. Klient nie może jej zmienić. Dane konta i metadane transakcji są w tabeli `payment_orders`; dokumenty sprawy i ich treść nie są do niej zapisywane. Tabela ma włączone RLS i nie ma uprawnień dla ról `anon` ani `authenticated`; korzysta z niej wyłącznie serwerowy klient Supabase.

## Przebieg

`POST /api/payments/checkout` wymaga zalogowanego konta, poprawnego tokenu CSRF oraz akceptacji regulaminu, polityki prywatności i rozpoczęcia usługi cyfrowej. Serwer tworzy `pending`, rejestruje transakcję w P24 i zwraca URL panelu. P24 wysyła JSON wyłącznie po udanej płatności na `/api/payments/webhook`. Serwer sprawdza podpis SHA-384, merchant/pos, walutę, kwotę oraz kwotę pierwotną, a następnie wywołuje `transaction/verify`. Dopiero odpowiedź `status=success` pozwala atomowo zmienić rekord na `paid`. Powtórne webhooki są bezpieczne dzięki warunkowi `status=pending`.

`GET /api/payments/status?sessionId=...` zwraca status tylko właścicielowi sesji. Token P24, klucze i sekrety nie trafiają do przeglądarki ani do URL aplikacji.

Przed uruchomieniem produkcji należy wykonać migrację `20261005113000_payment_orders.sql`, skonfigurować URL-e w panelu P24 i przetestować sandbox. Politykę zwrotów, regulamin, dane firmy, cenę i zasady dostępu trzeba uzupełnić danymi sprzedawcy przed włączeniem checkoutu.
