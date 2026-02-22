import React, { useState, useEffect, useMemo } from 'react';
import { getBreweryData } from '../services/dataService';
import type { Cliente, BrewHeader, PackagingData } from '../types';
import { useTranslation } from '../i18n';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar } from 'recharts';

interface ProductionTrendViewProps {
    selectedYear: string;
    onExit: () => void;
}

const COLORS = ['#f1c40f', '#2980b9', '#27ae60', '#c0392b', '#d35400', '#8e44ad'];

const parseDate = (dateStr: string) => {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        const [day, month, year] = parts.map(Number);
        return new Date(year, month - 1, day);
    }
    return new Date();
};

export const ProductionTrendView: React.FC<ProductionTrendViewProps> = ({ selectedYear, onExit }) => {
    const { t } = useTranslation();
    const [clienti, setClienti] = useState<Cliente[]>([]);
    const [cotte, setCotte] = useState<BrewHeader[]>([]);
    const [packaging, setPackaging] = useState<PackagingData[]>([]);
    const [selectedClientId, setSelectedClientId] = useState<string>('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            setIsLoading(true);
            const data = await getBreweryData(selectedYear);
            if (data) {
                setClienti(data.CLIENTI || []);
                setCotte(data.COTTE_HEAD || []);
                setPackaging(data.CONFEZIONAMENTO || []);
            }
            setIsLoading(false);
        };
        loadData();
    }, [selectedYear]);

    const analysisData = useMemo(() => {
        if (!selectedClientId) return null;
        
        const clientCotte = cotte.filter(c => c.CLIENTE === clienti.find(cli => cli.id === selectedClientId)?.nome);
        if (clientCotte.length === 0) return null;

        const productionHistory = clientCotte.map(cotta => {
            const relatedPackaging = packaging.filter(p => p.LOTTO_PROD === cotta.LOTTO);
            const packagedLiters = relatedPackaging.reduce((sum, p) => sum + p.LITRI_TOT, 0);
            const formats = [...new Set(relatedPackaging.map(p => p.FORMATO.includes('BOTT') ? 'Bottiglie' : 'Fusti'))];
            return {
                ...cotta,
                packagedLiters,
                formatsUsed: formats.join(', ')
            };
        }).sort((a,b) => parseDate(a.DATA_PROD).getTime() - parseDate(b.DATA_PROD).getTime());
        
        const totalLitersProduced = productionHistory.reduce((sum, item) => sum + item.packagedLiters, 0);

        const timelineData = productionHistory.map(item => ({
            date: item.DATA_PROD,
            litri: item.packagedLiters,
        }));
        
        // Fix: Explicitly type accumulator Record to avoid unknown type errors
        const byBeer = productionHistory.reduce<Record<string, {liters: number; batches: number; formats: Record<string, number>}>>((acc, item) => {
            if (!acc[item.NOME_BIRRA]) {
                acc[item.NOME_BIRRA] = { liters: 0, batches: 0, formats: { Bottiglie: 0, Fusti: 0 }};
            }
            acc[item.NOME_BIRRA].liters += item.packagedLiters;
            acc[item.NOME_BIRRA].batches += 1;
            
            const relatedPackaging = packaging.filter(p => p.LOTTO_PROD === item.LOTTO);
            relatedPackaging.forEach(p => {
                const formatType = p.FORMATO.includes('BOTT') ? 'Bottiglie' : 'Fusti';
                acc[item.NOME_BIRRA].formats[formatType] += p.LITRI_TOT;
            });

            return acc;
        }, {});

        const analysisByBeer = Object.entries(byBeer).map(([name, data]) => {
            return {
                name,
                liters: data.liters,
                batches: data.batches,
                preferredFormat: data.formats.Bottiglie > data.formats.Fusti ? 'Bottiglie' : 'Fusti'
            }
        }).sort((a,b) => b.liters - a.liters);

        const byFormat = packaging
            .filter(p => clientCotte.some(c => c.LOTTO === p.LOTTO_PROD))
            .reduce<Record<string, number>>((acc, item) => {
                acc[item.FORMATO] = (acc[item.FORMATO] || 0) + item.LITRI_TOT;
                return acc;
            }, {});
            
        const analysisByFormat = Object.entries(byFormat).map(([name, liters]) => ({name, liters: liters as number})).sort((a,b) => b.liters - a.liters);

        return {
            totalLitersProduced,
            productionHistory,
            timelineData,
            analysisByBeer,
            analysisByFormat
        };

    }, [selectedClientId, clienti, cotte, packaging]);

    if (isLoading) {
      return <p>Caricamento...</p>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-brew-accent">{t('productionTrend.title')}</h1>
                <button onClick={onExit} className="px-4 py-2 bg-brew-dark-secondary rounded-md text-sm font-semibold hover:bg-slate-600">Torna alla Home</button>
            </div>

            <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                <select 
                    value={selectedClientId} 
                    onChange={e => setSelectedClientId(e.target.value)}
                    className="w-full max-w-sm bg-brew-dark p-2 rounded-md border border-slate-600"
                >
                    <option value="">{t('productionTrend.selectClientPrompt')}</option>
                    {clienti.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
            </div>

            {!analysisData ? (
                <div className="text-center py-16 bg-brew-dark-secondary rounded-lg">
                    <p className="text-slate-400">{selectedClientId ? 'Nessun dato di produzione trovato per questo cliente.' : t('productionTrend.selectClientPrompt')}</p>
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="bg-brew-accent text-brew-dark text-center p-4 rounded-lg">
                        <h3 className="text-xl font-bold">{t('productionTrend.totalLitersProduced')}</h3>
                        <p className="text-5xl font-extrabold">{analysisData.totalLitersProduced.toFixed(1)} L</p>
                    </div>

                    <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                        <h2 className="text-xl font-bold mb-4">{t('productionTrend.productionHistory')}</h2>
                        <div className="max-h-80 overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-brew-light uppercase bg-slate-700 sticky top-0">
                                    <tr>
                                        <th className="px-3 py-2">{t('home.lottoColumn')}</th>
                                        <th className="px-3 py-2">{t('home.prodDateColumn')}</th>
                                        <th className="px-3 py-2">{t('home.typeColumn')}</th>
                                        <th className="px-3 py-2 text-right">{t('productionTrend.packagedLiters')}</th>
                                        <th className="px-3 py-2">{t('productionTrend.formatsUsed')}</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-300">
                                    {analysisData.productionHistory.map(row => (
                                        <tr key={row.LOTTO} className="border-b border-slate-700">
                                            <td className="px-3 py-2 font-semibold text-brew-accent">{row.LOTTO}</td>
                                            <td className="px-3 py-2">{row.DATA_PROD}</td>
                                            <td className="px-3 py-2">{row.NOME_BIRRA}</td>
                                            <td className="px-3 py-2 text-right font-medium">{row.packagedLiters.toFixed(1)}</td>
                                            <td className="px-3 py-2">{row.formatsUsed}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                             <h2 className="text-xl font-bold mb-4">{t('productionTrend.productionTimeline')}</h2>
                             <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={analysisData.timelineData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                                        <XAxis dataKey="date" stroke="#94a3b8" />
                                        <YAxis stroke="#94a3b8" />
                                        <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569' }}/>
                                        <Legend />
                                        <Line type="monotone" dataKey="litri" name={t('productionTrend.liters')} stroke={COLORS[0]} strokeWidth={2} />
                                    </LineChart>
                                </ResponsiveContainer>
                             </div>
                        </div>

                         <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                             <h2 className="text-xl font-bold mb-4">{t('productionTrend.analysisByBeer')}</h2>
                             <div className="grid grid-cols-2 gap-4 h-64">
                                 <div className="flex flex-col justify-center">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={analysisData.analysisByBeer} dataKey="liters" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                                                {analysisData.analysisByBeer.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                            </Pie>
                                            <Tooltip formatter={(value: number) => `${value.toFixed(1)} L`} />
                                            <Legend layout="vertical" align="right" verticalAlign="middle" />
                                        </PieChart>
                                    </ResponsiveContainer>
                                 </div>
                                 <div className="text-xs space-y-2 overflow-y-auto">
                                    {analysisData.analysisByBeer.map((beer, index) =>(
                                        <div key={beer.name} className="p-2 rounded-md" style={{borderLeft: `4px solid ${COLORS[index % COLORS.length]}`}}>
                                            <p className="font-bold">{beer.name}</p>
                                            <p>{beer.liters.toFixed(1)} L ({t('productionTrend.totalBatches')}: {beer.batches})</p>
                                            <p>{t('productionTrend.preferredFormat')}: <span className="font-semibold">{beer.preferredFormat}</span></p>
                                        </div>
                                    ))}
                                 </div>
                             </div>
                        </div>
                    </div>
                     <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                        <h2 className="text-xl font-bold mb-4">{t('productionTrend.analysisByFormat')}</h2>
                        <div className="h-80">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={analysisData.analysisByFormat} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                                    <XAxis type="number" stroke="#94a3b8" />
                                    <YAxis dataKey="name" type="category" width={150} stroke="#94a3b8" />
                                    <Tooltip formatter={(value: number) => `${value.toFixed(1)} L`} contentStyle={{ backgroundColor: '#1e293b', borderColor: '#475569' }}/>
                                    <Legend />
                                    <Bar dataKey="liters" name={t('productionTrend.liters')} fill={COLORS[1]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                     </div>
                </div>
            )}
        </div>
    );
};