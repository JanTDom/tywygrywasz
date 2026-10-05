'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { CheckCircle2, LoaderCircle, MessageCircleWarning } from 'lucide-react';

export function PaymentClient() {
  const [status, setStatus] = useState<'loading' | 'paid' | 'pending' | 'failed' | 'missing'>('loading');
  const [message, setMessage] = useState('Sprawdzam potwierdzenie płatności…');
  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get('sessionId');
    if (!sessionId) { setStatus('missing'); setMessage('Brakuje identyfikatora powrotu z płatności.'); return; }
    let stopped = false; let attempts = 0;
    const poll = async () => {
      attempts += 1;
      try {
        const response = await fetch(`/api/payments/status?sessionId=${encodeURIComponent(sessionId)}`, { credentials: 'include', cache: 'no-store' });
        const data = await response.json().catch(() => ({}));
        if (data.paid || data.status === 'paid' || data.status === 'success') { if (!stopped) { setStatus('paid'); setMessage('Płatność została potwierdzona.'); } return; }
        if (data.status === 'failed' || data.status === 'cancelled') { if (!stopped) { setStatus('failed'); setMessage('Płatność nie została potwierdzona.'); } return; }
      } catch { /* kolejna próba */ }
      if (stopped) return;
      if (attempts >= 12) { setStatus('pending'); setMessage('Płatność oczekuje na potwierdzenie. Odśwież tę stronę za chwilę.'); return; }
      window.setTimeout(poll, 2500);
    };
    void poll();
    return () => { stopped = true; };
  }, []);
  return <div className="commerce-card commerce-payment-result">
    {status === 'loading' && <LoaderCircle className="commerce-spin" size={40} />}
    {status === 'paid' && <CheckCircle2 className="commerce-result-success" size={42} />}
    {(status === 'pending' || status === 'failed' || status === 'missing') && <MessageCircleWarning className="commerce-result-warning" size={42} />}
    <h2>{status === 'paid' ? 'Gotowe.' : status === 'pending' ? 'Jeszcze chwila.' : status === 'failed' ? 'Płatność przerwana.' : status === 'missing' ? 'Nie znaleziono płatności.' : 'Potwierdzam płatność.'}</h2>
    <p>{message}</p>
    <Link href="/" className="commerce-submit commerce-submit-link">Wróć do aplikacji</Link>
  </div>;
}
