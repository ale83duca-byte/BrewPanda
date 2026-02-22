
import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { getYears, createNewYear as createYearService } from '../services/dataService';
import { useToast } from '../hooks/useToast';

interface NewYearModalProps {
    onClose: () => void;
    onYearCreated: () => Promise<any>;
}

export const NewYearModal: React.FC<NewYearModalProps> = ({ onClose, onYearCreated }) => {
    const [newYear, setNewYear] = useState<string>((new Date().getFullYear() + 1).toString());
    const [importFromYear, setImportFromYear] = useState<string>('');
    const [availableYears, setAvailableYears] = useState<string[]>([]);
    const [importInventory, setImportInventory] = useState(true);
    const { showToast } = useToast();

    useEffect(() => {
        const fetchYears = async () => {
            const years = await getYears();
            setAvailableYears(years);
            if (years.length > 0) {
                const lastYear = Math.max(...years.map(Number)).toString();
                setImportFromYear(lastYear);
            }
        };
        fetchYears();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!/^\d{4}$/.test(newYear)) {
            showToast("Per favore, inserisci un anno valido (4 cifre).", "error");
            return;
        }
        
        const success = await createYearService(newYear, importInventory ? importFromYear : undefined);
        if (success) {
            showToast(`Anno ${newYear} creato con successo!`, 'success');
            await onYearCreated();
            onClose();
        } else {
             showToast(`L'anno ${newYear} esiste già!`, "error");
        }
    };

    return (
        <Modal title="Crea Nuovo Anno" isOpen={true} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="new-year" className="block text-sm font-medium text-gray-300 mb-1">
                        Anno da creare
                    </label>
                    <input
                        type="text"
                        id="new-year"
                        value={newYear}
                        onChange={(e) => setNewYear(e.target.value)}
                        className="w-full bg-brew-dark p-2 rounded-md border border-slate-600 focus:ring-brew-accent focus:border-brew-accent"
                        required
                    />
                </div>
                <div className="flex items-start">
                    <div className="flex items-center h-5">
                        <input
                            id="import-inventory"
                            type="checkbox"
                            checked={importInventory}
                            onChange={(e) => setImportInventory(e.target.checked)}
                            className="focus:ring-brew-accent h-4 w-4 text-brew-blue bg-brew-dark border-gray-600 rounded"
                        />
                    </div>
                    <div className="ml-3 text-sm">
                        <label htmlFor="import-inventory" className="font-medium text-gray-300">
                            Importa inventario dall'anno precedente
                        </label>
                        <p className="text-gray-500">Importa le giacenze finali come inventario iniziale.</p>
                    </div>
                </div>

                {importInventory && availableYears.length > 0 && (
                     <div>
                        <label htmlFor="import-from-year" className="block text-sm font-medium text-gray-300 mb-1">
                            Importa da anno
                        </label>
                        <select
                            id="import-from-year"
                            value={importFromYear}
                            onChange={(e) => setImportFromYear(e.target.value)}
                             className="w-full bg-brew-dark p-2 rounded-md border border-slate-600 focus:ring-brew-accent focus:border-brew-accent"
                        >
                            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                    </div>
                )}
                
                <div className="pt-4 flex justify-end">
                    <button
                        type="submit"
                        className="bg-brew-green text-white font-bold py-2 px-4 rounded-md hover:bg-opacity-80 transition-all"
                    >
                        Crea Anno
                    </button>
                </div>
            </form>
        </Modal>
    );
};