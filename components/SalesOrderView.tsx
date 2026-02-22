import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getBreweryData, saveDataToSheet } from '../services/dataService';
import type { Cliente, SalesOrder, BeerMovement } from '../types';
import { useToast } from '../hooks/useToast';
import { PlusIcon, TrashIcon } from './icons';

interface SalesOrderViewProps {
    selectedYear: string;
    onRefresh: () => void;
}

type LocalBeerStockItem = {
    lotto: string;
    formato: string;
    quantita: number;
    dataScadenza: string;
};

type StockByBeer = Record<string, LocalBeerStockItem[]>;
type StockByClient = Record<string, StockByBeer>;

export const SalesOrderView: React.FC<SalesOrderViewProps> = ({ selectedYear, onRefresh }) => {
    
    const { showToast } = useToast();
    const [view, setView] = useState<'dashboard' | 'new'>('dashboard');
    const [isLoading, setIsLoading] = useState(true);
    
    const [orders, setOrders] = useState<SalesOrder[]>([]);
    const [clients, setClients] = useState<Cliente[]>([]);
    const [beerStock, setBeerStock] = useState<StockByClient>({});
    
    const [selectedClient, setSelectedClient] = useState('');
    const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
    const [orderItems, setOrderItems] = useState<{ beerName: string; format: string; quantity: string }[]>([{ beerName: '', format: '', quantity: '' }]);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        const data = await getBreweryData(selectedYear);
        if (data) {
            setClients(data.CLIENTI || []);
            setOrders((data.SALES_ORDERS || []).sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));

            // Calculate current beer stock
            const stock: StockByClient = {};
            const lottoInfo = new Map<string, { clientName: string, beerName: string }>();
            data.COTTE_HEAD.forEach(c => lottoInfo.set(c.LOTTO, { clientName: c.CLIENTE, beerName: c.NOME_BIRRA }));

            // Initial stock
            (data.BEER_WAREHOUSE_INITIAL || []).forEach(item => {
                if (!stock[item.cliente]) stock[item.cliente] = {};
                if (!stock[item.cliente][item.nomeBirra]) stock[item.cliente][item.nomeBirra] = [];
                stock[item.cliente][item.nomeBirra].push({ lotto: item.lotto, formato: item.formato, quantita: item.quantita, dataScadenza: item.dataScadenza });
            });

            // Packaging (in)
            (data.CONFEZIONAMENTO || []).forEach(pkg => {
                const info = lottoInfo.get(pkg.LOTTO_PROD);
                if (info) {
                     if (!stock[info.clientName]) stock[info.clientName] = {};
                     if (!stock[info.clientName][info.beerName]) stock[info.clientName][info.beerName] = [];
                     stock[info.clientName][info.beerName].push({ lotto: pkg.LOTTO_PROD, formato: pkg.FORMATO, quantita: pkg.QTA_UNITA, dataScadenza: pkg.DATA_SCADENZA });
                }
            });

             // Movements (out)
            (data.BEER_MOVEMENTS || []).forEach(mov => {
                if(stock[mov.cliente] && stock[mov.cliente][mov.nomeBirra]){
                    stock[mov.cliente][mov.nomeBirra].push({ lotto: mov.lotto, formato: mov.formato, quantita: mov.quantita, dataScadenza: 'N/A' });
                }
            });

            // Aggregate quantities
            for (const client in stock) {
                for (const beer in stock[client]) {
                    const lotMap = new Map<string, LocalBeerStockItem>();
                    stock[client][beer].forEach(item => {
                        const key = `${item.lotto}|${item.formato}`;
                        const existing = lotMap.get(key);
                        if (existing) {
                            existing.quantita += item.quantita;
                        } else {
                            lotMap.set(key, { ...item });
                        }
                    });
                    stock[client][beer] = Array.from(lotMap.values()).filter(i => i.quantita > 0);
                }
            }
            setBeerStock(stock);
        }
        setIsLoading(false);
    }, [selectedYear]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleItemChange = (index: number, field: 'beerName' | 'format' | 'quantity', value: string) => {
        const newItems = [...orderItems];
        newItems[index] = { ...newItems[index], [field]: value };
        if (field === 'beerName') newItems[index].format = '';
        setOrderItems(newItems);
    };
    const addItem = () => setOrderItems([...orderItems, { beerName: '', format: '', quantity: '' }]);
    const removeItem = (index: number) => setOrderItems(orderItems.filter((_, i) => i !== index));

    const availableBeers = useMemo(() => beerStock[selectedClient] ? Object.keys(beerStock[selectedClient]) : [], [selectedClient, beerStock]);
    const availableFormats = (beerName: string) => {
        if (!selectedClient || !beerName || !beerStock[selectedClient] || !beerStock[selectedClient][beerName]) return [];
        const formats = beerStock[selectedClient][beerName].map(item => item.formato);
        return [...new Set(formats)];
    };
     const getAvailableQuantity = (beerName: string, format: string) => {
        if (!selectedClient || !beerName || !format) return 0;
        return beerStock[selectedClient]?.[beerName]
            ?.filter(item => item.formato === format)
            .reduce((sum, item) => sum + item.quantita, 0) || 0;
    };


    const handleSaveOrder = async () => {
        if (!selectedClient || orderItems.some(i => !i.beerName || !i.format || !i.quantity)) {
            showToast("Cliente e tutti i campi degli articoli sono obbligatori.", 'error'); return;
        }

        const newMovements: BeerMovement[] = [];
        const orderId = `ORD_${Date.now()}`;
        const [year, month, day] = orderDate.split('-');
        const formattedDate = `${day}/${month}/${year}`;

        for (const item of orderItems) {
            const quantityToShip = parseInt(item.quantity);
            if (isNaN(quantityToShip) || quantityToShip <= 0) continue;

            const availableStock = getAvailableQuantity(item.beerName, item.format);
            if (quantityToShip > availableStock) {
                showToast(`Stock insufficiente per ${item.beerName} (${item.format}). Disponibili: ${availableStock}, Richiesti: ${quantityToShip}`, 'error');
                return;
            }

            // FIFO logic based on expiration date
            // Fix: Safe access to beerStock and explicit sorting params
            const clientBeerStock = beerStock[selectedClient];
            if (!clientBeerStock) continue;
            const itemsInStock = clientBeerStock[item.beerName];
            if (!itemsInStock) continue;

            const lotsForProduct = itemsInStock
                .filter(s => s.formato === item.format && s.quantita > 0)
                .sort((a: LocalBeerStockItem, b: LocalBeerStockItem) => {
                    const dateAStr = (a.dataScadenza || '01/01/1900').split('/').reverse().join('-');
                    const dateBStr = (b.dataScadenza || '01/01/1900').split('/').reverse().join('-');
                    return new Date(dateAStr).getTime() - new Date(dateBStr).getTime();
                });

            let remainingToShip = quantityToShip;
            for (const lot of lotsForProduct) {
                if (remainingToShip <= 0) break;
                const qtyFromThisLot = Math.min(remainingToShip, lot.quantita);
                newMovements.push({
                    id: `MOV_${Date.now()}_${newMovements.length}`,
                    data: formattedDate,
                    type: 'SALE',
                    cliente: selectedClient,
                    nomeBirra: item.beerName,
                    lotto: lot.lotto,
                    formato: item.format,
                    quantita: -qtyFromThisLot,
                    relatedDocId: orderId
                });
                remainingToShip -= qtyFromThisLot;
            }
        }
        
        const newOrder: SalesOrder = {
            id: orderId,
            date: formattedDate,
            client: selectedClient,
            // FIX: Ensure quantity is a string before parsing to avoid type errors.
            items: orderItems.map(i => ({...i, quantity: parseInt(String(i.quantity))})).filter(i => i.quantity > 0)
        };
        
        const data = await getBreweryData(selectedYear);
        if (!data) return;
        
        const updatedOrders = [...(data.SALES_ORDERS || []), newOrder];
        const updatedMovements = [...(data.BEER_MOVEMENTS || []), ...newMovements];
        
        await saveDataToSheet(selectedYear, 'SALES_ORDERS', updatedOrders);
        await saveDataToSheet(selectedYear, 'BEER_MOVEMENTS', updatedMovements);

        showToast("Commissione d'ordine salvata con successo!", 'success');
        onRefresh();
        setView('dashboard');
        // Reset form
        setSelectedClient('');
        setOrderItems([{ beerName: '', format: '', quantity: '' }]);
    };

    if(isLoading) return <p>Caricamento...</p>
    
    if (view === 'new') {
        return (
            <div className="space-y-4">
                 <h1 className="text-3xl font-bold text-brew-accent">Nuova Commissione d'Ordine</h1>
                 <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <Field label="Cliente">
                            <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600">
                                <option value="">Seleziona...</option>
                                {clients.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                            </select>
                        </Field>
                         <Field label="Data Ordine">
                            <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600" />
                        </Field>
                    </div>
                     <h3 className="text-lg font-semibold mb-2">Articoli</h3>
                     <div className="space-y-2">
                        {orderItems.map((item, index) => (
                            <div key={index} className="grid grid-cols-[2fr,1fr,auto,auto] gap-2 items-end">
                                <Field label={index === 0 ? "Birra" : ""}>
                                    <select value={item.beerName} onChange={e => handleItemChange(index, 'beerName', e.target.value)} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600" disabled={!selectedClient}>
                                        <option value="">Seleziona...</option>
                                        {availableBeers.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                </Field>
                                <Field label={index === 0 ? "Formato" : ""}>
                                    <select value={item.format} onChange={e => handleItemChange(index, 'format', e.target.value)} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600" disabled={!item.beerName}>
                                        <option value="">Seleziona...</option>
                                        {availableFormats(item.beerName).map(f => <option key={f} value={f}>{f} (Disp: {getAvailableQuantity(item.beerName, f)})</option>)}
                                    </select>
                                </Field>
                                <Field label={index === 0 ? "Quantità" : ""}>
                                     <input type="number" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', e.target.value)} className="w-24 bg-brew-dark p-2 rounded-md border border-slate-600"/>
                                </Field>
                                <button onClick={() => removeItem(index)} className="p-2 text-red-500 hover:text-red-400"><TrashIcon className="w-5 h-5"/></button>
                            </div>
                        ))}
                    </div>
                    <button onClick={addItem} className="mt-4 flex items-center px-2 py-1 bg-brew-blue rounded-md text-xs hover:bg-opacity-80"><PlusIcon className="w-4 h-4 mr-1"/>Aggiungi Articolo</button>
                 </div>
                 <div className="flex justify-between">
                     <button onClick={() => setView('dashboard')} className="px-4 py-2 rounded-md bg-slate-600 font-semibold hover:bg-slate-500">Annulla</button>
                     <button onClick={handleSaveOrder} className="px-6 py-3 rounded-md bg-brew-green font-bold text-lg hover:bg-opacity-90">Salva Ordine</button>
                 </div>
            </div>
        );
    }
    
    return (
        <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-brew-accent">Dashboard Commissioni</h2>
                <button onClick={() => setView('new')} className="flex items-center gap-2 bg-brew-green text-white font-bold py-2 px-4 rounded-md hover:bg-opacity-90">
                    <PlusIcon className="w-5 h-5" /> Nuova Commissione
                </button>
            </div>
            <div className="overflow-x-auto max-h-[70vh]">
                <table className="w-full text-sm text-left text-gray-300">
                     <thead className="text-xs text-brew-dark uppercase bg-brew-accent sticky top-0">
                        <tr>
                            <th className="px-3 py-3">Data</th>
                            <th className="px-3 py-3">Cliente</th>
                            <th className="px-3 py-3">Articoli</th>
                        </tr>
                    </thead>
                    <tbody>
                        {orders.map(order => (
                             <tr key={order.id} className="border-b border-slate-700">
                                <td className="px-3 py-2 font-semibold">{order.date}</td>
                                <td className="px-3 py-2">{order.client}</td>
                                <td className="px-3 py-2">
                                    <ul className="text-xs list-disc pl-4">
                                        {order.items.map((item, i) => <li key={i}>{item.quantity} x {item.beerName} ({item.format})</li>)}
                                    </ul>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                 {orders.length === 0 && <p className="text-center text-slate-400 mt-8 py-4">Nessuna commissione d'ordine trovata.</p>}
            </div>
        </div>
    );
};

const Field: React.FC<{label: string, children: React.ReactNode}> = ({ label, children }) => (
    <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">{label || '\u00A0'}</label>
        {children}
    </div>
);