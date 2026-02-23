import React, { useState, useEffect } from 'react';
import { getSheetData, deleteMovementByIndexAndSync } from '../services/dataService';
import type { Movement } from '../types';
import { COL_MOV } from '../constants';
import { EditMovementModal } from './EditMovementModal';

interface MovementsViewProps {
    selectedYear: string;
    searchTerm: string;
    onRefresh: () => void;
}

export type MovementWithIndex = Movement & { originalIndex: number };

export const MovementsView: React.FC<MovementsViewProps> = ({ selectedYear, searchTerm, onRefresh }) => {
    const [movements, setMovements] = useState<MovementWithIndex[]>([]);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; movementIndex: number } | null>(null);
    const [editingMovement, setEditingMovement] = useState<MovementWithIndex | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'DATA', direction: 'desc' });

    useEffect(() => {
        const loadMovements = async () => {
            const data = await getSheetData(selectedYear, 'MOVIMENTAZIONE');
            const allMovements = (data as Movement[])
                .map((mov, index) => ({ ...mov, originalIndex: index }))
                .filter(mov => mov.N_FATTURA !== 'RIPORTO_ANNO_PREC');
            
            if (searchTerm) {
                const lowercasedFilter = searchTerm.toLowerCase();
                const filtered = allMovements.filter(item => {
                    return Object.values(item).some(val =>
                        String(val).toLowerCase().includes(lowercasedFilter)
                    );
                });
                setMovements(filtered);
            } else {
                setMovements(allMovements);
            }
        };

        loadMovements();
    }, [selectedYear, searchTerm, onRefresh]);

    const sortedMovements = React.useMemo(() => {
        let sortableItems = [...movements];
        if (sortConfig.key === 'DATA') {
            sortableItems.sort((a, b) => {
                try {
                    const dateA = a.DATA ? new Date(a.DATA.split('/').reverse().join('-')).getTime() : 0;
                    const dateB = b.DATA ? new Date(b.DATA.split('/').reverse().join('-')).getTime() : 0;
                    
                    if (dateA < dateB) {
                        return sortConfig.direction === 'asc' ? -1 : 1;
                    }
                    if (dateA > dateB) {
                        return sortConfig.direction === 'asc' ? 1 : -1;
                    }
                    return 0;
                } catch {
                    return 0;
                }
            });
        }
        return sortableItems;
    }, [movements, sortConfig]);

    const requestSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const handleContextMenu = (e: React.MouseEvent, movementIndex: number) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, movementIndex });
    };

    const handleDelete = async (index: number) => {
        if (window.confirm("Sei sicuro di voler eliminare questo movimento? L'azione è irreversibile.")) {
            await deleteMovementByIndexAndSync(selectedYear, index);
            onRefresh();
        }
        setContextMenu(null);
    };

    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const isLoadMovement = (mov: Movement) => mov.KG_LITRI_PZ > 0 && mov.LOTTO_PRODUZIONE === '';

    return (
        <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg relative">
            <h2 className="text-2xl font-bold text-brew-accent mb-4">📄 Movimenti Magazzino - {selectedYear}</h2>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-300">
                    <thead className="text-xs text-brew-dark uppercase bg-brew-accent">
                        <tr>
                            {COL_MOV.map(col => (
                                <th 
                                    key={col} 
                                    scope="col" 
                                    className={`px-4 py-3 ${col === 'DATA' ? 'cursor-pointer hover:text-white' : ''}`}
                                    onClick={() => col === 'DATA' && requestSort('DATA')}
                                >
                                    {col} {col === 'DATA' && (sortConfig.direction === 'asc' ? '▲' : '▼')}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {sortedMovements.map((mov) => (
                            <tr 
                                key={mov.originalIndex} 
                                className={`border-b border-slate-700 hover:bg-slate-600 ${isLoadMovement(mov) ? 'cursor-pointer' : 'cursor-context-menu'}`}
                                onContextMenu={(e) => handleContextMenu(e, mov.originalIndex)}
                                onClick={() => { if (isLoadMovement(mov)) setEditingMovement(mov) }}
                            >
                                {COL_MOV.map(col => (
                                    <td key={col} className="px-4 py-2">
                                        {col === 'KG_LITRI_PZ' && typeof mov[col as keyof Movement] === 'number'
                                            ? (mov[col as keyof Movement] as number).toFixed(2)
                                            : mov[col as keyof Movement]}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {movements.length === 0 && (
                <p className="text-center text-slate-400 mt-8">Nessun movimento trovato per l'anno corrente (l'inventario iniziale è nascosto). Inizia registrando un carico merce o una cotta.</p>
            )}

            {contextMenu && (
                <div 
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    className="absolute z-10 bg-brew-dark border border-slate-600 rounded-md shadow-lg"
                >
                    <button
                        onClick={() => handleDelete(contextMenu.movementIndex)}
                        className="w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-brew-dark-secondary"
                    >
                        Elimina
                    </button>
                </div>
            )}
            {editingMovement && (
                <EditMovementModal
                    selectedYear={selectedYear}
                    movementToEdit={editingMovement}
                    onClose={() => {
                        setEditingMovement(null);
                        onRefresh();
                    }}
                />
            )}
        </div>
    );
};