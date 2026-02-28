import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getBreweryData, saveDataToSheet } from '../services/dataService';
import type { Cliente, PackagedBeerOrder, PackagedBeerOrderItem, BeerMovement, BeerPriceList, ClientOffer } from '../types';
import { useToast } from '../hooks/useToast';
import { PlusIcon, TrashIcon, DocumentTextIcon } from './icons';
import { exportPackagedBeerOrderToExcel } from '../utils/excelExport';

interface PackagedBeerOrdersViewProps {
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

export const PackagedBeerOrdersView: React.FC<PackagedBeerOrdersViewProps> = ({ selectedYear, onRefresh }) => {
    
    const { showToast } = useToast();
    const [view, setView] = useState<'dashboard' | 'new'>('dashboard');
    const [isLoading, setIsLoading] = useState(true);
    
    const [orders, setOrders] = useState<PackagedBeerOrder[]>([]);
    const [clients, setClients] = useState<Cliente[]>([]);
    const [alvereseStock, setAlvereseStock] = useState<StockByBeer>({});
    const [priceList, setPriceList] = useState<BeerPriceList[]>([]);
    const [clientOffers, setClientOffers] = useState<ClientOffer[]>([]);
    
    const [selectedClient, setSelectedClient] = useState('');
    const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
    const [orderItems, setOrderItems] = useState<PackagedBeerOrderItem[]>([{ beerName: '', lotto: '', format: '', quantity: 0, price: 0, total: 0 }]);
    const [editingOrder, setEditingOrder] = useState<PackagedBeerOrder | null>(null);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        const data = await getBreweryData(selectedYear);
        if (data) {
            setClients(data.CLIENTI || []);
            setOrders((data.PACKAGED_BEER_ORDERS || []).sort((a,b) => new Date(b.date.split('/').reverse().join('-')).getTime() - new Date(a.date.split('/').reverse().join('-')).getTime()));
            setPriceList(data.BEER_PRICE_LIST || []);
            setClientOffers(data.CLIENT_OFFERS || []);

            // Calculate current beer stock for ALVERESE
            const stock: StockByBeer = {};
            const lottoInfo = new Map<string, { clientName: string, beerName: string }>();
            data.COTTE_HEAD.forEach(c => lottoInfo.set(c.LOTTO, { clientName: c.CLIENTE, beerName: c.NOME_BIRRA }));

            // Helper to add stock
            const addStock = (client: string, beer: string, lotto: string, format: string, qty: number, scadenza: string) => {
                if (client !== "ALVERESE") return;
                if (!stock[beer]) stock[beer] = [];
                stock[beer].push({ lotto, formato: format, quantita: qty, dataScadenza: scadenza });
            };

            // Initial stock
            (data.BEER_WAREHOUSE_INITIAL || []).forEach(item => {
                addStock(item.cliente, item.nomeBirra, item.lotto, item.formato, item.quantita, item.dataScadenza);
            });

            // Packaging (in)
            (data.CONFEZIONAMENTO || []).forEach(pkg => {
                const info = lottoInfo.get(pkg.LOTTO_PROD);
                if (info) {
                     addStock(info.clientName, info.beerName, pkg.LOTTO_PROD, pkg.FORMATO, pkg.QTA_UNITA, pkg.DATA_SCADENZA);
                }
            });

             // Movements (out)
            (data.BEER_MOVEMENTS || []).forEach(mov => {
                if (mov.cliente === "ALVERESE") { // Only care about ALVERESE stock movements
                     // If type is SALE, quantity is negative, so we add it (reducing stock)
                     // If type is PURCHASE, quantity is positive (increasing stock)
                     // Wait, in SalesOrderView:
                     // SALE: quantita: -quantityToShip (reduces stock)
                     // PURCHASE: quantita: quantityToShip (increases stock)
                     // So we just add mov.quantita
                     addStock(mov.cliente, mov.nomeBirra, mov.lotto, mov.formato, mov.quantita, 'N/A');
                }
            });

            // Aggregate quantities
            for (const beer in stock) {
                const lotMap = new Map<string, LocalBeerStockItem>();
                stock[beer].forEach(item => {
                    const key = `${item.lotto}|${item.formato}`;
                    const existing = lotMap.get(key);
                    if (existing) {
                        existing.quantita += item.quantita;
                    } else {
                        lotMap.set(key, { ...item });
                    }
                });
                stock[beer] = Array.from(lotMap.values()).filter(i => i.quantita > 0);
            }
            setAlvereseStock(stock);
        }
        setIsLoading(false);
    }, [selectedYear]);

    useEffect(() => { loadData(); }, [loadData]);

    const mapFormatToPriceKey = useCallback((format: string): string | null => {
        if (!format) return null;
        const fmt = format.toUpperCase();
        if (fmt.includes('BOTT. 33CL')) return 'BOTTIGLIA 33CL';
        if (fmt.includes('BOTT. 50CL')) return 'BOTTIGLIA 50CL';
        if (fmt.includes('BOTT. 75CL')) return 'BOTTIGLIA 75CL';
        if (fmt.includes('24L') || fmt.includes('24LT')) return 'FUSTO 24 LT';
        if (fmt.includes('20L') || fmt.includes('20LT')) {
            if (fmt.includes('ACCIAIO')) return 'ACCIAIO 20 LT';
            return 'FUSTO 20 LT';
        }
        if (fmt.includes('5L') || fmt.includes('5LT')) return 'FUSTO 5 LT';
        return null;
    }, []);

    const getPrice = useCallback((clientName: string, beerName: string, format: string) => {
        const priceKey = mapFormatToPriceKey(format);
        if (!priceKey) return 0;

        // 1. Check for specific Client Offer
        const client = clients.find(c => c.nome === clientName);
        if (client) {
            const offer = clientOffers.find(o => o.clientId === client.id);
            if (offer && offer.prices[beerName] && offer.prices[beerName][priceKey]) {
                return offer.prices[beerName][priceKey];
            }
        }

        // 2. Check General Price List
        const priceItem = priceList.find(p => p.beerName === beerName);
        if (priceItem && priceItem.prices[priceKey]) {
            return priceItem.prices[priceKey];
        }

        return 0;
    }, [clients, clientOffers, priceList, mapFormatToPriceKey]);

    // Update prices when client changes
    useEffect(() => {
        if (selectedClient) {
            setOrderItems(prevItems => prevItems.map(item => {
                if (item.beerName && item.format) {
                    const newPrice = getPrice(selectedClient, item.beerName, item.format);
                    return { ...item, price: newPrice, total: item.quantity * newPrice };
                }
                return item;
            }));
        }
    }, [selectedClient, getPrice]);

    const handleItemChange = (index: number, field: keyof PackagedBeerOrderItem, value: string | number) => {
        const newItems = [...orderItems];
        const currentItem = { ...newItems[index], [field]: value };

        if (field === 'beerName') {
            currentItem.lotto = '';
            currentItem.format = '';
            currentItem.price = 0;
        } else if (field === 'lotto') {
            currentItem.format = '';
        } else if (field === 'format') {
            // Auto-fetch price when format changes
            const price = getPrice(selectedClient, currentItem.beerName, value as string);
            currentItem.price = price;
        } else if (field === 'quantity') {
             // If price is 0, try to fetch it again (in case client was selected late or something)
             if (currentItem.price === 0 && currentItem.format && selectedClient) {
                 const price = getPrice(selectedClient, currentItem.beerName, currentItem.format);
                 if (price > 0) currentItem.price = price;
             }
        }

        // Recalculate total for the row
        if (field === 'quantity' || field === 'price' || field === 'format') {
             const qty = field === 'quantity' ? Number(value) : currentItem.quantity;
             const price = field === 'price' ? Number(value) : currentItem.price;
             currentItem.total = qty * price;
        }

        newItems[index] = currentItem;
        setOrderItems(newItems);
    };

    const addItem = () => setOrderItems([...orderItems, { beerName: '', lotto: '', format: '', quantity: 0, price: 0, total: 0 }]);
    const removeItem = (index: number) => setOrderItems(orderItems.filter((_, i) => i !== index));

    const availableBeers = useMemo(() => Object.keys(alvereseStock), [alvereseStock]);

    const availableLottos = (beerName: string) => {
        if (!beerName || !alvereseStock[beerName]) return [];
        const lottos = alvereseStock[beerName].map(item => item.lotto);
        return [...new Set(lottos)];
    }

    const availableFormats = (beerName: string, lotto: string) => {
        if (!beerName || !lotto || !alvereseStock[beerName]) return [];
        const formats = alvereseStock[beerName]
            .filter(item => item.lotto === lotto)
            .map(item => item.formato);
        return [...new Set(formats)];
    };

     const getAvailableQuantity = (beerName: string, lotto: string, format: string) => {
        if (!beerName || !lotto || !format) return 0;
        return alvereseStock[beerName]
            ?.filter(item => item.lotto === lotto && item.formato === format)
            .reduce((sum, item) => sum + item.quantita, 0) || 0;
    };

    const calculateTotals = () => {
        const totalNet = orderItems.reduce((sum, item) => sum + item.total, 0);
        const iva = totalNet * 0.22; // Assuming 22% VAT
        const totalGross = totalNet + iva;
        return { totalNet, iva, totalGross };
    };

    const { totalNet, iva, totalGross } = calculateTotals();

    const handleEditOrder = (order: PackagedBeerOrder) => {
        setEditingOrder(order);
        setSelectedClient(order.client);
        const [day, month, year] = order.date.split('/');
        setOrderDate(`${year}-${month}-${day}`);
        setOrderItems(order.items.map(item => ({ ...item })));
        setView('new');
    };

    const handleSaveOrder = async () => {
        if (!selectedClient || orderItems.some(i => !i.beerName || !i.lotto || !i.format || !i.quantity)) {
            showToast("Cliente e tutti i campi degli articoli sono obbligatori.", 'error'); return;
        }

        const orderId = editingOrder ? editingOrder.id : `ORD_VEND_${Date.now()}`;
        const [year, month, day] = orderDate.split('-');
        const formattedDate = `${day}/${month}/${year}`;

        // Stock Validation
        const stockCheckMap = new Map<string, { required: number, available: number, refund: number }>();
        for (const item of orderItems) {
            if (item.quantity <= 0) continue;
            const key = `${item.beerName}|${item.lotto}|${item.format}`;
            const current = stockCheckMap.get(key) || { required: 0, available: 0, refund: 0 };
            current.required += item.quantity;
            stockCheckMap.set(key, current);
        }

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

        for (const [key, data] of stockCheckMap.entries()) {
            const [beerName, lotto, format] = key.split('|');
            if (data.required > (data.available + data.refund)) {
                 showToast(`Stock insufficiente per ${beerName} (Lotto: ${lotto}, ${format}). Disponibili: ${data.available + data.refund}, Richiesti: ${data.required}`, 'error');
                 return;
            }
        }

        const newMovements: BeerMovement[] = [];
        for (const item of orderItems) {
             if (item.quantity <= 0) continue;

            // Movement OUT from ALVERESE (Sale)
            newMovements.push({
                id: `MOV_VEND_${Date.now()}_${newMovements.length}_OUT`,
                data: formattedDate,
                type: 'SALE',
                cliente: "ALVERESE",
                nomeBirra: item.beerName,
                lotto: item.lotto,
                formato: item.format,
                quantita: -item.quantity,
                relatedDocId: orderId,
                destinatario: selectedClient
            });
        }
        
        const newOrder: PackagedBeerOrder = {
            id: orderId,
            date: formattedDate,
            client: selectedClient,
            items: orderItems.filter(i => i.quantity > 0),
            totalNet,
            iva,
            totalGross
        };
        
        const data = await getBreweryData(selectedYear);
        if (!data) return;
        
        let updatedOrders = data.PACKAGED_BEER_ORDERS || [];
        let updatedMovements = data.BEER_MOVEMENTS || [];

        if (editingOrder) {
            updatedOrders = updatedOrders.filter(o => o.id !== editingOrder.id);
            updatedMovements = updatedMovements.filter(m => m.relatedDocId !== editingOrder.id);
        }

        updatedOrders.push(newOrder);
        updatedMovements.push(...newMovements);
        
        await saveDataToSheet(selectedYear, 'PACKAGED_BEER_ORDERS', updatedOrders);
        await saveDataToSheet(selectedYear, 'BEER_MOVEMENTS', updatedMovements);

        showToast("Ordine salvato con successo!", 'success');
        
        // Generate Excel
        try {
             exportPackagedBeerOrderToExcel(newOrder);
             showToast("Bolla d'accompagno generata.", 'info');
        } catch (e) {
            console.error(e);
            showToast("Errore generazione Excel.", 'error');
        }

        onRefresh();
        setView('dashboard');
        setSelectedClient('');
        setOrderItems([{ beerName: '', lotto: '', format: '', quantity: 0, price: 0, total: 0 }]);
        setEditingOrder(null);
    };

    if(isLoading) return <p>Caricamento...</p>
    
    if (view === 'new') {
        return (
            <div className="space-y-4">
                 <h1 className="text-3xl font-bold text-brew-accent">Nuovo Ordine Birre Confezionate</h1>
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
                            <div key={index} className="grid grid-cols-[1.5fr,1fr,1fr,0.8fr,0.8fr,0.8fr,auto] gap-2 items-end">
                                <Field label={index === 0 ? "Birra" : ""}>
                                    <select value={item.beerName} onChange={e => handleItemChange(index, 'beerName', e.target.value)} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600">
                                        <option value="">Seleziona...</option>
                                        {availableBeers.map(b => <option key={b} value={b}>{b}</option>)}
                                    </select>
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
                                     <input type="number" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', e.target.value)} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600"/>
                                </Field>
                                <Field label={index === 0 ? "Prezzo Unit." : ""}>
                                     <input type="number" value={item.price} onChange={e => handleItemChange(index, 'price', e.target.value)} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600"/>
                                </Field>
                                <Field label={index === 0 ? "Totale" : ""}>
                                     <div className="w-full bg-brew-dark p-2 rounded-md border border-slate-600 text-right font-mono">
                                        € {item.total.toFixed(2)}
                                     </div>
                                </Field>
                                <button onClick={() => removeItem(index)} className="p-2 text-red-500 hover:text-red-400"><TrashIcon className="w-5 h-5"/></button>
                            </div>
                        ))}
                    </div>
                    <button onClick={addItem} className="mt-4 flex items-center px-2 py-1 bg-brew-blue rounded-md text-xs hover:bg-opacity-80"><PlusIcon className="w-4 h-4 mr-1"/>Aggiungi Articolo</button>
                    
                    <div className="mt-6 border-t border-slate-600 pt-4 flex flex-col items-end">
                        <div className="w-64 space-y-2">
                            <div className="flex justify-between">
                                <span>Totale Netto:</span>
                                <span className="font-mono">€ {totalNet.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-sm text-gray-400">
                                <span>IVA (22%):</span>
                                <span className="font-mono">€ {iva.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-xl font-bold text-brew-accent border-t border-slate-600 pt-2">
                                <span>Totale + IVA:</span>
                                <span className="font-mono">€ {totalGross.toFixed(2)}</span>
                            </div>
                        </div>
                    </div>

                 </div>
                 <div className="flex justify-between">
                     <button onClick={() => setView('dashboard')} className="px-4 py-2 rounded-md bg-slate-600 font-semibold hover:bg-slate-500">Annulla</button>
                     <button onClick={handleSaveOrder} className="px-6 py-3 rounded-md bg-brew-green font-bold text-lg hover:bg-opacity-90">Salva e Genera Bolla</button>
                 </div>
            </div>
        );
    }

    return (
        <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-brew-accent">Ordini Birre Confezionate</h2>
                <button onClick={() => { setEditingOrder(null); setSelectedClient(''); setOrderItems([{ beerName: '', lotto: '', format: '', quantity: 0, price: 0, total: 0 }]); setView('new'); }} className="flex items-center gap-2 bg-brew-green text-white font-bold py-2 px-4 rounded-md hover:bg-opacity-90">
                    <PlusIcon className="w-5 h-5" /> Nuovo Ordine
                </button>
            </div>
            <div className="overflow-x-auto max-h-[70vh] space-y-4">
                {orders.map(order => (
                    <div key={order.id} className="bg-brew-dark p-4 rounded-lg flex justify-between items-center border border-slate-700">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="text-brew-accent font-bold text-lg">{order.client}</span>
                                <span className="text-sm text-gray-400">({order.date})</span>
                            </div>
                            <ul className="text-xs text-gray-300 list-disc pl-4">
                                {order.items.map((item, i) => (
                                    <li key={i}>{item.quantity} x {item.beerName} ({item.format}) - € {item.total.toFixed(2)}</li>
                                ))}
                            </ul>
                        </div>
                        <div className="text-right">
                            <div className="text-xl font-bold text-white mb-2">€ {order.totalGross.toFixed(2)}</div>
                            <div className="flex gap-2">
                                <button onClick={() => exportPackagedBeerOrderToExcel(order)} className="text-brew-blue hover:text-blue-400 font-semibold text-xs border border-brew-blue px-2 py-1 rounded flex items-center gap-1">
                                    <DocumentTextIcon className="w-4 h-4"/> Bolla
                                </button>
                                <button onClick={() => handleEditOrder(order)} className="text-brew-orange hover:text-orange-400 font-semibold text-xs border border-brew-orange px-2 py-1 rounded">
                                    Modifica
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
                {orders.length === 0 && <p className="text-center text-slate-400 mt-8 py-4">Nessun ordine registrato.</p>}
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
