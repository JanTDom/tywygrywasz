import { CommerceLayout } from '@/components/CommerceLayout';
import { PaymentClient } from './PaymentClient';
export default function PaymentPage() { return <CommerceLayout eyebrow="Bezpieczny powrót" title="Status płatności" lead="Potwierdzenie otrzymujemy niezależnie od samego powrotu z banku."><PaymentClient /></CommerceLayout>; }
