'use client';

import React from 'react';
import {
  CalendarDays,
  FolderKanban,
  HardDrive,
  Inbox,
  Clock3,
  Scale,
  ListTodo,
  FileText,
  BookOpen,
  ShieldCheck,
  MoreHorizontal,
  Settings2,
  Plus,
} from 'lucide-react';

export type ViewType =
  | 'today'
  | 'cases'
  | 'disk'
  | 'inbox'
  | 'timeline'
  | 'evidence'
  | 'plan'
  | 'letters'
  | 'legal'
  | 'privacy';

interface NavigationProps {
  activeView: ViewType;
  onSelectView: (view: ViewType) => void;
  onHome?: () => void;
  inboxCount: number;
  urgentCount: number;
}

type NavItem = { id: ViewType; label: string; icon: React.ReactNode; badge?: number };

export function Navigation({ activeView, onSelectView, onHome, inboxCount, urgentCount }: NavigationProps) {
  const sections: { label: string; items: NavItem[] }[] = [
    {
      label: 'Start',
      items: [
        { id: 'today', label: 'Dziś', icon: <CalendarDays size={19} />, badge: urgentCount || undefined },
        { id: 'cases', label: 'Moje sprawy', icon: <FolderKanban size={19} /> },
      ],
    },
    {
      label: 'Prowadź',
      items: [
        { id: 'disk', label: 'Dokumenty', icon: <HardDrive size={19} /> },
        { id: 'inbox', label: 'Nowe dokumenty', icon: <Inbox size={19} />, badge: inboxCount || undefined },
        { id: 'timeline', label: 'Oś czasu', icon: <Clock3 size={19} /> },
        { id: 'letters', label: 'Pisma', icon: <FileText size={19} /> },
      ],
    },
    {
      label: 'Sprawdzaj',
      items: [
        { id: 'plan', label: 'Plan działania', icon: <ListTodo size={19} /> },
        { id: 'evidence', label: 'Dowody i stanowiska', icon: <Scale size={19} /> },
        { id: 'legal', label: 'Prawo i źródła', icon: <BookOpen size={19} /> },
      ],
    },
  ];

  const renderItem = (item: NavItem) => {
    const isActive = activeView === item.id;
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onSelectView(item.id)}
        aria-current={isActive ? 'page' : undefined}
        className={`rail-link ${isActive ? 'rail-link-active' : ''}`}
      >
        <span className="rail-link-icon">{item.icon}</span>
        <span className="rail-link-label">{item.label}</span>
        {item.badge !== undefined && <span className={`rail-badge ${isActive ? 'rail-badge-active' : ''}`}>{item.badge}</span>}
      </button>
    );
  };

  return (
    <>
      <aside className="app-rail no-print" aria-label="Główna nawigacja">
        <button type="button" className="rail-brand rail-brand-button" onClick={() => onHome?.()} aria-label="Wróć do strony głównej">
          <img className="brand-logo" src="/tywygrywasz-shield.png" alt="TyWygrywasz.pl" />
          <div>
            <div className="brand-name">TyWygrywasz.pl</div>
            <div className="brand-caption">Twój porządek w sprawie</div>
          </div>
        </button>

        <button type="button" className="rail-add" onClick={() => onSelectView('cases')}>
          <Plus size={17} /> <span>Dodaj coś nowego</span>
        </button>

        <div className="rail-sections">
          {sections.map((section) => (
            <div className="rail-section" key={section.label}>
              <div className="rail-section-label">{section.label}</div>
              <div className="rail-section-items">{section.items.map(renderItem)}</div>
            </div>
          ))}
        </div>

        <div className="rail-bottom">
          <button type="button" className={`rail-link ${activeView === 'privacy' ? 'rail-link-active' : ''}`} onClick={() => onSelectView('privacy')} aria-current={activeView === 'privacy' ? 'page' : undefined}>
            <span className="rail-link-icon"><ShieldCheck size={19} /></span>
            <span className="rail-link-label">Kopie i prywatność</span>
          </button>
          <div className="rail-trust">
            <div className="rail-trust-top"><span className="trust-dot" /> Sejf działa lokalnie</div>
            <p>Pliki zostają na tym urządzeniu.</p>
            <button type="button" onClick={() => onSelectView('privacy')}>Sprawdź ustawienia <span aria-hidden="true">↗</span></button>
          </div>
          <button type="button" className="rail-link rail-settings" onClick={() => onSelectView('privacy')}>
            <span className="rail-link-icon"><Settings2 size={18} /></span>
            <span className="rail-link-label">Ustawienia</span>
          </button>
        </div>
      </aside>

      <nav className="mobile-nav no-print" aria-label="Skrócona nawigacja">
        {[
          ['today', 'Dziś', <CalendarDays key="today" size={19} />],
          ['cases', 'Sprawy', <FolderKanban key="cases" size={19} />],
          ['disk', 'Dokumenty', <HardDrive key="disk" size={19} />],
          ['plan', 'Zadania', <ListTodo key="plan" size={19} />],
          ['privacy', 'Więcej', <MoreHorizontal key="more" size={19} />],
        ].map(([id, label, icon]) => (
          <button type="button" key={id as string} className={activeView === id ? 'mobile-nav-item mobile-nav-item-active' : 'mobile-nav-item'} onClick={() => onSelectView(id as ViewType)} aria-current={activeView === id ? 'page' : undefined}>
            {icon}<span>{label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
