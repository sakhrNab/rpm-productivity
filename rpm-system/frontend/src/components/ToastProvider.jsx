import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import './ToastProvider.css';

const ToastContext = createContext({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts(list => list.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++idRef.current;
    setToasts(list => [...list, { id, message, type }]);
    if (duration > 0) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  // Finishing a prerequisite anywhere in the app announces the tasks it freed up.
  useEffect(() => {
    const onUnblocked = (e) => {
      const list = e.detail || [];
      if (!list.length) return;
      const names = list.slice(0, 2).map(t => `“${t.title}”`).join(', ');
      showToast(`🔓 Unblocked: ${names}${list.length > 2 ? ` +${list.length - 2} more` : ''} — ready to start`, 'success', 6000);
    };
    window.addEventListener('rpm:unblocked', onUnblocked);
    return () => window.removeEventListener('rpm:unblocked', onUnblocked);
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-viewport" role="region" aria-live="polite" aria-label="Notifications">
        {toasts.map(t => {
          const Icon = ICONS[t.type] || Info;
          return (
            <div key={t.id} className={`toast toast-${t.type}`} role="status">
              <Icon size={18} className="toast-icon" />
              <span className="toast-message">{t.message}</span>
              <button type="button" className="toast-close" aria-label="Dismiss" onClick={() => dismiss(t.id)}>
                <X size={15} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
