import React, { useState, useEffect, useCallback } from 'react';
import { getBreweryData, saveDataToSheet } from '../services/dataService';
import type { BeerPriceList, ClientOffer } from '../types';
import { PRICE_LIST_FORMATS } from '../constants';
import { useToast } from '../hooks/useToast';
import { PlusIcon, TrashIcon } from './icons';

interface BeerPriceListViewProps {
    selectedYear: string;
}

export const BeerPriceListView: React.FC<BeerPriceListViewProps> = ({ selectedYear }) => {
    const { showToast } = useToast();
    const [view, setView] = useState<'dashboard' | 'offer_list' | 'offer_editor'>('dashboard');
    const [isLoading, setIsLoading] = useState(true);
    
    const [clients, setClients] = useState<{ id: string; nome: string }[]>([]);
    const [clientOffers, setClientOffers] = useState<ClientOffer[]>([]);
    const [generalPriceList, setGeneralPriceList] = useState<BeerPriceList[]>([]);
    const [currentOffer, setCurrentOffer] = useState<ClientOffer | null>(null);
    const [offerDate, setOfferDate] = useState(new Date().toISOString().slice(0, 10));
    const [selectedClientId, setSelectedClientId] = useState('');
    const [isGeneralListEditable, setIsGeneralListEditable] = useState(false);
    const [allBeers, setAllBeers] = useState<string[]>([]);
    const [selectedBeerToAdd, setSelectedBeerToAdd] = useState('');

    const loadData = useCallback(async () => {
        setIsLoading(true);
        const data = await getBreweryData(selectedYear);
        if (data) {
            setClients(data.CLIENTI || []);
            setClientOffers(data.CLIENT_OFFERS || []);
            
            // All beers in the system
            const allSystemBeers = data.BIRRE.map(b => b.nomeBirra);
            setAllBeers([...new Set(allSystemBeers)].sort());

            // Filter beers for ALVERESE
            const alvereseId = data.CLIENTI.find(c => c.nome === 'ALVERESE')?.id;
            const beers = data.BIRRE
                .filter(b => b.clienteId === alvereseId || b.clienteId === 'ALVERESE') // Fallback if ID is name
                .map(b => b.nomeBirra);
            
            const alvereseBeersList = beers.length > 0 ? beers : [...new Set(data.BIRRE.map(b => b.nomeBirra))];

            // Initialize General Price List
            let currentList = data.BEER_PRICE_LIST || [];
            
            // Ensure all ALVERESE beers are in the list, but also keep any manually added ones
            // Merge existing list with alverese beers
            const existingNames = new Set(currentList.map(p => p.beerName));
            const missingBeers = alvereseBeersList.filter(b => !existingNames.has(b));
            
            const newList = [...currentList];
            missingBeers.forEach(beerName => {
                newList.push({ beerName, prices: {} });
            });
            
            // Sort alphabetically
            newList.sort((a, b) => a.beerName.localeCompare(b.beerName));

            setGeneralPriceList(newList);
        }
        setIsLoading(false);
    }, [selectedYear]);

    useEffect(() => { loadData(); }, [loadData]);

    const handlePriceChange = (beerIndex: number, format: string, value: string) => {
        const newList = [...generalPriceList];
        const numValue = parseFloat(value.replace(',', '.'));
        if (isNaN(numValue)) {
             delete newList[beerIndex].prices[format];
        } else {
             newList[beerIndex].prices[format] = numValue;
        }
        setGeneralPriceList(newList);
    };

    const handleAddBeerToGeneralList = () => {
        if (!selectedBeerToAdd) return;
        if (generalPriceList.some(p => p.beerName === selectedBeerToAdd)) {
            showToast("Birra già presente nel listino", 'warning');
            return;
        }
        setGeneralPriceList(prev => [...prev, { beerName: selectedBeerToAdd, prices: {} }].sort((a, b) => a.beerName.localeCompare(b.beerName)));
        setSelectedBeerToAdd('');
    };

    const handleSaveGeneralList = async () => {
        await saveDataToSheet(selectedYear, 'BEER_PRICE_LIST', generalPriceList);
        setIsGeneralListEditable(false);
        showToast("Listino generale salvato con successo!", 'success');
    };

    const handleDeleteOffer = async (offerId: string) => {
        if (window.confirm("Sei sicuro di voler eliminare questa offerta?")) {
            const data = await getBreweryData(selectedYear);
            let updatedOffers = data?.CLIENT_OFFERS || [];
            updatedOffers = updatedOffers.filter(o => o.id !== offerId);
            await saveDataToSheet(selectedYear, 'CLIENT_OFFERS', updatedOffers);
            setClientOffers(updatedOffers);
            showToast("Offerta eliminata.", 'success');
        }
    };

    // Offer Editor Logic
    const handleNewOffer = () => {
        setCurrentOffer(null);
        setSelectedClientId('');
        setOfferDate(new Date().toISOString().slice(0, 10));
        setView('offer_editor');
    };

    const handleEditOffer = (offer: ClientOffer) => {
        setCurrentOffer(offer);
        setSelectedClientId(offer.clientId);
        // Convert DD/MM/YYYY to YYYY-MM-DD
        const [day, month, year] = offer.date.split('/');
        setOfferDate(`${year}-${month}-${day}`);
        setView('offer_editor');
    };

    const handleOfferPriceChange = (beerName: string, format: string, value: string) => {
        const numValue = parseFloat(value.replace(',', '.'));
        
        setCurrentOffer(prev => {
            if (!prev) return null;
            const prices = prev.prices ? { ...prev.prices } : {};
            if (!prices[beerName]) prices[beerName] = {};
            
            if (isNaN(numValue)) {
                delete prices[beerName][format];
            } else {
                prices[beerName][format] = numValue;
            }
            
            return {
                ...prev,
                prices
            };
        });
    };

    // When creating new offer, initialize with general prices
    useEffect(() => {
        if (view === 'offer_editor' && !currentOffer && selectedClientId) {
            // Initialize with general list
            const initialPrices: Record<string, Record<string, number>> = {};
            generalPriceList.forEach(item => {
                initialPrices[item.beerName] = { ...item.prices };
            });
            
            setCurrentOffer({
                id: `OFFER_${Date.now()}`,
                clientId: selectedClientId,
                clientName: clients.find(c => c.id === selectedClientId)?.nome || '',
                date: '', // Set on save
                prices: initialPrices
            });
        }
    }, [view, currentOffer, selectedClientId, generalPriceList, clients]);


    const handleSaveOffer = async () => {
        if (!selectedClientId) {
            showToast("Seleziona un cliente", 'error');
            return;
        }

        const [year, month, day] = offerDate.split('-');
        const formattedDate = `${day}/${month}/${year}`;

        const newOffer: ClientOffer = {
            id: currentOffer?.id || `OFFER_${Date.now()}`,
            clientId: selectedClientId,
            clientName: clients.find(c => c.id === selectedClientId)?.nome || '',
            date: formattedDate,
            prices: currentOffer?.prices || {}
        };

        const data = await getBreweryData(selectedYear);
        let updatedOffers = data?.CLIENT_OFFERS || [];
        
        // Remove existing if updating
        updatedOffers = updatedOffers.filter(o => o.id !== newOffer.id);
        updatedOffers.push(newOffer);

        await saveDataToSheet(selectedYear, 'CLIENT_OFFERS', updatedOffers);
        showToast("Offerta salvata con successo!", 'success');
        
        // Reload data to refresh list
        loadData();
        setView('offer_list'); // Go back to offer list as requested ("SULLA PAGINA OFFERTE CLIENTI SALVATE COMPARE IL NOME...")
    };

    if (isLoading) return <p className="text-white p-4">Caricamento...</p>;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-brew-accent">Listino Prezzi Birre Finite</h1>
                <div className="space-x-2">
                    <button 
                        onClick={() => setView('dashboard')} 
                        className={`px-4 py-2 rounded-md font-bold ${view === 'dashboard' ? 'bg-brew-accent text-brew-dark' : 'bg-brew-dark-secondary text-white'}`}
                    >
                        Listino Generale
                    </button>
                    <button 
                        onClick={() => setView('offer_list')} 
                        className={`px-4 py-2 rounded-md font-bold ${view === 'offer_list' ? 'bg-brew-accent text-brew-dark' : 'bg-brew-dark-secondary text-white'}`}
                    >
                        Offerte Clienti
                    </button>
                </div>
            </div>

            {/* General List View */}
            {view === 'dashboard' && (
                <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg overflow-x-auto">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-white">Listino Generale ALVERESE</h2>
                        {isGeneralListEditable ? (
                            <div className="flex gap-2">
                                <button onClick={() => setIsGeneralListEditable(false)} className="bg-slate-600 text-white font-bold py-2 px-4 rounded-md hover:bg-opacity-90">
                                    Annulla
                                </button>
                                <button onClick={handleSaveGeneralList} className="bg-brew-green text-white font-bold py-2 px-4 rounded-md hover:bg-opacity-90">
                                    Salva Listino
                                </button>
                            </div>
                        ) : (
                            <button onClick={() => setIsGeneralListEditable(true)} className="bg-brew-orange text-white font-bold py-2 px-4 rounded-md hover:bg-opacity-90">
                                AGGIORNA PREZZI LISTINO
                            </button>
                        )}
                    </div>
                    
                    {isGeneralListEditable && (
                        <div className="mb-4 flex gap-2 items-center bg-brew-dark p-2 rounded">
                            <select 
                                value={selectedBeerToAdd} 
                                onChange={e => setSelectedBeerToAdd(e.target.value)}
                                className="bg-brew-dark-secondary text-white p-2 rounded border border-slate-600"
                            >
                                <option value="">Seleziona birra da aggiungere...</option>
                                {allBeers.filter(b => !generalPriceList.some(p => p.beerName === b)).map(b => (
                                    <option key={b} value={b}>{b}</option>
                                ))}
                            </select>
                            <button onClick={handleAddBeerToGeneralList} className="bg-brew-blue text-white px-3 py-2 rounded hover:bg-opacity-80">
                                <PlusIcon className="w-5 h-5" />
                            </button>
                        </div>
                    )}

                    <PriceTable 
                        beers={generalPriceList.map(i => i.beerName)}
                        prices={generalPriceList}
                        onPriceChange={handlePriceChange}
                        readOnly={!isGeneralListEditable}
                    />
                </div>
            )}

            {/* Offer List View */}
            {view === 'offer_list' && (
                <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-xl font-bold text-white">Offerte Clienti Salvate</h2>
                        <button onClick={handleNewOffer} className="flex items-center gap-2 bg-brew-green text-white font-bold py-2 px-4 rounded-md hover:bg-opacity-90">
                            <PlusIcon className="w-5 h-5" /> Nuova Offerta
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {clientOffers.map(offer => (
                            <div 
                                key={offer.id} 
                                className="bg-brew-dark p-4 rounded-lg border border-slate-600 relative group"
                            >
                                <div onClick={() => handleEditOffer(offer)} className="cursor-pointer">
                                    <h3 className="text-lg font-bold text-brew-accent">{offer.clientName}</h3>
                                    <p className="text-sm text-gray-400">Data Offerta: {offer.date}</p>
                                    <p className="text-xs text-gray-500 mt-2">Clicca per modificare</p>
                                </div>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); handleDeleteOffer(offer.id); }}
                                    className="absolute top-2 right-2 text-red-500 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                                >
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                        {clientOffers.length === 0 && <p className="text-gray-400 col-span-full text-center py-8">Nessuna offerta salvata.</p>}
                    </div>
                </div>
            )}


            {/* Offer Editor View */}
            {view === 'offer_editor' && (
                <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-white">
                            {currentOffer?.id ? `Modifica Offerta: ${currentOffer.clientName}` : 'Nuova Offerta Cliente'}
                        </h2>
                        <div className="space-x-2">
                            <button onClick={() => setView('offer_list')} className="px-4 py-2 rounded-md bg-slate-600 font-semibold hover:bg-slate-500">Annulla</button>
                            <button onClick={handleSaveOffer} className="bg-brew-green text-white font-bold py-2 px-6 rounded-md hover:bg-opacity-90">
                                Salva Offerta
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Cliente</label>
                            <select 
                                value={selectedClientId} 
                                onChange={e => setSelectedClientId(e.target.value)} 
                                className="w-full bg-brew-dark p-2 rounded-md border border-slate-600 text-white"
                                disabled={!!currentOffer?.id && !currentOffer.id.startsWith('OFFER_')} // Disable if editing existing (unless it's a fresh new one)
                            >
                                <option value="">Seleziona Cliente...</option>
                                {clients.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Data Riferimento</label>
                            <input 
                                type="date" 
                                value={offerDate} 
                                onChange={e => setOfferDate(e.target.value)} 
                                className="w-full bg-brew-dark p-2 rounded-md border border-slate-600 text-white" 
                            />
                        </div>
                    </div>

                    {selectedClientId && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left text-gray-300 border-collapse">
                                <thead className="text-xs text-brew-dark uppercase bg-brew-accent sticky top-0">
                                    <tr>
                                        <th className="px-3 py-3 border border-slate-600">Birra</th>
                                        {PRICE_LIST_FORMATS.map(fmt => (
                                            <th key={fmt} className="px-3 py-3 text-center border border-slate-600 min-w-[100px]">{fmt}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {generalPriceList.map((item) => (
                                        <tr key={item.beerName} className="border-b border-slate-700 hover:bg-slate-700/50">
                                            <td className="px-3 py-2 font-bold border-r border-slate-700 bg-brew-dark sticky left-0">{item.beerName}</td>
                                            {PRICE_LIST_FORMATS.map(fmt => {
                                                const price = currentOffer?.prices?.[item.beerName]?.[fmt];
                                                const generalPrice = item.prices[fmt];
                                                return (
                                                    <td key={fmt} className="px-1 py-1 border-r border-slate-700 text-center">
                                                        <div className="relative">
                                                            <span className="absolute left-2 top-1.5 text-gray-500">€</span>
                                                            <input 
                                                                type="number" 
                                                                step="0.01"
                                                                value={price !== undefined ? price : ''} 
                                                                onChange={e => handleOfferPriceChange(item.beerName, fmt, e.target.value)}
                                                                className="w-full bg-transparent p-1 pl-6 text-right focus:outline-none focus:bg-slate-600 rounded"
                                                                placeholder={generalPrice !== undefined ? generalPrice.toFixed(2) : "-"}
                                                            />
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

interface PriceTableProps {
    beers: string[];
    prices: BeerPriceList[];
    // eslint-disable-next-line no-unused-vars
    onPriceChange: (index: number, format: string, value: string) => void;
    readOnly?: boolean;
}

const PriceTable: React.FC<PriceTableProps> = ({ beers, prices, onPriceChange, readOnly }) => {
    return (
        <table className="w-full text-sm text-left text-gray-300 border-collapse">
            <thead className="text-xs text-brew-dark uppercase bg-brew-accent sticky top-0">
                <tr>
                    <th className="px-3 py-3 border border-slate-600">Birra</th>
                    {PRICE_LIST_FORMATS.map(fmt => (
                        <th key={fmt} className="px-3 py-3 text-center border border-slate-600 min-w-[100px]">{fmt}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {beers.map((beerName, idx) => {
                    const beerPrices = prices.find(p => p.beerName === beerName)?.prices || {};
                    return (
                        <tr key={beerName} className="border-b border-slate-700 hover:bg-slate-700/50">
                            <td className="px-3 py-2 font-bold border-r border-slate-700 bg-brew-dark sticky left-0">{beerName}</td>
                            {PRICE_LIST_FORMATS.map(fmt => (
                                <td key={fmt} className="px-1 py-1 border-r border-slate-700 text-center">
                                    <div className="relative">
                                        <span className="absolute left-2 top-1.5 text-gray-500">€</span>
                                        <input 
                                            type="number" 
                                            step="0.01"
                                            value={beerPrices[fmt] !== undefined ? beerPrices[fmt] : ''} 
                                            onChange={e => onPriceChange(idx, fmt, e.target.value)}
                                            className="w-full bg-transparent p-1 pl-6 text-right focus:outline-none focus:bg-slate-600 rounded"
                                            placeholder="-"
                                            readOnly={readOnly}
                                        />
                                    </div>
                                </td>
                            ))}
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
};
