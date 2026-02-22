import React, { useState, useEffect, useMemo } from 'react';
import { getBreweryData, upsertItemInSheet } from '../services/dataService';
import type { BrewHeader, Movement, PriceDBItem, CostCoefficients, PackagingData } from '../types';
import { useTranslation } from '../i18n';
import { ArrowUturnLeftIcon } from './icons';
import { CONFIG_PACKAGING } from '../constants';
import { exportCostAnalysisToExcel } from '../utils/excelExport';
import { useToast } from '../hooks/useToast';
import { Modal } from './Modal';

interface CostAnalysisViewProps {
    selectedYear: string;
    lottoToOpenId?: string | null;
    onExit: () => void;
}

const ingredientCategories = ["MALTI", "LUPPOLI", "LIEVITI", "ADDITIVI", "SANIFICANTI"];

export const CostAnalysisView: React.FC<CostAnalysisViewProps> = ({ selectedYear, lottoToOpenId, onExit }) => {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const [cotte, setCotte] = useState<BrewHeader[]>([]);
    const [movements, setMovements] = useState<Movement[]>([]);
    const [priceDb, setPriceDb] = useState<PriceDBItem[]>([]);
    const [packaging, setPackaging] = useState<PackagingData[]>([]);
    const [coeffs, setCoeffs] = useState<CostCoefficients>({});
    const [selectedLotto, setSelectedLotto] = useState<BrewHeader | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const [gasType, setGasType] = useState<'gpl' | 'metano'>('metano');
    const [useStorage, setUseStorage] = useState(false);
    const [epalCount, setEpalCount] = useState(0);
    const [useLabels, setUseLabels] = useState(false);
    const [isConfirmCloseModalOpen, setConfirmCloseModalOpen] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            const data = await getBreweryData(selectedYear);
            if (data) {
                const sortedCotte = (data.COTTE_HEAD || []).sort((a, b) => {
                    try {
                       const dateA = new Date(a.DATA_PROD.split('/').reverse().join('-')).getTime();
                       const dateB = new Date(b.DATA_PROD.split('/').reverse().join('-')).getTime();
                       if (isNaN(dateA) || isNaN(dateB)) return 0;
                       return dateB - dateA;
                   } catch (e) { return 0; }
               });
                setCotte(sortedCotte);
                setMovements(data.MOVIMENTAZIONE || []);
                setPriceDb(data.PRICE_DATABASE || []);
                setPackaging(data.CONFEZIONAMENTO || []);
                setCoeffs(data.COST_COEFFICIENTS || {});

                if (lottoToOpenId) {
                    const lotto = sortedCotte.find(c => c.LOTTO === lottoToOpenId);
                    if (lotto) {
                        setSelectedLotto(lotto);
                    }
                }
            }
            setIsLoading(false);
        };
        loadData();
    }, [selectedYear, lottoToOpenId]);

    useEffect(() => {
        if (selectedLotto) {
            setGasType(selectedLotto.costAnalysisGasType || 'metano');
            setUseStorage(selectedLotto.costAnalysisUseStorage || false);
            setEpalCount(selectedLotto.costAnalysisEpalCount || 0);
            setUseLabels(selectedLotto.costAnalysisUseLabels || false);
        }
    }, [selectedLotto]);

    const handleSaveAnalysisState = async () => {
        if (!selectedLotto) return;
        const updatedLotto = {
            ...selectedLotto,
            costAnalysisGasType: gasType,
            costAnalysisUseStorage: useStorage,
            costAnalysisEpalCount: epalCount,
            costAnalysisUseLabels: useLabels
        };
        await upsertItemInSheet(selectedYear, 'COTTE_HEAD', updatedLotto, 'LOTTO');
        setSelectedLotto(updatedLotto); // Update local state
        showToast(t('toast.analysisStateSaved'), 'success');
    };

    const handleConfirmCloseAnalysis = async () => {
        if (!selectedLotto) return;
        const updatedLotto = { ...selectedLotto, isCostAnalysisClosed: true };
        await upsertItemInSheet(selectedYear, 'COTTE_HEAD', updatedLotto, 'LOTTO');
        setSelectedLotto(updatedLotto);
        setConfirmCloseModalOpen(false);
        showToast(t('toast.analysisClosed'), 'success');
    };

    const rawMaterialsCosts = useMemo(() => {
        if (!selectedLotto) return null;

        const ingredientMovements = movements.filter(m => 
            m.LOTTO_PRODUZIONE === selectedLotto.LOTTO && 
            m.KG_LITRI_PZ < 0 && 
            ingredientCategories.includes(m.TIPOLOGIA)
        );

        const costsByCategory: Record<string, { items: any[], total: number }> = {};
        let grandTotal = 0;

        // Fix: Explicitly type m as Movement to ensure property access works and avoids unknown type errors
        ingredientMovements.forEach((m: Movement) => {
            const quantity = Math.abs(m.KG_LITRI_PZ);
            const movNome = (m.NOME || '').toUpperCase();
            const movMarca = (m.MARCA || '').toUpperCase();
            const movFornitore = (m.FORNITORE || '').toUpperCase();

            const priceItem = priceDb.find(p => p.NOME === movNome && p.MARCA === movMarca && p.FORNITORE === movFornitore);
            const unitPrice = priceItem ? priceItem.PREZZO : 0;
            const totalCost = quantity * unitPrice;

            if (!costsByCategory[m.TIPOLOGIA]) {
                costsByCategory[m.TIPOLOGIA] = { items: [], total: 0 };
            }
            costsByCategory[m.TIPOLOGIA].items.push({ nome: m.NOME, qta: quantity, prezzoUnitario: unitPrice, costoTotale: totalCost });
            costsByCategory[m.TIPOLOGIA].total += totalCost;
            grandTotal += totalCost;
        });
        
        return { costsByCategory, grandTotal };
    }, [selectedLotto, movements, priceDb]);

    const otherCosts = useMemo(() => {
        if (!selectedLotto) return null;
        
        const gasCotta = parseFloat(selectedLotto.GAS_COTTA?.replace(',', '.') || '0');
        const gasConfezionamento = parseFloat(selectedLotto.GAS_CONFEZIONAMENTO?.replace(',', '.') || '0');
        const gasUsed = gasCotta + gasConfezionamento;

        const gasPrice = gasType === 'gpl' ? (coeffs.prezzo_gpl_mc || 0) : (coeffs.prezzo_metano_mc || 0);
        const gasCost = gasUsed * gasPrice;

        const co2Cost = selectedLotto.FLAG_CO2 ? (coeffs.costo_co2 || 0) : 0;
        const azotoCost = selectedLotto.FLAG_AZOTO ? (coeffs.costo_azoto || 0) : 0;
        const additionalGasesCost = co2Cost + azotoCost;

        const totalLitersPackaged = packaging.filter(p => p.LOTTO_PROD === selectedLotto.LOTTO).reduce((sum, p) => sum + p.LITRI_TOT, 0);
        const hectolitersPackaged = totalLitersPackaged / 100;
        const plato = parseFloat(selectedLotto.PLATO_INIZIALE?.replace(',', '.') || '0');
        const exciseCoefficient = coeffs.coefficiente_accise || 0;
        const exciseDutyCost = plato * hectolitersPackaged * exciseCoefficient;
        
        const storageCost = useStorage ? (coeffs.spese_stoccaggio || 0) : 0;
        const epalCountNum = epalCount || 0;
        const epalTotalCost = epalCountNum * (coeffs.costo_epal || 0);
        const managementCost = totalLitersPackaged * (coeffs.spese_gestione_litro || 0);

        const total = gasCost + additionalGasesCost + exciseDutyCost + storageCost + epalTotalCost + managementCost;

        return {
            gas: { used: gasUsed, price: gasPrice, total: gasCost },
            additionalGases: { co2: co2Cost, azoto: azotoCost, total: additionalGasesCost },
            exciseDuty: { plato, hl: hectolitersPackaged, coeff: exciseCoefficient, total: exciseDutyCost },
            storage: { total: storageCost },
            epal: { count: epalCountNum, price: coeffs.costo_epal || 0, total: epalTotalCost },
            management: { liters: totalLitersPackaged, coeff: coeffs.spese_gestione_litro || 0, total: managementCost },
            grandTotal: total
        };

    }, [selectedLotto, packaging, coeffs, gasType, useStorage, epalCount]);
    
    const analysisSummary = useMemo(() => {
        if (!selectedLotto) return null;

        const totalLitersPackaged = packaging.filter(p => p.LOTTO_PROD === selectedLotto.LOTTO).reduce((sum, p) => sum + p.LITRI_TOT, 0);
        const grandTotal = (rawMaterialsCosts?.grandTotal || 0) + (otherCosts?.grandTotal || 0);
        const beerPricePerLiter = totalLitersPackaged > 0 ? grandTotal / totalLitersPackaged : 0;
        
        return { totalLitersPackaged, grandTotal, beerPricePerLiter };
    }, [selectedLotto, packaging, rawMaterialsCosts, otherCosts]);

    const packagingAnalysis = useMemo(() => {
        if (!selectedLotto || !analysisSummary || analysisSummary.beerPricePerLiter === 0) return null;
        
        const lottoPackaging = packaging.filter(p => p.LOTTO_PROD === selectedLotto.LOTTO);
        const uniqueFormats = [...new Set(lottoPackaging.map(p => p.FORMATO))];

        const bottleFormats = uniqueFormats.filter(f => f.toUpperCase().includes('BOTT'));
        const kegFormats = uniqueFormats.filter(f => f.toUpperCase().includes('FUSTO') || f.toUpperCase().includes('KEG'));

        // --- KEG CALCULATION ---
        const kegs = kegFormats.map(formato => {
            const config = CONFIG_PACKAGING[formato];
            if (!config || config.litriUnit <= 0) return null;

            const isSteelKeg = formato.toUpperCase().includes('ACCIAIO');
            let containerUnitCost = 0;

            if (isSteelKeg) {
                containerUnitCost = coeffs.costo_lavaggio_fusto_acciaio || 0;
            } else {
                const priceItem = priceDb.find(p => p.NOME === config.nomeInvCont);
                containerUnitCost = priceItem ? priceItem.PREZZO : 0;
            }
            
            const containerCostPerLiter = containerUnitCost / config.litriUnit;
            const finalPricePerLiter = analysisSummary.beerPricePerLiter + containerCostPerLiter;

            return {
                formato,
                beerCostPerLiter: analysisSummary.beerPricePerLiter,
                containerCostPerLiter,
                finalPricePerLiter
            };
        }).filter(Boolean);

        // --- BOTTLE CALCULATION ---
        const allCapsPrices = priceDb.filter(p => p.NOME.toUpperCase().includes('TAPPO CORONA'));
        allCapsPrices.sort((a, b) => {
             const dateA = new Date(a.DATA_ULTIMO_CARICO.split('/').reverse().join('-')).getTime();
             const dateB = new Date(b.DATA_ULTIMO_CARICO.split('/').reverse().join('-')).getTime();
             return dateB - dateA;
        });
        const capPrice = allCapsPrices.length > 0 ? allCapsPrices[0].PREZZO : 0;

        const bottles = bottleFormats.map(formato => {
            const config = CONFIG_PACKAGING[formato];
            if (!config) return null;

            const totalBottles = lottoPackaging.filter(p => p.FORMATO === formato).reduce((sum, p) => sum + p.QTA_UNITA, 0);
            if (totalBottles === 0) return null;

            const beerCost = analysisSummary.beerPricePerLiter * config.litriUnit;
            
            const bottlePriceItem = priceDb.find(p => p.NOME === config.nomeInvCont);
            const bottleCost = bottlePriceItem ? bottlePriceItem.PREZZO : 0;

            let cartonCostPerBottle = 0;
            if (config.nomeInvScatola) {
                const cartonPriceItem = priceDb.find(p => p.NOME === config.nomeInvScatola);
                const cartonCost = cartonPriceItem ? cartonPriceItem.PREZZO : 0;
                cartonCostPerBottle = config.pezziPerCartone > 0 ? cartonCost / config.pezziPerCartone : 0;
            }

            const labelCost = useLabels ? (coeffs.costo_etichetta || 0) : 0;
            const finalPricePerBottle = beerCost + bottleCost + capPrice + cartonCostPerBottle + labelCost;
            const totalCostForFormat = finalPricePerBottle * totalBottles;

            return {
                formato, totalBottles, beerCost, bottleCost, capPrice,
                cartonCostPerBottle, labelCost, finalPricePerBottle, totalCostForFormat
            };
        }).filter(Boolean);


        return { kegs, bottles };

    }, [selectedLotto, analysisSummary, packaging, priceDb, coeffs, useLabels]);
    
    const handleBack = () => {
        if(lottoToOpenId) {
            onExit();
        } else {
            setSelectedLotto(null);
        }
    }
    
    const handleExport = () => {
        if (selectedLotto && rawMaterialsCosts && otherCosts && analysisSummary) {
            try {
                exportCostAnalysisToExcel(selectedLotto, rawMaterialsCosts, otherCosts, analysisSummary, packagingAnalysis);
            } catch (error) {
                console.error('Export to Excel failed:', error);
                showToast('Esportazione Excel fallita. Controlla la console per i dettagli.', 'error');
            }
        } else {
            showToast('Dati incompleti per l\'esportazione.', 'error');
        }
    };


    if (isLoading) {
        return <div className="text-center p-8">Caricamento dati...</div>;
    }
    
    if (!selectedLotto) {
        return (
             <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                <h2 className="text-2xl font-bold text-brew-accent mb-4">{t('costAnalysis.selectLottoTitle')}</h2>
                <div className="overflow-x-auto max-h-[70vh]">
                    <table className="w-full text-sm text-left text-gray-300">
                        <thead className="text-xs text-brew-dark uppercase bg-brew-accent sticky top-0">
                            <tr>
                                <th className="px-3 py-3">{t('costAnalysis.lotto')}</th>
                                <th className="px-3 py-3">{t('costAnalysis.beerName')}</th>
                                <th className="px-3 py-3">{t('costAnalysis.client')}</th>
                                <th className="px-3 py-3">{t('costAnalysis.prodDate')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cotte.map(cotta => (
                                <tr key={cotta.LOTTO} onClick={() => setSelectedLotto(cotta)} className="cursor-pointer hover:bg-slate-600/50 border-b border-slate-700">
                                    <td className="px-3 py-2 font-semibold text-brew-accent">{cotta.LOTTO}</td>
                                    <td className="px-3 py-2">{cotta.NOME_BIRRA}</td>
                                    <td className="px-3 py-2">{cotta.CLIENTE}</td>
                                    <td className="px-3 py-2">{cotta.DATA_PROD}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {cotte.length === 0 && (
                         <p className="text-center text-slate-400 mt-8 py-4">{t('costAnalysis.noLottos')}</p>
                    )}
                </div>
            </div>
        );
    }

    const isClosed = selectedLotto.isCostAnalysisClosed === true;

    return (
        <div>
            <button onClick={handleBack} className="flex items-center gap-2 mb-4 px-3 py-2 bg-brew-dark-secondary rounded-md text-sm font-semibold hover:bg-slate-600">
                <ArrowUturnLeftIcon className="w-4 h-4" />
                {t('costAnalysis.backToSelection')}
            </button>
            <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg space-y-6">
                <h2 className="text-2xl font-bold text-brew-accent">{t('costAnalysis.analysisTitle')}: <span className="text-white">{selectedLotto.LOTTO}</span></h2>
                
                {isClosed && (
                    <div className="p-3 bg-yellow-500/20 border border-yellow-500 text-yellow-300 rounded-lg text-center font-bold">
                        {t('costAnalysis.analysisClosedMessage')}
                    </div>
                )}

                <div className="bg-brew-dark p-4 rounded-lg">
                    <h3 className="text-xl font-bold mb-3">{t('costAnalysis.rawMaterialsCost')}</h3>
                    <div className="space-y-6">
                        {rawMaterialsCosts && Object.keys(rawMaterialsCosts.costsByCategory).sort().map(category => (
                            <div key={category}>
                                 <h4 className="font-semibold text-brew-accent border-b border-slate-600 pb-1 mb-2">{category}</h4>
                                 <table className="w-full text-sm">
                                     <thead><tr className="text-left text-slate-400">
                                         <th className="py-1 px-2 font-medium">{t('costAnalysis.ingredient')}</th>
                                         <th className="py-1 px-2 font-medium text-right">{t('costAnalysis.quantityUsed')}</th>
                                         <th className="py-1 px-2 font-medium text-right">{t('costAnalysis.unitPrice')}</th>
                                         <th className="py-1 px-2 font-medium text-right">{t('costAnalysis.totalCost')}</th>
                                     </tr></thead>
                                     <tbody>{rawMaterialsCosts.costsByCategory[category].items.map((item: any, index: number) => (
                                         <tr key={index} className="border-t border-slate-700/50">
                                             <td className="py-1 px-2">{item.nome}</td>
                                             <td className="py-1 px-2 text-right">{item.qta.toFixed(2)}</td>
                                             <td className="py-1 px-2 text-right">{item.prezzoUnitario > 0 ? `€${item.prezzoUnitario.toFixed(2)}` : <span className="text-red-500 text-xs">{t('costAnalysis.priceNotFound')}</span>}</td>
                                             <td className="py-1 px-2 text-right font-medium">€{item.costoTotale.toFixed(2)}</td>
                                         </tr>
                                     ))}</tbody>
                                     <tfoot><tr className="border-t-2 border-slate-600">
                                         <td colSpan={3} className="pt-2 px-2 text-right font-bold">{t('costAnalysis.subtotal')} {category}</td>
                                         <td className="pt-2 px-2 text-right font-bold text-lg">€{rawMaterialsCosts.costsByCategory[category].total.toFixed(2)}</td>
                                     </tr></tfoot>
                                 </table>
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 pt-4 border-t-2 border-brew-accent text-right">
                        <p className="text-lg font-semibold">{t('costAnalysis.grandTotalRawMaterials')}</p>
                        <p className="text-3xl font-bold text-brew-accent">€{rawMaterialsCosts?.grandTotal.toFixed(2)}</p>
                    </div>
                </div>

                <div className="bg-brew-dark p-4 rounded-lg">
                    <h3 className="text-xl font-bold mb-3">{t('costAnalysis.otherCosts')}</h3>
                    {otherCosts && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 items-center p-2 border-b border-slate-700">
                                <label className="font-semibold">{t('costAnalysis.totalGasCost')}</label>
                                <div className="text-right">
                                    <p className="text-sm text-slate-400">{otherCosts.gas.used.toFixed(2)} m³ * €{otherCosts.gas.price.toFixed(2)}/m³</p>
                                    <p className="font-bold text-lg">€{otherCosts.gas.total.toFixed(2)}</p>
                                </div>
                                <label className="text-sm text-slate-400">{t('costAnalysis.gasType')}</label>
                                <select value={gasType} onChange={e => setGasType(e.target.value as any)} className="bg-brew-dark-secondary p-1 rounded-md text-sm disabled:opacity-50" disabled={isClosed}>
                                    <option value="metano">Metano</option>
                                    <option value="gpl">GPL</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-2 gap-4 items-center p-2 border-b border-slate-700">
                            <label className="font-semibold">{t('costAnalysis.additionalGases')}</label>
                                <div className="text-right">
                                    {selectedLotto.FLAG_CO2 && <p className="text-sm text-slate-400">CO2: €{otherCosts.additionalGases.co2.toFixed(2)}</p>}
                                    {selectedLotto.FLAG_AZOTO && <p className="text-sm text-slate-400">Azoto: €{otherCosts.additionalGases.azoto.toFixed(2)}</p>}
                                    <p className="font-bold text-lg">€{otherCosts.additionalGases.total.toFixed(2)}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 items-center p-2 border-b border-slate-700">
                            <label className="font-semibold">{t('costAnalysis.exciseDuty')}</label>
                                <div className="text-right">
                                    <p className="text-sm text-slate-400">{otherCosts.exciseDuty.plato.toFixed(2)}°P * {otherCosts.exciseDuty.hl.toFixed(4)} hL * €{otherCosts.exciseDuty.coeff.toFixed(2)}</p>
                                    <p className="font-bold text-lg">€{otherCosts.exciseDuty.total.toFixed(2)}</p>
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 items-center p-2 border-b border-slate-700">
                            <div className="flex items-center gap-2"><input type="checkbox" checked={useStorage} onChange={e => setUseStorage(e.target.checked)} className="h-4 w-4 rounded bg-brew-dark-secondary disabled:opacity-50" disabled={isClosed}/> <label className="font-semibold">{t('costAnalysis.storage')}</label></div>
                            <p className="font-bold text-lg text-right">€{otherCosts.storage.total.toFixed(2)}</p>
                            <div className="flex items-center gap-2"><input type="number" value={epalCount} onChange={e => setEpalCount(parseInt(e.target.value) || 0)} className="w-16 bg-brew-dark-secondary p-1 rounded-md disabled:opacity-50" disabled={isClosed}/> <label className="font-semibold">{t('costAnalysis.epal')}</label></div>
                            <p className="font-bold text-lg text-right">€{otherCosts.epal.total.toFixed(2)}</p>
                            <label className="font-semibold">{t('costAnalysis.managementFees')}</label>
                            <p className="font-bold text-lg text-right">€{otherCosts.management.total.toFixed(2)}</p>
                            </div>
                        </div>
                    )}
                </div>

                {packagingAnalysis && packagingAnalysis.kegs.length > 0 && (
                    <div className="bg-brew-dark p-4 rounded-lg">
                        <h3 className="text-xl font-bold mb-3">{t('costAnalysis.packagingCostAnalysis')}</h3>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead><tr className="text-left text-slate-400">
                                    <th className="py-1 px-2 font-medium">{t('costAnalysis.packagingFormat')}</th>
                                    <th className="py-1 px-2 font-medium text-right">{t('costAnalysis.beerCostPerLiter')}</th>
                                    <th className="py-1 px-2 font-medium text-right">{t('costAnalysis.containerCostPerLiter')}</th>
                                    <th className="py-1 px-2 font-medium text-right">{t('costAnalysis.finalPricePerLiter')}</th>
                                </tr></thead>
                                <tbody>
                                    {packagingAnalysis.kegs.map((item, index) => item && (
                                        <tr key={index} className="border-t border-slate-700/50">
                                            <td className="py-2 px-2 font-bold">{item.formato}</td>
                                            <td className="py-2 px-2 text-right">€{item.beerCostPerLiter.toFixed(3)}</td>
                                            <td className="py-2 px-2 text-right">€{item.containerCostPerLiter.toFixed(3)}</td>
                                            <td className="py-2 px-2 text-right font-bold text-lg text-brew-accent">€{item.finalPricePerLiter.toFixed(3)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                
                {packagingAnalysis && packagingAnalysis.bottles.length > 0 && (
                    <div className="bg-brew-dark p-4 rounded-lg">
                        <div className="flex justify-between items-center mb-3">
                             <h3 className="text-xl font-bold">{t('costAnalysis.bottleCostAnalysis')}</h3>
                             <div className="flex items-center gap-2">
                                <input type="checkbox" id="useLabels" checked={useLabels} onChange={e => setUseLabels(e.target.checked)} className="h-4 w-4 rounded bg-brew-dark-secondary disabled:opacity-50" disabled={isClosed}/> 
                                <label htmlFor="useLabels" className="font-semibold text-sm">{t('costAnalysis.useLabels')}</label>
                             </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead><tr className="text-left text-slate-400">
                                    <th className="p-1">{t('costAnalysis.bottleFormat')}</th>
                                    <th className="p-1 text-right">{t('costAnalysis.bottleCount')}</th>
                                    <th className="p-1 text-right">{t('costAnalysis.beerCostPerBottle')}</th>
                                    <th className="p-1 text-right">{t('costAnalysis.containerCostPerBottle')}</th>
                                    <th className="p-1 text-right">{t('costAnalysis.capCostPerBottle')}</th>
                                    <th className="p-1 text-right">{t('costAnalysis.cartonCostPerBottle')}</th>
                                    <th className="p-1 text-right">{t('costAnalysis.labelCostPerBottle')}</th>
                                    <th className="p-1 text-right text-base">{t('costAnalysis.finalPricePerBottle')}</th>
                                    <th className="p-1 text-right text-base">{t('costAnalysis.totalPriceForFormat')}</th>
                                </tr></thead>
                                <tbody>
                                    {packagingAnalysis.bottles.map((item, index) => item && (
                                        <tr key={index} className="border-t border-slate-700/50">
                                            <td className="p-2 font-bold">{item.formato}</td>
                                            <td className="p-2 text-right">{item.totalBottles}</td>
                                            <td className="p-2 text-right">€{item.beerCost.toFixed(3)}</td>
                                            <td className="p-2 text-right">€{item.bottleCost.toFixed(3)}</td>
                                            <td className="p-2 text-right">€{item.capPrice.toFixed(3)}</td>
                                            <td className="p-2 text-right">€{item.cartonCostPerBottle.toFixed(3)}</td>
                                            <td className="p-2 text-right">€{item.labelCost.toFixed(3)}</td>
                                            <td className="p-2 text-right font-bold text-lg text-brew-accent">€{item.finalPricePerBottle.toFixed(3)}</td>
                                            <td className="p-2 text-right font-bold text-lg text-brew-green">€{item.totalCostForFormat.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
                
                {analysisSummary && <div className="space-y-4">
                    <div className="bg-brew-accent text-brew-dark p-4 rounded-lg text-right">
                        <h3 className="text-xl font-bold">{t('costAnalysis.grandTotal')}</h3>
                        <p className="text-4xl font-extrabold">€{analysisSummary.grandTotal.toFixed(2)}</p>
                    </div>
                    <div className="bg-brew-green text-white p-4 rounded-lg text-right">
                        <h3 className="text-xl font-bold">{t('costAnalysis.effectivePricePerLiter')}</h3>
                        <p className="text-4xl font-extrabold">€{analysisSummary.beerPricePerLiter.toFixed(3)}</p>
                    </div>
                </div>}

                <div className="pt-4 flex justify-center items-center gap-4">
                    {!isClosed ? (
                        <>
                            <button onClick={handleSaveAnalysisState} className="bg-brew-blue text-white font-bold py-3 px-6 rounded-lg text-lg hover:bg-opacity-90 transition-all shadow-lg">{t('costAnalysis.saveButton')}</button>
                            <button onClick={() => setConfirmCloseModalOpen(true)} className="bg-brew-red text-white font-bold py-3 px-6 rounded-lg text-lg hover:bg-opacity-90 transition-all shadow-lg">{t('costAnalysis.closeButton')}</button>
                        </>
                    ) : (
                        <button onClick={handleExport} className="bg-brew-green text-white font-bold py-3 px-8 rounded-lg text-lg hover:bg-opacity-90 transition-all shadow-lg">{t('costAnalysis.exportButton')}</button>
                    )}
                </div>
            </div>
             {isConfirmCloseModalOpen && (
                <Modal title={t('costAnalysis.confirmCloseTitle')} isOpen={isConfirmCloseModalOpen} onClose={() => setConfirmCloseModalOpen(false)} size="sm">
                    <div className="space-y-4">
                        <p className="text-sm text-gray-300">{t('costAnalysis.confirmCloseMessage')}</p>
                        <div className="flex justify-end gap-4 pt-4">
                            <button onClick={() => setConfirmCloseModalOpen(false)} className="px-4 py-2 rounded-md bg-slate-600 text-white font-semibold hover:bg-slate-500">{t('costAnalysis.cancel')}</button>
                            <button onClick={handleConfirmCloseAnalysis} className="px-4 py-2 rounded-md bg-brew-red text-white font-bold hover:bg-opacity-80">{t('costAnalysis.confirm')}</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};