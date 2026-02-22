import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getBreweryData } from '../services/dataService';
// FIX: Import BeerStockItem as StockItem from shared types and remove local definition for consistency.
import type { BeerMovement, Cliente, BeerStockItem as StockItem } from '../types';
import { useTranslation } from '../i18n';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { CONFIG_PACKAGING } from '../constants';

interface SalesTrendViewProps {
    selectedYear: string;
}

const COLORS = ['#f1c40f', '#2980b9', '#27ae60', '#c0392b', '#d35400', '#8e44ad', '#34495e', '#7f8c8d'];

const parseDate = (dateStr: string) => {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        const [day, month, year] = parts.map(Number);
        return new Date(year, month - 1, day);
    }
    return new Date(0); // Epoch for invalid dates
};

export const SalesTrendView: React.FC<SalesTrendViewProps> = ({ selectedYear }) => {
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(true);
    const [clients, setClients] = useState<Cliente[]>([]);
    const [salesMovements, setSalesMovements] = useState<BeerMovement[]>([]);
    const [currentStock, setCurrentStock] = useState<StockItem[]>([]);
    const [selectedClientId, setSelectedClientId] = useState<string>('');

    const loadData = useCallback(async () => {
        setIsLoading(true);
        const data = await getBreweryData(selectedYear);
        if (data) {
            setClients(data.CLIENTI || []);
            
            const allMovements = data.BEER_MOVEMENTS || [];
            // Sales are both explicit sales and negative adjustments from inventory
            setSalesMovements(allMovements.filter(m => m.type === 'SALE' || (m.type === 'ADJUSTMENT' && m.quantita < 0)));

            // Calculate current stock (needed for slow-moving items)
            const stockMap = new Map<string, StockItem>();
            const lottoInfo = new Map<string, { clientName: string; beerName: string }>();
            (data.COTTE_HEAD || []).forEach(c => lottoInfo.set(c.LOTTO, { clientName: c.CLIENTE, beerName: c.NOME_BIRRA }));

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
            allMovements.forEach(mov => {
                const key = `${mov.cliente}|${mov.nomeBirra}|${mov.lotto}|${mov.formato}`;
                const existing = stockMap.get(key);
                if (existing) {
                    existing.quantita += mov.quantita;
                }
            });
            setCurrentStock(Array.from(stockMap.values()).filter(item => item.quantita > 0.001));
        }
        setIsLoading(false);
    }, [selectedYear]);

    useEffect(() => { loadData(); }, [loadData]);

    const analysisData = useMemo(() => {
        const clientName = clients.find(c => c.id === selectedClientId)?.nome;
        const movementsToAnalyze = clientName 
            ? salesMovements.filter(m => m.cliente === clientName)
            : salesMovements;

        if (movementsToAnalyze.length === 0) return null;

        const totalLitersSold = movementsToAnalyze.reduce((sum, mov) => {
            const config = CONFIG_PACKAGING[mov.formato];
            const liters = config ? config.litriUnit : 0;
            return sum + (Math.abs(mov.quantita) * liters);
        }, 0);

        const salesByBeer = movementsToAnalyze.reduce((acc, mov) => {
            const config = CONFIG_PACKAGING[mov.formato];
            const liters = config ? Math.abs(mov.quantita) * config.litriUnit : 0;
            acc[mov.nomeBirra] = (acc[mov.nomeBirra] || 0) + liters;
            return acc;
        }, {} as Record<string, number>);

        const salesByFormat = movementsToAnalyze.reduce((acc, mov) => {
            const config = CONFIG_PACKAGING[mov.formato];
            const liters = config ? Math.abs(mov.quantita) * config.litriUnit : 0;
            acc[mov.formato] = (acc[mov.formato] || 0) + liters;
            return acc;
        }, {} as Record<string, number>);

        const salesByClient = salesMovements.reduce((acc, mov) => {
            const config = CONFIG_PACKAGING[mov.formato];
            const liters = config ? Math.abs(mov.quantita) * config.litriUnit : 0;
            acc[mov.cliente] = (acc[mov.cliente] || 0) + liters;
            return acc;
        }, {} as Record<string, number>);
        
        const salesByMonthMap = movementsToAnalyze.reduce((acc, mov) => {
            const month = parseDate(mov.data).getMonth();
            const config = CONFIG_PACKAGING[mov.formato];
            const liters = config ? Math.abs(mov.quantita) * config.litriUnit : 0;
            acc[month] = (acc[month] || 0) + liters;
            return acc;
        }, {} as Record<number, number>);

        const salesByMonth = Array.from({ length: 12 }, (_, i) => ({
            name: new Date(0, i).toLocaleString('it-IT', { month: 'short' }),
            Litri: salesByMonthMap[i] || 0
        }));
        
        const topBeers = Object.entries(salesByBeer).map(([name, liters]) => ({ name, liters })).sort((a, b) => b.liters - a.liters);
        const topFormats = Object.entries(salesByFormat).map(([name, liters]) => ({ name, liters })).sort((a, b) => b.liters - a.liters);
        const topClients = Object.entries(salesByClient).map(([name, liters]) => ({ name, liters })).sort((a, b) => b.liters - a.liters);

        // Slow moving items logic
        const threshold = new Date();
        threshold.setDate(threshold.getDate() - 90); // 90 days threshold

        const slowMovingItems = currentStock
            .filter(item => clientName ? item.cliente === clientName : true)
            .map(item => {
                const salesForItem = salesMovements.filter(sale => 
                    sale.cliente === item.cliente &&
                    sale.nomeBirra === item.nomeBirra &&
                    sale.formato === item.formato &&
                    sale.lotto === item.lotto
                ).sort((a,b) => parseDate(b.data).getTime() - parseDate(a.data).getTime());
                
                const lastSaleDate = salesForItem.length > 0 ? parseDate(salesForItem[0].data) : null;
                return { ...item, lastSaleDate };
            })
            .filter(item => !item.lastSaleDate || item.lastSaleDate < threshold);

        return { totalLitersSold, topBeers, topFormats, topClients, salesByMonth, slowMovingItems };

    }, [salesMovements, currentStock, selectedClientId, clients]);

    if (isLoading) return <p>Caricamento dati di vendita...</p>;
    
    const clientName = clients.find(c => c.id === selectedClientId)?.nome || "Generale";

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-brew-accent">Andamento Vendite - {clientName} ({selectedYear})</h1>
            
            <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                <select 
                    value={selectedClientId} 
                    onChange={e => setSelectedClientId(e.target.value)}
                    className="w-full max-w-sm bg-brew-dark p-2 rounded-md border border-slate-600"
                >
                    <option value="">-- Analisi Generale --</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
            </div>

            {!analysisData ? (
                 <div className="text-center py-16 bg-brew-dark-secondary rounded-lg">
                    <p className="text-slate-400">Nessun dato di vendita per il periodo o cliente selezionato.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="bg-brew-accent text-brew-dark text-center p-4 rounded-lg">
                        <h3 className="text-xl font-bold">Litri Totali Venduti</h3>
                        <p className="text-5xl font-extrabold">{analysisData.totalLitersSold.toFixed(1)} L</p>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                            <h2 className="text-xl font-bold mb-4">{selectedClientId ? t('salesTrend.monthlySalesTrend') : t('salesTrend.topClientsByLiters')}</h2>
                            <div className="h-80">
                                <ResponsiveContainer width="100%" height="100%">
                                    {selectedClientId ? (
                                        <LineChart data={analysisData.salesByMonth} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                                            <XAxis dataKey="name" stroke="#94a3b8" />
                                            <YAxis stroke="#94a3b8" />
                                            <Tooltip formatter={(value: number) => `${value.toFixed(1)} L`} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569' }}/>
                                            <Line type="monotone" dataKey="Litri" name={t('salesTrend.litersSold')} stroke={COLORS[1]} strokeWidth={2} />
                                        </LineChart>
                                    ) : (
                                        <BarChart data={analysisData.topClients.slice(0, 10)} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                                            <XAxis type="number" stroke="#94a3b8" />
                                            <YAxis dataKey="name" type="category" width={120} stroke="#94a3b8" />
                                            <Tooltip formatter={(value: number) => `${value.toFixed(1)} L`} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569' }}/>
                                            <Bar dataKey="liters" name={t('salesTrend.litersPurchased')} fill={COLORS[2]} />
                                        </BarChart>
                                    )}
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                            <h2 className="text-xl font-bold mb-4">{t('salesTrend.topBeersByLiters')}</h2>
                            <div className="h-80">
                               <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={analysisData.topBeers} dataKey="liters" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                                            {analysisData.topBeers.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                        </Pie>
                                        <Tooltip formatter={(value: number) => `${value.toFixed(1)} L`} />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                     <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                        <h2 className="text-xl font-bold mb-4">{t('salesTrend.topFormatsByLiters')}</h2>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={analysisData.topFormats} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                                    <XAxis dataKey="name" stroke="#94a3b8" />
                                    <YAxis stroke="#94a3b8" />
                                    <Tooltip formatter={(value: number) => `${value.toFixed(1)} L`} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569' }}/>
                                    <Bar dataKey="liters" name={t('salesTrend.litersSold')} fill={COLORS[1]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                     </div>
                      {selectedClientId && analysisData.slowMovingItems.length > 0 && (
                        <div className="bg-red-900/50 border border-red-500 p-4 rounded-lg shadow-lg">
                            <h2 className="text-xl font-bold mb-4 text-red-300">Articoli a Lenta Movimentazione (Invenduti da &gt;90 giorni)</h2>
                             <div className="overflow-x-auto max-h-60">
                                <table className="w-full text-sm text-left text-red-200">
                                    <thead className="text-xs uppercase bg-red-800/60 sticky top-0">
                                        <tr>
                                            <th className="px-3 py-2">Birra</th>
                                            <th className="px-3 py-2">Formato</th>
                                            <th className="px-3 py-2">Lotto</th>
                                            <th className="px-3 py-2 text-right">Giacenza</th>
                                            <th className="px-3 py-2 text-center">Ultima Vendita</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {analysisData.slowMovingItems.map((item, index) => (
                                            <tr key={index} className="border-b border-red-700/50">
                                                <td className="px-3 py-2 font-semibold">{item.nomeBirra}</td>
                                                <td className="px-3 py-2">{item.formato}</td>
                                                <td className="px-3 py-2">{item.lotto}</td>
                                                <td className="px-3 py-2 text-right font-bold">{item.quantita}</td>
                                                <td className="px-3 py-2 text-center">{item.lastSaleDate ? item.lastSaleDate.toLocaleDateString('it-IT') : 'MAI VENDUTO'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};