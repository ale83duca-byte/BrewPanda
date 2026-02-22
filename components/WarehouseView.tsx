import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getBreweryData, updatePriceInDb } from '../services/dataService';
import type { PriceDBItem, RawWarehouseItem } from '../types';
import { TIPOLOGIE_PRODOTTI } from '../constants';
import { useToast } from '../hooks/useToast';

interface WarehouseViewProps {
    selectedYear: string;
}

interface DetailedWarehouseItem {
    TIPOLOGIA: string;
    NOME: string;
    MARCA: string;
    FORNITORE: string;
    GIACENZA: number;
}

const ALL_CATEGORIES = "TUTTO";

export const WarehouseView: React.FC<WarehouseViewProps> = ({ selectedYear }) => {
    const [rawWarehouse, setRawWarehouse] = useState<RawWarehouseItem[]>([]);
    const [priceDb, setPriceDb] = useState<PriceDBItem[]>([]);
    const [filter, setFilter] = useState<string>(ALL_CATEGORIES);
    const [editingItemKey, setEditingItemKey] = useState<string | null>(null);
    const [editingPrice, setEditingPrice] = useState('');
    const { showToast } = useToast();
    const [refreshKey, setRefreshKey] = useState(0);

    const loadData = useCallback(async () => {
        const data = await getBreweryData(selectedYear);
        if (data) {
            setRawWarehouse(data.MAGAZZINO || []);
            setPriceDb(data.PRICE_DATABASE || []);
        }
    }, [selectedYear]);

    useEffect(() => {
        loadData();
    }, [selectedYear, refreshKey, loadData]);

    const detailedWarehouse: DetailedWarehouseItem[] = useMemo(() => {
        const filteredData = filter === ALL_CATEGORIES 
            ? rawWarehouse 
            : rawWarehouse.filter(item => item.TIPOLOGIA === filter);
        
        return filteredData
            .filter((item: RawWarehouseItem) => item.GIACENZA >= 0.01)
            .sort((a: RawWarehouseItem, b: RawWarehouseItem) => a.TIPOLOGIA.localeCompare(b.TIPOLOGIA) || a.NOME.localeCompare(b.NOME));

    }, [rawWarehouse, filter]);

    const totalQuantity = useMemo(() => {
        if (filter === ALL_CATEGORIES) {
            return null;
        }
        return detailedWarehouse.reduce((sum, item) => sum + item.GIACENZA, 0);
    }, [detailedWarehouse, filter]);


    const handlePriceClick = (key: string, currentPrice: number | undefined) => {
        setEditingItemKey(key);
        setEditingPrice(currentPrice ? String(currentPrice) : '');
    };

    const handlePriceUpdate = async () => {
        if (!editingItemKey) return;

        const [, nome, marca, fornitore] = editingItemKey.split('|');
        const newPrice = parseFloat(editingPrice.replace(',', '.'));

        if (isNaN(newPrice) || newPrice < 0) {
            showToast("Inserisci un prezzo valido.", 'error');
            return;
        }

        try {
            await updatePriceInDb(selectedYear, { NOME: nome, MARCA: marca, FORNITORE: fornitore }, newPrice);
            showToast(`Prezzo per ${nome} aggiornato a €${newPrice.toFixed(2)}`, 'success');
            setEditingItemKey(null);
            setRefreshKey(prev => prev + 1); // Trigger refresh
        } catch (error) {
            showToast("Errore durante l'aggiornamento del prezzo.", 'error');
        }
    };


    return (
        <div className="bg-brew-dark-secondary p-4 sm:p-6 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
                <h2 className="text-2xl font-bold text-brew-accent">📦 Giacenze e Prezzi Magazzino - {selectedYear}</h2>
                <div className="flex items-center gap-4">
                    {totalQuantity !== null && (
                        <div className="bg-brew-accent text-brew-dark p-2 rounded-lg text-center shadow-md">
                            <p className="text-xs font-bold uppercase">Totale {filter}</p>
                            <p className="text-2xl font-extrabold">{totalQuantity.toFixed(2)}</p>
                        </div>
                    )}
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        className="bg-brew-dark p-2 rounded-md text-brew-light focus:outline-none focus:ring-2 focus:ring-brew-accent h-full"
                    >
                        <option value={ALL_CATEGORIES}>TUTTO</option>
                        {TIPOLOGIE_PRODOTTI.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-300">
                    <thead className="text-xs text-brew-dark uppercase bg-brew-accent">
                        <tr>
                            <th scope="col" className="px-6 py-3">TIPOLOGIA</th>
                            <th scope="col" className="px-6 py-3">NOME PRODOTTO</th>
                            <th scope="col" className="px-6 py-3">MARCA</th>
                            <th scope="col" className="px-6 py-3">FORNITORE</th>
                            <th scope="col" className="px-6 py-3 text-right">GIACENZA</th>
                            <th scope="col" className="px-6 py-3 text-right">PREZZO</th>
                        </tr>
                    </thead>
                    <tbody>
                        {detailedWarehouse.map((item, index) => {
                             const key = `${item.TIPOLOGIA}|${item.NOME}|${item.MARCA}|${item.FORNITORE}`;
                             const priceItem = priceDb.find(p => p.NOME === item.NOME && p.MARCA === item.MARCA && p.FORNITORE === item.FORNITORE);
                             const isEditing = editingItemKey === key;
                            return (
                                <tr key={index} className="border-b border-slate-700 hover:bg-slate-600">
                                    <td className="px-6 py-4">{item.TIPOLOGIA}</td>
                                    <td className="px-6 py-4 font-medium">{item.NOME}</td>
                                    <td className="px-6 py-4">{item.MARCA || '-'}</td>
                                    <td className="px-6 py-4">{item.FORNITORE || '-'}</td>
                                    <td className="px-6 py-4 font-bold text-right">{item.GIACENZA.toFixed(2)}</td>
                                    <td className="px-6 py-4 font-bold text-right cursor-pointer" onClick={() => !isEditing && handlePriceClick(key, priceItem?.PREZZO)}>
                                        {isEditing ? (
                                            <input
                                                type="text"
                                                value={editingPrice}
                                                onChange={(e) => setEditingPrice(e.target.value)}
                                                onBlur={handlePriceUpdate}
                                                onKeyDown={(e) => e.key === 'Enter' && handlePriceUpdate()}
                                                className="w-24 bg-brew-dark p-1 rounded-md border border-brew-accent text-right"
                                                autoFocus
                                            />
                                        ) : (
                                            <span className={priceItem ? 'text-brew-accent' : 'text-gray-400'}>
                                                {priceItem ? `€${priceItem.PREZZO.toFixed(2)}` : 'N/D'}
                                            </span>
                                        )}
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
                {detailedWarehouse.length === 0 && (
                    <p className="text-center text-slate-400 mt-8">Nessun articolo in magazzino per questa categoria.</p>
                )}
            </div>
        </div>
    );
};