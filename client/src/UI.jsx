import { X, Check, AlertCircle, Info, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const Loader = ({ text }) => {
    const { t } = useTranslation();
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200">
            <div className="bg-gray-900 border border-gray-800 p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4">
                <Loader2 className="animate-spin text-blue-500" size={32} />
                <p className="text-gray-300 font-medium">{text || t('loading')}</p>
            </div>
        </div>
    );
};

export const ToastContainer = ({ toasts, removeToast }) => (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none w-full max-w-sm px-4 md:px-0 md:w-auto">
        {toasts.map(toast => (
            <div 
                key={toast.id} 
                className={`pointer-events-auto flex items-center gap-3 p-4 rounded-xl shadow-lg border backdrop-blur-md animate-in slide-in-from-right-full fade-in duration-300 ${
                    toast.type === 'error' ? 'bg-red-950/80 border-red-500/30 text-red-400' :
                    toast.type === 'success' ? 'bg-green-950/80 border-green-500/30 text-green-400' :
                    'bg-blue-950/80 border-blue-500/30 text-blue-400'
                }`}
            >
                {toast.type === 'error' && <AlertCircle size={20} className="shrink-0" />}
                {toast.type === 'success' && <Check size={20} className="shrink-0" />}
                {toast.type === 'info' && <Info size={20} className="shrink-0" />}
                <p className="text-sm font-medium pr-2 break-words">{toast.message}</p>
                <button 
                    onClick={() => removeToast(toast.id)} 
                    className="hover:bg-white/10 p-1 rounded transition-colors ml-auto shrink-0"
                >
                    <X size={14} />
                </button>
            </div>
        ))}
    </div>
);
