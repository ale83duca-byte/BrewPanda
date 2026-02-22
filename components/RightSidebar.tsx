
import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from '../i18n';
import { BrewPandaLogo, CubeIcon, ClipboardDocumentListIcon, CalculatorIcon, ChartBarIcon } from './icons';
import { getSheetData } from '../services/dataService';
import type { PriceDBItem } from '../types';
import { PriceSearchModal } from './PriceSearchModal';
import type { View } from '../App';

interface RightSidebarProps {
    selectedYear: string;
    refreshKey: number;
    // eslint-disable-next-line no-unused-vars
    onNavigate: (view: View) => void;
    onOpenCoefficients: () => void;
}

const Button: React.FC<{
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    className?: string;
    textClassName?: string;
}> = ({ onClick, icon, label, className, textClassName }) => (
    <button
        onClick={onClick}
        className={`w-full flex items-center justify-center px-3 py-2 rounded-md transition-colors text-white font-bold hover:bg-opacity-90 ${className}`}
    >
        {icon}
        <span className={textClassName || 'text-sm'}>{label}</span>
    </button>
);


export const RightSidebar: React.FC<RightSidebarProps> = ({ selectedYear, refreshKey, onNavigate, onOpenCoefficients }) => {
    const { t } = useTranslation();
    const [priceDb, setPriceDb] = useState<PriceDBItem[]>([]);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const loadPriceData = async () => {
            if (selectedYear) {
                const data = await getSheetData(selectedYear, 'PRICE_DATABASE');
                setPriceDb(data as PriceDBItem[] || []);
            }
        };
        loadPriceData();
    }, [selectedYear, refreshKey]);

    const filteredPriceDb = useMemo(() => {
        if (!searchTerm) return [];
        const lowercasedFilter = searchTerm.toLowerCase();
        return priceDb
            .filter(item => 
                item.NOME.toLowerCase().includes(lowercasedFilter) ||
                item.MARCA.toLowerCase().includes(lowercasedFilter) ||
                item.FORNITORE.toLowerCase().includes(lowercasedFilter)
            )
            .sort((a, b) => a.NOME.localeCompare(b.NOME));
    }, [priceDb, searchTerm]);

    return (
        <aside className="w-60 bg-brew-dark flex-shrink-0 flex flex-col border-l border-slate-700 p-3">
            <div className="p-1 text-center mb-4 flex flex-col items-center">
                <BrewPandaLogo className="w-24 h-auto mb-2" />
                <h1 className="text-3xl font-bold text-brew-light">BREW<span className="text-brew-accent">PANDA</span></h1>
                <p className="text-xs text-slate-400">v1.5 Web</p>
            </div>
            
            <div className="flex-grow flex flex-col">
                <div className="mb-4">
                    <h2 className="text-sm font-bold text-brew-accent mb-2 px-2 text-center">
                        {t('rightSidebar.commercialAdminTitle')}
                    </h2>
                </div>
                <div className="space-y-2 mb-6">
                     <Button onClick={() => onNavigate('COST_ANALYSIS')} icon={null} label={t('rightSidebar.batchCostButton')} className="bg-brew-orange py-3" textClassName="text-base" />
                     <Button onClick={() => onNavigate('PRODUCTION_TREND')} icon={null} label={t('rightSidebar.productionTrendButton')} className="bg-teal-600 hover:bg-teal-500" />
                     <Button onClick={() => onNavigate('QUOTES_LIST')} icon={null} label={t('rightSidebar.brewQuoteButton')} className="bg-brew-blue py-3" textClassName="text-base" />
                </div>

                <div className="border-t border-slate-700 pt-4">
                    <Button onClick={onOpenCoefficients} icon={null} label={t('rightSidebar.coefficientsButton')} className="bg-brew-green mb-4" />
                     <label htmlFor="price-search" className="text-sm font-bold text-brew-accent mb-2 px-2 block text-center">
                        {t('rightSidebar.priceDbSearchTitle')}
                    </label>
                    <input
                        id="price-search"
                        type="text"
                        placeholder={t('rightSidebar.priceDbSearchPlaceholder')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-brew-dark-secondary p-1.5 rounded-md text-sm focus:ring-2 focus:ring-brew-accent focus:outline-none mb-4"
                    />
                    <Button 
                        onClick={() => onNavigate('BEER_PRICE_LIST')} 
                        icon={null} 
                        label="LISTINO PREZZI BIRRE FINITE" 
                        className="bg-brew-purple py-2 text-xs" 
                    />
                </div>
                
                <div className="mt-auto pt-4 border-t border-slate-700">
                    <h2 className="text-sm font-bold text-brew-accent mb-2 px-2 text-center">
                        {t('rightSidebar.packagedBeerTitle')}
                    </h2>
                    <div className="space-y-2">
                         <Button 
                            onClick={() => onNavigate('BEER_WAREHOUSE')}
                            icon={<CubeIcon className="w-5 h-5 mr-2"/>}
                            label={t('rightSidebar.beerWarehouseButton')}
                            className="bg-brew-purple"
                        />
                        <Button onClick={() => onNavigate('SALES_ORDER')} icon={<ClipboardDocumentListIcon className="w-5 h-5 mr-2" />} label={t('rightSidebar.salesOrderButton')} className="bg-sky-600 hover:bg-sky-500" />
                        <Button onClick={() => onNavigate('SALES_TREND')} icon={<ChartBarIcon className="w-5 h-5 mr-2" />} label={t('rightSidebar.salesTrendButton')} className="bg-rose-600 hover:bg-rose-500" />
                        <Button onClick={() => onNavigate('BEER_INVENTORY')} icon={<CalculatorIcon className="w-5 h-5 mr-2" />} label={t('rightSidebar.beerInventoryButton')} className="bg-indigo-600 hover:bg-indigo-500" />
                    </div>
                </div>
            </div>

            <PriceSearchModal
                isOpen={searchTerm.length > 0}
                onClose={() => setSearchTerm('')}
                searchTerm={searchTerm}
                results={filteredPriceDb}
            />
        </aside>
    );
};
