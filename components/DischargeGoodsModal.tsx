
import React, { useState, useMemo, useEffect } from 'react';
import { Modal } from './Modal';
import { addMovementsAndSync, getBreweryData } from '../services/dataService';
import type { Movement, WarehouseItem, RawWarehouseItem } from '../types';
import { TIPOLOGIE_PRODOTTI } from '../constants';
import { useToast } from '../hooks/useToast';

interface DischargeGoodsModalProps {
    selectedYear: string;
    onClose: () => void;
}

export const DischargeGoodsModal: React.FC<DischargeGoodsModalProps> = ({ selectedYear, onClose }) => {
    const [tipologia, setTipologia] = useState('');
    const [nome, setNome] = useState('');
    const [lottoFornitore, setLottoFornitore] = useState('');
    const [qta, setQta] = useState('');
    const [causale, setCausale] = useState('');
    const { showToast } = useToast();

    const [allMovements, setAllMovements] = useState<Movement[]>([]);
    const [warehouseStock, setWarehouseStock] = useState<WarehouseItem[]>([]);

     useEffect(() => {
        const loadData = async () => {
            const data = await getBreweryData(selectedYear);
            if (!data) return;
            setAllMovements(data.MOVIMENTAZIONE);
            const stockMap = new Map<string, WarehouseItem>();
            (data.MAGAZZINO as RawWarehouseItem[]).forEach(item => {
                const key = `${item.TIPOLOGIA}|${item.NOME}`;
                const existing = stockMap.get(key) || { TIPOLOGIA: item.TIPOLOGIA, NOME: item.NOME, GIACENZA: 0 };
                existing.GIACENZA += item.GIACENZA;
                stockMap.set(key, existing);
            });
            setWarehouseStock(Array.from(stockMap.values()));
        };
        loadData();
    }, [selectedYear]);

     const ingredientLotsStock = useMemo(() => {
        const stock: Record<string, { lotto: string; giacenza: number; marca: string; fornitore: string }[]> = {};
        const lotStockMap: Record<string, number> = {};
        const lotDetailsMap: Record<string, { nome: string; marca: string; fornitore: string }> = {};

        allMovements.forEach(m => {
            if (m.NOME && m.LOTTO_FORNITORE) {
                const key = `${m.NOME.toUpperCase().trim()}|${m.LOTTO_FORNITORE.toUpperCase().trim()}`;
                lotStockMap[key] = (lotStockMap[key] || 0) + m.KG_LITRI_PZ;
                if(m.KG_LITRI_PZ > 0 && !lotDetailsMap[key]) {
                    lotDetailsMap[key] = { nome: m.NOME, marca: m.MARCA, fornitore: m.FORNITORE };
                }
            }
        });
        
        Object.entries(lotStockMap).forEach(([key, giacenza]) => {
            if (giacenza >= 0.01) {
                const [nome, lotto] = key.split('|');
                const details = lotDetailsMap[key] || { nome, marca: 'N/D', fornitore: 'N/D' };
                if (!stock[nome]) stock[nome] = [];
                stock[nome].push({ lotto, giacenza, ...details });
            }
        });
        return stock;
    }, [allMovements]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const quantity = parseFloat(qta.replace(',', '.'));
        if (!tipologia || !nome || !lottoFornitore || isNaN(quantity) || quantity <= 0) {
            showToast("Tutti i campi sono obbligatori e la quantità deve essere valida.", 'error');
            return;
        }

        const upperNome = nome.toUpperCase();
        const upperLotto = lottoFornitore.toUpperCase();
        const availableLots = ingredientLotsStock[upperNome] || [];
        const selectedLot = availableLots.find(l => l.lotto === upperLotto);

        if (!selectedLot) {
            showToast(`Lotto fornitore "${lottoFornitore}" non trovato per il prodotto "${nome}".`, 'error');
            return;
        }

        if (quantity > selectedLot.giacenza) {
            showToast(`Quantità insufficiente in magazzino per il lotto ${lottoFornitore}. Disponibili: ${selectedLot.giacenza}, Richiesti: ${quantity}`, 'error');
            return;
        }

        const newMovement: Movement = {
            DATA: new Date().toLocaleDateString('it-IT'),
            TIPOLOGIA: tipologia,
            NOME: nome,
            MARCA: selectedLot.marca,
            FORNITORE: selectedLot.fornitore,
            KG_LITRI_PZ: -parseFloat(quantity.toFixed(2)),
            N_FATTURA: `SCARICO_GENERICO_${Date.now()}`,
            LOTTO_FORNITORE: lottoFornitore,
            LOTTO_PRODUZIONE: causale || 'SCARICO GENERICO',
        };

        await addMovementsAndSync(selectedYear, [newMovement]);
        showToast("Scarico registrato con successo!", 'success');
        onClose();
    };

    return (
        <Modal title={`Scarico Merce Generico - ${selectedYear}`} isOpen={true} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-3">
                <Field label="Tipologia">
                     <select value={tipologia} onChange={(e) => {setTipologia(e.target.value); setNome(''); setLottoFornitore('');}} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600" required>
                        <option value="">Seleziona...</option>
                        {TIPOLOGIE_PRODOTTI.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </Field>
                 <Field label="Nome Prodotto">
                     <select value={nome} onChange={(e) => {setNome(e.target.value); setLottoFornitore('');}} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600" required disabled={!tipologia}>
                        <option value="">Seleziona...</option>
                        {warehouseStock.filter(s => s.TIPOLOGIA === tipologia).map(s => <option key={s.NOME} value={s.NOME}>{s.NOME}</option>)}
                    </select>
                </Field>
                <Field label="Lotto Fornitore">
                     <select value={lottoFornitore} onChange={(e) => setLottoFornitore(e.target.value)} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600" required disabled={!nome}>
                        <option value="">Seleziona Lotto...</option>
                        {(ingredientLotsStock[nome.toUpperCase()] || []).map(l => <option key={l.lotto} value={l.lotto}>{`${l.lotto} (Giac: ${l.giacenza.toFixed(2)})`}</option>)}
                    </select>
                </Field>
                <Field label="Quantità da Scaricare"><Input value={qta} onChange={setQta} required type="text" pattern="[0-9.,]*" /></Field>
                <Field label="Causale (opzionale)"><Input value={causale} onChange={setCausale} placeholder="Es. Rottura, Campionatura..." /></Field>

                <div className="pt-5 flex justify-end">
                    <button type="submit" className="bg-brew-red text-white font-bold py-2 px-6 rounded-md hover:bg-opacity-80 transition-all">
                        Registra Scarico
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
    return <input {...rest} value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600" />;
};