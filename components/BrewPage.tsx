import React, { useState, useEffect, useCallback, useMemo } from 'react';
// FIX: Add 'upsertItemInSheet' to imports to resolve a 'Cannot find name' error.
import { getBreweryData, getSheetData, deleteMovementsByInvoiceAndSync, saveDataToSheet, saveCottaAndPackaging, upsertItemInSheet } from '../services/dataService';
import type { BrewHeader, FermentationDataPoint, PackagingData, Movement, WarehouseItem, FermenterConfig, Cliente, Birra, RawWarehouseItem } from '../types';
import { TrashIcon, PlusIcon, ArrowUturnLeftIcon, PencilIcon } from './icons';
import { CONFIG_PACKAGING } from '../constants';
import { FermentationChart } from './FermentationChart';
import { Modal } from './Modal';
import { useToast } from '../hooks/useToast';
import { exportBrewSheetToExcel } from '../utils/excelExport';
import { useTranslation } from '../i18n';
import { parseItalianDate } from '../utils/dateUtils';

interface BrewPageProps {
    selectedYear: string;
    lottoId: string | null;
    onExit: () => void;
    onSaveNewLotto?: (id: string) => void; // eslint-disable-line
}

const initialHeaderState: BrewHeader = {
    LOTTO: '', CLIENTE: '', DATA_PROD: new Date().toLocaleDateString('it-IT'), NOME_BIRRA: '', FERMENTATORE: '',
    PLATO_INIZIALE: '', LITRI_FINALI: '', GAS_COTTA: '', GAS_CONFEZIONAMENTO: '', FLAG_CO2: false, FLAG_AZOTO: false, TIPO_BIRRA: '',
    TIPO_FERMENTAZIONE: '', GIORNI_FERMENTAZIONE_PREVISTI: '', NOTE: '',
    mustCounterPrevious: '', mustCounterMeasured: '',
    gasBrewCounterPrevious: '', gasBrewCounterCurrent: '',
    gasPackagingCounterPrevious: '', gasPackagingCounterCurrent: '',
    washWaterCounterPrevious: '', washWaterCounterMeasured: '',
};

interface IngredientRowState {
    id: number;
    tipologia: string;
    nome: string;
    lotto_fornitore: string;
    qta: string;
    gia_scaricato: boolean;
}

type MaterialRequirement = { NOME: string, TIPOLOGIA: string, QTA: number, lotto: string, marca: string, fornitore: string };

interface LocalPackagingData extends PackagingData {
    isNew?: boolean;
    materials?: MaterialRequirement[];
}

const ingredientCategories = ["MALTI", "LUPPOLI", "LIEVITI", "ADDITIVI", "SANIFICANTI"];

const BrewPage: React.FC<BrewPageProps> = ({ selectedYear, lottoId, onExit, onSaveNewLotto }) => {
    const { t } = useTranslation();
    const [header, setHeader] = useState<BrewHeader>(initialHeaderState);
    const [ingredients, setIngredients] = useState<IngredientRowState[]>([]);
    const [fermentationData, setFermentationData] = useState<FermentationDataPoint[]>([]);
    const [packagingData, setPackagingData] = useState<LocalPackagingData[]>([]);
    const [warehouseStock, setWarehouseStock] = useState<WarehouseItem[]>([]);
    const [allMovements, setAllMovements] = useState<Movement[]>([]);
    const [cantinaConfig, setCantinaConfig] = useState<FermenterConfig[]>([]);
    const [cotte, setCotte] = useState<BrewHeader[]>([]);
    const [allPackaging, setAllPackaging] = useState<PackagingData[]>([]);
    const [clienti, setClienti] = useState<Cliente[]>([]);
    const [birre, setBirre] = useState<Birra[]>([]);
    const [isCloseLottoModalOpen, setIsCloseLottoModalOpen] = useState(false);
    const { showToast } = useToast();
    const [fermInput, setFermInput] = useState({data: new Date().toISOString().slice(0, 10), temp: '', plato: ''});

    const dataProdValue = useMemo(() => {
        if (header.DATA_PROD && /^\d{2}\/\d{2}\/\d{4}$/.test(header.DATA_PROD)) {
            return header.DATA_PROD.split('/').reverse().join('-');
        }
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }, [header.DATA_PROD]);

    const handleDataProdChange = (isoDate: string) => { // isoDate is 'YYYY-MM-DD'
        if (!isoDate) {
            handleHeaderChange('DATA_PROD', '');
        } else {
            const [y, m, d] = isoDate.split('-');
            handleHeaderChange('DATA_PROD', `${d}/${m}/${y}`);
        }
    };
    
    const isLottoClosed = useMemo(() => {
        return !!lottoId && !header.FERMENTATORE;
    }, [lottoId, header.FERMENTATORE]);

    const birreClienteSelezionato = useMemo(() => {
        const clienteSelezionato = clienti.find(c => c.nome === header.CLIENTE);
        if (clienteSelezionato) {
            return birre.filter(b => b.clienteId === clienteSelezionato.id);
        }
        return [];
    }, [header.CLIENTE, clienti, birre]);

    const availableFermenters = useMemo(() => {
        const packagedLiters: Record<string, number> = {};
        allPackaging.forEach(p => {
            packagedLiters[p.LOTTO_PROD] = (packagedLiters[p.LOTTO_PROD] || 0) + p.LITRI_TOT;
        });

        const occupiedByOthers = new Set<string>();
        cotte.forEach(cotta => {
            if (cotta.LOTTO !== lottoId && cotta.FERMENTATORE) {
                const litriFinali = parseFloat(cotta.LITRI_FINALI?.replace(',', '.')) || 0;
                const litriConfezionati = packagedLiters[cotta.LOTTO] || 0;
                if (litriFinali > 0 && litriConfezionati < litriFinali) {
                    occupiedByOthers.add(cotta.FERMENTATORE);
                }
            }
        });
        
        return cantinaConfig.filter(f => !occupiedByOthers.has(f.nome));

    }, [cantinaConfig, cotte, allPackaging, lottoId]);

    const dataConfezionamentoPrevista = useMemo(() => {
        if (header.DATA_PROD && header.GIORNI_FERMENTAZIONE_PREVISTI) {
            const prodDate = parseItalianDate(header.DATA_PROD);
            const giorni = parseInt(header.GIORNI_FERMENTAZIONE_PREVISTI, 10);
            if (prodDate && !isNaN(giorni)) {
                prodDate.setDate(prodDate.getDate() + giorni);
                return prodDate.toLocaleDateString('it-IT');
            }
        }
        return 'N/D';
    }, [header.DATA_PROD, header.GIORNI_FERMENTAZIONE_PREVISTI]);

    const ingredientLotsStock = useMemo(() => {
        const stock: Record<string, { lotto: string; giacenza: number; marca: string; fornitore: string }[]> = {};
        const lotStockMap: Record<string, number> = {};
        const lotDetailsMap: Record<string, { nome: string; marca: string; fornitore: string }> = {};

        const normalizedMovements = allMovements.map(m => ({
            ...m,
            NOME: m.NOME ? m.NOME.toUpperCase().trim() : '',
            LOTTO_FORNITORE: m.LOTTO_FORNITORE ? m.LOTTO_FORNITORE.toUpperCase().trim() : '',
        }));

        normalizedMovements.forEach(m => {
            if (m.NOME && m.LOTTO_FORNITORE) {
                const key = `${m.NOME}|${m.LOTTO_FORNITORE}`;
                lotStockMap[key] = (lotStockMap[key] || 0) + m.KG_LITRI_PZ;

                if (m.KG_LITRI_PZ > 0 && !lotDetailsMap[key]) {
                    lotDetailsMap[key] = { nome: m.NOME, marca: m.MARCA, fornitore: m.FORNITORE };
                }
            }
        });
        
        Object.entries(lotStockMap).forEach(([entryKey, giacenza]) => {
            const key = entryKey as string;
            if (giacenza >= 0.01) {
                const [nome, lotto] = key.split('|');
                const details = lotDetailsMap[key] || { nome, marca: 'N/D', fornitore: 'N/D' };
                if (!stock[nome]) {
                    stock[nome] = [];
                }
                stock[nome].push({ lotto, giacenza, ...details });
            }
        });
        return stock;

    }, [allMovements]);

    const loadData = useCallback(async () => {
        const data = await getBreweryData(selectedYear);
        if (!data) return;

        setAllMovements(data.MOVIMENTAZIONE);
        setCantinaConfig(data.CANTINA_CONFIG || []);
        
        const cotteData = (data.COTTE_HEAD || []).sort((a, b) => {
            try {
                const dateA = new Date(a.DATA_PROD.split('/').reverse().join('-')).getTime();
                const dateB = new Date(b.DATA_PROD.split('/').reverse().join('-')).getTime();
                return dateA - dateB;
            } catch { return 0; }
        });
        setCotte(cotteData);

        setAllPackaging(data.CONFEZIONAMENTO || []);
        setClienti(data.CLIENTI || []);
        setBirre(data.BIRRE || []);

        const stockMap = new Map<string, WarehouseItem>();
        (data.MAGAZZINO as RawWarehouseItem[]).forEach(item => {
            const key = `${item.TIPOLOGIA}|${item.NOME}`;
            const existing = stockMap.get(key) || { TIPOLOGIA: item.TIPOLOGIA, NOME: item.NOME, GIACENZA: 0 };
            existing.GIACENZA += item.GIACENZA;
            stockMap.set(key, existing);
        });
        setWarehouseStock(Array.from(stockMap.values()));

        if (lottoId) {
            const existingHeader = cotteData.find(h => h.LOTTO === lottoId);
            setHeader(existingHeader || { ...initialHeaderState, LOTTO: lottoId });

            const lotMovements = data.MOVIMENTAZIONE.filter(m => m.LOTTO_PRODUZIONE === lottoId && m.KG_LITRI_PZ < 0 && ingredientCategories.includes(m.TIPOLOGIA));
            setIngredients(lotMovements.map((m, i) => ({
                id: i, tipologia: m.TIPOLOGIA, nome: m.NOME, lotto_fornitore: m.LOTTO_FORNITORE, qta: String(Math.abs(m.KG_LITRI_PZ)), gia_scaricato: true
            })));

            setFermentationData(data.FERMENTAZIONE.filter(f => f.LOTTO === lottoId).sort((a,b) => a.GIORNO - b.GIORNO));
            setPackagingData(data.CONFEZIONAMENTO.filter(p => p.LOTTO_PROD === lottoId));
        } else {
            setHeader(initialHeaderState);
            setIngredients([]);
            setFermentationData([]);
            setPackagingData([]);
        }
    }, [selectedYear, lottoId]);

    useEffect(() => {
        loadData();
    }, [loadData]);
    
    useEffect(() => {
        let initialDate = new Date();
        // Only for existing lots with a prod date
        if (lottoId && header.DATA_PROD) {
            const prodDate = parseItalianDate(header.DATA_PROD);
            if(prodDate) {
                prodDate.setHours(0,0,0,0);
                 if (fermentationData.length > 0) {
                    // Find the latest day number from the existing data
                    const lastDay = Math.max(...fermentationData.map(d => d.GIORNO));
                    
                    // Calculate the next date by adding (lastDay + 1) to the production date.
                    const nextMeasurementDate = new Date(prodDate.getTime());
                    nextMeasurementDate.setDate(nextMeasurementDate.getDate() + lastDay + 1);
                    
                    initialDate = nextMeasurementDate;
                } else {
                    // If no fermentation data, start from the production date
                    initialDate = prodDate;
                }
            }
        }
        // Also reset temp and plato to avoid carrying over old values
        setFermInput({ data: initialDate.toISOString().slice(0, 10), temp: '', plato: '' });
    }, [lottoId, header.DATA_PROD, fermentationData]);

    const handleHeaderChange = (field: keyof BrewHeader, value: string | boolean) => {
        if (typeof value === 'boolean') {
             setHeader(prev => ({ ...prev, [field]: value }));
             return;
        }
        
        const isNumeric = field === 'PLATO_INIZIALE' || field === 'LITRI_FINALI';
        const isInteger = field === 'GIORNI_FERMENTAZIONE_PREVISTI';
        const isCounter = [
            'mustCounterPrevious', 'mustCounterMeasured',
            'gasBrewCounterPrevious', 'gasBrewCounterCurrent',
            'gasPackagingCounterPrevious', 'gasPackagingCounterCurrent',
            'washWaterCounterPrevious', 'washWaterCounterMeasured'
        ].includes(field);

        if ((isNumeric || isInteger || isCounter) && value !== '' && !/^[0-9]*[.,]?[0-9]*$/.test(value)) {
            return;
        }
        setHeader(prev => ({ ...prev, [field]: value }));
    };

    const handleClienteSelection = (clienteNome: string) => {
        setHeader(prev => ({
            ...prev,
            CLIENTE: clienteNome,
            NOME_BIRRA: '',
            TIPO_BIRRA: '',
            PLATO_INIZIALE: ''
        }));
        setIngredients([]);
    };

    const handleBirraSelection = (birraNome: string) => {
        const birraSelezionata = birreClienteSelezionato.find(b => b.nomeBirra === birraNome);
        if (birraSelezionata) {
            setHeader(prev => ({
                ...prev,
                NOME_BIRRA: birraSelezionata.nomeBirra,
                TIPO_BIRRA: birraSelezionata.tipologia,
                PLATO_INIZIALE: birraSelezionata.platoIniziale
            }));
             if (birraSelezionata.ricetta && birraSelezionata.ricetta.length > 0) {
                const newIngredientsFromRecipe: IngredientRowState[] = birraSelezionata.ricetta.map(ing => ({
                    id: Date.now() + Math.random(),
                    tipologia: ing.tipologia,
                    nome: ing.nome,
                    qta: String(ing.qta).replace('.', ','),
                    lotto_fornitore: '',
                    gia_scaricato: false,
                }));
                setIngredients(newIngredientsFromRecipe);
                showToast(`Ricetta per ${birraSelezionata.nomeBirra} caricata! Seleziona i lotti da scaricare.`, 'info');
            } else {
                setIngredients([]);
            }
        } else {
             setHeader(prev => ({ ...prev, NOME_BIRRA: birraNome }));
             setIngredients([]);
        }
    };


    const addIngredientRow = (tipologia: string) => {
        setIngredients(prev => [...prev, { id: Date.now(), tipologia, nome: '', lotto_fornitore: '', qta: '', gia_scaricato: false }]);
    };
    
    const [editingIngredientId, setEditingIngredientId] = useState<number | null>(null);

    const toggleEditIngredient = (id: number) => {
        if (editingIngredientId === id) {
            setEditingIngredientId(null);
        } else {
            setEditingIngredientId(id);
        }
    };

    const updateIngredientRow = (id: number, field: 'nome' | 'lotto_fornitore' | 'qta', value: string) => {
        if (field === 'qta' && value !== '' && !/^[0-9]*[.,]?[0-9]*$/.test(value)) {
            return;
        }
        setIngredients(prev => prev.map(ing => {
            if (ing.id !== id) {
                return ing;
            }
            const newIng = {...ing};
            switch(field) {
                case 'nome':
                    newIng.nome = value;
                    if (!editingIngredientId) {
                         newIng.lotto_fornitore = '';
                    }
                    break;
                case 'lotto_fornitore':
                    newIng.lotto_fornitore = value;
                    break;
                case 'qta':
                    newIng.qta = value;
                    break;
            }
            return newIng;
        }));
    };


    const removeIngredientRow = (id: number) => {
        setIngredients(prev => prev.filter(ing => ing.id !== id));
    };

    const handleSaveCotta = async () => {
        if (!header.LOTTO) {
            showToast("Il numero di Lotto è obbligatorio.", 'error');
            return;
        }
        const isNewLotto = !lottoId;
        const upperLotto = header.LOTTO.toUpperCase().trim();
        
        const parse = (val: string | number | undefined) => {
             if (typeof val === 'number') return val;
             if (!val) return 0;
             return parseFloat(val.replace(',', '.')) || 0;
        };
        const gasCottaValue = parse(header.gasBrewCounterCurrent) - parse(header.gasBrewCounterPrevious);
        const gasConfValue = parse(header.gasPackagingCounterCurrent) - parse(header.gasPackagingCounterPrevious);

        const updatedHeader: BrewHeader = { 
            ...header, 
            LOTTO: upperLotto,
            GAS_COTTA: gasCottaValue > 0 ? gasCottaValue.toFixed(2).replace('.', ',') : '0',
            GAS_CONFEZIONAMENTO: gasConfValue > 0 ? gasConfValue.toFixed(2).replace('.', ',') : '0',
        };

        // Ingredient movements
        const ingredientMovements = ingredients
            .filter(ing => !ing.gia_scaricato && ing.nome && ing.qta && ing.lotto_fornitore)
            .map(ing => {
                const lots = ingredientLotsStock[ing.nome.toUpperCase()] || [];
                const lotInfo = lots.find(l => l.lotto === ing.lotto_fornitore.toUpperCase());
                return {
                    DATA: header.DATA_PROD,
                    TIPOLOGIA: ing.tipologia,
                    NOME: ing.nome,
                    MARCA: lotInfo?.marca || 'N/D',
                    FORNITORE: lotInfo?.fornitore || 'N/D',
                    KG_LITRI_PZ: -parseFloat(ing.qta.replace(',', '.')),
                    N_FATTURA: '',
                    LOTTO_FORNITORE: ing.lotto_fornitore,
                    LOTTO_PRODUZIONE: upperLotto,
                } as Movement;
            });
        
        // Packaging movements and data
        const newPackagingItems = packagingData.filter(p => p.isNew);
        const packagingMovements: Movement[] = [];
        newPackagingItems.forEach(pkg => {
            pkg.materials?.forEach(mat => {
                packagingMovements.push({
                    DATA: pkg.DATA,
                    TIPOLOGIA: mat.TIPOLOGIA,
                    NOME: mat.NOME,
                    MARCA: mat.marca,
                    FORNITORE: mat.fornitore,
                    KG_LITRI_PZ: -mat.QTA,
                    N_FATTURA: pkg.ID_OPERAZIONE,
                    LOTTO_FORNITORE: mat.lotto,
                    LOTTO_PRODUZIONE: pkg.LOTTO_PROD
                });
            });
        });
        const newPackagingData = newPackagingItems.map(({ isNew: _isNew, materials: _materials, ...rest }) => rest); // eslint-disable-line

        // Save everything
        await saveCottaAndPackaging(selectedYear, {
            header: updatedHeader,
            ingredientMovements,
            packagingMovements,
            newPackagingData
        });


        showToast("Cotta, ingredienti e confezionamento salvati!", 'success');
        if (isNewLotto && onSaveNewLotto) {
            onSaveNewLotto(upperLotto);
        } else {
            await loadData();
        }
    };

    const calculatedFermentationDay = useMemo(() => {
        const prodDate = parseItalianDate(header.DATA_PROD);
        if (!prodDate || !fermInput.data) {
            return null;
        }
    
        const [year, month, day] = fermInput.data.split('-').map(Number);
        if (isNaN(year) || isNaN(month) || isNaN(day)) {
            return null;
        }
        const measurementDate = new Date(year, month - 1, day);
    
        if (isNaN(measurementDate.getTime())) {
            return null;
        }
        
        prodDate.setHours(0, 0, 0, 0);
        measurementDate.setHours(0, 0, 0, 0);
    
        const diffTime = measurementDate.getTime() - prodDate.getTime();
        if (diffTime < 0) return null;
        
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    }, [header.DATA_PROD, fermInput.data]);

    const handleFermInputChange = (field: 'data' | 'temp' | 'plato', value: string) => {
        const numericFields = ['temp', 'plato'];
        if (numericFields.includes(field) && value !== '' && !/^[0-9]*[.,]?[0-9]*$/.test(value)) {
            return;
        }
        setFermInput(s => ({ ...s, [field]: value }));
    };

    const addFermentationPoint = async () => {
        const { temp, plato } = fermInput;
        const giorno = calculatedFermentationDay;
    
        if (giorno === null || giorno < 0 || !temp || !plato || !header.LOTTO) {
            showToast("Dati di fermentazione non validi. Controlla la data, temperatura e plato.", 'error');
            return;
        }
    
        // Check for duplicate day and ask for confirmation to overwrite
        if (fermentationData.some(d => d.GIORNO === giorno)) {
            if (!window.confirm(`Esiste già una misurazione per il giorno ${giorno}. Vuoi sovrascriverla?`)) {
                return; // User cancelled
            }
        }
    
        const newPoint: FermentationDataPoint = {
            LOTTO: header.LOTTO,
            GIORNO: giorno,
            TEMPERATURA: parseFloat(temp.replace(',', '.')),
            PLATO: parseFloat(plato.replace(',', '.'))
        };
    
        const allFermDataForYear = await getSheetData(selectedYear, 'FERMENTAZIONE');
        
        // Filter out the old point for this lotto and day, if it exists
        const updatedFermDataForYear = allFermDataForYear.filter(d => !(d.LOTTO === header.LOTTO && d.GIORNO === giorno));
        
        // Add the new/updated point
        updatedFermDataForYear.push(newPoint);
    
        await saveDataToSheet(selectedYear, 'FERMENTAZIONE', updatedFermDataForYear);
        
        // Update local state by replacing or adding the point, then sorting
        setFermentationData(prev => [...prev.filter(d => d.GIORNO !== giorno), newPoint].sort((a, b) => a.GIORNO - b.GIORNO));
        
        // Reset input for the next day
        const [y, m, d] = fermInput.data.split('-').map(Number);
        const lastDate = new Date(y, m - 1, d);
        lastDate.setDate(lastDate.getDate() + 1);
        const nextDate = lastDate.toISOString().slice(0, 10);
        setFermInput({ data: nextDate, temp: '', plato: '' });
    
        showToast(`Dati per il giorno ${giorno} salvati.`, 'success');
    };

    const [pkgInput, setPkgInput] = useState({data: new Date().toISOString().slice(0, 10), formato:'', qta:'', dataScadenza: ''});
    const [useCartons, setUseCartons] = useState(true);
    const [selectedCapName, setSelectedCapName] = useState('');
    const [pkgMaterialSelections, setPkgMaterialSelections] = useState<Record<string, string>>({});

    useEffect(() => {
        setPkgMaterialSelections({});
        setSelectedCapName('');
    }, [pkgInput.formato, useCartons]);

    const requiredPackagingMaterials = useMemo(() => {
        if (!pkgInput.formato) return [];
        const config = CONFIG_PACKAGING[pkgInput.formato];
        if (!config) return [];

        const materials = [];
        materials.push({ key: 'container', name: config.nomeInvCont, tipologia: config.nomeInvCont.includes('BOTTIGLIA') ? 'BOTTIGLIE' : 'FUSTI'});

        if (config.nomeInvScatola && useCartons) {
            materials.push({ key: 'carton', name: config.nomeInvScatola, tipologia: 'CARTONI' });
        }

        if (pkgInput.formato.includes("BOTT")) {
            materials.push({ key: 'cap', name: '', tipologia: 'TAPPI' });
        }

        return materials;
    }, [pkgInput.formato, useCartons]);


    const totalLitriConfezionati = packagingData.reduce((sum, pkg) => sum + pkg.LITRI_TOT, 0);
    const litriIniziali = parseFloat(header.LITRI_FINALI?.replace(',', '.')) || 0;
    const perdita = litriIniziali - totalLitriConfezionati;

    const addPackagingItem = () => {
        const {formato, qta: qtaStr, dataScadenza} = pkgInput;
        if (!header.LOTTO || !formato || !qtaStr || !dataScadenza) {
            showToast("Tutti i campi di confezionamento sono obbligatori.", 'error'); return;
        }
        const qta = parseInt(qtaStr);
        if(isNaN(qta) || qta <= 0) { showToast("Quantità non valida.", 'error'); return; }

        const config = CONFIG_PACKAGING[formato];
        if(!config) { showToast("Formato non valido.", 'error'); return; }
        
        const fabbisogni: MaterialRequirement[] = [];

        // 1. Container
        const containerName = config.nomeInvCont;
        const containerLotto = pkgMaterialSelections[containerName];
        if (!containerLotto) { showToast(`Seleziona un lotto per ${containerName}`, 'error'); return; }
        const containerInfo = (ingredientLotsStock[containerName.toUpperCase()] || []).find(l => l.lotto === containerLotto.toUpperCase());
        if(!containerInfo) { showToast(`Info lotto non trovate per ${containerName}`, 'error'); return; }
        fabbisogni.push({ NOME: containerName, TIPOLOGIA: containerName.includes('BOTT') ? 'BOTTIGLIE' : 'FUSTI', QTA: qta, lotto: containerLotto, marca: containerInfo.marca, fornitore: containerInfo.fornitore });

        // 2. Carton
        if (config.nomeInvScatola && useCartons) {
            const cartonName = config.nomeInvScatola;
            const cartonLotto = pkgMaterialSelections[cartonName];
            if (!cartonLotto) { showToast(`Seleziona un lotto per ${cartonName}`, 'error'); return; }
            const cartonQta = Math.ceil(qta / config.pezziPerCartone);
            const cartonInfo = (ingredientLotsStock[cartonName.toUpperCase()] || []).find(l => l.lotto === cartonLotto.toUpperCase());
            if(!cartonInfo) { showToast(`Info lotto non trovate per ${cartonName}`, 'error'); return; }
            fabbisogni.push({ NOME: cartonName, TIPOLOGIA: 'CARTONI', QTA: cartonQta, lotto: cartonLotto, marca: cartonInfo.marca, fornitore: cartonInfo.fornitore });
        }

        // 3. Cap
        if (formato.includes("BOTT")) {
            if (!selectedCapName) { showToast("Seleziona un tipo di tappo", 'error'); return; }
            const capLotto = pkgMaterialSelections[selectedCapName];
            if (!capLotto) { showToast(`Seleziona un lotto per ${selectedCapName}`, 'error'); return; }
            const capInfo = (ingredientLotsStock[selectedCapName.toUpperCase()] || []).find(l => l.lotto === capLotto.toUpperCase());
            if(!capInfo) { showToast(`Info lotto non trovate per ${selectedCapName}`, 'error'); return; }
            fabbisogni.push({ NOME: selectedCapName, TIPOLOGIA: 'TAPPI', QTA: qta, lotto: capLotto, marca: capInfo.marca, fornitore: capInfo.fornitore });
        }

        for (const item of fabbisogni) {
            const availableLots = ingredientLotsStock[item.NOME.toUpperCase()] || [];
            const selectedLotInfo = availableLots.find(l => l.lotto === item.lotto.toUpperCase());
            if (!selectedLotInfo || selectedLotInfo.giacenza < item.QTA) {
                showToast(`Materiale insufficiente: ${item.NOME} (Lotto: ${item.lotto}). Necessari: ${item.QTA}, Disponibili: ${selectedLotInfo?.giacenza || 0}`, 'error');
                return;
            }
        }

        const [year, month, day] = pkgInput.data.split('-');
        const formattedDate = `${day}/${month}/${year}`;
        
        const [s_year, s_month, s_day] = dataScadenza.split('-');
        const formattedScadenza = `${s_day}/${s_month}/${s_year}`;

        const id_op = `CONF_${Date.now()}`;
        const newPkg: LocalPackagingData = {
            DATA: formattedDate, LOTTO_PROD: header.LOTTO, FORMATO: formato, QTA_UNITA: qta, LITRI_TOT: qta * config.litriUnit, ID_OPERAZIONE: id_op, 
            DATA_SCADENZA: formattedScadenza, isNew: true, materials: fabbisogni
        };
        
        setPackagingData(prev => [...prev, newPkg]);
        showToast("Confezionamento aggiunto al riepilogo.", 'info');
        
        setPkgInput({data: new Date().toISOString().slice(0, 10), formato: '', qta: '', dataScadenza: ''});
        setPkgMaterialSelections({});
        setSelectedCapName('');
    };

    const handleUndoLastPackaging = async () => {
        if (packagingData.length === 0) return;
        const lastPkg = packagingData[packagingData.length - 1];

        if (lastPkg.isNew) {
            setPackagingData(prev => prev.slice(0, -1));
            showToast("Ultimo confezionamento non salvato rimosso.", 'info');
        } else {
            if(window.confirm(`Annullare l'ultimo confezionamento salvato (${lastPkg.FORMATO} x${lastPkg.QTA_UNITA})? L'operazione è irreversibile.`)) {
                await deleteMovementsByInvoiceAndSync(selectedYear, lastPkg.ID_OPERAZIONE);
                const updatedPkgs = packagingData.slice(0, -1);
                await saveDataToSheet(selectedYear, 'CONFEZIONAMENTO', updatedPkgs);
                showToast("Operazione salvata annullata.", 'success');
                await loadData(); // Reload all data to ensure consistency
            }
        }
    };

    const handleConfirmCloseLotto = async () => {
        if (!header.LOTTO || !header.FERMENTATORE) {
            showToast("Impossibile chiudere il lotto: nessun fermentatore assegnato.", 'error');
            return;
        }
        
        const fermenterToFree = header.FERMENTATORE;
        const updatedHeader = { ...header, FERMENTATORE: '' };
        await upsertItemInSheet(selectedYear, 'COTTE_HEAD', updatedHeader, 'LOTTO');
        setHeader(updatedHeader);
        showToast(`Lotto ${header.LOTTO} chiuso. Il fermentatore ${fermenterToFree} è ora libero.`, 'success');
        setIsCloseLottoModalOpen(false);
        await loadData();
    };

    const handleExport = () => {
        try {
            exportBrewSheetToExcel(header, ingredients, fermentationData, packagingData);
        } catch (error) {
            console.error('Export to Excel failed:', error);
            showToast('Esportazione Excel fallita. Controlla la console per i dettagli.', 'error');
        }
    };

    const parseCounter = (val: string | number | undefined) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        return parseFloat(val.replace(',', '.')) || 0;
    };

    const gasCottaCalc = parseCounter(header.gasBrewCounterCurrent) - parseCounter(header.gasBrewCounterPrevious);
    const gasConfValue = parseCounter(header.gasPackagingCounterCurrent) - parseCounter(header.gasPackagingCounterPrevious);

    return (
        <div className="space-y-6 text-brew-light">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold text-brew-accent">{lottoId ? `LOTTO: ${lottoId}` : 'NUOVO FOGLIO COTTA'}</h1>
                <button onClick={onExit} className="px-4 py-2 bg-brew-dark-secondary rounded-md text-sm font-semibold hover:bg-slate-600">Torna alla Home</button>
            </div>
            
            {isLottoClosed && (
                <div className="p-3 bg-yellow-500/20 border border-yellow-500 text-yellow-300 rounded-lg text-center font-bold">
                    Questo lotto è stato chiuso e non è più modificabile.
                </div>
            )}
            
            <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                <h2 className="text-xl font-bold mb-4">Testata</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <Input label="LOTTO" value={header.LOTTO} onChange={v => handleHeaderChange('LOTTO', v.target.value.toUpperCase())} required disabled={!!lottoId} />
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">CLIENTE</label>
                        <select value={header.CLIENTE} onChange={e => handleClienteSelection(e.target.value)} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600 focus:ring-brew-accent focus:border-brew-accent text-sm disabled:opacity-50" disabled={isLottoClosed}>
                            <option value="">Seleziona Cliente...</option>
                            {clienti.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
                        </select>
                    </div>
                    <Input label="DATA PROD." type="date" value={dataProdValue} onChange={v => handleDataProdChange(v.target.value)} disabled={isLottoClosed} />
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">NOME BIRRA</label>
                        <select value={header.NOME_BIRRA} onChange={e => handleBirraSelection(e.target.value)} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600 focus:ring-brew-accent focus:border-brew-accent text-sm disabled:opacity-50" disabled={isLottoClosed || !header.CLIENTE}>
                            <option value="">Seleziona Birra...</option>
                            {birreClienteSelezionato.map(b => <option key={b.id} value={b.nomeBirra}>{b.nomeBirra}</option>)}
                        </select>
                    </div>
                    <Input label="TIPOLOGIA" value={header.TIPO_BIRRA} onChange={v => handleHeaderChange('TIPO_BIRRA', v.target.value)} disabled={isLottoClosed} />
                    <Input label="PLATO (°P)" value={header.PLATO_INIZIALE} onChange={v => handleHeaderChange('PLATO_INIZIALE', v.target.value)} disabled={isLottoClosed} />
                    <Input label="LITRI FINALI" value={header.LITRI_FINALI} onChange={v => handleHeaderChange('LITRI_FINALI', v.target.value)} disabled={isLottoClosed} />
                </div>
                <div className="col-span-1 md:col-span-2 lg:grid-cols-4 border-t border-slate-700 mt-4 pt-4">
                    <h3 className="text-lg font-semibold text-brew-accent mb-2">{t('brewPage.mustCounter')}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Input label={t('brewPage.mustCounterPrevious')} value={header.mustCounterPrevious} onChange={e => handleHeaderChange('mustCounterPrevious', e.target.value)} disabled={isLottoClosed} />
                        <Input label={t('brewPage.mustCounterMeasured')} value={header.mustCounterMeasured} onChange={e => handleHeaderChange('mustCounterMeasured', e.target.value)} disabled={isLottoClosed} />
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">{t('brewPage.mustCounterResult')}</label>
                            <div className="w-full bg-brew-dark p-2 rounded-md border border-slate-700 text-lg font-bold text-yellow-300 h-[42px] flex items-center">
                                {Math.round((parseCounter(header.mustCounterMeasured) - parseCounter(header.mustCounterPrevious)) * 100) / 100} L
                            </div>
                        </div>
                    </div>
                </div>
                <div className="col-span-1 md:col-span-2 lg:grid-cols-4 border-t border-slate-700 mt-4 pt-4">
                    <h3 className="text-lg font-semibold text-brew-accent mb-2">Valore Conta Mosto Lavaggi Controflusso</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Input label="Valore Precedente" value={header.washWaterCounterPrevious} onChange={e => handleHeaderChange('washWaterCounterPrevious', e.target.value)} disabled={isLottoClosed} />
                        <Input label="Valore Misurato" value={header.washWaterCounterMeasured} onChange={e => handleHeaderChange('washWaterCounterMeasured', e.target.value)} disabled={isLottoClosed} />
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Acqua totale di lavaggi</label>
                            <div className="w-full bg-brew-dark p-2 rounded-md border border-slate-700 text-lg font-bold text-cyan-300 h-[42px] flex items-center">
                                {Math.round((parseCounter(header.washWaterCounterMeasured) - parseCounter(header.washWaterCounterPrevious)) * 100) / 100} L
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="space-y-4">
                {ingredientCategories.map(cat => (
                    <div key={cat} className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-lg font-bold text-brew-accent">{cat}</h3>
                            <button onClick={() => addIngredientRow(cat)} className="flex items-center px-2 py-1 bg-brew-green rounded-md text-xs hover:bg-opacity-80 disabled:bg-slate-600" disabled={isLottoClosed}><PlusIcon className="w-4 h-4 mr-1"/>AGGIUNGI</button>
                        </div>
                        <div className="space-y-2">
                            {ingredients.filter(i => i.tipologia === cat).map(ing => {
                                const isEditing = editingIngredientId === ing.id;
                                const availableIngredients = warehouseStock.filter(s => s.TIPOLOGIA === cat);
                                // Ensure the current ingredient is in the list even if out of stock, to prevent "Seleziona..."
                                const currentIngredientInStock = availableIngredients.find(s => s.NOME === ing.nome);
                                const options = currentIngredientInStock 
                                    ? availableIngredients 
                                    : [...availableIngredients, { TIPOLOGIA: cat, NOME: ing.nome, GIACENZA: 0 } as WarehouseItem];

                                return (
                                <div key={ing.id} className="grid grid-cols-[1fr,1fr,auto,auto,auto,auto] gap-2 items-center">
                                    <select value={ing.nome} onChange={e => updateIngredientRow(ing.id, 'nome', e.target.value)} className="bg-brew-dark p-1.5 rounded-md text-sm w-full disabled:opacity-50" disabled={(ing.gia_scaricato && !isEditing) || isLottoClosed}>
                                        <option value="">Seleziona...</option>
                                        {options.map(s => <option key={s.NOME} value={String(s.NOME)}>{s.NOME}</option>)}
                                    </select>
                                    {ing.gia_scaricato && !isEditing ? (
                                        <input 
                                            type="text" 
                                            value={ing.lotto_fornitore} 
                                            className="bg-brew-dark p-1.5 rounded-md text-sm w-full disabled:opacity-70 border border-transparent" 
                                            disabled 
                                        />
                                    ) : (
                                        <select value={ing.lotto_fornitore} onChange={e => updateIngredientRow(ing.id, 'lotto_fornitore', e.target.value)} className="bg-brew-dark p-1.5 rounded-md text-sm w-full disabled:opacity-50" disabled={(isLottoClosed && !isEditing) || !ing.nome}>
                                            <option value="">Seleziona Lotto...</option>
                                            {(ingredientLotsStock[ing.nome.toUpperCase()] || []).map(l => <option key={l.lotto} value={String(l.lotto)}>{`${l.lotto} (Giac: ${l.giacenza.toFixed(2)})`}</option>)}
                                            {/* If editing and the current lot is not in stock (e.g. fully used), add it as an option */}
                                            {isEditing && ing.lotto_fornitore && !(ingredientLotsStock[ing.nome.toUpperCase()] || []).some(l => l.lotto === ing.lotto_fornitore) && (
                                                <option value={ing.lotto_fornitore}>{ing.lotto_fornitore} (Esaurito)</option>
                                            )}
                                        </select>
                                    )}
                                    <input type="text" placeholder="Quantità" value={ing.qta} onChange={e => updateIngredientRow(ing.id, 'qta', e.target.value)} className="bg-brew-dark p-1.5 rounded-md text-sm w-24 disabled:opacity-50" disabled={(ing.gia_scaricato && !isEditing) || isLottoClosed} />
                                    <span className={`text-xl ${ing.gia_scaricato ? 'text-gray-500' : 'text-green-400'}`}>{ing.gia_scaricato ? '✅' : '🆕'}</span>
                                    
                                    {ing.gia_scaricato && !isLottoClosed && (
                                        <button 
                                            onClick={() => toggleEditIngredient(ing.id)} 
                                            className={`p-1 hover:text-brew-accent ${isEditing ? 'text-brew-accent' : 'text-gray-400'}`}
                                            title="Modifica ingrediente scaricato"
                                        >
                                            <PencilIcon className="w-5 h-5"/>
                                        </button>
                                    )}
                                    {!ing.gia_scaricato && !isLottoClosed && <div className="w-7"></div>}

                                    <button onClick={() => removeIngredientRow(ing.id)} className="p-1 text-red-500 hover:text-red-400 disabled:text-gray-500 disabled:cursor-not-allowed" disabled={(ing.gia_scaricato && !isEditing) || isLottoClosed}><TrashIcon className="w-5 h-5"/></button>
                                </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                 <h2 className="text-xl font-bold mb-4 text-brew-accent">Gestione Cantina</h2>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-4">
                        <div className="bg-brew-dark p-3 rounded-md grid grid-cols-2 gap-4">
                             <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">FERMENTATORE</label>
                                <select value={header.FERMENTATORE} onChange={e => handleHeaderChange('FERMENTATORE', e.target.value)} className="w-full bg-brew-dark-secondary p-2 rounded-md border border-slate-600 text-sm disabled:opacity-50" required disabled={isLottoClosed} >
                                    <option value="">Seleziona libero...</option>
                                    {availableFermenters.map(f => <option key={f.id} value={f.nome}>{f.nome}</option>)}
                                </select>
                             </div>
                             <div>
                                <label className="block text-xs font-medium text-gray-400 mb-1">TIPO FERMENTAZIONE</label>
                                <select value={header.TIPO_FERMENTAZIONE} onChange={e => handleHeaderChange('TIPO_FERMENTAZIONE', e.target.value)} className="w-full bg-brew-dark-secondary p-2 rounded-md border border-slate-600 text-sm disabled:opacity-50" disabled={isLottoClosed}>
                                    <option value="">Seleziona...</option>
                                    <option value="ALTA">Alta</option>
                                    <option value="BASSA">Bassa</option>
                                </select>
                             </div>
                             <Input label="GIORNI PREVISTI" type="number" value={header.GIORNI_FERMENTAZIONE_PREVISTI} onChange={v => handleHeaderChange('GIORNI_FERMENTAZIONE_PREVISTI', v.target.value)} disabled={isLottoClosed} />
                             <div className="col-span-2">
                                <p className="text-sm">Data confezionamento prevista: <span className="font-bold text-brew-accent">{dataConfezionamentoPrevista}</span></p>
                             </div>
                        </div>
                        <div className="bg-brew-dark p-3 rounded-md">
                             <h4 className="font-semibold mb-2">Parametri Gas e Aggiuntivi</h4>
                            <div className="space-y-4">
                                <div>
                                    <h5 className="text-sm font-semibold text-slate-300 mb-1">{t('brewPage.gasBrewCounters')}</h5>
                                    <div className="flex gap-2 items-end">
                                        <Input label={t('brewPage.counterPrevious')} value={header.gasBrewCounterPrevious} onChange={e => handleHeaderChange('gasBrewCounterPrevious', e.target.value)} disabled={isLottoClosed} />
                                        <Input label={t('brewPage.counterCurrent')} value={header.gasBrewCounterCurrent} onChange={e => handleHeaderChange('gasBrewCounterCurrent', e.target.value)} disabled={isLottoClosed} />
                                        <div className="pb-2 text-2xl font-bold">=</div>
                                        <div className="flex-1">
                                            <label className="block text-xs font-medium text-gray-400 mb-1">{t('brewPage.gasUsed')}</label>
                                            <div className="w-full bg-brew-dark p-2 rounded-md border border-slate-700 text-lg font-bold text-yellow-300 h-[42px] flex items-center justify-center">
                                                {gasCottaCalc.toFixed(2)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <h5 className="text-sm font-semibold text-slate-300 mb-1">{t('brewPage.gasPackagingCounters')}</h5>
                                    <div className="flex gap-2 items-end">
                                        <Input label={t('brewPage.counterPrevious')} value={header.gasPackagingCounterPrevious} onChange={e => handleHeaderChange('gasPackagingCounterPrevious', e.target.value)} disabled={isLottoClosed} />
                                        <Input label={t('brewPage.counterCurrent')} value={header.gasPackagingCounterCurrent} onChange={e => handleHeaderChange('gasPackagingCounterCurrent', e.target.value)} disabled={isLottoClosed} />
                                        <div className="pb-2 text-2xl font-bold">=</div>
                                        <div className="flex-1">
                                            <label className="block text-xs font-medium text-gray-400 mb-1">{t('brewPage.gasUsed')}</label>
                                            <div className="w-full bg-brew-dark p-2 rounded-md border border-slate-700 text-lg font-bold text-cyan-300 h-[42px] flex items-center justify-center">
                                                {gasConfValue.toFixed(2)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                             </div>
                             <div className="mt-4 pt-4 border-t border-slate-700 flex justify-end items-center gap-4">
                                <span className="text-lg font-bold">{t('brewPage.totalGasUsed')}</span>
                                <span className="text-3xl font-extrabold text-brew-accent bg-brew-dark px-4 py-2 rounded-lg">
                                    {(gasCottaCalc + gasConfValue).toFixed(2)} m³
                                </span>
                            </div>
                             <div className="flex items-center space-x-4 pt-4">
                                <Checkbox label="CO2" checked={header.FLAG_CO2} onChange={v => handleHeaderChange('FLAG_CO2', v.target.checked)} disabled={isLottoClosed} />
                                <Checkbox label="AZOTO" checked={header.FLAG_AZOTO} onChange={v => handleHeaderChange('FLAG_AZOTO', v.target.checked)} disabled={isLottoClosed} />
                             </div>
                        </div>
                    </div>
                    <div className="flex flex-col gap-4">
                        <div className="bg-brew-dark p-3 rounded-md">
                            <h4 className="font-semibold mb-2">Nuova Misurazione</h4>
                            <div className="flex gap-2 items-end">
                                <div className="flex-grow min-w-[150px]">
                                    <label className="block text-xs font-medium text-gray-400 mb-1">Data Misurazione</label>
                                    <input 
                                        type="date" 
                                        value={fermInput.data} 
                                        onChange={e => handleFermInputChange('data', e.target.value)} 
                                        className="w-full bg-brew-dark p-2 rounded-md border border-slate-600 h-[42px] text-sm disabled:opacity-50"
                                        disabled={isLottoClosed || !header.DATA_PROD}
                                    />
                                </div>
                                <div className="w-20">
                                    <label className="block text-xs font-medium text-gray-400 mb-1">Giorno</label>
                                    <div className="w-full bg-brew-dark p-2 rounded-md border border-slate-700 h-[42px] flex items-center justify-center font-bold">
                                        {calculatedFermentationDay !== null ? calculatedFermentationDay : 'N/A'}
                                    </div>
                                </div>
                                <div className="w-24"><Input label="Temp" value={fermInput.temp} onChange={e => handleFermInputChange('temp', e.target.value)} disabled={isLottoClosed}/></div>
                                <div className="w-24"><Input label="Plato" value={fermInput.plato} onChange={e => handleFermInputChange('plato', e.target.value)} disabled={isLottoClosed}/></div>
                                <button onClick={addFermentationPoint} className="self-end bg-brew-green text-white font-bold py-2 px-3 rounded-md hover:bg-opacity-80 disabled:bg-slate-600 h-[42px]">ADD</button>
                            </div>
                        </div>
                        <div className="bg-brew-dark p-3 rounded-md flex-grow">
                             <h4 className="font-semibold mb-2">Dati & Grafico Fermentazione</h4>
                             <div className="flex gap-4 h-48">
                                <div className="w-1/3 max-h-full overflow-y-auto">
                                    <table className="w-full text-xs">
                                        <thead><tr className="text-left"><th className="p-1">G</th><th className="p-1">T°C</th><th className="p-1">P°</th></tr></thead>
                                        <tbody>{fermentationData.map(d=>(<tr key={d.GIORNO}><td className="p-1">{d.GIORNO}</td><td className="p-1">{d.TEMPERATURA}</td><td className="p-1">{d.PLATO}</td></tr>))}</tbody>
                                    </table>
                                </div>
                                <div className="w-2/3 h-full bg-slate-800 p-1 rounded-md">
                                   <FermentationChart data={fermentationData} />
                                </div>
                             </div>
                        </div>
                    </div>
                 </div>
            </div>

            <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                <h2 className="text-xl font-bold mb-4 text-brew-accent">Confezionamento</h2>
                <div className="grid grid-cols-1 md:grid-cols-[1fr,auto] gap-6">
                    <div>
                        <div className="bg-brew-dark p-3 rounded-md mb-4">
                            <div className="flex flex-wrap items-end gap-2">
                                <div className="flex-grow min-w-[120px]">
                                    <label className="text-xs font-medium text-gray-400 mb-1 block">Data</label>
                                    <input type="date" value={pkgInput.data} onChange={e=>setPkgInput(s=>({...s, data:e.target.value}))} className="bg-brew-dark-secondary p-2 rounded-md disabled:opacity-50 w-full" disabled={isLottoClosed}/>
                                </div>
                                <div className="flex-grow min-w-[150px]">
                                    <label className="text-xs font-medium text-gray-400 mb-1 block">Formato</label>
                                    <select value={pkgInput.formato} onChange={e=>{setPkgInput(s=>({...s, formato:e.target.value})); setUseCartons(true);}} className="bg-brew-dark-secondary p-2 rounded-md disabled:opacity-50 w-full" disabled={isLottoClosed}>
                                        <option value="">Seleziona...</option>
                                        {Object.keys(CONFIG_PACKAGING).map(f=><option key={f} value={f}>{f}</option>)}
                                    </select>
                                </div>
                                <div className="flex-grow min-w-[120px]">
                                    <label className="text-xs font-medium text-gray-400 mb-1 block">{t('brewPage.expirationDate')}</label>
                                    <input type="date" value={pkgInput.dataScadenza} onChange={e=>setPkgInput(s=>({...s, dataScadenza:e.target.value}))} className="bg-brew-dark-secondary p-2 rounded-md disabled:opacity-50 w-full" disabled={isLottoClosed} required/>
                                </div>
                                <div className="w-24">
                                    <label className="text-xs font-medium text-gray-400 mb-1 block">Q.tà Pezzi</label>
                                    <input type="number" placeholder="Q.tà" value={pkgInput.qta} onChange={e=>setPkgInput(s=>({...s, qta:e.target.value}))} className="bg-brew-dark-secondary p-2 rounded-md w-full disabled:opacity-50" disabled={isLottoClosed}/>
                                </div>
                            </div>
                            
                            <div className="mt-4 pt-4 border-t border-slate-700 space-y-4">
                                <h4 className="text-md font-semibold text-slate-300">Selezione Materiali di Confezionamento</h4>
                                {requiredPackagingMaterials.map(mat => {
                                    if (mat.tipologia === 'TAPPI') {
                                        const capTypes = Object.keys(ingredientLotsStock).filter(name => name.toUpperCase().startsWith('TAPPO')).sort();
                                        const availableCapLots = selectedCapName ? ingredientLotsStock[selectedCapName.toUpperCase()] || [] : [];
                                        return (
                                            <div key={mat.key} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                <Field label="Tipo Tappo">
                                                    <select value={selectedCapName} onChange={e => { setSelectedCapName(e.target.value); setPkgMaterialSelections(p => ({...p, [e.target.value]: ''}));}} className="w-full bg-brew-dark-secondary p-2 rounded-md border border-slate-600 text-sm" disabled={isLottoClosed}>
                                                        <option value="">Seleziona tipo...</option>
                                                        {capTypes.map(name => <option key={name} value={name}>{name}</option>)}
                                                    </select>
                                                </Field>
                                                <Field label="Lotto Tappo">
                                                    <select value={pkgMaterialSelections[selectedCapName] || ''} onChange={e => setPkgMaterialSelections(p => ({...p, [selectedCapName]: e.target.value}))} className="w-full bg-brew-dark-secondary p-2 rounded-md border border-slate-600 text-sm" disabled={isLottoClosed || !selectedCapName}>
                                                        <option value="">Seleziona lotto...</option>
                                                        {availableCapLots.map(l => <option key={l.lotto} value={l.lotto}>{`${l.lotto} (Giac: ${l.giacenza.toFixed(2)})`}</option>)}
                                                    </select>
                                                </Field>
                                            </div>
                                        );
                                    } else { // Container or Carton
                                        const availableLots = ingredientLotsStock[mat.name.toUpperCase()] || [];
                                        return (
                                            <div key={mat.key} className="grid grid-cols-[1fr,2fr] gap-2 items-center">
                                                <label className="text-sm font-semibold">{mat.name}</label>
                                                <select value={pkgMaterialSelections[mat.name] || ''} onChange={e => setPkgMaterialSelections(p => ({...p, [mat.name]: e.target.value}))} className="w-full bg-brew-dark-secondary p-2 rounded-md border border-slate-600 text-sm" disabled={isLottoClosed}>
                                                    <option value="">Seleziona lotto...</option>
                                                    {availableLots.map(l => <option key={l.lotto} value={l.lotto}>{`${l.lotto} (Giac: ${l.giacenza.toFixed(2)})`}</option>)}
                                                </select>
                                            </div>
                                        );
                                    }
                                })}
                                {pkgInput.formato.includes("BOTT") && <Checkbox label="Includi Scatole" checked={useCartons} onChange={v => setUseCartons(v.target.checked)} disabled={isLottoClosed} />}
                            </div>
                            
                            <div className="mt-4 pt-4 border-t border-slate-700 flex justify-between">
                                <button onClick={handleUndoLastPackaging} className="flex items-center bg-brew-red text-white text-xs font-bold py-2 px-3 rounded-md hover:bg-opacity-80 disabled:bg-slate-600 self-end" disabled={isLottoClosed || packagingData.length === 0}><ArrowUturnLeftIcon className="w-4 h-4 mr-1"/>ANNULLA ULTIMO</button>
                                <button onClick={addPackagingItem} className="bg-brew-green text-white font-bold py-2 px-4 rounded-md hover:bg-opacity-80 disabled:bg-slate-600 self-end" disabled={isLottoClosed}>OK</button>
                            </div>
                        </div>
                        
                        <h4 className="font-semibold mb-2">Riepilogo Confezionato</h4>
                        <div className="max-h-48 overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-700"><tr><th className="p-2 text-left">DATA</th><th className="p-2 text-left">FORMATO</th><th className="p-2 text-left">PEZZI</th><th className="p-2 text-left">LITRI</th></tr></thead>
                                <tbody>
                                    {packagingData.map(p=>(
                                        <tr key={p.ID_OPERAZIONE} className={`border-b border-slate-700 ${p.isNew ? 'bg-green-500/10' : ''}`}>
                                            <td className="p-2">{p.DATA}</td><td className="p-2">{p.FORMATO}</td><td className="p-2">{p.QTA_UNITA}</td><td className="p-2">{p.LITRI_TOT.toFixed(1)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="bg-brew-dark p-4 rounded-md text-center flex flex-col justify-center">
                        <div className="mb-2">
                            <p className="text-sm text-slate-400">TOTALE CONFEZIONATO</p>
                            <p className="text-2xl font-bold text-brew-accent">{totalLitriConfezionati.toFixed(1)} L</p>
                        </div>
                         <div>
                            <p className="text-sm text-slate-400">PERDITA / RIMANENZA</p>
                            <p className="text-2xl font-bold">{perdita.toFixed(1)} L</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
                <h2 className="text-xl font-bold mb-4">Note</h2>
                <textarea
                    value={header.NOTE || ''}
                    onChange={e => handleHeaderChange('NOTE', e.target.value)}
                    rows={4}
                    className="w-full bg-brew-dark p-2 rounded-md border border-slate-600 focus:ring-brew-accent focus:border-brew-accent text-sm disabled:opacity-50"
                    placeholder="Aggiungi appunti o informazioni importanti su questa cotta..."
                    disabled={isLottoClosed}
                />
            </div>

             <div className="text-center pt-4 flex justify-center items-center gap-4">
                {!isLottoClosed ? (
                    <>
                        <button onClick={handleSaveCotta} className="bg-brew-blue text-white font-bold py-3 px-8 rounded-lg text-lg hover:bg-opacity-90 transition-all shadow-lg">SALVA COTTA E SCARICA INGREDIENTI</button>
                        <button 
                            onClick={() => setIsCloseLottoModalOpen(true)}
                            className="bg-brew-red text-white font-bold py-3 px-8 rounded-lg text-lg hover:bg-opacity-90 transition-all shadow-lg disabled:bg-slate-600 disabled:cursor-not-allowed"
                            disabled={!header.LOTTO || !header.FERMENTATORE}
                            title={!header.FERMENTATORE ? 'Assegna un fermentatore per poter chiudere il lotto' : 'Chiudi lotto e libera il fermentatore'}
                        >
                            CHIUDI LOTTO
                        </button>
                    </>
                ) : (
                     <button onClick={handleExport} className="bg-brew-green text-white font-bold py-3 px-8 rounded-lg text-lg hover:bg-opacity-90 transition-all shadow-lg">{t('brewPage.exportButton')}</button>
                )}
            </div>

            {isCloseLottoModalOpen && (
                <Modal
                    title="Conferma Chiusura Lotto"
                    isOpen={isCloseLottoModalOpen}
                    onClose={() => setIsCloseLottoModalOpen(false)}
                    size="sm"
                >
                    <div className="space-y-4">
                        <p className="text-sm text-gray-300">
                            Sei sicuro di voler chiudere definitivamente il lotto <strong>{header.LOTTO}</strong>?
                            <br /><br />
                            Tutte le lavorazioni verranno considerate concluse, il fermentatore verrà liberato e <strong>non sarà più possibile modificare questa cotta</strong>. L'azione è irreversibile.
                        </p>
                        <div className="flex justify-end gap-4 pt-4">
                            <button
                                onClick={() => setIsCloseLottoModalOpen(false)}
                                className="px-4 py-2 rounded-md bg-slate-600 text-white font-semibold hover:bg-slate-500"
                            >
                                Annulla
                            </button>
                            <button
                                onClick={handleConfirmCloseLotto}
                                className="px-4 py-2 rounded-md bg-brew-red text-white font-bold hover:bg-opacity-80"
                            >
                                Sì, Chiudi Lotto
                            </button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
};

const Input: React.FC<{ label: string } & React.InputHTMLAttributes<HTMLInputElement>> = ({ label, ...props }) => (
    <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">{label}</label>
        <input {...props} className="w-full bg-brew-dark p-2 rounded-md border border-slate-600 focus:ring-brew-accent focus:border-brew-accent text-sm disabled:opacity-50 h-[42px]" />
    </div>
);

const Field: React.FC<{label: string, children: React.ReactNode}> = ({ label, children }) => (
    <div>
        <label className="block text-xs font-medium text-gray-400 mb-1">{label}</label>
        {children}
    </div>
);

const Checkbox: React.FC<{ label: string } & React.InputHTMLAttributes<HTMLInputElement>> = ({ label, ...props }) => (
    <label className="flex items-center space-x-2 cursor-pointer text-sm">
        <input type="checkbox" {...props} className="h-4 w-4 rounded bg-brew-dark border-slate-600 text-brew-blue focus:ring-brew-accent disabled:opacity-50"/>
        <span>{label}</span>
    </label>
);

export default BrewPage;