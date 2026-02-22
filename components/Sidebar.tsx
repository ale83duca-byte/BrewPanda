
import React from 'react';
import type { View } from '../App';
import { HouseIcon, DocumentTextIcon, ArchiveBoxIcon, TruckIcon, BeakerIcon, TableCellsIcon, BrewPandaLogo, ArrowPathIcon, CylinderStackIcon, ArrowDownTrayIcon, ArrowUpTrayIcon, ArrowDownIcon } from './icons';
import { useTranslation } from '../i18n';
import { downloadLogoAsPng } from '../utils/imageExport';

interface SidebarProps {
    years: string[];
    selectedYear: string;
    activeView: View;
    onYearSelect: (year: string) => void;
    onNewYear: () => void;
    onNavigate: (view: View) => void;
    onNewLotto: () => void;
    onLoadGoods: () => void;
    onDischargeGoods: () => void;
    onExportYear: () => void;
    onRefresh: () => void;
    onExportAllData: () => void;
    onImportData: () => void;
    onFactoryReset: () => void;
}

const NavButton: React.FC<{
    icon: React.ReactNode;
    label: string;
    isActive: boolean;
    onClick: () => void;
    isAction?: boolean;
}> = ({ icon, label, isActive, onClick, isAction = false }) => (
    <li>
        <button
            onClick={onClick}
            className={`w-full flex items-center px-3 py-2 rounded-md text-sm transition-colors ${
                isActive 
                ? 'bg-brew-accent text-brew-dark font-bold' 
                : isAction
                ? 'hover:bg-brew-orange/20 text-brew-orange'
                : 'hover:bg-brew-dark-secondary text-brew-light'
            }`}
        >
            <span className="w-6 h-6 mr-3">{icon}</span>
            <span>{label}</span>
        </button>
    </li>
);

export const Sidebar: React.FC<SidebarProps> = ({ years, selectedYear, activeView, onYearSelect, onNewYear, onNavigate, onNewLotto, onLoadGoods, onDischargeGoods, onExportYear, onRefresh, onExportAllData, onImportData, onFactoryReset }) => {
    const { t } = useTranslation();
    
    return (
        <aside className="w-60 bg-brew-dark flex-shrink-0 flex flex-col border-r border-slate-700 p-3 overflow-y-auto">
            <div className="p-1 text-center mb-4 flex flex-col items-center">
                <div id="app-logo-container">
                    <BrewPandaLogo className="w-24 h-auto mb-2" />
                </div>
                <h1 className="text-3xl font-bold text-brew-light leading-none">BREW<span className="text-brew-accent">PANDA</span></h1>
                <p className="text-xs text-slate-400 mt-1">v1.5 Web</p>
                <button 
                    onClick={() => downloadLogoAsPng('app-logo-container')}
                    className="mt-2 flex items-center gap-1 text-[10px] font-bold text-brew-accent hover:text-white transition-colors bg-brew-dark-secondary px-2 py-1 rounded border border-slate-600 shadow-sm"
                    title="Scarica l'icona in formato PNG per il tuo desktop"
                >
                    <ArrowDownIcon className="w-3 h-3" /> SCARICA ICONA
                </button>
            </div>
            
            <div className="mb-6">
                <h2 className="text-sm font-bold text-brew-accent mb-2 px-2">{t('sidebar.mainMenu')}</h2>
                <ul className="space-y-1">
                    <NavButton icon={<HouseIcon />} label={t('sidebar.home')} isActive={activeView === 'HOME'} onClick={() => onNavigate('HOME')} />
                    <NavButton icon={<DocumentTextIcon />} label={t('sidebar.movements')} isActive={activeView === 'MOVEMENTS'} onClick={() => onNavigate('MOVEMENTS')} />
                    <NavButton icon={<ArchiveBoxIcon />} label={t('sidebar.warehouse')} isActive={activeView === 'WAREHOUSE'} onClick={() => onNavigate('WAREHOUSE')} />
                    <NavButton icon={<TruckIcon style={{ transform: 'scaleX(-1)'}} />} label={t('sidebar.loadGoods')} isActive={false} onClick={onLoadGoods} />
                    <NavButton icon={<TruckIcon />} label={t('sidebar.dischargeGoods')} isActive={false} onClick={onDischargeGoods} isAction={true} />
                    <NavButton icon={<TableCellsIcon />} label={t('sidebar.exportYear')} isActive={false} onClick={onExportYear} />
                    <NavButton icon={<ArrowDownTrayIcon />} label={t('sidebar.exportAllData')} isActive={false} onClick={onExportAllData} />
                    <NavButton icon={<ArrowUpTrayIcon />} label={t('sidebar.importData')} isActive={false} onClick={onImportData} />
                    <NavButton icon={<ArrowPathIcon />} label={t('sidebar.refreshData')} isActive={false} onClick={onRefresh} />
                </ul>
            </div>

             <div className="mb-6">
                <h2 className="text-sm font-bold text-brew-accent mb-2 px-2">{t('sidebar.productionManagement')}</h2>
                 <button 
                    onClick={onNewLotto}
                    className="w-full flex items-center justify-center px-3 py-3 rounded-md text-lg transition-colors bg-brew-orange text-white font-bold hover:bg-opacity-90 mb-2"
                >
                    <BeakerIcon className="w-6 h-6 mr-2"/> {t('sidebar.newBrew')}
                </button>
                 <button 
                    onClick={() => onNavigate('CANTINA')}
                    className="w-full flex items-center justify-center px-3 py-3 rounded-md text-lg transition-colors bg-brew-blue text-white font-bold hover:bg-opacity-90 mb-2"
                >
                    <CylinderStackIcon className="w-6 h-6 mr-2"/> {t('sidebar.cellarManagement')}
                </button>
                <button 
                    onClick={() => onNavigate('DATABASE')}
                    className={`w-full flex items-center justify-center px-3 py-3 rounded-md text-lg transition-colors font-bold mb-2 ${
                        activeView === 'DATABASE' ? 'bg-brew-accent text-brew-dark' : 'bg-slate-600 text-white hover:bg-slate-500'
                    }`}
                >
                     {t('sidebar.clientBeerDb')}
                </button>
            </div>

            <div className="mt-auto">
                <h2 className="text-sm font-bold text-brew-accent mb-2 px-2">📅 {t('sidebar.yearArchive')}</h2>
                <ul className="space-y-1 max-h-40 overflow-y-auto pr-1">
                    {years.map(year => (
                        <li key={year}>
                            <button
                                onClick={() => onYearSelect(year)}
                                className={`w-full text-left px-3 py-1.5 rounded-md text-sm transition-colors ${
                                    selectedYear === year 
                                    ? 'bg-brew-blue text-white font-bold' 
                                    : 'hover:bg-brew-dark-secondary'
                                }`}
                            >
                                {year}
                            </button>
                        </li>
                    ))}
                </ul>
                <button 
                    onClick={onNewYear}
                    className="w-full mt-3 bg-brew-green text-white font-bold py-2 px-4 rounded-md text-sm hover:bg-opacity-80 transition-all"
                >
                    ➕ {t('sidebar.createNewYear')}
                </button>
                <button 
                    onClick={onFactoryReset}
                    className="w-full mt-3 bg-brew-red text-black font-bold py-2 px-4 rounded-md text-sm hover:bg-opacity-80 transition-all"
                >
                    💣 Programma Base
                </button>
            </div>
        </aside>
    );
};
