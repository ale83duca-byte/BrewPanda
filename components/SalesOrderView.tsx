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
    const [orderItems, setOrderItems] = useState<{ beerName: string; lotto: string; format: string; quantity: string; customBeerName: string }[]>([{ beerName: '', lotto: '', format: '', quantity: '', customBeerName: '' }]);
    const [editingOrder, setEditingOrder] = useState<SalesOrder | null>(null);

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

    const handleItemChange = (index: number, field: 'beerName' | 'lotto' | 'format' | 'quantity' | 'customBeerName', value: string) => {
        const newItems = [...orderItems];
        newItems[index] = { ...newItems[index], [field]: value };
        if (field === 'beerName') {
            newItems[index].lotto = '';
            newItems[index].format = '';
            newItems[index].customBeerName = value;
        }
        if (field === 'lotto') {
            newItems[index].format = '';
        }
        setOrderItems(newItems);
    };
    const addItem = () => setOrderItems([...orderItems, { beerName: '', lotto: '', format: '', quantity: '', customBeerName: '' }]);
    const removeItem = (index: number) => setOrderItems(orderItems.filter((_, i) => i !== index));

    // Filter beers by "ALVERESE" client
    const availableBeers = useMemo(() => {
        const alvereseStock = beerStock["ALVERESE"];
        return alvereseStock ? Object.keys(alvereseStock) : [];
    }, [beerStock]);

    const availableLottos = (beerName: string) => {
        if (!beerName || !beerStock["ALVERESE"] || !beerStock["ALVERESE"][beerName]) return [];
        const lottos = beerStock["ALVERESE"][beerName].map(item => item.lotto);
        return [...new Set(lottos)];
    }

    const availableFormats = (beerName: string, lotto: string) => {
        if (!beerName || !lotto || !beerStock["ALVERESE"] || !beerStock["ALVERESE"][beerName]) return [];
        const formats = beerStock["ALVERESE"][beerName]
            .filter(item => item.lotto === lotto)
            .map(item => item.formato);
        return [...new Set(formats)];
    };

     const getAvailableQuantity = (beerName: string, lotto: string, format: string) => {
        if (!beerName || !lotto || !format) return 0;
        return beerStock["ALVERESE"]?.[beerName]
            ?.filter(item => item.lotto === lotto && item.formato === format)
            .reduce((sum, item) => sum + item.quantita, 0) || 0;
    };


    const handleEditOrder = (order: SalesOrder) => {
        setEditingOrder(order);
        setSelectedClient(order.client);
        // Convert DD/MM/YYYY to YYYY-MM-DD for input type="date"
        const [day, month, year] = order.date.split('/');
        setOrderDate(`${year}-${month}-${day}`);
        setOrderItems(order.items.map(item => ({
            beerName: item.beerName,
            lotto: item.lotto,
            format: item.format,
            quantity: String(item.quantity),
            customBeerName: item.customBeerName || ''
        })));
        setView('new');
    };

    const handleSaveOrder = async () => {
        if (!selectedClient || orderItems.some(i => !i.beerName || !i.lotto || !i.format || !i.quantity)) {
            showToast("Cliente e tutti i campi degli articoli sono obbligatori.", 'error'); return;
        }

        const orderId = editingOrder ? editingOrder.id : `ORD_${Date.now()}`;
        const [year, month, day] = orderDate.split('-');
        const formattedDate = `${day}/${month}/${year}`;

        // Robust Stock Validation
        const stockCheckMap = new Map<string, { required: number, available: number, refund: number }>();

        // 1. Calculate Required Quantities
        for (const item of orderItems) {
            const qty = parseInt(item.quantity);
            if (isNaN(qty) || qty <= 0) continue;
            const key = `${item.beerName}|${item.lotto}|${item.format}`;
            const current = stockCheckMap.get(key) || { required: 0, available: 0, refund: 0 };
            current.required += qty;
            stockCheckMap.set(key, current);
        }

        // 2. Calculate Available and Refund Quantities
        for (const key of stockCheckMap.keys()) {
            const [beerName, lotto, format] = key.split('|');
            const available = getAvailableQuantity(beerName, lotto, format);
            
            let refund = 0;
            if (editingOrder) {
                editingOrder.items.forEach(i => {
                    if (i.beerName === beerName && i.lotto === lotto && i.format === format) {
                        refund += i.quantity;
                    }
                });
            }
            
            const current = stockCheckMap.get(key)!;
            current.available = available;
            current.refund = refund;
            stockCheckMap.set(key, current);
        }

        // 3. Validate
        for (const [key, data] of stockCheckMap.entries()) {
            const [beerName, lotto, format] = key.split('|');
            if (data.required > (data.available + data.refund)) {
                 showToast(`Stock insufficiente per ${beerName} (Lotto: ${lotto}, ${format}). Disponibili: ${data.available + data.refund}, Richiesti: ${data.required}`, 'error');
                 return;
            }
        }

        const newMovements: BeerMovement[] = [];
        for (const item of orderItems) {
             const quantityToShip = parseInt(item.quantity);
             if (isNaN(quantityToShip) || quantityToShip <= 0) continue;

            // 1. Movement OUT from ALVERESE (Sale)
            newMovements.push({
                id: `MOV_${Date.now()}_${newMovements.length}_OUT`,
                data: formattedDate,
                type: 'SALE',
                cliente: "ALVERESE", // The stock is deducted from ALVERESE
                nomeBirra: item.beerName,
                lotto: item.lotto,
                formato: item.format,
                quantita: -quantityToShip,
                relatedDocId: orderId
            });

            // 2. Movement IN to Selected Client (Purchase)
            newMovements.push({
                id: `MOV_${Date.now()}_${newMovements.length}_IN`,
                data: formattedDate,
                type: 'PURCHASE',
                cliente: selectedClient,
                nomeBirra: item.customBeerName || item.beerName,
                lotto: item.lotto,
                formato: item.format,
                quantita: quantityToShip,
                relatedDocId: orderId
            });
        }
        
        const newOrder: SalesOrder = {
            id: orderId,
            date: formattedDate,
            client: selectedClient,
            items: orderItems.map(i => ({...i, quantity: parseInt(String(i.quantity))})).filter(i => i.quantity > 0)
        };
        
        const data = await getBreweryData(selectedYear);
        if (!data) return;
        
        let updatedOrders = data.SALES_ORDERS || [];
        let updatedMovements = data.BEER_MOVEMENTS || [];

        if (editingOrder) {
            // Remove old order and its movements
            updatedOrders = updatedOrders.filter(o => o.id !== editingOrder.id);
            updatedMovements = updatedMovements.filter(m => m.relatedDocId !== editingOrder.id);
        }

        updatedOrders.push(newOrder);
        updatedMovements.push(...newMovements);
        
        await saveDataToSheet(selectedYear, 'SALES_ORDERS', updatedOrders);
        await saveDataToSheet(selectedYear, 'BEER_MOVEMENTS', updatedMovements);

        showToast("Commissione d'ordine salvata con successo!", 'success');
        onRefresh();
        setView('dashboard');
        // Reset form
        setSelectedClient('');
        setOrderItems([{ beerName: '', lotto: '', format: '', quantity: '', customBeerName: '' }]);
        setEditingOrder(null);
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
                            <div key={index} className="grid grid-cols-[1.5fr,1.5fr,1fr,1fr,0.5fr,auto] gap-2 items-end">
                                <Field label={index === 0 ? "Birra" : ""}>
                                    <select value={item.beerName} onChange={e => handleItemChange(index, 'beerName', e.target.value)} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600" disabled={!selectedClient}>
                                        <option value="">Seleziona...</option>
                                        {availableBeers.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                </Field>
                                <Field label={index === 0 ? "Nome Cliente" : ""}>
                                    <input type="text" value={item.customBeerName} onChange={e => handleItemChange(index, 'customBeerName', e.target.value)} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600" placeholder={item.beerName} disabled={!item.beerName} />
                                </Field>
                                <Field label={index === 0 ? "Lotto" : ""}>
                                    <select value={item.lotto} onChange={e => handleItemChange(index, 'lotto', e.target.value)} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600" disabled={!item.beerName}>
                                        <option value="">Seleziona...</option>
                                        {availableLottos(item.beerName).map(l => <option key={l} value={l}>{l}</option>)}
                                    </select>
                                </Field>
                                <Field label={index === 0 ? "Formato" : ""}>
                                    <select value={item.format} onChange={e => handleItemChange(index, 'format', e.target.value)} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600" disabled={!item.lotto}>
                                        <option value="">Seleziona...</option>
                                        {availableFormats(item.beerName, item.lotto).map(f => <option key={f} value={f}>{f} (Disp: {getAvailableQuantity(item.beerName, item.lotto, f)})</option>)}
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
    
    const groupedOrders = useMemo(() => {
        const groups: Record<string, SalesOrder[]> = {};
        orders.forEach(order => {
            if (!groups[order.client]) groups[order.client] = [];
            groups[order.client].push(order);
        });
        return groups;
    }, [orders]);

    return (
        <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-brew-accent">Dashboard Commissioni</h2>
                <button onClick={() => { setEditingOrder(null); setSelectedClient(''); setOrderItems([{ beerName: '', lotto: '', format: '', quantity: '', customBeerName: '' }]); setView('new'); }} className="flex items-center gap-2 bg-brew-green text-white font-bold py-2 px-4 rounded-md hover:bg-opacity-90">
                    <PlusIcon className="w-5 h-5" /> Nuova Commissione
                </button>
            </div>
            <div className="overflow-x-auto max-h-[70vh] space-y-6">
                {Object.keys(groupedOrders).sort().map(clientName => (
                    <div key={clientName} className="bg-brew-dark p-4 rounded-lg">
                        <h3 className="text-xl font-bold text-white mb-3 border-b border-slate-600 pb-2">{clientName}</h3>
                        <table className="w-full text-sm text-left text-gray-300">
                            <thead className="text-xs text-brew-dark uppercase bg-brew-accent">
                                <tr>
                                    <th className="px-3 py-3 rounded-tl-md">Data</th>
                                    <th className="px-3 py-3">Articoli</th>
                                    <th className="px-3 py-3 rounded-tr-md">Azioni</th>
                                </tr>
                            </thead>
                            <tbody>
                                {groupedOrders[clientName].map(order => (
                                    <tr key={order.id} className="border-b border-slate-700 last:border-0">
                                        <td className="px-3 py-2 font-semibold w-32">{order.date}</td>
                                        <td className="px-3 py-2">
                                            <ul className="text-xs list-disc pl-4 space-y-1">
                                                {order.items.map((item, i) => (
                                                    <li key={i}>
                                                        {item.quantity} x {item.customBeerName ? `${item.customBeerName} (ex ${item.beerName})` : item.beerName} ({item.format}) - Lotto: {item.lotto}
                                                    </li>
                                                ))}
                                            </ul>
                                        </td>
                                        <td className="px-3 py-2 w-24">
                                            <button onClick={() => handleEditOrder(order)} className="text-brew-blue hover:text-blue-400 font-semibold text-xs border border-brew-blue px-2 py-1 rounded">
                                                Modifica
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ))}
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