
import React from 'react';
import type { FermentationDataPoint } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface FermentationChartProps {
    data: FermentationDataPoint[];
}

export const FermentationChart: React.FC<FermentationChartProps> = ({ data }) => {
    if (data.length < 2) {
        return <div className="flex items-center justify-center h-full w-full bg-slate-800 rounded-md text-slate-400">Dati insufficienti per il grafico (min. 2 punti).</div>;
    }

    return (
        <ResponsiveContainer width="100%" height="100%">
            <LineChart
                data={data}
                margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
            >
                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                <XAxis dataKey="GIORNO" stroke="#94a3b8" label={{ value: 'Giorno', position: 'insideBottom', offset: -5, fill: '#94a3b8' }} />
                <YAxis yAxisId="left" stroke="#ef4444" label={{ value: 'Temp (°C)', angle: -90, position: 'insideLeft', fill: '#ef4444' }} />
                <YAxis yAxisId="right" orientation="right" stroke="#3b82f6" label={{ value: 'Plato (°P)', angle: -90, position: 'insideRight', fill: '#3b82f6' }} />
                <Tooltip
                    contentStyle={{
                        backgroundColor: '#1e293b',
                        borderColor: '#475569',
                    }}
                />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="TEMPERATURA" stroke="#ef4444" strokeWidth={2} name="Temp (°C)" dot={{ r: 4 }} activeDot={{ r: 6 }} />
                <Line yAxisId="right" type="monotone" dataKey="PLATO" stroke="#3b82f6" strokeWidth={2} name="Plato (°P)" dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </LineChart>
        </ResponsiveContainer>
    );
};