

import { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { Home } from './components/Home';
import { MovementsView } from './components/MovementsView';
import { WarehouseView } from './components/WarehouseView';
import { CantinaView } from './components/CantinaView';
import BrewPage from './components/BrewPage';
import { NewYearModal } from './components/NewYearModal';
import { LoadGoodsModal } from './components/LoadGoodsModal';
import { DischargeGoodsModal } from './components/DischargeGoodsModal';
import { DatabaseView } from './components/DatabaseView';
// FIX: import `importAllBreweryData` to resolve missing name error.
import { getYears as fetchYears, initializeCurrentYearData, getBreweryData, getAllBreweryData, checkAndProcessWarehouseStatus, checkLottoExists, importAllBreweryData } from './services/dataService';
import { migrateFromLocalStorage, factoryReset } from './services/db';
import { BrewPandaLogo } from './components/icons';
import { excel } from './utils/excelExport';
import type { WarehouseStatus } from './types';
import { useToast } from './hooks/useToast';
import { RightSidebar } from './components/RightSidebar';
import { useTranslation } from './i18n';
import { CostAnalysisView } from './components/CostAnalysisView';
import { CoefficientsModal } from './components/CoefficientsModal';
import { LottoActionModal } from './components/LottoActionModal';
import { ProductionTrendView } from './components/ProductionTrendView';
import { BrewQuoteView } from './components/BrewQuoteView';
import { QuotesListView } from './components/QuotesListView';
import { BeerWarehouseView } from './components/BeerWarehouseView';
import { SalesOrderView } from './components/SalesOrderView';
import { BeerInventoryView } from './components/BeerInventoryView';
import { SalesTrendView } from './components/SalesTrendView';
import { FactoryResetModal } from './components/FactoryResetModal';

export type View = 'HOME' | 'MOVEMENTS' | 'WAREHOUSE' | 'BREW_PAGE' | 'CANTINA' | 'DATABASE' | 'COST_ANALYSIS' | 'PRODUCTION_TREND' | 'BREW_QUOTE' | 'QUOTES_LIST' | 'BEER_WAREHOUSE' | 'SALES_ORDER' | 'BEER_INVENTORY' | 'SALES_TREND';

export default function App() {
    const [years, setYears] = useState<string[]>([]);
    const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
    const [activeView, setActiveView] = useState<View>('HOME');
    const [editingLottoId, setEditingLottoId] = useState<string | null>(null);
    const [editingQuoteId, setEditingQuoteId] = useState<string | null>(null);
    const [preselectedLottoId, setPreselectedLottoId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [lottoSearchTerm, setLottoSearchTerm] = useState('');

    const [isNewYearModalOpen, setNewYearModalOpen] = useState(false);
    const [isLoadGoodsModalOpen, setLoadGoodsModalOpen] = useState(false);
    const [isDischargeGoodsModalOpen, setDischargeGoodsModalOpen] = useState(false);
    const [isCoefficientsModalOpen, setCoefficientsModalOpen] = useState(false);
    const [isFactoryResetModalOpen, setFactoryResetModalOpen] = useState(false);
    const [lottoActionModal, setLottoActionModal] = useState<{ isOpen: boolean, lottoId: string | null }>({ isOpen: false, lottoId: null });
    const [isLoading, setIsLoading] = useState(true);
    const [loadingMessage, setLoadingMessage] = useState('Caricamento Brew Panda...');
    const [refreshKey, setRefreshKey] = useState(0);
    const [warehouseStatus, setWarehouseStatus] = useState<WarehouseStatus | null>(null);
    const [showSaveIndicator, setShowSaveIndicator] = useState(false);
    const { showToast } = useToast();
    const { t } = useTranslation();

    const handleRefresh = useCallback(() => setRefreshKey(prev => prev + 1), []);

    const refreshYears = useCallback(async () => {
        const availableYears = await fetchYears();
        setYears(availableYears);
        if (availableYears.length > 0 && !availableYears.includes(selectedYear)) {
            setSelectedYear(availableYears[0]);
        }
        return availableYears;
    }, [selectedYear]);

    const checkWarehouse = useCallback(async (year: string) => {
        const status = await checkAndProcessWarehouseStatus(year);
        setWarehouseStatus(status);

        if (status.dischargedItems.length > 0) {
            const dischargedSummary = status.dischargedItems.map(item => `${item.nome} (Lotto: ${item.lotto})`).join(', ');
            showToast(t('toast.expiredLotsDischarged', { summary: dischargedSummary }), 'warning');
            handleRefresh();
        }
    }, [handleRefresh, showToast, t]);

    useEffect(() => {
        const initializeApp = async () => {
            setIsLoading(true);
            setLoadingMessage(t('loading.migratingDb'));
            const migrated = await migrateFromLocalStorage();
            if (migrated) {
                showToast(t('toast.dbUpdated'), 'success');
            }

            setLoadingMessage(t('loading.initializingYear'));
            await initializeCurrentYearData();
            
            setLoadingMessage(t('loading.loadingData'));
            const availableYears = await refreshYears();
            const yearToLoad = availableYears.includes(selectedYear) ? selectedYear : availableYears[0];

            if (yearToLoad) {
                await checkWarehouse(yearToLoad);
            }
            setIsLoading(false);
        };
        
        initializeApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    
    useEffect(() => {
       const loadYearData = async () => {
         if(!isLoading) { // Prevent running on initial load
            setIsLoading(true);
            await checkWarehouse(selectedYear);
            handleRefresh();
            setIsLoading(false);
         }
       };
       loadYearData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedYear]);

     useEffect(() => {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/service-worker.js').catch(error => {
                    console.log('ServiceWorker registration failed: ', error);
                });
            });
        }
        
        const handleDataSaved = () => {
            setShowSaveIndicator(true);
            const timer = setTimeout(() => setShowSaveIndicator(false), 2000);
            return () => clearTimeout(timer);
        };

        window.addEventListener('data-saved', handleDataSaved);
        return () => window.removeEventListener('data-saved', handleDataSaved);
    }, []);

    const handleYearChange = (year: string) => {
        setSelectedYear(year);
        setActiveView('HOME');
    };

    const handleNewLotto = () => {
        setEditingLottoId(null);
        setActiveView('BREW_PAGE');
    };

    const handleOpenLotto = (lottoId: string) => {
        setEditingLottoId(lottoId);
        setActiveView('BREW_PAGE');
    };

    const handleSaveNewLotto = (newLottoId: string) => {
        setEditingLottoId(newLottoId);
    };
    
    const handleLottoSearch = async () => {
        const searchTerm = lottoSearchTerm.trim().toUpperCase();
        if(!searchTerm) return;

        const lottoExists = await checkLottoExists(selectedYear, searchTerm);

        if (lottoExists) {
            setLottoActionModal({ isOpen: true, lottoId: searchTerm });
        } else {
            showToast(t('toast.lottoNotFound', { lottoId: searchTerm }), 'error');
        }
    }

    const openLottoCostAnalysis = (lottoId: string) => {
        setPreselectedLottoId(lottoId);
        setActiveView('COST_ANALYSIS');
    };

    const handleExportYear = async () => {
        const data = await getBreweryData(selectedYear);
        if (data) {
           excel(data, selectedYear);
        } else {
            showToast(t('toast.noDataForYear', { year: selectedYear }), 'error');
        }
    };

    const handleExportAllData = async () => {
        try {
            const allData = await getAllBreweryData();
            if (Object.keys(allData).length === 0) {
                showToast("Nessun dato da esportare.", 'warning');
                return;
            }
            
            // Create a JSON backup file
            const jsonString = JSON.stringify(allData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const date = new Date().toISOString().slice(0, 10);
            link.download = `brewpanda_all_data_backup_${date}.json`;

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            showToast(t('toast.dataExported'), 'success');
        } catch (error) {
            console.error('Export failed:', error);
            showToast(t('toast.exportError'), 'error');
        }
    };

    const handleImportData = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (event) => {
            const file = (event.target as HTMLInputElement).files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const text = e.target?.result;
                    if (typeof text !== 'string') throw new Error(t('errors.fileNotReadable'));
                    
                    const data = JSON.parse(text);

                    if (typeof data !== 'object' || data === null || Object.keys(data).some(key => !/^\d{4}$/.test(key))) {
                         throw new Error(t('errors.invalidBackupFile'));
                    }
                    
                    if (window.confirm(t('confirmations.import'))) {
                        await importAllBreweryData(data);
                        showToast(t('toast.dataImported'), 'success');
                        setTimeout(() => window.location.reload(), 2000);
                    }
                } catch (error) {
                    console.error('Import failed:', error);
                    const errorMessage = error instanceof Error ? error.message : t('errors.unknown');
                    showToast(t('toast.importError', { message: errorMessage }), 'error');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    };

    const handleConfirmFactoryReset = async () => {
        await factoryReset();
        showToast("Programma ripristinato. Ricaricamento in corso...", "success");
        setTimeout(() => {
            window.location.reload();
        }, 2000);
    };


    const renderView = () => {
        switch (activeView) {
            case 'HOME':
                return <Home key={refreshKey} warehouseStatus={warehouseStatus} selectedYear={selectedYear} onRefresh={handleRefresh} />;
            case 'MOVEMENTS':
                return <MovementsView key={`${selectedYear}-${refreshKey}`} selectedYear={selectedYear} searchTerm={searchTerm} onRefresh={handleRefresh} />;
            case 'WAREHOUSE':
                return <WarehouseView key={`${selectedYear}-${refreshKey}`} selectedYear={selectedYear} />;
            case 'CANTINA':
                return <CantinaView key={`${selectedYear}-${refreshKey}`} selectedYear={selectedYear} />;
            case 'BREW_PAGE':
                return <BrewPage key={`${selectedYear}-${editingLottoId || 'new'}-${refreshKey}`} selectedYear={selectedYear} lottoId={editingLottoId} onExit={() => setActiveView('HOME')} onSaveNewLotto={handleSaveNewLotto} />;
            case 'DATABASE':
                return <DatabaseView key={`${selectedYear}-${refreshKey}`} selectedYear={selectedYear} />;
            case 'COST_ANALYSIS':
                return <CostAnalysisView key={`${selectedYear}-${refreshKey}`} selectedYear={selectedYear} lottoToOpenId={preselectedLottoId} onExit={() => { setActiveView('HOME'); setPreselectedLottoId(null); }} />;
             case 'PRODUCTION_TREND':
                return <ProductionTrendView key={`${selectedYear}-${refreshKey}`} selectedYear={selectedYear} onExit={() => setActiveView('HOME')} />;
            case 'QUOTES_LIST':
                return <QuotesListView 
                            key={`${selectedYear}-${refreshKey}`} 
                            selectedYear={selectedYear} 
                            onNewQuote={() => { setEditingQuoteId(null); setActiveView('BREW_QUOTE'); }}
                            onOpenQuote={(id) => { setEditingQuoteId(id); setActiveView('BREW_QUOTE'); }}
                        />;
            case 'BREW_QUOTE':
                return <BrewQuoteView 
                            key={`${selectedYear}-${editingQuoteId || 'new'}-${refreshKey}`} 
                            selectedYear={selectedYear} 
                            quoteId={editingQuoteId}
                            onExit={() => setActiveView('QUOTES_LIST')} 
                        />;
            case 'BEER_WAREHOUSE':
                return <BeerWarehouseView key={`${selectedYear}-${refreshKey}`} selectedYear={selectedYear} />;
            case 'SALES_ORDER':
                return <SalesOrderView key={`${selectedYear}-${refreshKey}`} selectedYear={selectedYear} onRefresh={handleRefresh} />;
            case 'BEER_INVENTORY':
                return <BeerInventoryView key={`${selectedYear}-${refreshKey}`} selectedYear={selectedYear} onRefresh={handleRefresh} />;
            case 'SALES_TREND':
                return <SalesTrendView key={`${selectedYear}-${refreshKey}`} selectedYear={selectedYear} />;
            default:
                return <Home key={refreshKey} warehouseStatus={warehouseStatus} selectedYear={selectedYear} onRefresh={handleRefresh} />;
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-screen bg-brew-dark text-brew-accent">
                <BrewPandaLogo className="w-24 h-auto animate-pulse" />
                <h1 className="text-4xl font-bold ml-4">{loadingMessage}</h1>
            </div>
        );
    }
    
    return (
        <div className="flex h-screen bg-brew-dark text-brew-light font-sans">
            <Sidebar
                years={years}
                selectedYear={selectedYear}
                activeView={activeView}
                onYearSelect={handleYearChange}
                onNewYear={() => setNewYearModalOpen(true)}
                onNavigate={setActiveView}
                onNewLotto={handleNewLotto}
                onLoadGoods={() => setLoadGoodsModalOpen(true)}
                onDischargeGoods={() => setDischargeGoodsModalOpen(true)}
                onExportYear={handleExportYear}
                onRefresh={() => { checkWarehouse(selectedYear); handleRefresh(); }}
                onExportAllData={handleExportAllData}
                onImportData={handleImportData}
                onFactoryReset={() => setFactoryResetModalOpen(true)}
            />
            <main className="flex-1 flex flex-col overflow-hidden">
                <Header 
                    selectedYear={selectedYear}
                    showSaveIndicator={showSaveIndicator}
                />
                <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-brew-dark-secondary">
                    {renderView()}
                </div>
                <footer className="bg-brew-dark p-3 border-t border-slate-700 flex justify-between items-center flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                        <label htmlFor="search" className="text-sm font-semibold">{t('footer.searchMovement')}:</label>
                        <input
                            id="search"
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && setActiveView('MOVEMENTS')}
                            className="bg-brew-dark-secondary p-1.5 rounded-md text-sm w-40 focus:ring-2 focus:ring-brew-accent focus:outline-none"
                        />
                         <button onClick={() => setActiveView('MOVEMENTS')} className="px-3 py-1.5 bg-brew-blue rounded-md text-sm font-bold hover:bg-opacity-80">🔍</button>
                    </div>
                    <div className="flex items-center gap-2">
                         <label htmlFor="lottoSearch" className="text-sm font-semibold">{t('footer.openLotto')}:</label>
                         <input
                            id="lottoSearch"
                            type="text"
                            value={lottoSearchTerm}
                            onChange={(e) => setLottoSearchTerm(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleLottoSearch()}
                            className="bg-yellow-100 text-slate-900 p-1.5 rounded-md text-sm w-40 focus:ring-2 focus:ring-brew-orange focus:outline-none"
                        />
                        <button onClick={handleLottoSearch} className="px-3 py-1.5 bg-brew-orange rounded-md text-sm font-bold hover:bg-opacity-80">{t('footer.open')}</button>
                    </div>
                </footer>
            </main>
             <RightSidebar 
                selectedYear={selectedYear} 
                refreshKey={refreshKey} 
                onNavigate={setActiveView}
                onOpenCoefficients={() => setCoefficientsModalOpen(true)}
            />
            {isNewYearModalOpen && <NewYearModal onClose={() => setNewYearModalOpen(false)} onYearCreated={refreshYears} />}
            {isLoadGoodsModalOpen && <LoadGoodsModal selectedYear={selectedYear} onClose={() => {
                setLoadGoodsModalOpen(false);
                checkWarehouse(selectedYear);
                handleRefresh();
            }} />}
            {isDischargeGoodsModalOpen && <DischargeGoodsModal selectedYear={selectedYear} onClose={() => {
                setDischargeGoodsModalOpen(false);
                checkWarehouse(selectedYear);
                handleRefresh();
            }} />}
            {isCoefficientsModalOpen && <CoefficientsModal selectedYear={selectedYear} onClose={() => setCoefficientsModalOpen(false)} />}
            {lottoActionModal.isOpen && lottoActionModal.lottoId && (
                <LottoActionModal
                    lottoId={lottoActionModal.lottoId}
                    onClose={() => setLottoActionModal({ isOpen: false, lottoId: null })}
                    onOpenBrewPage={() => {
                        handleOpenLotto(lottoActionModal.lottoId!);
                        setLottoActionModal({ isOpen: false, lottoId: null });
                    }}
                    onOpenCostAnalysis={() => {
                        openLottoCostAnalysis(lottoActionModal.lottoId!);
                        setLottoActionModal({ isOpen: false, lottoId: null });
                    }}
                />
            )}
            {isFactoryResetModalOpen && (
                <FactoryResetModal
                    onClose={() => setFactoryResetModalOpen(false)}
                    onConfirm={handleConfirmFactoryReset}
                />
            )}
        </div>
    );
}