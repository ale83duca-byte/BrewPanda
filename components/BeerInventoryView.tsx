import React, { useState, useEffect, useCallback } from 'react';
import { getBreweryData, saveDataToSheet } from '../services/dataService';
// FIX: Import BeerStockItem from shared types and remove local definition for consistency.
import type { BeerMovement, BeerInventoryCheck, BeerInventoryCheckItem, BeerStockItem } from '../types';
import { useToast } from '../hooks/useToast';
import { CONFIG_PACKAGING } from '../constants';
import { PlusIcon } from './icons';

interface BeerInventoryViewProps {
    selectedYear: string;
    onRefresh: () => void;
}

// FIX: Change component to React.FC to correctly handle the 'key' prop.
const PastCheckItem: React.FC<{ check: BeerInventoryCheck }> = ({ check }) => {
    const [isOpen, setIsOpen] = useState(false);
    const discrepancies = check.items.filter(i => i.discrepanza !== 0);

    return (
        <div className="bg-brew-dark rounded-md">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex justify-between items-center p-3 text-left hover:bg-slate-700/50 rounded-md">
                <div>
                    <span className="font-bold text-lg text-brew-accent">Controllo del {check.date}</span>
                    <span className="text-sm text-slate-400 ml-4">({discrepancies.length} discrepanze)</span>
                </div>
                <span className={`transform transition-transform text-2xl ${isOpen ? 'rotate-180' : ''}`}>▾</span>
            </button>
            {isOpen && (
                <div className="p-3 border-t border-slate-600">
                    <h4 className="font-semibold mb-2">Dettaglio Discrepanze Rilevate</h4>
                    {discrepancies.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead className="text-slate-400">
                                    <tr>
                                        <th className="p-1 text-left">Birra (Formato)</th>
                                        <th className="p-1 text-left">Lotto</th>
                                        <th className="p-1 text-right">Calcolata</th>
                                        <th className="p-1 text-right">Fisica</th>
                                        <th className="p-1 text-right">Discrepanza</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {discrepancies.map((item, index) => (
                                        <tr key={index} className="border-t border-slate-700">
                                            <td className="p-1">{item.nomeBirra} ({item.formato})</td>
                                            <td className="p-1">{item.lotto}</td>
                                            <td className="p-1 text-right">{item.quantitaCalcolata}</td>
                                            <td className="p-1 text-right">{item.quantitaFisica}</td>
                                            <td className={`p-1 text-right font-bold ${item.discrepanza > 0 ? 'text-green-400' : 'text-red-400'}`}>
                                                {item.discrepanza > 0 ? `+${item.discrepanza}`: item.discrepanza}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : <p className="text-sm text-slate-400">Nessuna discrepanza rilevata in questo controllo.</p>}
                </div>
            )}
        </div>
    );
};

export const BeerInventoryView: React.FC<BeerInventoryViewProps> = ({ selectedYear, onRefresh }) => {
    
    const { showToast } = useToast();
    const [isLoading, setIsLoading] = useState(true);
    const [view, setView] = useState<'list' | 'check'>('list');
    
    const [stock, setStock] = useState<BeerStockItem[]>([]);
    const [physicalCounts, setPhysicalCounts] = useState<Record<string, string>>({});
    const [pastChecks, setPastChecks] = useState<BeerInventoryCheck[]>([]);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        const data = await getBreweryData(selectedYear);
        if (data) {
            setPastChecks((data.BEER_INVENTORY_CHECKS || []).sort((a,b) => new Date(b.date.split('/').reverse().join('-')).getTime() - new Date(a.date.split('/').reverse().join('-')).getTime()));

            const stockMap = new Map<string, BeerStockItem>();
            const lottoInfo = new Map<string, { clientName: string, beerName: string }>();
            data.COTTE_HEAD.forEach(c => lottoInfo.set(c.LOTTO, { clientName: c.CLIENTE, beerName: c.NOME_BIRRA }));

            (data.BEER_WAREHOUSE_INITIAL || []).forEach(item => {
                const key = `${item.cliente}|${item.nomeBirra}|${item.lotto}|${item.formato}`;
                stockMap.set(key, { ...item });
            });
            (data.CONFEZIONAMENTO || []).forEach(pkg => {
                 const info = lottoInfo.get(pkg.LOTTO_PROD);
                 if (info) {
                    const key = `${info.clientName}|${info.beerName}|${pkg.LOTTO_PROD}|${pkg.FORMATO}`;
                    const existing = stockMap.get(key);
                    if (existing) {
                        existing.quantita += pkg.QTA_UNITA;
                    } else {
                        stockMap.set(key, { cliente: info.clientName, nomeBirra: info.beerName, lotto: pkg.LOTTO_PROD, formato: pkg.FORMATO, quantita: pkg.QTA_UNITA, dataScadenza: pkg.DATA_SCADENZA });
                    }
                 }
            });
            (data.BEER_MOVEMENTS || []).forEach(mov => {
                const key = `${mov.cliente}|${mov.nomeBirra}|${mov.lotto}|${mov.formato}`;
                const existing = stockMap.get(key);
                if (existing) {
                    existing.quantita += mov.quantita;
                }
            });

            const aggregatedStock = Array.from(stockMap.values())
                .filter(item => item.quantita > 0)
                .sort((a,b) => a.cliente.localeCompare(b.cliente) || a.nomeBirra.localeCompare(b.nomeBirra));

            setStock(aggregatedStock);
            const initialCounts: Record<string, string> = {};
            aggregatedStock.forEach(item => {
                const key = `${item.cliente}|${item.nomeBirra}|${item.lotto}|${item.formato}`;
                
                const config = CONFIG_PACKAGING[item.formato];
                if (config && item.formato.includes('BOTT') && config.pezziPerCartone > 0) {
                     initialCounts[key] = String(Math.floor(item.quantita / config.pezziPerCartone));
                } else {
                    initialCounts[key] = String(item.quantita);
                }
            });
            setPhysicalCounts(initialCounts);
        }
        setIsLoading(false);
    }, [selectedYear]);

    useEffect(() => { loadData(); }, [loadData]);
    
    const handleCountChange = (key: string, value: string) => {
        if (/^\d*$/.test(value)) {
            setPhysicalCounts(prev => ({ ...prev, [key]: value }));
        }
    };
    
    const handleSaveCheck = async () => {
        const adjustments: BeerMovement[] = [];
        const today = new Date();
        const checkId = `INV_${today.getFullYear()}_${String(today.getMonth() + 1).padStart(2, '0')}`;
        const formattedDate = today.toLocaleDateString('it-IT');
        const checkItems: BeerInventoryCheckItem[] = [];

        for (const item of stock) {
             const key = `${item.cliente}|${item.nomeBirra}|${item.lotto}|${item.formato}`;
             const physicalCountInput = parseInt(physicalCounts[key] || '0', 10);
             const calculatedQty = item.quantita;
             
             let physicalCountInUnits = physicalCountInput;
             const config = CONFIG_PACKAGING[item.formato];
             if (config && item.formato.includes('BOTT') && config.pezziPerCartone > 0) {
                 physicalCountInUnits = physicalCountInput * config.pezziPerCartone;
             }
             const difference = physicalCountInUnits - calculatedQty;
             
             checkItems.push({
                 cliente: item.cliente, nomeBirra: item.nomeBirra, lotto: item.lotto, formato: item.formato,
                 quantitaCalcolata: calculatedQty, quantitaFisica: physicalCountInUnits, discrepanza: difference
             });

             if (difference !== 0) {
                 adjustments.push({
                     id: `ADJ_${Date.now()}_${adjustments.length}`, data: formattedDate, type: 'ADJUSTMENT',
                     cliente: item.cliente, nomeBirra: item.nomeBirra, lotto: item.lotto, formato: item.formato,
                     quantita: difference, relatedDocId: `INVENTORY_${checkId}`
                 });
             }
        }
        
        const newCheck: BeerInventoryCheck = { id: checkId, date: formattedDate, items: checkItems };
        const data = await getBreweryData(selectedYear);
        if (!data) return;
        
        const existingChecks = data.BEER_INVENTORY_CHECKS || [];
        if (existingChecks.some(c => c.id === checkId)) {
            if (!window.confirm("Esiste già un controllo per questo mese. Vuoi sovrascriverlo? L'operazione non può essere annullata.")) return;
        }
        
        const updatedMovements = (data.BEER_MOVEMENTS || []).filter(mov => mov.relatedDocId !== `INVENTORY_${checkId}`);
        if (adjustments.length > 0) {
            updatedMovements.push(...adjustments);
        }
        
        const updatedChecks = existingChecks.filter(c => c.id !== checkId);
        updatedChecks.push(newCheck);

        await saveDataToSheet(selectedYear, 'BEER_INVENTORY_CHECKS', updatedChecks);
        await saveDataToSheet(selectedYear, 'BEER_MOVEMENTS', updatedMovements);

        showToast("Controllo inventariale salvato e magazzino aggiornato!", 'success');
        setView('list');
        onRefresh();
        loadData();
    };

    if (isLoading) return <p>Caricamento inventario...</p>;
    
    if (view === 'list') {
        return (
             <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-brew-accent">Storico Controlli Inventariali</h2>
                    <button onClick={() => { loadData(); setView('check'); }} className="flex items-center gap-2 bg-brew-green text-white font-bold py-2 px-4 rounded-md hover:bg-opacity-90">
                        <PlusIcon className="w-5 h-5" /> Avvia Nuovo Controllo
                    </button>
                </div>
                {pastChecks.length > 0 ? (
                    <div className="space-y-2">
                        {pastChecks.map(check => <PastCheckItem key={check.id} check={check} />)}
                    </div>
                ) : (
                    <p className="text-center text-slate-400 mt-8 py-4">Nessun controllo inventariale salvato per questo anno.</p>
                )}
            </div>
        );
    }

    return (
        <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-brew-accent">Controllo Inventario - {new Date().toLocaleDateString('it-IT')}</h2>
            </div>
             <div className="overflow-x-auto max-h-[70vh]">
                <table className="w-full text-sm text-left text-gray-300">
                    <thead className="text-xs text-brew-dark uppercase bg-brew-accent sticky top-0">
                        <tr>
                            <th className="px-3 py-3">Cliente</th>
                            <th className="px-3 py-3">Birra</th>
                            <th className="px-3 py-3">Lotto</th>
                            <th className="px-3 py-3">Formato</th>
                            <th className="px-3 py-3 text-right">Q.tà Calcolata (Pz)</th>
                            <th className="px-3 py-3 text-center">Q.tà Fisica (Cartoni/Pz)</th>
                            <th className="px-3 py-3 text-right">Discrepanza</th>
                        </tr>
                    </thead>
                    <tbody>
                        {stock.map(item => {
                            const key = `${item.cliente}|${item.nomeBirra}|${item.lotto}|${item.formato}`;
                            const physicalCountInput = parseInt(physicalCounts[key] || '0', 10);
                            const config = CONFIG_PACKAGING[item.formato];
                            const physicalCountInUnits = (config && item.formato.includes('BOTT') && config.pezziPerCartone > 0) ? physicalCountInput * config.pezziPerCartone : physicalCountInput;
                            const difference = physicalCountInUnits - item.quantita;
                            return (
                                <tr key={key} className="border-b border-slate-700">
                                    <td className="px-3 py-2">{item.cliente}</td>
                                    <td className="px-3 py-2 font-semibold">{item.nomeBirra}</td>
                                    <td className="px-3 py-2 text-brew-accent">{item.lotto}</td>
                                    <td className="px-3 py-2">{item.formato}</td>
                                    <td className="px-3 py-2 text-right font-bold">{item.quantita}</td>
                                    <td className="px-3 py-2 text-center">
                                        <input 
                                            type="text" 
                                            value={physicalCounts[key] || ''}
                                            onChange={e => handleCountChange(key, e.target.value)}
                                            className="w-32 bg-brew-dark p-1 rounded-md border border-slate-600 text-center"
                                            placeholder={item.formato.includes('BOTT') ? 'Cartoni' : 'Pezzi'}
                                        />
                                    </td>
                                    <td className={`px-3 py-2 text-right font-bold ${difference > 0 ? 'text-green-400' : difference < 0 ? 'text-red-400' : ''}`}>
                                        {difference !== 0 ? (difference > 0 ? `+${difference}`: difference) : '-'}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
             </div>
             <div className="mt-6 flex justify-between">
                <button onClick={() => setView('list')} className="px-4 py-2 rounded-md bg-slate-600 font-semibold hover:bg-slate-500">Annulla</button>
                <button onClick={handleSaveCheck} className="px-6 py-3 rounded-md bg-brew-green font-bold text-lg hover:bg-opacity-90">
                    Salva Controllo e Aggiorna Inventario
                </button>
             </div>
        </div>
    );
};