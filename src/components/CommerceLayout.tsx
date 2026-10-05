import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { SiteFooter } from './SiteFooter';
import { getPublicCommerceConfig } from '@/domain/commerce-config';

export function CommerceLayout({ children, eyebrow, title, lead }: { children: ReactNode; eyebrow?: string; title?: string; lead?: string }) {
  return (
    <div className="commerce-page">
      <header className="commerce-header">
        <div className="commerce-header-inner">
          <Link href="/" className="commerce-header-logo" aria-label="TyWygrywasz.pl — strona główna">
            <img src="/tywygrywasz-logo.png" alt="TyWygrywasz.pl" />
          </Link>
          <Link href="/" className="commerce-back"><ArrowLeft size={15} /> Wróć do aplikacji</Link>
        </div>
      </header>
      <main className="commerce-main">
        {(eyebrow || title || lead) && <div className="commerce-heading">
          {eyebrow && <p className="commerce-eyebrow">{eyebrow}</p>}
          {title && <h1>{title}</h1>}
          {lead && <p className="commerce-lead">{lead}</p>}
        </div>}
        {children}
      </main>
      <SiteFooter seller={getPublicCommerceConfig().seller} />
    </div>
  );
}
