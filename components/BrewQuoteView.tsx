import React, { useState, useEffect, useMemo } from 'react';
import { getBreweryData, upsertItemInSheet } from '../services/dataService';
import type { PriceDBItem, CostCoefficients, Cliente, Quote, DatabaseItem } from '../types';
import { useTranslation } from '../i18n';
import { ArrowUturnLeftIcon, PlusIcon, TrashIcon } from './icons';
import { CONFIG_PACKAGING } from '../constants';
import { exportQuoteToExcel } from '../utils/excelExport';
import { useToast } from '../hooks/useToast';

interface BrewQuoteViewProps {
    selectedYear: string;
    quoteId: string | null;
    onExit: () => void;
}

interface QuoteIngredient {
    id: number;
    priceDbId: string; // "NOME|MARCA|FORNITORE"
    qta: string;
}

interface QuotePackaging {
    id: number;
    formato: string;
    qta: string;
}

const ingredientCategories = ["MALTI", "LUPPOLI", "LIEVITI", "ADDITIVI", "SANIFICANTI"];

export const BrewQuoteView: React.FC<BrewQuoteViewProps> = ({ selectedYear, quoteId, onExit }) => {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const [priceDb, setPriceDb] = useState<PriceDBItem[]>([]);
    const [database, setDatabase] = useState<DatabaseItem[]>([]);
    const [coeffs, setCoeffs] = useState<CostCoefficients>({});
    const [clienti, setClienti] = useState<Cliente[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [currentQuoteId, setCurrentQuoteId] = useState<string | null>(null);

    const [quoteData, setQuoteData] = useState({
        date: new Date().toLocaleDateString('it-IT'),
        cliente: '',
        nomeBirra: '',
        plato: '',
        litriFinali: '',
        gasConsumato: '',
        gasType: 'metano' as 'gpl' | 'metano',
        useCo2: false,
        useAzoto: false,
        useStorage: false,
        epalCount: '0',
        useLabels: false,
    });
    const [ingredients, setIngredients] = useState<QuoteIngredient[]>([]);
    const [packaging, setPackaging] = useState<QuotePackaging[]>([]);

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            const data = await getBreweryData(selectedYear);
            if (data) {
                setPriceDb(data.PRICE_DATABASE || []);
                setDatabase(data.DATABASE || []);
                setCoeffs(data.COST_COEFFICIENTS || {});
                setClienti(data.CLIENTI || []);

                if (quoteId) {
                    const existingQuote = (data.QUOTES || []).find(q => q.id === quoteId);
                    if (existingQuote) {
                        setCurrentQuoteId(existingQuote.id);
                        setQuoteData({
                            date: existingQuote.date,
                            cliente: existingQuote.cliente,
                            nomeBirra: existingQuote.nomeBirra,
                            plato: existingQuote.plato,
                            litriFinali: existingQuote.litriFinali,
                            gasConsumato: existingQuote.gasConsumato,
                            gasType: existingQuote.gasType,
                            useCo2: existingQuote.useCo2,
                            useAzoto: existingQuote.useAzoto,
                            useStorage: existingQuote.useStorage,
                            epalCount: existingQuote.epalCount,
                            useLabels: existingQuote.useLabels,
                        });
                        setIngredients(existingQuote.ingredients);
                        setPackaging(existingQuote.packaging);
                    }
                } else {
                    setCurrentQuoteId(null);
                }
            }
            setIsLoading(false);
        };
        loadData();
    }, [selectedYear, quoteId]);

    const handleQuoteDataChange = (field: keyof typeof quoteData, value: string | boolean | number) => {
        setQuoteData(prev => ({...prev, [field]: value}));
    };
    
    // Ingredient Handlers
    const addIngredient = () => setIngredients(prev => [...prev, { id: Date.now(), priceDbId: '', qta: '' }]);
    const removeIngredient = (id: number) => setIngredients(prev => prev.filter(i => i.id !== id));
    const updateIngredient = (id: number, field: 'priceDbId' | 'qta', value: string) => {
        setIngredients(prev => prev.map(i => i.id === id ? {...i, [field]: value} : i));
    };
    
    // Packaging Handlers
    const addPackaging = () => setPackaging(prev => [...prev, { id: Date.now(), formato: '', qta: '' }]);
    const removePackaging = (id: number) => setPackaging(prev => prev.filter(p => p.id !== id));
    const updatePackaging = (id: number, field: 'formato' | 'qta', value: string) => {
        setPackaging(prev => prev.map(p => p.id === id ? {...p, [field]: value} : p));
    };

    const ingredientPriceDb = useMemo(() => {
        const ingredientItems = new Set(
            database
                .filter(item => ingredientCategories.includes(item.TIPOLOGIA))
                .map(item => `${item.NOME}|${item.MARCA}|${item.FORNITORE}`)
        );
        return priceDb.filter(p => ingredientItems.has(`${p.NOME}|${p.MARCA}|${p.FORNITORE}`));
    }, [priceDb, database]);
    
    const priceDbMap = useMemo(() => {
        const map = new Map<string, PriceDBItem>();
        priceDb.forEach(item => {
            map.set(`${item.NOME}|${item.MARCA}|${item.FORNITORE}`, item);
        });
        return map;
    }, [priceDb]);

    const rawMaterialsCosts = useMemo(() => {
        const costs: any[] = [];
        let grandTotal = 0;
        ingredients.forEach(ing => {
            const priceItem = priceDbMap.get(ing.priceDbId);
            const qta = parseFloat(ing.qta.replace(',', '.')) || 0;
            if(priceItem && qta > 0) {
                const totalCost = priceItem.PREZZO * qta;
                costs.push({
                    nome: priceItem.NOME,
                    qta: qta,
                    prezzoUnitario: priceItem.PREZZO,
                    costoTotale: totalCost,
                });
                grandTotal += totalCost;
            }
        });
        return { items: costs, grandTotal };
    }, [ingredients, priceDbMap]);

    const totalPackagedLiters = useMemo(() => {
        return packaging.reduce((acc, pkg) => {
            const config = CONFIG_PACKAGING[pkg.formato];
            const qta = parseInt(pkg.qta) || 0;
            if (config && qta > 0) {
                return acc + qta * config.litriUnit;
            }
            return acc;
        }, 0);
    }, [packaging]);

    const otherCosts = useMemo(() => {
        const gasUsed = parseFloat(quoteData.gasConsumato.replace(',', '.')) || 0;
        const gasPrice = quoteData.gasType === 'gpl' ? (coeffs.prezzo_gpl_mc || 0) : (coeffs.prezzo_metano_mc || 0);
        const gasCost = gasUsed * gasPrice;

        const co2Cost = quoteData.useCo2 ? (coeffs.costo_co2 || 0) : 0;
        const azotoCost = quoteData.useAzoto ? (coeffs.costo_azoto || 0) : 0;
        
        const hectoliters = totalPackagedLiters / 100;
        const plato = parseFloat(quoteData.plato.replace(',', '.')) || 0;
        const exciseDutyCost = plato * hectoliters * (coeffs.coefficiente_accise || 0);

        const storageCost = quoteData.useStorage ? (coeffs.spese_stoccaggio || 0) : 0;
        const epalCountNum = parseInt(quoteData.epalCount) || 0;
        const epalTotalCost = epalCountNum * (coeffs.costo_epal || 0);
        const managementCost = totalPackagedLiters * (coeffs.spese_gestione_litro || 0);

        const grandTotal = gasCost + co2Cost + azotoCost + exciseDutyCost + storageCost + epalTotalCost + managementCost;

        return {
             gas: { total: gasCost },
             additionalGases: { total: co2Cost + azotoCost },
             exciseDuty: { total: exciseDutyCost },
             storage: { total: storageCost },
             epal: { total: epalTotalCost },
             management: { total: managementCost },
             grandTotal
        };
    }, [quoteData, coeffs, totalPackagedLiters]);
    
    const analysisSummary = useMemo(() => {
        const grandTotal = (rawMaterialsCosts?.grandTotal || 0) + (otherCosts?.grandTotal || 0);
        const beerPricePerLiter = totalPackagedLiters > 0 ? grandTotal / totalPackagedLiters : 0;
        return { totalLiters: totalPackagedLiters, grandTotal, beerPricePerLiter };
    }, [totalPackagedLiters, rawMaterialsCosts, otherCosts]);

    const packagingAnalysis = useMemo(() => {
        if (analysisSummary.beerPricePerLiter === 0) return null;
        
        const kegs: any[] = [];
        const bottles: any[] = [];

        const allCapsPrices = priceDb.filter(p => p.NOME.toUpperCase().includes('TAPPO CORONA'));
        allCapsPrices.sort((a, b) => new Date(b.DATA_ULTIMO_CARICO.split('/').reverse().join('-')).getTime() - new Date(a.DATA_ULTIMO_CARICO.split('/').reverse().join('-')).getTime());
        const capPrice = allCapsPrices.length > 0 ? allCapsPrices[0].PREZZO : 0;
        
        packaging.forEach(pkg => {
            const qta = parseInt(pkg.qta) || 0;
            if (qta === 0) return;

            const config = CONFIG_PACKAGING[pkg.formato];
            if (!config) return;

            if (pkg.formato.toUpperCase().includes('FUSTO') || pkg.formato.toUpperCase().includes('KEG')) {
                const isSteelKeg = pkg.formato.toUpperCase().includes('ACCIAIO');
                const containerUnitCost = isSteelKeg 
                    ? (coeffs.costo_lavaggio_fusto_acciaio || 0)
                    : (priceDb.find(p => p.NOME === config.nomeInvCont)?.PREZZO || 0);
                
                const containerCostPerLiter = config.litriUnit > 0 ? containerUnitCost / config.litriUnit : 0;
                kegs.push({
                    formato: pkg.formato,
                    beerCostPerLiter: analysisSummary.beerPricePerLiter,
                    containerCostPerLiter,
                    finalPricePerLiter: analysisSummary.beerPricePerLiter + containerCostPerLiter
                });
            } else if (pkg.formato.toUpperCase().includes('BOTT')) {
                const beerCost = analysisSummary.beerPricePerLiter * config.litriUnit;
                const bottleCost = priceDb.find(p => p.NOME === config.nomeInvCont)?.PREZZO || 0;
                const cartonPrice = config.nomeInvScatola ? priceDb.find(p => p.NOME === config.nomeInvScatola)?.PREZZO || 0 : 0;
                const cartonCostPerBottle = config.pezziPerCartone > 0 ? cartonPrice / config.pezziPerCartone : 0;
                const labelCost = quoteData.useLabels ? (coeffs.costo_etichetta || 0) : 0;

                const finalPricePerBottle = beerCost + bottleCost + capPrice + cartonCostPerBottle + labelCost;
                bottles.push({
                    formato: pkg.formato,
                    totalBottles: qta,
                    beerCost, bottleCost, capPrice, cartonCostPerBottle, labelCost, finalPricePerBottle,
                    totalCostForFormat: finalPricePerBottle * qta
                });
            }
        });

        return { kegs, bottles };
    }, [packaging, analysisSummary, priceDb, coeffs, quoteData.useLabels]);
    
    const handleSaveQuote = async () => {
         if (!quoteData.cliente || !quoteData.nomeBirra || !quoteData.litriFinali) {
            showToast("Cliente, Nome Birra e Litri Stimati sono obbligatori.", "error");
            return;
        }
        const idToSave = currentQuoteId || `quote_${Date.now()}`;
        const quoteToSave: Quote = {
            id: idToSave,
            ...quoteData,
            ingredients,
            packaging,
        };
        await upsertItemInSheet(selectedYear, 'QUOTES', quoteToSave, 'id');
        setCurrentQuoteId(idToSave);
        showToast(t('toast.quoteSaved'), 'success');
    };

    const handleExport = () => {
        if (!quoteData.cliente || !quoteData.nomeBirra || !quoteData.litriFinali) {
            showToast("Cliente, Nome Birra e Litri Stimati sono obbligatori per generare un preventivo.", "error");
            return;
        }
        try {
            exportQuoteToExcel(quoteData, rawMaterialsCosts, otherCosts, analysisSummary, packagingAnalysis);
        } catch (error) {
            console.error('Export to Excel failed:', error);
            showToast('Esportazione Excel fallita. Controlla la console per i dettagli.', 'error');
        }
    };

    if (isLoading) return <p>Caricamento...</p>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-brew-accent">{t('brewQuote.title')}</h1>
                <button onClick={onExit} className="flex items-center gap-2 px-3 py-2 bg-brew-dark-secondary rounded-md text-sm font-semibold hover:bg-slate-600">
                    <ArrowUturnLeftIcon className="w-4 h-4" /> {t('brewQuote.quoteListTitle')}
                </button>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                     <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                        <h2 className="text-xl font-bold mb-4">{t('brewQuote.headerTitle')}</h2>
                        <div className="grid grid-cols-2 gap-4">
                            <Field label={t('brewQuote.date')}><Input value={quoteData.date} onChange={v => handleQuoteDataChange('date', v)}/></Field>
                             <Field label={t('costAnalysis.client')}>
                                <select value={quoteData.cliente} onChange={e => handleQuoteDataChange('cliente', e.target.value)} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600" required>
                                    <option value="">Seleziona...</option>
                                    {clienti.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                                </select>
                             </Field>
                            <Field label={t('brewQuote.beerName')}><Input value={quoteData.nomeBirra} onChange={v => handleQuoteDataChange('nomeBirra', v)} required/></Field>
                            <Field label={t('brewQuote.estimatedLiters')}><Input value={quoteData.litriFinali} onChange={v => handleQuoteDataChange('litriFinali', v)} required/></Field>
                            <Field label="Plato Stimato (°P)"><Input value={quoteData.plato} onChange={v => handleQuoteDataChange('plato', v)} required/></Field>
                            <Field label={t('brewQuote.estimatedGas')}><Input value={quoteData.gasConsumato} onChange={v => handleQuoteDataChange('gasConsumato', v)} required/></Field>
                        </div>
                     </div>
                      <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                        <h2 className="text-xl font-bold mb-4">Altri Costi e Opzioni</h2>
                        <div className="space-y-3">
                            <Field label={t('costAnalysis.gasType')}>
                                 <select value={quoteData.gasType} onChange={e => handleQuoteDataChange('gasType', e.target.value)} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600">
                                    <option value="metano">Metano</option>
                                    <option value="gpl">GPL</option>
                                </select>
                            </Field>
                            <div className="grid grid-cols-2 gap-4">
                               <Checkbox label="Usa CO2" checked={quoteData.useCo2} onChange={c => handleQuoteDataChange('useCo2', c)} />
                               <Checkbox label="Usa Azoto" checked={quoteData.useAzoto} onChange={c => handleQuoteDataChange('useAzoto', c)} />
                               <Checkbox label={t('costAnalysis.storage')} checked={quoteData.useStorage} onChange={c => handleQuoteDataChange('useStorage', c)} />
                               <Checkbox label={t('costAnalysis.useLabels')} checked={quoteData.useLabels} onChange={c => handleQuoteDataChange('useLabels', c)} />
                            </div>
                            <Field label={`Numero ${t('costAnalysis.epal')}`}>
                                <Input value={quoteData.epalCount} onChange={v => handleQuoteDataChange('epalCount', v)} type="number" />
                            </Field>
                        </div>
                     </div>
                     <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                        <h2 className="text-xl font-bold mb-4">{t('brewQuote.ingredientsTitle')}</h2>
                        <div className="space-y-2">
                            {ingredients.map(ing => (
                                <div key={ing.id} className="grid grid-cols-[1fr,auto,auto] gap-2 items-center">
                                    <select value={ing.priceDbId} onChange={e => updateIngredient(ing.id, 'priceDbId', e.target.value)} className="bg-brew-dark p-1.5 rounded-md text-sm w-full">
                                        <option value="">{t('brewQuote.selectIngredient')}</option>
                                        {ingredientPriceDb.map(p => <option key={`${p.NOME}|${p.MARCA}|${p.FORNITORE}`} value={`${p.NOME}|${p.MARCA}|${p.FORNITORE}`}>{`${p.NOME} (${p.MARCA}) - €${p.PREZZO.toFixed(2)}`}</option>)}
                                    </select>
                                    <input type="text" placeholder={t('brewQuote.quantity')} value={ing.qta} onChange={e => updateIngredient(ing.id, 'qta', e.target.value)} className="bg-brew-dark p-1.5 rounded-md text-sm w-24"/>
                                    <button onClick={() => removeIngredient(ing.id)} className="p-1 text-red-500 hover:text-red-400"><TrashIcon className="w-5 h-5"/></button>
                                </div>
                            ))}
                        </div>
                         <button onClick={addIngredient} className="mt-4 flex items-center px-2 py-1 bg-brew-green rounded-md text-xs hover:bg-opacity-80"><PlusIcon className="w-4 h-4 mr-1"/>{t('brewQuote.addIngredient')}</button>
                     </div>
                      <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                        <h2 className="text-xl font-bold mb-4">{t('brewQuote.packagingTitle')}</h2>
                        <div className="space-y-2">
                             {packaging.map(pkg => (
                                <div key={pkg.id} className="grid grid-cols-[1fr,auto,auto] gap-2 items-center">
                                    <select value={pkg.formato} onChange={e => updatePackaging(pkg.id, 'formato', e.target.value)} className="bg-brew-dark p-1.5 rounded-md text-sm w-full">
                                        <option value="">Seleziona Formato...</option>
                                        {Object.keys(CONFIG_PACKAGING).map(f => <option key={f} value={f}>{f}</option>)}
                                    </select>
                                    <input type="number" placeholder={t('brewQuote.pieces')} value={pkg.qta} onChange={e => updatePackaging(pkg.id, 'qta', e.target.value)} className="bg-brew-dark p-1.5 rounded-md text-sm w-24"/>
                                    <button onClick={() => removePackaging(pkg.id)} className="p-1 text-red-500 hover:text-red-400"><TrashIcon className="w-5 h-5"/></button>
                                </div>
                            ))}
                        </div>
                        <button onClick={addPackaging} className="mt-4 flex items-center px-2 py-1 bg-brew-green rounded-md text-xs hover:bg-opacity-80"><PlusIcon className="w-4 h-4 mr-1"/>{t('brewQuote.addPackaging')}</button>
                     </div>
                </div>

                <div className="space-y-6">
                     <div className="bg-brew-dark p-4 rounded-lg">
                        <h3 className="text-xl font-bold mb-3">{t('costAnalysis.rawMaterialsCost')}</h3>
                        {rawMaterialsCosts.items.length > 0 ? (
                            <>
                                <table className="w-full text-sm">
                                    <tbody>{rawMaterialsCosts.items.map((item: any, index: number) => (
                                        <tr key={index} className="border-t border-slate-700/50">
                                            <td className="py-1">{item.nome}</td>
                                            <td className="py-1 text-right">€{item.costoTotale.toFixed(2)}</td>
                                        </tr>
                                    ))}</tbody>
                                </table>
                                <div className="mt-4 pt-2 border-t-2 border-brew-accent text-right">
                                    <p className="text-lg font-semibold">{t('costAnalysis.grandTotalRawMaterials')}</p>
                                    <p className="text-3xl font-bold text-brew-accent">€{rawMaterialsCosts.grandTotal.toFixed(2)}</p>
                                </div>
                            </>
                        ): <p className="text-sm text-slate-400">Aggiungi ingredienti per calcolare i costi.</p>}
                     </div>

                     <div className="bg-brew-dark p-4 rounded-lg">
                        <h3 className="text-xl font-bold mb-3">{t('costAnalysis.otherCosts')}</h3>
                        <div className="space-y-2">
                             {Object.entries(otherCosts).filter(([k]) => k !== 'grandTotal').map(([key, value]) => (
                                <div key={key} className="flex justify-between text-sm">
                                    <span>{t(`costAnalysis.${key}` as any)}</span>
                                    <span className="font-semibold">€{(value as any).total.toFixed(2)}</span>
                                </div>
                             ))}
                        </div>
                        <div className="mt-4 pt-2 border-t-2 border-slate-600 text-right">
                            <p className="font-semibold">Totale Altri Costi</p>
                            <p className="text-2xl font-bold">€{otherCosts.grandTotal.toFixed(2)}</p>
                        </div>
                     </div>
                     
                    {packagingAnalysis?.kegs && packagingAnalysis.kegs.length > 0 && 
                        <div className="bg-brew-dark p-4 rounded-lg">
                            <h3 className="text-xl font-bold mb-3">{t('costAnalysis.packagingCostAnalysis')}</h3>
                            <table className="w-full text-sm">
                                <thead><tr className="text-left text-slate-400"><th className="py-1 px-2 font-medium">{t('costAnalysis.packagingFormat')}</th><th className="py-1 px-2 font-medium text-right">{t('costAnalysis.finalPricePerLiter')}</th></tr></thead>
                                <tbody>
                                    {packagingAnalysis.kegs.map((item: any, index: number) => (
                                        <tr key={index} className="border-t border-slate-700/50">
                                            <td className="py-2 px-2 font-bold">{item.formato}</td>
                                            <td className="py-2 px-2 text-right font-bold text-lg text-brew-accent">€{item.finalPricePerLiter.toFixed(3)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    }
                    {packagingAnalysis?.bottles && packagingAnalysis.bottles.length > 0 && 
                         <div className="bg-brew-dark p-4 rounded-lg">
                             <h3 className="text-xl font-bold mb-3">{t('costAnalysis.bottleCostAnalysis')}</h3>
                             <table className="w-full text-sm">
                                <thead><tr className="text-left text-slate-400"><th className="p-1">{t('costAnalysis.bottleFormat')}</th><th className="p-1 text-right">{t('costAnalysis.finalPricePerBottle')}</th><th className="p-1 text-right">{t('costAnalysis.totalPriceForFormat')}</th></tr></thead>
                                <tbody>
                                     {packagingAnalysis.bottles.map((item: any, index: number) => (
                                        <tr key={index} className="border-t border-slate-700/50">
                                            <td className="p-2 font-bold">{item.formato}</td>
                                            <td className="p-2 text-right font-bold text-lg text-brew-accent">€{item.finalPricePerBottle.toFixed(3)}</td>
                                            <td className="p-2 text-right font-bold text-lg text-brew-green">€{item.totalCostForFormat.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                             </table>
                        </div>
                    }

                     <div className="space-y-4">
                        <div className="bg-brew-accent text-brew-dark p-4 rounded-lg text-right">
                            <h3 className="text-xl font-bold">{t('costAnalysis.grandTotal')}</h3>
                            <p className="text-4xl font-extrabold">€{analysisSummary.grandTotal.toFixed(2)}</p>
                        </div>
                        <div className="bg-brew-green text-white p-4 rounded-lg text-right">
                            <h3 className="text-xl font-bold">{t('costAnalysis.effectivePricePerLiter')}</h3>
                            <p className="text-4xl font-extrabold">€{analysisSummary.beerPricePerLiter.toFixed(3)}</p>
                        </div>
                    </div>

                    <div className="pt-4 flex justify-center gap-4">
                        <button onClick={handleSaveQuote} className="bg-brew-green text-white font-bold py-3 px-8 rounded-lg text-lg hover:bg-opacity-90">
                           {t('brewQuote.saveButton')}
                        </button>
                        <button onClick={handleExport} className="bg-brew-blue text-white font-bold py-3 px-8 rounded-lg text-lg hover:bg-opacity-90">
                            {t('brewQuote.exportButton')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};


const Field: React.FC<{label: string, children: React.ReactNode}> = ({ label, children }) => (
    <div>
        <label className="block text-xs font-medium text-gray-300 mb-1">{label}</label>
        {children}
    </div>
);

const Input = (props: { value: string; onChange: (val: string) => void; required?: boolean, type?: string }) => (
    <input
        type={props.type || "text"}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full bg-brew-dark p-2 rounded-md border border-slate-600 focus:ring-brew-accent focus:border-brew-accent"
        required={props.required}
    />
);

const Checkbox: React.FC<{ label: string; checked: boolean; onChange: (val: boolean) => void;}> = ({ label, checked, onChange }) => (
    <label className="flex items-center space-x-2 cursor-pointer text-sm">
        <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="h-4 w-4 rounded bg-brew-dark border-slate-600 text-brew-blue focus:ring-brew-accent"/>
        <span>{label}</span>
    </label>
);