'use client';

import { useEffect, useRef, useState } from 'react';
import { BadgeCheck, KeyRound, Mail, ShieldCheck } from 'lucide-react';

type Props = {
  user?: { email: string; emailVerified?: boolean } | null;
  onAccountChanged?: () => Promise<void> | void;
  onPasswordReset?: () => Promise<void> | void;
};

/** Account-only actions: this component never receives a document or vault key. */
export function AccountRecoveryPanel({ user, onAccountChanged, onPasswordReset }: Props) {
  const [mode, setMode] = useState<'closed' | 'verify' | 'reset'>('closed');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [emailCodesAvailable, setEmailCodesAvailable] = useState<boolean | null>(null);
  const actionController = useRef<AbortController | null>(null);

  useEffect(() => () => actionController.current?.abort(), []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/auth/capabilities', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const capabilities = response.ok ? await response.json() : {};
        if (!controller.signal.aborted) setEmailCodesAvailable(capabilities.emailCodesAvailable === true);
      })
      .catch(() => { if (!controller.signal.aborted) setEmailCodesAvailable(false); });
    return () => controller.abort();
  }, []);

  async function action(path: string, method: 'POST' | 'PATCH', body?: Record<string, string>) {
    if (actionController.current && !actionController.current.signal.aborted) return;
    const controller = new AbortController();
    actionController.current = controller;
    setBusy(true); setError(''); setNotice('');
    try {
      const csrfResponse = await fetch('/api/auth/csrf', { credentials: 'include', cache: 'no-store', signal: controller.signal });
      const csrf = await csrfResponse.json();
      if (controller.signal.aborted) return;
      if (!csrfResponse.ok || !csrf.csrfToken) throw new Error('Nie udało się przygotować formularza.');
      const response = await fetch(path, {
        method, credentials: 'include', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf.csrfToken },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const result = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(result.error || 'Nie udało się wykonać operacji konta.');
      setNotice(result.message || 'Operacja konta zakończona.');
      if (method === 'PATCH') {
        setCode(''); setPassword(''); setRepeatPassword('');
        if (path.endsWith('password-reset')) await onPasswordReset?.();
        else await onAccountChanged?.();
      }
    } catch (reason) {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : 'Operacja konta jest teraz niedostępna.');
    } finally {
      if (actionController.current === controller) actionController.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  function choose(next: 'verify' | 'reset') {
    setMode(mode === next ? 'closed' : next);
    setCode(''); setPassword(''); setRepeatPassword(''); setError(''); setNotice('');
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3" aria-labelledby="account-security-title">
      <div className="flex items-center gap-2 text-slate-800"><ShieldCheck size={17} /><h3 id="account-security-title" className="text-sm font-semibold">Dostęp do konta</h3></div>
      {user && <p className="text-xs flex items-center gap-2 text-slate-600">{user.emailVerified ? <BadgeCheck size={15} /> : <Mail size={15} />}{user.emailVerified ? 'Adres e-mail potwierdzony' : 'Adres e-mail czeka na potwierdzenie'}</p>}
      {emailCodesAvailable === false && <p role="status" className="text-xs leading-relaxed text-amber-800">Wysyłka kodów e-mail jest teraz niedostępna. Logowanie i lokalny sejf działają. Możesz użyć już otrzymanego, ważnego kodu; odzyskanie sejfu wymaga jego osobnej kopii i klucza.</p>}
      <div className="flex flex-wrap gap-2">
        {user && !user.emailVerified && <button type="button" className="button-secondary text-xs" aria-expanded={mode === 'verify'} onClick={() => choose('verify')}>Potwierdź e-mail</button>}
        <button type="button" className="button-secondary text-xs" aria-expanded={mode === 'reset'} onClick={() => choose('reset')}>Nie pamiętam hasła konta</button>
        {user && <button type="button" className="button-secondary text-xs" disabled={busy} onClick={() => void action('/api/auth/sessions', 'POST')}>Wyloguj pozostałe sesje</button>}
      </div>
      {mode !== 'closed' && (
        <div className="space-y-3 border-t border-slate-200 pt-3">
          <p className="text-xs leading-relaxed text-slate-600">{mode === 'verify' ? 'Wyślij jednorazowy kod na adres swojego konta, a potem wklej go tutaj.' : 'Otrzymasz jednorazowy kod ważny przez 30 minut. Po zmianie hasła wszystkie sesje konta zostaną wylogowane.'}</p>
          {mode === 'reset' && <label className="block text-xs font-medium text-slate-700" htmlFor="recovery-email">E-mail konta<input id="recovery-email" type="email" autoComplete="email" maxLength={254} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" value={email} onChange={(event) => setEmail(event.target.value)} /></label>}
          <button type="button" className="button-secondary text-xs" disabled={busy || emailCodesAvailable !== true || (mode === 'reset' && !email.trim())} onClick={() => void action(mode === 'verify' ? '/api/auth/verify-email' : '/api/auth/password-reset', 'POST', mode === 'reset' ? { email } : undefined)}>Wyślij kod na e-mail</button>
          <form className="space-y-3" onSubmit={(event) => {
            event.preventDefault();
            if (mode === 'reset' && password !== repeatPassword) { setError('Oba hasła muszą być identyczne.'); return; }
            void action(mode === 'verify' ? '/api/auth/verify-email' : '/api/auth/password-reset', 'PATCH', mode === 'verify' ? { code } : { code, password });
          }}>
            <label className="block text-xs font-medium text-slate-700" htmlFor="recovery-code">Kod z wiadomości<input id="recovery-code" type="text" required autoComplete="one-time-code" spellCheck={false} maxLength={60} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2 font-mono text-xs" value={code} onChange={(event) => setCode(event.target.value)} /></label>
            {mode === 'reset' && <>
              <label className="block text-xs font-medium text-slate-700" htmlFor="recovery-password">Nowe hasło konta<input id="recovery-password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
              <label className="block text-xs font-medium text-slate-700" htmlFor="recovery-password-repeat">Powtórz nowe hasło<input id="recovery-password-repeat" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-2" value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} /></label>
            </>}
            <button type="submit" className="button-primary text-xs" disabled={busy || !code.trim()}>{busy ? 'Trwa sprawdzanie…' : mode === 'verify' ? 'Potwierdź adres' : 'Zmień hasło konta'}</button>
          </form>
          <p className="text-xs leading-relaxed text-slate-600 flex gap-2"><KeyRound size={16} className="shrink-0 mt-0.5" /><span>Hasło konta i klucz sejfu służą do różnych celów. Reset hasła nie odblokowuje dokumentów. Do odzyskania sejfu potrzebujesz jego klucza odzyskiwania oraz kopii zapasowej.</span></p>
        </div>
      )}
      {notice && <p role="status" className="text-xs leading-relaxed text-emerald-800">{notice}</p>}
      {error && <p role="alert" className="text-xs leading-relaxed text-red-700">{error}</p>}
    </section>
  );
}
