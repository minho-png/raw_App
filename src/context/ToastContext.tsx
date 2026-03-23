'use client';

/**
 * 토스트 알림 시스템
 * 프론트엔드 디자이너 요청 — 모든 alert() 대체
 * 사용법: const { toast } = useToast()
 *        toast.success('제목', '설명')
 *        toast.error('제목', '설명')
 */
import React, { createContext, useCallback, useContext, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

// ──────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
}

interface ToastAPI {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastAPI | null>(null);

// ──────────────────────────────────────────────────────────
// Provider
// ──────────────────────────────────────────────────────────

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const add = useCallback((type: ToastType, title: string, description?: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts(prev => [...prev.slice(-4), { id, type, title, description }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, type === 'error' ? 6000 : 4000);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast: ToastAPI = {
    success: (t, d) => add('success', t, d),
    error:   (t, d) => add('error',   t, d),
    warning: (t, d) => add('warning', t, d),
    info:    (t, d) => add('info',    t, d),
  };

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <ToastList toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

// ──────────────────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────────────────

export function useToast(): ToastAPI {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

// ──────────────────────────────────────────────────────────
// UI
// ──────────────────────────────────────────────────────────

const CONFIG: Record<ToastType, { icon: React.ElementType; bg: string; iconColor: string; border: string }> = {
  success: { icon: CheckCircle2, bg: 'bg-white',   iconColor: 'text-green-500',  border: 'border-l-green-500'  },
  error:   { icon: XCircle,      bg: 'bg-white',   iconColor: 'text-red-500',    border: 'border-l-red-500'    },
  warning: { icon: AlertTriangle,bg: 'bg-white',   iconColor: 'text-orange-500', border: 'border-l-orange-500' },
  info:    { icon: Info,         bg: 'bg-white',   iconColor: 'text-blue-500',   border: 'border-l-blue-500'   },
};

function ToastList({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: string) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map(t => {
          const { icon: Icon, bg, iconColor, border } = CONFIG[t.type];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 60, scale: 0.95 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 60, scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className={`pointer-events-auto w-80 rounded-2xl shadow-2xl border border-slate-100 border-l-4 ${border} ${bg} p-4 flex items-start gap-3`}
            >
              <Icon size={20} className={`mt-0.5 shrink-0 ${iconColor}`} />
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm text-slate-900 leading-tight">{t.title}</p>
                {t.description && (
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{t.description}</p>
                )}
              </div>
              <button
                onClick={() => onDismiss(t.id)}
                className="shrink-0 text-slate-300 hover:text-slate-500 transition-colors"
              >
                <X size={14} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
