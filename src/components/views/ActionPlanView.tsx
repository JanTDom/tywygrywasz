'use client';

import React from 'react';
import {
  ListTodo,
  CheckCircle2,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { Case, ActionPlanStep } from '../../domain/types';
import { ViewType } from '../Navigation';

interface ActionPlanViewProps {
  cases: Case[];
  activeCaseId: string | null;
  onSelectCase: (caseId: string) => void;
  actionPlan: ActionPlanStep[];
  onToggleStepStatus: (stepId: string) => void;
  onNavigate: (view: ViewType, caseId?: string) => void;
}

export function ActionPlanView({
  cases,
  activeCaseId,
  onSelectCase,
  actionPlan,
  onToggleStepStatus,
  onNavigate,
}: ActionPlanViewProps) {
  const currentCaseId = activeCaseId || cases[0]?.id;

  const completedCount = actionPlan.filter((s) => s.status === 'completed').length;
  const totalCount = actionPlan.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Plan działania krok po kroku
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Przewodnik prowadzący Cię za rękę przez procedurę: cele, wymagane dokumenty i kryteria ukończenia.
          </p>
        </div>

        <select
          value={currentCaseId || ''}
          onChange={(e) => onSelectCase(e.target.value)}
          className="text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-slate-900"
        >
          {cases.map((c) => (
            <option key={c.id} value={c.id}>
              {c.id} - {c.title}
            </option>
          ))}
        </select>
      </div>

      {/* Progress Bar Card */}
      {totalCount > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
            <span>
              Postęp realizacji kroków: {completedCount} z {totalCount} wykonanych
            </span>
            <span className="text-slate-900 font-bold">{progressPercent}%</span>
          </div>

          <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-emerald-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}

      {/* Steps List */}
      <div className="space-y-4">
        {actionPlan.map((step) => {
          const isDone = step.status === 'completed';
          const isInProgress = step.status === 'in_progress';

          return (
            <div
              key={step.id}
              className={`bg-white rounded-2xl border p-5 shadow-sm transition-all space-y-4 ${
                isDone
                  ? 'border-emerald-200 bg-emerald-50/20'
                  : isInProgress
                  ? 'border-slate-900 ring-2 ring-slate-900/5'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div
                    className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0 mt-0.5 ${
                      isDone
                        ? 'bg-emerald-600 text-white'
                        : isInProgress
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {step.stepNumber}
                  </div>
                  <div>
                    <h2
                      className={`text-base font-bold ${
                        isDone ? 'text-slate-600 line-through' : 'text-slate-900'
                      }`}
                    >
                      {step.title}
                    </h2>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      <strong className="text-slate-800">Dlaczego to robimy: </strong>
                      {step.why}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onToggleStepStatus(step.id)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors self-start sm:self-auto flex items-center gap-1.5 ${
                    isDone
                      ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                      : isInProgress
                      ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {isDone ? 'Krok zrobiony' : isInProgress ? 'W realizacji' : 'Oznacz jako zrobiony'}
                  </span>
                </button>
              </div>

              {/* Step details grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-100">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Wymagane dokumenty
                  </span>
                  <div className="text-slate-800">
                    {step.requiredDocuments.join(', ')}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/70 space-y-1">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                    Twoja decyzja / wybór
                  </span>
                  <div className="text-slate-800">{step.decisionNeeded}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-1">
                  <span className="text-[11px] font-semibold text-amber-900 uppercase tracking-wider flex items-center gap-1">
                    <Clock className="w-3 h-3 text-amber-700" />
                    <span>Termin i ryzyko</span>
                  </span>
                  <div className="text-amber-950 font-medium">{step.deadlineNotice}</div>
                </div>

                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200/80 space-y-1">
                  <span className="text-[11px] font-semibold text-emerald-900 uppercase tracking-wider flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                    <span>Kryterium ukończenia kroku</span>
                  </span>
                  <div className="text-emerald-950 font-medium">{step.completionCriteria}</div>
                </div>
              </div>

              {/* Action buttons */}
              {step.title.toLowerCase().includes('pismo') || step.title.toLowerCase().includes('odwołan') || step.title.toLowerCase().includes('reklamacj') ? (
                <div className="pt-1 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={() => onNavigate('letters', currentCaseId)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-900 hover:text-slate-700 transition-colors"
                  >
                    <span>Przejdź do generatora pism</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}

        {actionPlan.length === 0 && (
          <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
            <ListTodo className="w-8 h-8 text-slate-400 mx-auto" />
            <h2 className="text-sm font-bold text-slate-800 mt-2">
              Brak zdefiniowanego planu działania
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Wczytaj sprawę syntetyczną w zakładce &quot;Dziś&quot; lub dodaj zdarzenia w osi czasu.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
