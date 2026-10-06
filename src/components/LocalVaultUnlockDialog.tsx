'use client';

import React, { useState } from 'react';
import { LockKeyhole, ShieldCheck, KeyRound } from 'lucide-react';

interface Props {
  mode: 'create' | 'unlock' | 'migrate';
  onUnlock: (password: string) => Promise<void>;
  onAccount: () => void;
}

export function LocalVaultUnlockDialog({ mode, onUnlock, onAccount }: Props) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const creating = mode !== 'unlock';
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (creating && password !== confirmation) { setError('Hasła nie są jednakowe.'); return; }
    setError(null);
    setBusy(true);
    try { await onUnlock(password); setPassword(''); setConfirmation(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Nie udało się odblokować sejfu.'); }
    finally { setBusy(false); }
  };
  return (
    <div className="account-overlay no-print">
      <section className="account-dialog" role="dialog" aria-modal="true" aria-labelledby="local-vault-title">
        <div className="panel-kicker"><LockKeyhole size={16} /> LOKALNY SEJF</div>
        <h2 id="local-vault-title" className="text-2xl font-bold mt-3">{creating ? 'Ustaw hasło swojego sejfu' : 'Odblokuj swój sejf'}</h2>
        <p className="account-intro">{mode === 'migrate' ? 'Zabezpieczamy istniejący klucz hasłem. Dokumenty i historia pozostają zachowane.' : creating ? 'Możesz korzystać bez konta. Hasło chroni klucz zapisany na tym urządzeniu i nie jest wysyłane do serwera.' : 'Hasło odblokowuje klucz tylko na tym urządzeniu. Możesz też podać zapisany klucz odzyskiwania.'}</p>
        <form onSubmit={submit} className="account-form">
          <label>{creating ? 'Nowe hasło sejfu (minimum 12 znaków)' : 'Hasło sejfu lub klucz odzyskiwania'}<input required autoFocus type="password" minLength={creating ? 12 : undefined} maxLength={256} autoComplete={creating ? 'new-password' : 'current-password'} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {creating && <label>Powtórz hasło<input required type="password" minLength={12} maxLength={256} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>}
          <div className="account-note"><KeyRound size={16} /><span>Po odblokowaniu pobierz klucz odzyskiwania i pełną kopię w sekcji „Kopie i prywatność”. Bez nich utraconego hasła ani wyczyszczonego profilu nie da się odtworzyć.</span></div>
          {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
          <div className="account-actions"><button type="button" className="button-secondary" onClick={onAccount}>Użyj konta</button><button disabled={busy} type="submit" className="button-primary"><ShieldCheck size={16} />{busy ? 'Odblokowywanie…' : creating ? 'Zabezpiecz sejf' : 'Odblokuj sejf'}</button></div>
        </form>
      </section>
    </div>
  );
}
