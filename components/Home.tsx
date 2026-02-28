import React, { useState, useEffect } from 'react';
import { TrashIcon, XMarkIcon } from './icons';
import { getBreweryData, deleteWarehouseItem } from '../services/dataService';
import type { WarehouseStatus, Movement, PackagingData, RawWarehouseItem } from '../types';
import { InitialInventoryModal } from './InitialInventoryModal';
import { useTranslation } from '../i18n';
import { isInventoryDay } from '../utils/inventoryReminder';
import { useToast } from '../hooks/useToast';
import { CONFIG_PACKAGING } from '../constants';

interface HomeProps {
    warehouseStatus: WarehouseStatus | null;
    selectedYear: string;
    onRefresh: () => void;
}

interface ProductionSummaryRow {
    numeroProgressivo: number;
    dataProduzione: string;
    cliente: string;
    lotto: string;
    litriContaMosto: string;
    gasUtilizzato: string;
    tipologia: string;
    litriProdotti: string;
    numeroFermentatore: string;
    dataConfezionamento: string;
    litriConfezionati: string;
    modalitaConfezionamento: string;
}

const AlertBox: React.FC<{ title: string; items: React.ReactNode[]; type: 'warning' | 'info'; onClose: () => void; }> = ({ title, items, type, onClose }) => {
    if (items.length === 0) return null;

    const colors = {
        warning: 'border-yellow-500 bg-yellow-500/10 text-yellow-300',
        info: 'border-blue-500 bg-blue-500/10 text-blue-300',
    };

    return (
        <div className={`border rounded-lg p-3 shadow-md ${colors[type]} w-full max-w-sm backdrop-blur-sm`}>
            <div className="flex justify-between items-center mb-2">
                <h3 className="font-bold text-sm">{title}</h3>
                <button onClick={onClose} className="hover:text-white"><XMarkIcon className="w-4 h-4" /></button>
            </div>
            <ul className="text-xs list-none pl-0 space-y-1 max-h-24 overflow-y-auto">
                {items.map((item, index) => <li key={index}>{item}</li>)}
            </ul>
        </div>
    );
};


export const Home: React.FC<HomeProps> = ({ warehouseStatus, selectedYear, onRefresh }) => {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const [showExpiring, setShowExpiring] = useState(true);
    const [showExpiringBeer, setShowExpiringBeer] = useState(true);
    const [showOutOfStock, setShowOutOfStock] = useState(true);
    const [initialInventory, setInitialInventory] = useState<Movement[]>([]);
    const [isInventoryModalOpen, setInventoryModalOpen] = useState(false);
    const [summaryData, setSummaryData] = useState<ProductionSummaryRow[]>([]);
    const [showInventoryReminder, setShowInventoryReminder] = useState(false);

    useEffect(() => {
        const loadHomeData = async () => {
            setShowInventoryReminder(isInventoryDay());
            const breweryData = await getBreweryData(selectedYear);
            if (!breweryData) return;

            const { MOVIMENTAZIONE, COTTE_HEAD, CONFEZIONAMENTO } = breweryData;

            const inventory = MOVIMENTAZIONE.filter(m => m.N_FATTURA === 'RIPORTO_ANNO_PREC' || m.FORNITORE === 'INVENTARIO INIZIALE');
            setInitialInventory(inventory);

            const sortedCotte = [...COTTE_HEAD].sort((a, b) => {
                 try {
                    const dateA = new Date(a.DATA_PROD.split('/').reverse().join('-')).getTime();
                    const dateB = new Date(b.DATA_PROD.split('/').reverse().join('-')).getTime();
                    if (isNaN(dateA) || isNaN(dateB)) return 0;
                    return dateA - dateB;
                } catch {
                    return 0;
                }
            });

            const processedData = sortedCotte.map((cotta, index): ProductionSummaryRow => {
                const relatedPackaging = (CONFEZIONAMENTO as PackagingData[]).filter(p => p.LOTTO_PROD === cotta.LOTTO);
                
                const litriConfezionati = relatedPackaging.reduce((sum, p) => sum + p.LITRI_TOT, 0);
                
                const firstPackagingDate = relatedPackaging.length > 0
                    ? relatedPackaging.sort((a, b) => {
                        try {
                           return new Date(a.DATA.split('/').reverse().join('-')).getTime() - new Date(b.DATA.split('/').reverse().join('-')).getTime()
                        } catch { return 0; }
                    })[0].DATA
                    : 'N/D';

                const packagingSummary: Record<string, number> = relatedPackaging.reduce((acc, p) => {
                    acc[p.FORMATO] = (acc[p.FORMATO] || 0) + p.QTA_UNITA;
                    return acc;
                }, {} as Record<string, number>);

                const packagingModes = Object.entries(packagingSummary).map(([formato, qta]) => {
                    const config = CONFIG_PACKAGING[formato];
                    if (config && formato.includes('BOTT') && config.pezziPerCartone > 0) {
                        const cartons = qta / config.pezziPerCartone;
                        const cartonStr = cartons.toFixed(1).replace(/\.0$/, '');
                        return `${cartonStr} CT x ${formato.replace('BOTT. ', '')}`;
                    }
                    return `${qta} x ${formato}`;
                }).join(' / ') || 'N/D';

                const parseCounter = (val: string | number | undefined) => {
                    if (typeof val === 'number') return val;
                    if (!val) return 0;
                    return parseFloat(val.replace(',', '.')) || 0;
                };

                const litriContaMostoCalc = parseCounter(cotta.mustCounterMeasured) - parseCounter(cotta.mustCounterPrevious);
    
                const gasCottaCalc = parseCounter(cotta.gasBrewCounterCurrent) - parseCounter(cotta.gasBrewCounterPrevious);
                const gasConfCalc = parseCounter(cotta.gasPackagingCounterCurrent) - parseCounter(cotta.gasPackagingCounterPrevious);
                const gasTotale = gasCottaCalc + gasConfCalc;

                return {
                    numeroProgressivo: index + 1,
                    dataProduzione: cotta.DATA_PROD,
                    cliente: cotta.CLIENTE,
                    lotto: cotta.LOTTO,
                    litriContaMosto: litriContaMostoCalc > 0 ? litriContaMostoCalc.toFixed(1) : 'N/D',
                    gasUtilizzato: gasTotale > 0 ? gasTotale.toFixed(2) : 'N/D',
                    tipologia: cotta.NOME_BIRRA,
                    litriProdotti: cotta.LITRI_FINALI,
                    numeroFermentatore: cotta.FERMENTATORE || 'Chiuso',
                    dataConfezionamento: firstPackagingDate,
                    litriConfezionati: litriConfezionati.toFixed(1),
                    modalitaConfezionamento: packagingModes
                };
            });

            setSummaryData(processedData);
        };

        loadHomeData();
    }, [selectedYear, warehouseStatus]);

    const handleDeleteOutOfStockItem = async (item: WarehouseStatus['outOfStockItems'][0]) => {
        // FIX: Map the lowercase properties from the 'item' object to the uppercase properties expected by the `RawWarehouseItem` type for `deleteWarehouseItem`.
        const itemToDelete: RawWarehouseItem = {
            NOME: item.nome,
            MARCA: item.marca,
            FORNITORE: item.fornitore,
            TIPOLOGIA: item.tipologia,
            GIACENZA: 0,
        };
        if (window.confirm(`Sei sicuro di voler rimuovere definitivamente il prodotto "${item.nome}" (${item.marca}) dal database? Tutti i movimenti associati verranno cancellati.`)) {
            try {
                await deleteWarehouseItem(selectedYear, itemToDelete);
                showToast('Prodotto rimosso con successo.', 'success');
                onRefresh();
            } catch (e: any) {
                showToast(e.message, 'error');
            }
        }
    };

    const expiringItems = warehouseStatus?.expiringSoonItems.map(item => 
        `<li key="${item.lotto}">${`<strong>${item.nome}</strong> (Lotto: ${item.lotto}) scade il ${item.scadenza}. Giacenza: ${item.giacenza.toFixed(2)}`}</li>`
    ) || [];

    const expiringBeerItems = warehouseStatus?.expiringBeerItems.map(item =>
        `<li key="${item.lotto}">${`<strong>${item.birra}</strong> (${item.formato}) Lotto: ${item.lotto} scade il ${item.scadenza}. Q.tà: ${item.qta}`}</li>`
    ) || [];

    const outOfStockItems = warehouseStatus?.outOfStockItems.map(item => (
        <div key={`${item.nome}-${item.marca}-${item.fornitore}`} className="flex justify-between items-center w-full">
            <span><strong>{item.nome}</strong> <span className="text-slate-400">({item.marca || 'N/D'} - {item.fornitore || 'N/D'})</span></span>
            <button onClick={() => handleDeleteOutOfStockItem(item)} className="ml-2 p-1 text-red-400 hover:text-red-200 flex-shrink-0">
                <TrashIcon className="w-4 h-4" />
            </button>
        </div>
    )) || [];
    
    return (
        <div className="space-y-4">
             <h1 className="text-3xl font-bold text-brew-accent">Dashboard Produzione - {selectedYear}</h1>
            <div className="flex gap-4 flex-wrap">
                {showInventoryReminder && <AlertBox title={t('home.inventoryReminderTitle')} items={[t('home.inventoryReminderText')]} type="info" onClose={() => setShowInventoryReminder(false)} />}
                {initialInventory.length > 0 && (
                    <div className="bg-blue-500/20 border border-blue-500 text-blue-300 rounded-lg p-3 shadow-md w-full max-w-sm">
                        <h3 className="font-bold text-blue-200 text-sm">Inventario Iniziale Anno {selectedYear}</h3>
                        <p className="text-xs mt-1 mb-2">Riepilogo giacenze iniziali importate.</p>
                        <button 
                            onClick={() => setInventoryModalOpen(true)}
                            className="bg-brew-blue text-white font-bold py-1 px-3 rounded-md hover:bg-opacity-80 transition-all text-xs shadow-sm"
                        >
                            Visualizza / Esporta
                        </button>
                    </div>
                )}
                 {showExpiring && <AlertBox title="Materie Prime in Scadenza (entro 30gg)" items={expiringItems.map(i => <div dangerouslySetInnerHTML={{__html: i}}/>)} type="warning" onClose={() => setShowExpiring(false)} />}
                 {showExpiringBeer && <AlertBox title={t('home.expiringBeerAlertTitle')} items={expiringBeerItems.map(i => <div dangerouslySetInnerHTML={{__html: i}}/>)} type="warning" onClose={() => setShowExpiringBeer(false)} />}
                 {showOutOfStock && <AlertBox title="Materie Prime Esaurite" items={outOfStockItems} type="warning" onClose={() => setShowOutOfStock(false)} />}
            </div>
            
            <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-300">
                        <thead className="text-xs text-brew-dark uppercase bg-brew-accent">
                            <tr>
                                <th className="px-3 py-3">#</th>
                                <th className="px-3 py-3">{t('home.prodDateColumn')}</th>
                                <th className="px-3 py-3">{t('home.clientColumn')}</th>
                                <th className="px-3 py-3">{t('home.lottoColumn')}</th>
                                <th className="px-3 py-3 text-right w-32">{t('home.mustCounterColumn')}</th>
                                <th className="px-3 py-3 text-right">{t('home.gasColumn')}</th>
                                <th className="px-3 py-3">{t('home.typeColumn')}</th>
                                <th className="px-3 py-3 text-right">{t('home.litersProdColumn')}</th>
                                <th className="px-3 py-3">{t('home.fermenterColumn')}</th>
                                <th className="px-3 py-3 w-28">{t('home.pkgDateColumn')}</th>
                                <th className="px-3 py-3 text-right">{t('home.litersPkgColumn')}</th>
                                <th className="px-3 py-3">{t('home.pkgModeColumn')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summaryData.map((row) => (
                                <tr key={row.lotto} className="border-b border-slate-700 hover:bg-slate-600/50">
                                    <td className="px-3 py-2 font-bold">{row.numeroProgressivo}</td>
                                    <td className="px-3 py-2">{row.dataProduzione}</td>
                                    <td className="px-3 py-2">{row.cliente}</td>
                                    <td className="px-3 py-2 font-semibold text-brew-accent">{row.lotto}</td>
                                    <td className="px-3 py-2 text-right font-medium text-yellow-300">{row.litriContaMosto}</td>
                                    <td className="px-3 py-2 text-right font-medium text-cyan-300">{row.gasUtilizzato}</td>
                                    <td className="px-3 py-2">{row.tipologia}</td>
                                    <td className="px-3 py-2 text-right font-medium">{row.litriProdotti}</td>
                                    <td className="px-3 py-2">{row.numeroFermentatore}</td>
                                    <td className="px-3 py-2">{row.dataConfezionamento}</td>
                                    <td className="px-3 py-2 text-right font-medium">{row.litriConfezionati}</td>
                                    <td className="px-3 py-2">{row.modalitaConfezionamento}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                     {summaryData.length === 0 && (
                        <p className="text-center text-slate-400 mt-8 py-4">Nessuna produzione registrata per l'anno corrente. Inizia creando una nuova cotta.</p>
                    )}
                </div>
            </div>

            <InitialInventoryModal 
                isOpen={isInventoryModalOpen}
                onClose={() => setInventoryModalOpen(false)}
                inventory={initialInventory}
                year={selectedYear}
            />
        </div>
    );
};