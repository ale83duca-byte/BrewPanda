import React, { useState, useEffect, useMemo } from 'react';
import { getBreweryData, saveDataToSheet } from '../services/dataService';
import type { FermenterConfig, BrewHeader, PackagingData, FermentationDataPoint } from '../types';
import { PlusIcon, TrashIcon } from './icons';
import { useToast } from '../hooks/useToast';
import { parseItalianDate } from '../utils/dateUtils';

interface CantinaViewProps {
    selectedYear: string;
}

export const CantinaView: React.FC<CantinaViewProps> = ({ selectedYear }) => {
    const [fermenters, setFermenters] = useState<FermenterConfig[]>([]);
    const [cotte, setCotte] = useState<BrewHeader[]>([]);
    const [packaging, setPackaging] = useState<PackagingData[]>([]);
    const [fermentationData, setFermentationData] = useState<FermentationDataPoint[]>([]);
    const [newFermenter, setNewFermenter] = useState({ nome: '', capacita: '' });
    const { showToast } = useToast();

    useEffect(() => {
        const loadCantinaData = async () => {
            const data = await getBreweryData(selectedYear);
            if(data){
                setFermenters(data.CANTINA_CONFIG || []);
                setCotte(data.COTTE_HEAD || []);
                setPackaging(data.CONFEZIONAMENTO || []);
                setFermentationData(data.FERMENTAZIONE || []);
            }
        };
        loadCantinaData();
    }, [selectedYear]);

    const activeLotsByFermenter = useMemo(() => {
        const packagedLiters: Record<string, number> = {};
        packaging.forEach(p => {
            packagedLiters[p.LOTTO_PROD] = (packagedLiters[p.LOTTO_PROD] || 0) + p.LITRI_TOT;
        });

        const activeLots: Record<string, BrewHeader> = {};
        cotte.forEach(cotta => {
            const litriFinali = parseFloat(cotta.LITRI_FINALI?.replace(',', '.')) || 0;
            const litriConfezionati = packagedLiters[cotta.LOTTO] || 0;
            if (cotta.FERMENTATORE && litriFinali > 0 && litriConfezionati < litriFinali) {
                activeLots[cotta.FERMENTATORE] = cotta;
            }
        });
        return activeLots;
    }, [cotte, packaging]);

    const latestTemperaturesByLotto = useMemo(() => {
        const temps: Record<string, number> = {};
        const dataByLotto: Record<string, FermentationDataPoint[]> = {};
        fermentationData.forEach(point => {
            if (!dataByLotto[point.LOTTO]) {
                dataByLotto[point.LOTTO] = [];
            }
            dataByLotto[point.LOTTO].push(point);
        });

        for (const lotto in dataByLotto) {
            const points = dataByLotto[lotto];
            if (points.length > 0) {
                const latestPoint = points.reduce((latest, current) => 
                    current.GIORNO > latest.GIORNO ? current : latest
                );
                temps[lotto] = latestPoint.TEMPERATURA;
            }
        }
        return temps;
    }, [fermentationData]);

    const handleSaveFermenters = async (updatedFermenters: FermenterConfig[]) => {
        setFermenters(updatedFermenters);
        await saveDataToSheet(selectedYear, 'CANTINA_CONFIG', updatedFermenters);
        showToast("Configurazione fermentatori salvata.", 'success');
    };

    const addFermenter = () => {
        if (newFermenter.nome && newFermenter.capacita) {
            const newFerm: FermenterConfig = {
                id: `ferm_${Date.now()}`,
                nome: newFermenter.nome.toUpperCase(),
                capacita: parseFloat(newFermenter.capacita),
            };
            handleSaveFermenters([...fermenters, newFerm]);
            setNewFermenter({ nome: '', capacita: '' });
        } else {
            showToast("Nome e capacità sono obbligatori.", 'error');
        }
    };

    const removeFermenter = (id: string) => {
        if (window.confirm("Sei sicuro di voler rimuovere questo fermentatore?")) {
            handleSaveFermenters(fermenters.filter(f => f.id !== id));
        }
    };

    const getFermenterStatus = (activeLot: BrewHeader | undefined): { status: 'free' | 'occupied' | 'finishing' | 'alarm', expectedDate?: Date } => {
        if (!activeLot) {
            return { status: 'free' };
        }

        const giorniPrevisti = parseInt(activeLot.GIORNI_FERMENTAZIONE_PREVISTI || '0', 10);
        const dataProd = parseItalianDate(activeLot.DATA_PROD);

        if (giorniPrevisti > 0 && dataProd) {
            const dataFinePrevista = new Date(dataProd);
            dataFinePrevista.setDate(dataFinePrevista.getDate() + giorniPrevisti);
            
            const today = new Date();
            today.setHours(0, 0, 0, 0); // Normalize today to midnight for accurate day comparison

            const daysRemaining = (dataFinePrevista.getTime() - today.getTime()) / (1000 * 3600 * 24);

            // If the packaging date has passed
            if (daysRemaining < 0) {
                return { status: 'alarm', expectedDate: dataFinePrevista };
            }

            // If the packaging date is today or in the next 5 days, it's 'finishing'
            if (daysRemaining >= 0 && daysRemaining <= 5) {
                return { status: 'finishing', expectedDate: dataFinePrevista };
            }

            return { status: 'occupied', expectedDate: dataFinePrevista };
        }
        
        return { status: 'occupied' };
    };

    const statusClasses = {
        free: 'bg-green-500/20 border-green-500',
        occupied: 'bg-red-500/20 border-red-500',
        finishing: 'bg-yellow-500/20 border-yellow-500',
        alarm: 'bg-yellow-500/40 border-yellow-500 animate-pulse ring-4 ring-yellow-500',
    }

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-brew-accent">🌡️ Gestione Cantina</h1>
            
            {/* Configuration Section */}
            <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                <h2 className="text-xl font-bold mb-4">Configura Fermentatori</h2>
                <div className="flex gap-4 items-end">
                    <div className="flex-grow">
                        <label className="text-xs">Nome Fermentatore</label>
                        <input type="text" value={newFermenter.nome} onChange={e => setNewFermenter(s => ({...s, nome: e.target.value}))} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600"/>
                    </div>
                     <div className="w-32">
                        <label className="text-xs">Capacità (L)</label>
                        <input type="number" value={newFermenter.capacita} onChange={e => setNewFermenter(s => ({...s, capacita: e.target.value}))} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600"/>
                    </div>
                    <button onClick={addFermenter} className="bg-brew-blue text-white font-bold py-2 px-4 rounded-md flex items-center gap-2"><PlusIcon className="w-5 h-5"/> Aggiungi</button>
                </div>
                 {fermenters.length > 0 && (
                    <div className="mt-4 text-xs text-slate-400">
                        Fermentatori configurati: {fermenters.map(f => (
                            <span key={f.id} className="inline-flex items-center bg-slate-700 rounded-full px-2 py-0.5 mx-1">
                                {f.nome} ({f.capacita}L)
                                <button onClick={() => removeFermenter(f.id)} className="ml-2 text-red-500 hover:text-red-400"><TrashIcon className="w-3 h-3"/></button>
                            </span>
                        ))}
                    </div>
                 )}
            </div>

            {/* Visualization Section */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {fermenters.map(ferm => {
                    const activeLot = activeLotsByFermenter[ferm.nome];
                    const { status, expectedDate } = getFermenterStatus(activeLot);
                    const latestTemp = activeLot ? latestTemperaturesByLotto[activeLot.LOTTO] : undefined;
                    
                    return (
                        <div key={ferm.id} className={`border-2 rounded-lg shadow-lg flex flex-col ${statusClasses[status]}`}>
                           <div className="p-3 bg-black/20">
                             <h3 className="text-lg font-bold text-center">{ferm.nome}</h3>
                             <p className="text-xs text-center text-slate-400">{ferm.capacita} Litri</p>
                           </div>
                           <div className="flex-grow p-4 flex flex-col justify-center items-center space-y-2">
                                {status === 'free' ? (
                                    <p className="text-2xl font-bold text-green-400">LIBERO</p>
                                ) : (
                                    activeLot && (
                                        <>
                                            <p className="text-xs text-slate-400">Lotto Attivo</p>
                                            <p className="text-2xl font-bold text-brew-accent bg-slate-800 px-3 py-1 rounded-md">{activeLot.LOTTO}</p>
                                            <p className="text-sm font-semibold text-white">{activeLot.LITRI_FINALI} L</p>
                                            {expectedDate && (
                                                <div className="mt-2 text-center bg-black/30 p-2 rounded-md w-full">
                                                    <p className="text-[10px] text-slate-300 uppercase font-bold">Data Conf. Prevista</p>
                                                    <p className={`text-sm font-bold ${status === 'alarm' ? 'text-red-400' : 'text-white'}`}>
                                                        {expectedDate.toLocaleDateString('it-IT')}
                                                    </p>
                                                </div>
                                            )}
                                        </>
                                    )
                                )}
                           </div>
                           <div className="p-2 bg-black/20 flex items-center justify-center gap-2">
                               <span className="text-sm font-semibold">T:</span>
                               <div className="w-full bg-brew-dark p-1 text-center rounded-md border border-slate-600 text-lg font-bold flex items-center justify-center">
                                    {latestTemp !== undefined ? `${latestTemp.toFixed(1)}°C` : 'N/D'}
                               </div>
                           </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};