
import React, { useState, useMemo } from 'react';
import { Modal } from './Modal';
import { addMovementsAndSync } from '../services/dataService';
import type { Movement } from '../types';
import { TIPOLOGIE_PRODOTTI, STD_NOMI_MAGAZZINO } from '../constants';
import { useToast } from '../hooks/useToast';
import { useTranslation } from '../i18n';

interface LoadGoodsModalProps {
    selectedYear: string;
    onClose: () => void;
}

const expirationTypes = ["MALTI", "LUPPOLI", "LIEVITI", "ADDITIVI"];

export const LoadGoodsModal: React.FC<LoadGoodsModalProps> = ({ selectedYear, onClose }) => {
    const [tipologia, setTipologia] = useState('');
    const [nome, setNome] = useState('');
    const [marca, setMarca] = useState('');
    const [fornitore, setFornitore] = useState('');
    const [kgLitriPz, setKgLitriPz] = useState('');
    const [prezzo, setPrezzo] = useState('');
    const [nFattura, setNFattura] = useState('');
    const [lottoFornitore, setLottoFornitore] = useState('');
    const [dataScadenza, setDataScadenza] = useState('');
    const { showToast } = useToast();
    const { t } = useTranslation();
    
    const standardNames = useMemo(() => STD_NOMI_MAGAZZINO[tipologia] || [], [tipologia]);
    const needsExpiration = useMemo(() => expirationTypes.includes(tipologia), [tipologia]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const quantity = parseFloat(kgLitriPz.replace(',', '.'));
        const price = parseFloat(prezzo.replace(',', '.'));

        if (!tipologia || !nome || !kgLitriPz) {
            showToast("Tipologia, Nome e Quantità sono obbligatori.", 'error');
            return;
        }
        if (isNaN(quantity) || quantity <= 0) {
            showToast("La quantità deve essere un numero valido e maggiore di zero.", 'error');
            return;
        }
        if (isNaN(price) || price <= 0) {
            showToast(t('loadGoods.priceRequiredError'), 'error');
            return;
        }
        if (needsExpiration && !dataScadenza) {
            showToast("La data di scadenza è obbligatoria per questa tipologia di prodotto.", 'error');
            return;
        }

        let formattedScadenza = '';
        if (needsExpiration && dataScadenza) { // dataScadenza is 'YYYY-MM-DD'
            const [year, month, day] = dataScadenza.split('-').map(Number);
            formattedScadenza = new Date(year, month - 1, day).toLocaleDateString('it-IT');
        }

        const newMovement: Movement = {
            DATA: new Date().toLocaleDateString('it-IT'),
            TIPOLOGIA: tipologia,
            NOME: nome,
            MARCA: marca,
            FORNITORE: fornitore,
            KG_LITRI_PZ: parseFloat(quantity.toFixed(2)),
            PREZZO: price,
            N_FATTURA: nFattura,
            LOTTO_FORNITORE: lottoFornitore,
            LOTTO_PRODUZIONE: '',
            DATA_SCADENZA: needsExpiration ? formattedScadenza : undefined,
        };

        await addMovementsAndSync(selectedYear, [newMovement]);
        showToast("Carico registrato con successo!", 'success');
        onClose();
    };

    const renderNomeInput = () => {
        if (standardNames.length > 0) {
            return (
                 <select
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full bg-brew-dark p-2 rounded-md border border-slate-600 focus:ring-brew-accent focus:border-brew-accent"
                    required
                >
                    <option value="">Seleziona...</option>
                    {standardNames.map(name => <option key={name} value={name}>{name}</option>)}
                </select>
            );
        }
        return (
             <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full bg-brew-dark p-2 rounded-md border border-slate-600 focus:ring-brew-accent focus:border-brew-accent"
                required
            />
        );
    };

    return (
        <Modal title={`Carico Merce - ${selectedYear}`} isOpen={true} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-3">
                <Field label="Tipologia">
                     <select
                        value={tipologia}
                        onChange={(e) => {setTipologia(e.target.value); setNome('');}}
                        className="w-full bg-brew-dark p-2 rounded-md border border-slate-600 focus:ring-brew-accent focus:border-brew-accent"
                        required
                    >
                        <option value="">Seleziona una tipologia</option>
                        {TIPOLOGIE_PRODOTTI.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </Field>
                 <Field label="Nome Prodotto">{renderNomeInput()}</Field>
                 <Field label="Marca"><Input value={marca} onChange={setMarca} /></Field>
                 <Field label="Fornitore"><Input value={fornitore} onChange={setFornitore} /></Field>
                 <Field label="Kg/Litri/Pz"><Input value={kgLitriPz} onChange={setKgLitriPz} required type="text" pattern="[0-9.,]*" /></Field>
                 {needsExpiration && (
                     <Field label="Data di Scadenza"><Input value={dataScadenza} onChange={setDataScadenza} type="date" required/></Field>
                 )}
                 <Field label="N. Fattura"><Input value={nFattura} onChange={setNFattura} /></Field>
                 <Field label="Lotto Fornitore"><Input value={lottoFornitore} onChange={setLottoFornitore} /></Field>
                 <Field label={t('loadGoods.price')}>
                    <Input 
                        value={prezzo} 
                        onChange={setPrezzo} 
                        required 
                        type="text" 
                        pattern="[0-9.,]*"
                        title={t('loadGoods.priceTooltip')}
                    />
                </Field>

                <div className="pt-5 flex justify-end">
                    <button
                        type="submit"
                        className="bg-brew-green text-white font-bold py-2 px-6 rounded-md hover:bg-opacity-80 transition-all"
                    >
                        Registra Carico
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
            className="w-full bg-brew-dark p-2 rounded-md border border-slate-600 focus:ring-brew-accent focus:border-brew-accent"
        />
    );
};