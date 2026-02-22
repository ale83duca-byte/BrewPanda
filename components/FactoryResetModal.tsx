
import React from 'react';
import { Modal } from './Modal';

interface FactoryResetModalProps {
    onClose: () => void;
    onConfirm: () => void;
}

export const FactoryResetModal: React.FC<FactoryResetModalProps> = ({ onClose, onConfirm }) => {
    return (
        <Modal
            title="ATTENZIONE: Ripristino di Fabbrica"
            isOpen={true}
            onClose={onClose}
            size="md"
        >
            <div className="space-y-4">
                <p className="text-lg text-yellow-300 font-bold">
                    Sei assolutamente sicuro di voler continuare?
                </p>
                <p className="text-sm text-gray-300">
                    Questa azione cancellerà <strong>TUTTI I DATI</strong> presenti nell'applicazione, inclusi tutti gli anni, le movimentazioni, le cotte, i clienti e le impostazioni.
                </p>
                <p className="text-md font-bold text-red-400">
                    L'operazione è irreversibile.
                </p>
                <div className="flex justify-end gap-4 pt-4">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-md bg-slate-600 text-white font-semibold hover:bg-slate-500"
                    >
                        Annulla
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 rounded-md bg-brew-red text-black font-bold hover:bg-opacity-80"
                    >
                        Sì, Resetta Tutto
                    </button>
                </div>
            </div>
        </Modal>
    );
};
