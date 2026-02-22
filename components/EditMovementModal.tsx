import React, { useState, useMemo } from 'react';
import { Modal } from './Modal';
import { updateMovementAndSync } from '../services/dataService';
import type { Movement } from '../types';
import { TIPOLOGIE_PRODOTTI, STD_NOMI_MAGAZZINO } from '../constants';
import { useToast } from '../hooks/useToast';
import type { MovementWithIndex } from './MovementsView';

interface EditMovementModalProps {
    selectedYear: string;
    movementToEdit: MovementWithIndex;
    onClose: () => void;
}

const expirationTypes = ["MALTI", "LUPPOLI", "LIEVITI", "ADDITIVI"];

export const EditMovementModal: React.FC<EditMovementModalProps> = ({ selectedYear, movementToEdit, onClose }) => {
    const [formData, setFormData] = useState<Omit<Movement, 'DATA_SCADENZA'> & { DATA_SCADENZA?: string }>({
        ...movementToEdit,
        DATA_SCADENZA: movementToEdit.DATA_SCADENZA ? new Date(movementToEdit.DATA_SCADENZA.split('/').reverse().join('-')).toISOString().split('T')[0] : ''
    });

    const { showToast } = useToast();
    
    const standardNames = useMemo(() => STD_NOMI_MAGAZZINO[formData.TIPOLOGIA] || [], [formData.TIPOLOGIA]);
    const needsExpiration = useMemo(() => expirationTypes.includes(formData.TIPOLOGIA), [formData.TIPOLOGIA]);

    const handleInputChange = (field: keyof Movement, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const quantity = parseFloat(String(formData.KG_LITRI_PZ).replace(',', '.'));
        const price = parseFloat(String(formData.PREZZO).replace(',', '.'));

        if (!formData.TIPOLOGIA || !formData.NOME || !formData.KG_LITRI_PZ) {
            showToast("Tipologia, Nome e Quantità sono obbligatori.", 'error');
            return;
        }
        if (isNaN(quantity) || quantity <= 0) {
            showToast("La quantità deve essere un numero valido e maggiore di zero.", 'error');
            return;
        }
        if (isNaN(price) || price <= 0) {
            showToast("Il prezzo deve essere maggiore di zero.", 'error');
            return;
        }
        if (needsExpiration && !formData.DATA_SCADENZA) {
            showToast("La data di scadenza è obbligatoria per questa tipologia di prodotto.", 'error');
            return;
        }

        let formattedScadenza: string | undefined = undefined;
        if (needsExpiration && formData.DATA_SCADENZA) { // formData.DATA_SCADENZA is 'YYYY-MM-DD' from input[type=date]
            const [year, month, day] = formData.DATA_SCADENZA.split('-').map(Number);
            if(year && month && day) {
                formattedScadenza = new Date(year, month - 1, day).toLocaleDateString('it-IT');
            }
        }

        const updatedMovement: Movement = {
            ...formData,
            KG_LITRI_PZ: parseFloat(quantity.toFixed(2)),
            PREZZO: price,
            DATA_SCADENZA: formattedScadenza,
        };
        
        try {
            await updateMovementAndSync(selectedYear, movementToEdit.originalIndex, updatedMovement);
            showToast("Movimento aggiornato con successo!", 'success');
            onClose();
        } catch (error: any) {
            showToast(`Errore: ${error.message}`, 'error');
        }
    };

    return (
        <Modal title={`Modifica Carico Merce - ${selectedYear}`} isOpen={true} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-3">
                 <Field label="Data"><Input value={formData.DATA} onChange={v => handleInputChange('DATA', v)} /></Field>
                 <Field label="Tipologia">
                     <select
                        value={formData.TIPOLOGIA}
                        onChange={(e) => {
                            handleInputChange('TIPOLOGIA', e.target.value);
                            handleInputChange('NOME', '');
                        }}
                        className="w-full bg-brew-dark p-2 rounded-md border border-slate-600"
                        required
                    >
                        {TIPOLOGIE_PRODOTTI.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </Field>
                 <Field label="Nome Prodotto">
                    {standardNames.length > 0 ? (
                         <select
                            value={formData.NOME}
                            onChange={(e) => handleInputChange('NOME', e.target.value)}
                            className="w-full bg-brew-dark p-2 rounded-md border border-slate-600"
                            required
                        >
                            {standardNames.map(name => <option key={name} value={name}>{name}</option>)}
                        </select>
                    ) : (
                         <Input value={formData.NOME} onChange={v => handleInputChange('NOME', v)} required />
                    )}
                 </Field>
                 <Field label="Marca"><Input value={formData.MARCA} onChange={v => handleInputChange('MARCA', v)} /></Field>
                 <Field label="Fornitore"><Input value={formData.FORNITORE} onChange={v => handleInputChange('FORNITORE', v)} /></Field>
                 <Field label="Kg/Litri/Pz"><Input value={String(formData.KG_LITRI_PZ)} onChange={v => handleInputChange('KG_LITRI_PZ', v)} required type="text" pattern="[0-9.,]*" /></Field>
                 {needsExpiration && (
                     <Field label="Data di Scadenza"><Input value={formData.DATA_SCADENZA || ''} onChange={v => handleInputChange('DATA_SCADENZA', v)} type="date" required/></Field>
                 )}
                 <Field label="N. Fattura"><Input value={formData.N_FATTURA} onChange={v => handleInputChange('N_FATTURA', v)} /></Field>
                 <Field label="Lotto Fornitore"><Input value={formData.LOTTO_FORNITORE} onChange={v => handleInputChange('LOTTO_FORNITORE', v)} /></Field>
                 <Field label="Prezzo">
                    <Input 
                        value={String(formData.PREZZO)} 
                        onChange={v => handleInputChange('PREZZO', v)} 
                        required 
                        type="text" 
                        pattern="[0-9.,]*"
                    />
                </Field>

                <div className="pt-5 flex justify-end">
                    <button
                        type="submit"
                        className="bg-brew-green text-white font-bold py-2 px-6 rounded-md hover:bg-opacity-80 transition-all"
                    >
                        Salva Modifiche
                    </button>
                </div>
            </form>
        </Modal>
    );
};

const Field: React.FC<{label: string, children: React.ReactNode}> = ({ label, children }) => (
    <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
        {children}
    </div>
);

const Input = (props: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> & { value: string; onChange: (val: string) => void}) => {
    const { value, onChange, ...rest } = props;
    return (
        <input
            {...rest}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-brew-dark p-2 rounded-md border border-slate-600"
        />
    );
};