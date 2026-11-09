import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import ConfirmModal, { ConfirmModalOptions } from '../components/ConfirmModal';

type ConfirmFunction = (options: ConfirmModalOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFunction>(() => Promise.resolve(false));

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    options: ConfirmModalOptions | null;
  }>({
    isOpen: false,
    options: null
  });

  const resolverRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmModalOptions): Promise<boolean> => {
    // If a modal was somehow still unresolved, resolve it as cancelled first
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
      setModalState({
        isOpen: true,
        options
      });
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (resolverRef.current) {
      resolverRef.current(true);
      resolverRef.current = null;
    }
    setModalState({ isOpen: false, options: null });
  }, []);

  const handleCancel = useCallback(() => {
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }
    setModalState({ isOpen: false, options: null });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmModal
        isOpen={modalState.isOpen}
        options={modalState.options}
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => useContext(ConfirmContext);
