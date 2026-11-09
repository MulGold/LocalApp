import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, AlertCircle, X } from 'lucide-react';

export interface ConfirmModalOptions {
  title: string;
  message: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: 'destructive' | 'warning' | 'default';
}

interface ConfirmModalProps {
  isOpen: boolean;
  options: ConfirmModalOptions | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  options,
  onConfirm,
  onCancel
}) => {
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Auto focus confirm button or trap focus safely
    const timeout = setTimeout(() => {
      confirmBtnRef.current?.focus();
    }, 50);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timeout);
    };
  }, [isOpen, onCancel]);

  if (!isOpen || !options) return null;

  const isDestructive = options.variant === 'destructive';
  const isWarning = options.variant === 'warning';
  const confirmText = options.confirmText || (isDestructive ? 'Delete' : 'Confirm');
  const cancelText = options.cancelText || 'Cancel';

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 overflow-y-auto"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-modal-title"
        aria-describedby="confirm-modal-desc"
      >
        {/* Backdrop - Clicking cancels, never confirms */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-xs"
          onClick={onCancel}
          aria-hidden="true"
        />

        {/* Modal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="relative bg-white rounded-2xl max-w-md w-full p-6 border border-gray-200 shadow-2xl z-10 my-8 flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header with Icon and Close Button */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div 
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                  isDestructive 
                    ? 'bg-red-50 text-red-600 border-red-200' 
                    : isWarning 
                      ? 'bg-amber-50 text-amber-600 border-amber-200'
                      : 'bg-orange-50 text-primary border-orange-200'
                }`}
              >
                {isDestructive ? (
                  <AlertTriangle size={20} className="stroke-[2.2]" />
                ) : (
                  <AlertCircle size={20} className="stroke-[2.2]" />
                )}
              </div>
              <h2 id="confirm-modal-title" className="text-lg font-black text-dark tracking-tight">
                {options.title}
              </h2>
            </div>
            
            <button
              type="button"
              onClick={onCancel}
              className="text-gray-400 hover:text-dark hover:bg-gray-100 p-1.5 rounded-lg transition-colors"
              aria-label="Close dialog"
            >
              <X size={18} />
            </button>
          </div>

          {/* Description / Message */}
          <div id="confirm-modal-desc" className="text-sm text-gray-600 leading-relaxed mb-6">
            {options.message}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 rounded-lg font-bold text-xs sm:text-sm text-gray-700 bg-gray-100 hover:bg-gray-200 active:scale-[0.98] transition-all"
            >
              {cancelText}
            </button>
            <button
              ref={confirmBtnRef}
              type="button"
              onClick={onConfirm}
              className={`px-5 py-2.5 rounded-lg font-bold text-xs sm:text-sm text-white shadow-sm active:scale-[0.98] transition-all ${
                isDestructive
                  ? 'bg-red-600 hover:bg-red-700 focus:ring-2 focus:ring-red-400/50'
                  : 'bg-dark hover:bg-primary focus:ring-2 focus:ring-dark/30'
              }`}
            >
              {confirmText}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ConfirmModal;
