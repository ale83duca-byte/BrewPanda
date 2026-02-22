import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getSheetData, saveDataToSheet, getBreweryData, saveBreweryData, upsertItemInSheet } from '../services/dataService';
import type { Cliente, Birra, DatabaseItem, RecipeIngredient } from '../types';
import { PlusIcon, TrashIcon, PencilIcon } from './icons';
import { Modal } from './Modal';
import { useToast } from '../hooks/useToast';

interface DatabaseViewProps {
    selectedYear: string;
}

const ingredientCategories = ["MALTI", "LUPPOLI", "LIEVITI", "ADDITIVI", "SANIFICANTI"];

const BeerRecipeModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    selectedYear: string;
    clienteId: string;
    beerToEdit: Birra | null;
    warehouseDb: DatabaseItem[];
}> = ({ isOpen, onClose, selectedYear, clienteId, beerToEdit, warehouseDb }) => {
    const { showToast } = useToast();
    const [beerDetails, setBeerDetails] = useState({ nomeBirra: '', tipologia: '', platoIniziale: '' });
    const [ricetta, setRicetta] = useState<(RecipeIngredient & { uiId: number })[]>([]);

    useEffect(() => {
        if (beerToEdit) {
            setBeerDetails({ nomeBirra: beerToEdit.nomeBirra, tipologia: beerToEdit.tipologia, platoIniziale: beerToEdit.platoIniziale });
            setRicetta((beerToEdit.ricetta || []).map(r => ({ ...r, qta: r.qta, uiId: Date.now() + Math.random() })));
        } else {
            setBeerDetails({ nomeBirra: '', tipologia: '', platoIniziale: '' });
            setRicetta([]);
        }
    }, [beerToEdit]);

    const handleDetailChange = (field: keyof typeof beerDetails, value: string) => {
        setBeerDetails(prev => ({ ...prev, [field]: value }));
    };

    const addRicettaIngredient = (tipologia: string) => {
        setRicetta(prev => [...prev, { uiId: Date.now(), tipologia, nome: '', qta: 0 }]);
    };
    
    const updateRicettaIngredient = (uiId: number, field: keyof RecipeIngredient, value: string | number) => {
        if (field === 'qta' && typeof value === 'string' && !/^[0-9]*[.,]?[0-9]*$/.test(value)) return;
        setRicetta(prev => prev.map(r => r.uiId === uiId ? { ...r, [field]: value } : r));
    };
    
    const removeRicettaIngredient = (uiId: number) => {
        setRicetta(prev => prev.filter(r => r.uiId !== uiId));
    };

    const handleSave = async () => {
        if (!beerDetails.nomeBirra || !beerDetails.tipologia || !beerDetails.platoIniziale) {
            showToast("Nome, tipologia e grado Plato della birra sono obbligatori.", 'error');
            return;
        }

        const ricettaToSave = ricetta
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            .map(({ uiId, ...rest }) => ({ ...rest, qta: parseFloat(String(rest.qta).replace(',', '.')) || 0 }))
            .filter(r => r.nome && r.qta > 0);

        const birraToSave: Birra = {
            id: beerToEdit?.id || `birra_${Date.now()}`,
            clienteId,
            ...beerDetails,
            ricetta: ricettaToSave,
        };
        
        await upsertItemInSheet(selectedYear, 'BIRRE', birraToSave, 'id');
        showToast(`Birra "${birraToSave.nomeBirra}" salvata con successo!`, 'success');
        onClose();
    };

    const availableIngredients = useMemo(() => {
        const grouped: Record<string, string[]> = {};
        ingredientCategories.forEach(cat => {
            // FIX: Explicitly type `item` to resolve type inference issue.
            grouped[cat] = [...new Set(warehouseDb.filter((item: DatabaseItem) => item.TIPOLOGIA === cat).map(item => item.NOME))].sort();
        });
        return grouped;
    }, [warehouseDb]);

    return (
        <Modal title={beerToEdit ? `Modifica Ricetta: ${beerToEdit.nomeBirra}` : "Aggiungi Nuova Birra"} isOpen={isOpen} onClose={onClose} size="3xl">
            <div className="space-y-6">
                <div className="bg-brew-dark p-4 rounded-lg grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Fix: Pass event.target.value to handleDetailChange instead of the event object. */}
                    <Field label="Nome Birra"><Input value={beerDetails.nomeBirra} onChange={e => handleDetailChange('nomeBirra', e.target.value)} required/></Field>
                    {/* Fix: Pass event.target.value to handleDetailChange instead of the event object. */}
                    <Field label="Tipologia"><Input value={beerDetails.tipologia} onChange={e => handleDetailChange('tipologia', e.target.value)} required/></Field>
                    {/* Fix: Pass event.target.value to handleDetailChange instead of the event object. */}
                    <Field label="Grado Plato (°P)"><Input value={beerDetails.platoIniziale} onChange={e => handleDetailChange('platoIniziale', e.target.value)} required/></Field>
                </div>
                
                <div className="space-y-4">
                    <h3 className="text-xl font-bold text-brew-accent">Ricetta</h3>
                    {ingredientCategories.map(cat => (
                        <div key={cat} className="bg-brew-dark p-3 rounded-lg">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="font-semibold">{cat}</h4>
                                <button onClick={() => addRicettaIngredient(cat)} className="flex items-center text-xs px-2 py-1 bg-brew-blue rounded-md hover:bg-opacity-80"><PlusIcon className="w-4 h-4 mr-1"/>Aggiungi</button>
                            </div>
                            <div className="space-y-2">
                                {ricetta.filter(r => r.tipologia === cat).map(ing => (
                                    <div key={ing.uiId} className="grid grid-cols-[1fr,auto,auto] gap-2 items-center">
                                        <select value={ing.nome} onChange={e => updateRicettaIngredient(ing.uiId, 'nome', e.target.value)} className="w-full bg-brew-dark-secondary p-1.5 rounded-md text-sm">
                                            <option value="">Seleziona ingrediente...</option>
                                            {(availableIngredients[cat] || []).map(name => <option key={name} value={name}>{name}</option>)}
                                        </select>
                                        <input type="text" placeholder="Q.tà" value={ing.qta} onChange={e => updateRicettaIngredient(ing.uiId, 'qta', e.target.value)} className="w-24 bg-brew-dark-secondary p-1.5 rounded-md text-sm text-right"/>
                                        <button onClick={() => removeRicettaIngredient(ing.uiId)} className="p-1 text-red-500 hover:text-red-400"><TrashIcon className="w-5 h-5"/></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>

                <div className="pt-5 flex justify-end">
                    <button onClick={handleSave} className="bg-brew-green text-white font-bold py-2 px-6 rounded-md hover:bg-opacity-80">Salva Birra e Ricetta</button>
                </div>
            </div>
        </Modal>
    );
};


const EditClientModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    clientToEdit: Cliente | null;
    onSave: (_client: Cliente) => Promise<void>;
}> = ({ isOpen, onClose, clientToEdit, onSave }) => {
    const [formData, setFormData] = useState<Cliente | null>(null);

    useEffect(() => {
        setFormData(clientToEdit);
    }, [clientToEdit]);

    const handleChange = (field: keyof Cliente, value: string) => {
        if (formData) {
            setFormData({ ...formData, [field]: value });
        }
    };

    const handleSave = () => {
        if (formData) {
            onSave(formData);
        }
    };

    if (!formData) return null;

    return (
        <Modal title="Modifica Cliente" isOpen={isOpen} onClose={onClose}>
            <div className="space-y-4">
                <Field label="Nome Cliente"><Input value={formData.nome} onChange={e => handleChange('nome', e.target.value)} /></Field>
                <Field label="Ragione Sociale"><Input value={formData.ragioneSociale || ''} onChange={e => handleChange('ragioneSociale', e.target.value)} /></Field>
                <Field label="Partita IVA"><Input value={formData.partitaIva || ''} onChange={e => handleChange('partitaIva', e.target.value)} /></Field>
                <Field label="Sede Sociale"><Input value={formData.sedeSociale || ''} onChange={e => handleChange('sedeSociale', e.target.value)} /></Field>
                <Field label="Numero di Telefono"><Input value={formData.numeroTelefono || ''} onChange={e => handleChange('numeroTelefono', e.target.value)} /></Field>
                <div className="flex justify-end pt-4">
                    <button onClick={handleSave} className="bg-brew-green text-white font-bold py-2 px-4 rounded-md hover:bg-opacity-80">Salva Modifiche</button>
                </div>
            </div>
        </Modal>
    );
};

export const DatabaseView: React.FC<DatabaseViewProps> = ({ selectedYear }) => {
    const [clienti, setClienti] = useState<Cliente[]>([]);
    const [birre, setBirre] = useState<Birra[]>([]);
    const [warehouseDb, setWarehouseDb] = useState<DatabaseItem[]>([]);
    const [newCliente, setNewCliente] = useState<Partial<Cliente>>({ nome: '', partitaIva: '', sedeSociale: '', numeroTelefono: '', ragioneSociale: '' });
    const [confirmState, setConfirmState] = useState<{ isOpen: boolean; type: 'cliente' | 'birra' | null; id: string | null; }>({ isOpen: false, type: null, id: null });
    const { showToast } = useToast();

    const [modalState, setModalState] = useState<{isOpen: boolean, clienteId: string | null, beerToEdit: Birra | null}>({isOpen: false, clienteId: null, beerToEdit: null});
    const [editClientModalOpen, setEditClientModalOpen] = useState(false);
    const [clientToEdit, setClientToEdit] = useState<Cliente | null>(null);

    const loadData = useCallback(async () => {
        const data = await getBreweryData(selectedYear);
        if (data) {
            setClienti(data.CLIENTI || []);
            setBirre(data.BIRRE || []);
            setWarehouseDb(data.DATABASE || []);
        }
    }, [selectedYear]);
    
    useEffect(() => {
        loadData();
    }, [loadData]);

    const addCliente = async () => {
        if (!newCliente.nome || newCliente.nome.trim() === '') {
            showToast("Il nome del cliente non può essere vuoto.", 'error');
            return;
        }
        
        const currentClienti = await getSheetData(selectedYear, 'CLIENTI') as Cliente[];
        if (currentClienti.some(c => c.nome.toLowerCase() === newCliente.nome!.trim().toLowerCase())) {
            showToast("Esiste già un cliente con questo nome.", 'error');
            return;
        }
        
        const clienteToSave: Cliente = {
            id: `cli_${Date.now()}`,
            nome: newCliente.nome.trim(),
            partitaIva: newCliente.partitaIva?.trim() || undefined,
            sedeSociale: newCliente.sedeSociale?.trim() || undefined,
            numeroTelefono: newCliente.numeroTelefono?.trim() || undefined,
            ragioneSociale: newCliente.ragioneSociale?.trim() || undefined,
        };

        await saveDataToSheet(selectedYear, 'CLIENTI', [...currentClienti, clienteToSave]);
        await loadData();
        setNewCliente({ nome: '', partitaIva: '', sedeSociale: '', numeroTelefono: '', ragioneSociale: '' });
        showToast("Cliente aggiunto con successo!", 'success');
    };

    const handleDeleteRequest = (type: 'cliente' | 'birra', id: string) => {
        setConfirmState({ isOpen: true, type, id });
    };

    const handleConfirmDelete = async () => {
        if (!confirmState.type || !confirmState.id) return;

        try {
            const fullData = await getBreweryData(selectedYear);
            if (!fullData) throw new Error("Dati non trovati per l'anno corrente");
            
            if (confirmState.type === 'cliente') {
                const clienteId = confirmState.id;
                fullData.CLIENTI = fullData.CLIENTI.filter(c => c.id !== clienteId);
                fullData.BIRRE = fullData.BIRRE.filter(b => b.clienteId !== clienteId);
            } else {
                const birraId = confirmState.id;
                fullData.BIRRE = fullData.BIRRE.filter(b => b.id !== birraId);
            }
            
            await saveBreweryData(selectedYear, fullData);
            await loadData();
            showToast("Elemento eliminato.", 'success');

        } catch (error) {
             console.error("Errore durante l'eliminazione:", error);
            showToast(`Si è verificato un errore: ${error instanceof Error ? error.message : String(error)}`, 'error');
        } finally {
            setConfirmState({ isOpen: false, type: null, id: null });
        }
    };
    
    const handleOpenNewBeerModal = (clienteId: string) => {
        setModalState({ isOpen: true, clienteId, beerToEdit: null });
    };
    
    const handleOpenEditBeerModal = (beer: Birra) => {
        setModalState({ isOpen: true, clienteId: beer.clienteId, beerToEdit: beer });
    };

    const handleCloseModal = () => {
        setModalState({ isOpen: false, clienteId: null, beerToEdit: null });
        loadData();
    };

    const handleEditClient = (cliente: Cliente) => {
        setClientToEdit(cliente);
        setEditClientModalOpen(true);
    };

    const saveEditedClient = async (updatedClient: Cliente) => {
        await upsertItemInSheet(selectedYear, 'CLIENTI', updatedClient, 'id');
        await loadData();
        setEditClientModalOpen(false);
        setClientToEdit(null);
        showToast("Cliente modificato con successo!", 'success');
    };


    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold text-brew-accent">📚 Database Clienti e Birre</h1>

            <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                <h2 className="text-xl font-bold mb-4">Aggiungi Nuovo Cliente</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
                    <div className="flex-grow">
                        <Field label="Nome Cliente"><Input value={newCliente.nome || ''} onChange={e => setNewCliente(prev => ({ ...prev, nome: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addCliente()} required/></Field>
                        <Field label="Ragione Sociale"><Input value={newCliente.ragioneSociale || ''} onChange={e => setNewCliente(prev => ({ ...prev, ragioneSociale: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addCliente()}/></Field>
                        <Field label="Partita IVA"><Input value={newCliente.partitaIva || ''} onChange={e => setNewCliente(prev => ({ ...prev, partitaIva: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addCliente()}/></Field>
                        <Field label="Sede Sociale"><Input value={newCliente.sedeSociale || ''} onChange={e => setNewCliente(prev => ({ ...prev, sedeSociale: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addCliente()}/></Field>
                        <Field label="Numero di Telefono"><Input value={newCliente.numeroTelefono || ''} onChange={e => setNewCliente(prev => ({ ...prev, numeroTelefono: e.target.value }))} onKeyDown={e => e.key === 'Enter' && addCliente()}/></Field>
                    </div>
                    <button onClick={addCliente} className="bg-brew-green text-white font-bold py-2 px-4 rounded-md flex items-center gap-2"><PlusIcon className="w-5 h-5"/> Aggiungi Cliente</button>
                </div>
            </div>

            <div className="space-y-4">
                {clienti.map(cliente => (
                    <div key={cliente.id} className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                        <div className="flex justify-between items-center mb-4 border-b border-slate-600 pb-2">
                            <h3 className="text-2xl font-bold text-brew-accent">{cliente.nome}</h3>
                            {cliente.ragioneSociale && <p className="text-sm text-slate-400">Ragione Sociale: {cliente.ragioneSociale}</p>}
                            {cliente.partitaIva && <p className="text-sm text-slate-400">P.IVA: {cliente.partitaIva}</p>}
                            {cliente.sedeSociale && <p className="text-sm text-slate-400">Sede: {cliente.sedeSociale}</p>}
                            {cliente.numeroTelefono && <p className="text-sm text-slate-400">Tel: {cliente.numeroTelefono}</p>}
                            <div className="flex items-center gap-2">
                                <button onClick={() => handleEditClient(cliente)} className="text-brew-blue hover:text-blue-400"><PencilIcon className="w-6 h-6"/></button>
                                <button onClick={() => handleDeleteRequest('cliente', cliente.id)} className="text-red-500 hover:text-red-400"><TrashIcon className="w-6 h-6"/></button>
                            </div>
                        </div>
                        
                        <div className="pl-4">
                             <h4 className="text-lg font-semibold mb-2">Birre Associate</h4>
                             {birre.filter(b => b.clienteId === cliente.id).map(birra => (
                                <div key={birra.id} className="flex justify-between items-center bg-brew-dark p-2 rounded-md mb-2">
                                    <div>
                                        <p className="font-bold">{birra.nomeBirra}</p>
                                        <p className="text-xs text-slate-400">{birra.tipologia} - {birra.platoIniziale}°P</p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <button onClick={() => handleOpenEditBeerModal(birra)} className="text-brew-blue hover:text-blue-400"><PencilIcon className="w-5 h-5"/></button>
                                        <button onClick={() => handleDeleteRequest('birra', birra.id)} className="text-red-500/70 hover:text-red-500"><TrashIcon className="w-5 h-5"/></button>
                                    </div>
                                </div>
                             ))}
                             {birre.filter(b => b.clienteId === cliente.id).length === 0 && <p className="text-sm text-slate-400">Nessuna birra associata.</p>}

                            <div className="mt-4 pt-4 border-t border-slate-700">
                                <button onClick={() => handleOpenNewBeerModal(cliente.id)} className="w-full bg-brew-blue text-white font-bold p-2 rounded-md flex items-center justify-center gap-2">
                                    <PlusIcon className="w-5 h-5"/> Aggiungi Nuova Birra
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            
            {confirmState.isOpen && (
                <Modal
                    title="Conferma Eliminazione"
                    isOpen={confirmState.isOpen}
                    onClose={() => setConfirmState({ isOpen: false, type: null, id: null })}
                    size="sm"
                >
                    <div className="space-y-4">
                        <p className="text-sm text-gray-300">
                            {confirmState.type === 'cliente'
                                ? "Vuoi davvero cancellare questo cliente e tutte le sue birre associate dal database?"
                                : "Vuoi davvero cancellare questo prodotto dal database?"}
                        </p>
                        <div className="flex justify-end gap-4 pt-4">
                            <button
                                onClick={() => setConfirmState({ isOpen: false, type: null, id: null })}
                                className="px-4 py-2 rounded-md bg-slate-600 text-white font-semibold hover:bg-slate-500"
                            >
                                No
                            </button>
                            <button
                                onClick={handleConfirmDelete}
                                className="px-4 py-2 rounded-md bg-brew-red text-white font-bold hover:bg-opacity-80"
                            >
                                Sì
                            </button>
                        </div>
                    </div>
                </Modal>
            )}

            {modalState.isOpen && (
                <BeerRecipeModal
                    isOpen={modalState.isOpen}
                    onClose={handleCloseModal}
                    selectedYear={selectedYear}
                    clienteId={modalState.clienteId!}
                    beerToEdit={modalState.beerToEdit}
                    warehouseDb={warehouseDb}
                />
            )}
            
            {editClientModalOpen && (
                <EditClientModal
                    isOpen={editClientModalOpen}
                    onClose={() => setEditClientModalOpen(false)}
                    clientToEdit={clientToEdit}
                    onSave={saveEditedClient}
                />
            )}
        </div>
    );
};

const Field: React.FC<{label: string, children: React.ReactNode}> = ({ label, children }) => (
    <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">{label}</label>
        {children}
    </div>
);

const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input {...props} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600 focus:ring-brew-accent focus:border-brew-accent text-sm" />
);