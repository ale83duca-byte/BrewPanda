import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getBreweryData } from '../services/dataService';
// FIX: Use the existing and correctly shaped InitialBeerStock type instead of the non-exported BeerStockItem.
import type { InitialBeerStock } from '../types';
import { useTranslation } from '../i18n';
import { CubeIcon } from './icons';
import { InitialBeerStockModal } from './InitialBeerStockModal';
import { CONFIG_PACKAGING } from '../constants';

interface BeerWarehouseViewProps {
    selectedYear: string;
}

interface GroupedStock {
    [client: string]: {
        [beer: string]: InitialBeerStock[]
    }
}

export const BeerWarehouseView: React.FC<BeerWarehouseViewProps> = ({ selectedYear }) => {
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(true);
    const [stock, setStock] = useState<InitialBeerStock[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    const handleModalClose = () => {
        setIsModalOpen(false);
        setRefreshKey(prev => prev + 1); // Trigger a refresh
    };

    const loadStock = useCallback(async () => {
        setIsLoading(true);
        const data = await getBreweryData(selectedYear);
        if (data) {
            const stockMap = new Map<string, InitialBeerStock>();
             const lottoInfo = new Map<string, { clientName: string, beerName: string }>();
            (data.COTTE_HEAD || []).forEach(c => lottoInfo.set(c.LOTTO, { clientName: c.CLIENTE, beerName: c.NOME_BIRRA }));

            (data.BEER_WAREHOUSE_INITIAL || []).forEach(item => {
                const key = `${item.cliente}|${item.nomeBirra}|${item.lotto}|${item.formato}`;
                 stockMap.set(key, { ...item, quantita: item.quantita, dataScadenza: item.dataScadenza });
            });
            const lottoExpiration = new Map<string, string>();
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
                    lottoExpiration.set(pkg.LOTTO_PROD, pkg.DATA_SCADENZA);
                 }
            });
            (data.BEER_MOVEMENTS || []).forEach(mov => {
                const key = `${mov.cliente}|${mov.nomeBirra}|${mov.lotto}|${mov.formato}`;
                const existing = stockMap.get(key);
                if (existing) {
                    existing.quantita += mov.quantita;
                } else if (mov.quantita > 0) {
                    // If it's a new item (e.g. from a PURCHASE), add it to the map
                    stockMap.set(key, { 
                        cliente: mov.cliente, 
                        nomeBirra: mov.nomeBirra, 
                        lotto: mov.lotto, 
                        formato: mov.formato, 
                        quantita: mov.quantita, 
                        dataScadenza: lottoExpiration.get(mov.lotto) || 'N/A'
                    });
                }
            });

            const aggregatedStock = Array.from(stockMap.values())
                .filter(item => item.quantita > 0.001)
                .sort((a,b) => a.cliente.localeCompare(b.cliente) || a.nomeBirra.localeCompare(b.nomeBirra) || new Date(a.dataScadenza.split('/').reverse().join('-')).getTime() - new Date(b.dataScadenza.split('/').reverse().join('-')).getTime());

            setStock(aggregatedStock);
        }
        setIsLoading(false);
    }, [selectedYear]);

    useEffect(() => { loadStock(); }, [loadStock, refreshKey]);

    const groupedStock = useMemo(() => {
        return stock.reduce((acc: GroupedStock, item) => {
            if (!acc[item.cliente]) acc[item.cliente] = {};
            if (!acc[item.cliente][item.nomeBirra]) acc[item.cliente][item.nomeBirra] = [];
            acc[item.cliente][item.nomeBirra].push(item);
            return acc;
        }, {});
    }, [stock]);

    if (isLoading) {
        return <p>Caricamento magazzino birra...</p>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-brew-accent">{t('beerWarehouse.title')} - {selectedYear}</h1>
                <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-brew-orange text-white font-bold py-2 px-4 rounded-md hover:bg-opacity-90">
                    <CubeIcon className="w-5 h-5" /> Carica Giacenze Iniziali
                </button>
            </div>
            
            {stock.length === 0 ? (
                <div className="text-center py-16 bg-brew-dark-secondary rounded-lg">
                    <p className="text-slate-400">{t('beerWarehouse.noData')}</p>
                    <p className="text-sm mt-2">Puoi iniziare caricando le giacenze iniziali o registrando un confezionamento.</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {Object.entries(groupedStock).map(([clientName, beers]) => {
                        const totalClientLiters = Object.values(beers).flat().reduce((sum, item) => sum + (CONFIG_PACKAGING[item.formato]?.litriUnit * item.quantita || 0), 0);
                        return (
                            <div key={clientName} className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                                <div className="flex justify-between items-baseline mb-4 border-b border-slate-600 pb-2">
                                    <h2 className="text-2xl font-bold text-brew-accent">{clientName}</h2>
                                    <p className="text-xl font-bold text-brew-light">
                                        {t('beerWarehouse.totalLiters')}: <span className="text-2xl text-brew-accent">{totalClientLiters.toFixed(1)} L</span>
                                    </p>
                                </div>
                                <div className="space-y-4 pl-4">
                                    {Object.entries(beers).map(([beerName, items]) => (
                                        <div key={beerName}>
                                            <div className="flex justify-between items-baseline mb-2">
                                                <h3 className="text-xl font-semibold text-brew-light">{beerName}</h3>
                                                <p className="text-lg font-bold text-brew-accent">{t('beerWarehouse.totalLiters')}: {items.reduce((sum, i) => sum + (CONFIG_PACKAGING[i.formato]?.litriUnit * i.quantita || 0), 0).toFixed(1)} L</p>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm text-left text-gray-300">
                                                    <thead className="text-xs text-brew-light uppercase bg-slate-700">
                                                        <tr>
                                                            <th className="px-3 py-2">{t('beerWarehouse.batch')}</th>
                                                            <th className="px-3 py-2">{t('beerWarehouse.format')}</th>
                                                            <th className="px-3 py-2 text-right">{t('beerWarehouse.quantity')}</th>
                                                            <th className="px-3 py-2 text-center">{t('beerWarehouse.expirationDate')}</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {items.map((item, index) => (
                                                            <tr key={index} className="border-b border-slate-700/50">
                                                                <td className="px-3 py-2 font-semibold">{item.lotto}</td>
                                                                <td className="px-3 py-2">{item.formato}</td>
                                                                <td className="px-3 py-2 text-right font-medium">{item.quantita}</td>
                                                                <td className="px-3 py-2 text-center font-medium">{item.dataScadenza}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            {isModalOpen && <InitialBeerStockModal selectedYear={selectedYear} onClose={handleModalClose} />}
        </div>
    );
};