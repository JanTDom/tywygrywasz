import { Mail, MessageSquareText } from 'lucide-react';
import { CommerceLayout } from '@/components/CommerceLayout';
import { getPublicCommerceConfig } from '@/domain/commerce-config';

export default function ContactPage() {
  const config = getPublicCommerceConfig();
  return <CommerceLayout eyebrow="Jesteśmy po Twojej stronie" title="Kontakt" lead="Opisz, co nie działa albo czego potrzebujesz. Nie wysyłaj treści dokumentów, jeśli nie jest to konieczne.">
    <div className="commerce-grid commerce-contact-grid">
      <section className="commerce-card"><div className="commerce-section-label"><Mail size={15} /> SPRAWY KONTA</div><h2>Pomoc techniczna i reklamacje</h2><p>W wiadomości podaj adres konta, przybliżoną datę zdarzenia i opis kroku, na którym pojawił się problem. Nie przesyłaj haseł, kluczy sejfu ani pełnej treści pism.</p>{config.seller.email ? <a className="commerce-submit commerce-submit-link" href={`mailto:${config.seller.email}`}>Napisz: {config.seller.email}</a> : <div className="commerce-status">Adres kontaktowy zostanie opublikowany przed uruchomieniem sprzedaży.</div>}</section>
      <section className="commerce-card"><div className="commerce-section-label"><MessageSquareText size={15} /> ZANIM NAPISZESZ</div><h2>Sprawdź lokalnie</h2><p>W aplikacji otwórz konto i zobacz komunikat systemowy. Przy problemie z dokumentem sprawdź też, czy przeglądarka ma dostęp do pamięci i czy masz zaszyfrowany backup.</p><ul className="commerce-contact-list"><li>Nie udostępniaj hasła konta.</li><li>Nie wklejaj klucza odzyskiwania do e-maila.</li><li>W razie płatności zachowaj potwierdzenie Przelewy24.</li></ul></section>
    </div>
  </CommerceLayout>;
}
