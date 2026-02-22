
import React from 'react';
import { Modal } from './Modal';
import type { Movement } from '../types';
import { exportInventoryToExcel } from '../utils/excelExport';

interface InitialInventoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    inventory: Movement[];
    year: string;
}

export const InitialInventoryModal: React.FC<InitialInventoryModalProps> = ({ isOpen, onClose, inventory, year }) => {
    
    const handleExport = () => {
        exportInventoryToExcel(inventory, year);
    };

    return (
        <Modal
            title={`Inventario Iniziale Magazzino - 01/01/${year}`}
            isOpen={isOpen}
            onClose={onClose}
            size="xl"
        >
            <div className="printable-modal-content">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-300">
                        <thead className="text-xs text-brew-dark uppercase bg-brew-accent">
                            <tr>
                                <th scope="col" className="px-4 py-3">TIPOLOGIA</th>
                                <th scope="col" className="px-4 py-3">NOME PRODOTTO</th>
                                <th scope="col" className="px-4 py-3">MARCA</th>
                                <th scope="col" className="px-4 py-3">GIACENZA INIZIALE</th>
                            </tr>
                        </thead>
                        <tbody>
                            {inventory
                                .sort((a, b) => a.TIPOLOGIA.localeCompare(b.TIPOLOGIA) || a.NOME.localeCompare(b.NOME))
                                .map((item, index) => (
                                    <tr key={index} className="border-b border-slate-700">
                                        <td className="px-4 py-2">{item.TIPOLOGIA}</td>
                                        <td className="px-4 py-2 font-medium">{item.NOME}</td>
                                        <td className="px-4 py-2">{item.MARCA}</td>
                                        <td className="px-4 py-2 font-bold">{item.KG_LITRI_PZ.toFixed(2)}</td>
                                    </tr>
                                ))
                            }
                        </tbody>
                    </table>
                    {inventory.length === 0 && (
                        <p className="text-center text-slate-400 mt-8">Nessun dato di inventario iniziale trovato.</p>
                    )}
                </div>
            </div>
            <div className="pt-6 flex justify-end no-print">
                <button
                    onClick={handleExport}
                    className="bg-brew-green text-white font-bold py-2 px-6 rounded-md hover:bg-opacity-80 transition-all"
                >
                    Esporta in Excel
                </button>
            </div>
        </Modal>
    );
};