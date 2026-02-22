import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { getBreweryData, saveDataToSheet } from '../services/dataService';
import type { Cliente, Birra, InitialBeerStock, BreweryData } from '../types';
import { CONFIG_PACKAGING } from '../constants';
import { useToast } from '../hooks/useToast';
import { PlusIcon, TrashIcon } from './icons';

interface InitialBeerStockModalProps {
    selectedYear: string;
    onClose: () => void;
}

const emptyRow = { cliente: '', nomeBirra: '', lotto: '', formato: '', quantita: '', dataScadenza: '' }; // quantita can be cartons or pieces

export const InitialBeerStockModal: React.FC<InitialBeerStockModalProps> = ({ selectedYear, onClose }) => {
    const [rows, setRows] = useState([emptyRow]);
    const [clienti, setClienti] = useState<Cliente[]>([]);
    const [birre, setBirre] = useState<Birra[]>([]);
    const { showToast } = useToast();

    useEffect(() => {
        const loadData = async () => {
            const data = await getBreweryData(selectedYear);
            if(data) {
                setClienti(data.CLIENTI || []);
                setBirre(data.BIRRE || []);
            }
        };
        loadData();
    }, [selectedYear]);

    const handleRowChange = (index: number, field: keyof typeof emptyRow, value: string) => {
        const newRows = [...rows];
        newRows[index] = { ...newRows[index], [field]: value };
        if(field === 'cliente') {
            newRows[index].nomeBirra = '';
        }
        setRows(newRows);
    };

    const addRow = () => setRows([...rows, emptyRow]);
    const removeRow = (index: number) => setRows(rows.filter((_, i) => i !== index));

    const handleSave = async () => {
        const newStockItems: InitialBeerStock[] = [];
        for (const row of rows) {
             if (Object.values(row).every(v => v === '')) continue; // Skip empty rows

            if (!row.cliente || !row.nomeBirra || !row.lotto || !row.formato || !row.quantita || !row.dataScadenza) {
                showToast("Tutti i campi sono obbligatori per ogni riga inserita.", 'error');
                return;
            }
            const inputQuantity = parseInt(row.quantita);
            if (isNaN(inputQuantity) || inputQuantity <= 0) {
                 showToast(`Quantità non valida per la riga: ${row.nomeBirra}`, 'error');
                 return;
            }
            
            let finalQuantity = inputQuantity;
            const config = CONFIG_PACKAGING[row.formato];
            if (config && row.formato.includes('BOTT') && config.pezziPerCartone > 0) {
                finalQuantity = inputQuantity * config.pezziPerCartone;
            }

            const [year, month, day] = row.dataScadenza.split('-');

            newStockItems.push({
                cliente: row.cliente,
                nomeBirra: row.nomeBirra,
                lotto: row.lotto.toUpperCase(),
                formato: row.formato,
                quantita: finalQuantity,
                dataScadenza: `${day}/${month}/${year}`
            });
        }

        if (newStockItems.length === 0) {
            onClose();
            return;
        }
        
        const data = await getBreweryData(selectedYear) as BreweryData;
        const existingStock = data?.BEER_WAREHOUSE_INITIAL || [];
        const updatedStock = [...existingStock, ...newStockItems];
        await saveDataToSheet(selectedYear, 'BEER_WAREHOUSE_INITIAL', updatedStock);
        showToast("Giacenze iniziali caricate con successo!", 'success');
        onClose();
    };

    const getBirreForCliente = (clienteNome: string) => {
        const cliente = clienti.find(c => c.nome === clienteNome);
        return cliente ? birre.filter(b => b.clienteId === cliente.id) : [];
    };
    
    return (
        <Modal title="Carica Giacenze Iniziali Birra Finita" isOpen={true} onClose={onClose} size="5xl">
            <div className="space-y-4">
                <p className="text-sm text-slate-400">
                    Usa questo modulo per caricare il magazzino di birra finita per la prima volta. 
                    Questi dati serviranno come punto di partenza per l'anno corrente.
                </p>
                <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
                    {rows.map((row, index) => (
                        <div key={index} className="grid grid-cols-[2fr_2fr_1.5fr_2fr_1.5fr_1.5fr_auto] gap-x-4 items-end pb-3 border-b border-slate-700">
                           <Field label={index === 0 ? "Cliente" : ""}>
                                <select value={row.cliente} onChange={e => handleRowChange(index, 'cliente', e.target.value)} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600">
                                    <option value="">Seleziona...</option>
                                    {clienti.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                                </select>
                           </Field>
                           <Field label={index === 0 ? "Nome Birra" : ""}>
                                <select value={row.nomeBirra} onChange={e => handleRowChange(index, 'nomeBirra', e.target.value)} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600" disabled={!row.cliente}>
                                    <option value="">Seleziona...</option>
                                    {getBirreForCliente(row.cliente).map(b => <option key={b.id} value={b.nomeBirra}>{b.nomeBirra}</option>)}
                                </select>
                           </Field>
                           <Field label={index === 0 ? "Lotto" : ""}><Input value={row.lotto} onChange={v => handleRowChange(index, 'lotto', v)}/></Field>
                            <Field label={index === 0 ? "Formato" : ""}>
                                <select value={row.formato} onChange={e => handleRowChange(index, 'formato', e.target.value)} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600">
                                    <option value="">Seleziona...</option>
                                    {Object.keys(CONFIG_PACKAGING).map(f=><option key={f} value={f}>{f}</option>)}
                                </select>
                           </Field>
                           <Field label={index === 0 ? (row.formato.includes('BOTT') ? 'Q.tà Cartoni' : 'Q.tà Pezzi') : ""}>
                               <Input value={row.quantita} onChange={v => handleRowChange(index, 'quantita', v)} type="number"/>
                           </Field>
                           <Field label={index === 0 ? "Scadenza" : ""}><Input value={row.dataScadenza} onChange={v => handleRowChange(index, 'dataScadenza', v)} type="date"/></Field>
                           <button onClick={() => removeRow(index)} className="p-2 text-red-500 hover:text-red-400"><TrashIcon className="w-5 h-5"/></button>
                        </div>
                    ))}
                </div>
                <button onClick={addRow} className="flex items-center px-2 py-1 bg-brew-blue rounded-md text-xs hover:bg-opacity-80"><PlusIcon className="w-4 h-4 mr-1"/>Aggiungi Riga</button>
                 <div className="pt-5 flex justify-end">
                    <button onClick={handleSave} className="bg-brew-green text-white font-bold py-2 px-6 rounded-md hover:bg-opacity-80 transition-all">
                        Salva Giacenze
                    </button>
                </div>
            </div>
        </Modal>
    );
};


const Field: React.FC<{label: string, children: React.ReactNode}> = ({ label, children }) => (
    <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">{label || '\u00A0'}</label>
        {children}
    </div>
);

const Input = (props: { value: string; onChange: (val: string) => void; type?: string; }) => (
    <input
        type={props.type || "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full bg-brew-dark p-2 rounded-md border border-slate-600"
    />
);
