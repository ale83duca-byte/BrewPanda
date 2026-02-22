import type { BreweryData, BrewerySheet, Movement, DatabaseItem, RawWarehouseItem, WarehouseStatus, PriceDBItem, InitialBeerStock, PackagingData, BrewHeader } from '../types';
import { getDb } from './db';

const getDefaultData = (): BreweryData => ({
    MOVIMENTAZIONE: [], DATABASE: [], MAGAZZINO: [], COTTE_HEAD: [], FERMENTAZIONE: [],
    CONFEZIONAMENTO: [], CANTINA_CONFIG: [], CLIENTI: [], BIRRE: [], PRICE_DATABASE: [],
    COST_COEFFICIENTS: {}, QUOTES: [],
    BEER_WAREHOUSE_INITIAL: [],
    BEER_MOVEMENTS: [],
    SALES_ORDERS: [],
    BEER_INVENTORY_CHECKS: [],
});

export const getBreweryData = async (year: string): Promise<BreweryData | undefined> => {
    const db = await getDb();
    const data = await db.get('brewery_data', year);
    if (!data) return undefined;

    const defaultData = getDefaultData();
    for (const key in defaultData) {
        if (!data[key as BrewerySheet]) {
            data[key as BrewerySheet] = defaultData[key as BrewerySheet] as any;
        }
    }
    return data;
};

export const saveBreweryData = async (year: string, data: BreweryData) => {
    try {
        const db = await getDb();
        await db.put('brewery_data', data, year);
        window.dispatchEvent(new CustomEvent('data-saved'));
    } catch (error) {
        console.error("Failed to save brewery data.", error);
    }
};

export const getYears = async (): Promise<string[]> => {
    const db = await getDb();
    let years = await db.getAllKeys('brewery_data');
    years.sort();
    
    if (years.length === 0) {
        const currentYear = new Date().getFullYear().toString();
        await initializeYear(currentYear);
        return [currentYear];
    }
    return years;
};

const initializeYear = async (year: string, initialMovements: Movement[] = []) => {
    const newData = getDefaultData();
    newData.MOVIMENTAZIONE = initialMovements;
    const { magazzino, database } = syncWithMovements(newData.MOVIMENTAZIONE);
    newData.MAGAZZINO = magazzino;
    newData.DATABASE = database;
    await saveBreweryData(year, newData);
};

export const initializeCurrentYearData = async () => {
    await getYears(); // This will create the current year if none exist
};

export const createNewYear = async (newYear: string, importFromYear?: string): Promise<boolean> => {
    const db = await getDb();
    if (await db.get('brewery_data', newYear)) {
        return false;
    }

    const newData = getDefaultData();

    if (importFromYear) {
        const prevYearData = await getBreweryData(importFromYear);
        if (prevYearData) {
            const prevYearWarehouse = syncWithMovements(prevYearData.MOVIMENTAZIONE).magazzino;
            const initialMovements = prevYearWarehouse
                .filter(item => item.GIACENZA >= 0.01)
                .map(item => ({
                    DATA: `01/01/${newYear}`, TIPOLOGIA: item.TIPOLOGIA, NOME: item.NOME, MARCA: item.MARCA,
                    FORNITORE: item.FORNITORE, KG_LITRI_PZ: item.GIACENZA, N_FATTURA: 'RIPORTO_ANNO_PREC',
                    LOTTO_FORNITORE: '', LOTTO_PRODUZIONE: '', DATA_SCADENZA: undefined,
                }));
            
            newData.MOVIMENTAZIONE = initialMovements;
            newData.CLIENTI = prevYearData.CLIENTI || [];
            newData.BIRRE = prevYearData.BIRRE || [];
            newData.CANTINA_CONFIG = prevYearData.CANTINA_CONFIG || [];
            newData.PRICE_DATABASE = prevYearData.PRICE_DATABASE || [];
            newData.COST_COEFFICIENTS = prevYearData.COST_COEFFICIENTS || {};
            newData.QUOTES = []; // Quotes are not carried over

            // Carry over finished beer stock
            const prevBeerStock = new Map<string, { item: InitialBeerStock, qta: number }>();
            (prevYearData.BEER_WAREHOUSE_INITIAL || []).forEach(item => {
                const key = `${item.cliente}|${item.nomeBirra}|${item.lotto}|${item.formato}`;
                prevBeerStock.set(key, { item, qta: item.quantita });
            });
            (prevYearData.BEER_MOVEMENTS || []).forEach(mov => {
                const key = `${mov.cliente}|${mov.nomeBirra}|${mov.lotto}|${mov.formato}`;
                if (prevBeerStock.has(key)) {
                    prevBeerStock.get(key)!.qta += mov.quantita;
                }
            });

            const newInitialBeerStock: InitialBeerStock[] = [];
            prevBeerStock.forEach(({ item, qta }) => {
                if (qta > 0) {
                    newInitialBeerStock.push({ ...item, quantita: qta });
                }
            });
            newData.BEER_WAREHOUSE_INITIAL = newInitialBeerStock;
        }
    }
    
    const { magazzino, database } = syncWithMovements(newData.MOVIMENTAZIONE);
    newData.MAGAZZINO = magazzino;
    newData.DATABASE = database;
    
    await saveBreweryData(newYear, newData);
    return true;
};

const syncWithMovements = (movements: Movement[]) => {
    const upperCaseMovements = movements.map(m => ({ ...m, TIPOLOGIA: m.TIPOLOGIA.toUpperCase().trim(), NOME: m.NOME.toUpperCase().trim(), MARCA: m.MARCA ? m.MARCA.toUpperCase().trim() : '', FORNITORE: m.FORNITORE ? m.FORNITORE.toUpperCase().trim() : '' }));
    const dbItems = new Map<string, DatabaseItem>();
    upperCaseMovements.forEach(m => {
        if (m.KG_LITRI_PZ > 0) {
            const key = `${m.NOME}|${m.MARCA}`;
            if (!dbItems.has(key) && m.NOME) {
                dbItems.set(key, { TIPOLOGIA: m.TIPOLOGIA, NOME: m.NOME, MARCA: m.MARCA, FORNITORE: m.FORNITORE });
            }
        }
    });
    const database = Array.from(dbItems.values());
    const warehouseMap = new Map<string, number>();
    upperCaseMovements.forEach(m => {
        const key = `${m.TIPOLOGIA}|${m.NOME}|${m.MARCA}|${m.FORNITORE}`;
        warehouseMap.set(key, (warehouseMap.get(key) || 0) + m.KG_LITRI_PZ);
    });
    const magazzino: RawWarehouseItem[] = Array.from(warehouseMap.entries()).map(([key, giacenza]) => {
        const [TIPOLOGIA, NOME, MARCA, FORNITORE] = key.split('|');
        return { TIPOLOGIA, NOME, MARCA, FORNITORE, GIACENZA: parseFloat(giacenza.toFixed(2)) };
    })
    .filter(item => item.GIACENZA > 0.01);
    return { magazzino, database };
};

export const addMovementsAndSync = async (year: string, newMovements: Movement[]) => {
    const data = await getBreweryData(year) || getDefaultData();
    data.MOVIMENTAZIONE.push(...newMovements);

    // Update Price Database
    newMovements.forEach(movement => {
        if (movement.KG_LITRI_PZ > 0 && movement.PREZZO && movement.PREZZO > 0) {
            const newItem: PriceDBItem = {
                NOME: movement.NOME.toUpperCase().trim(),
                MARCA: (movement.MARCA || '').toUpperCase().trim(),
                FORNITORE: (movement.FORNITORE || '').toUpperCase().trim(),
                PREZZO: movement.PREZZO,
                DATA_ULTIMO_CARICO: movement.DATA,
            };
            const index = data.PRICE_DATABASE.findIndex(
                item => item.NOME === newItem.NOME && item.MARCA === newItem.MARCA && item.FORNITORE === newItem.FORNITORE
            );
            if (index > -1) {
                data.PRICE_DATABASE[index] = newItem;
            } else {
                data.PRICE_DATABASE.push(newItem);
            }
        }
    });

    const { magazzino, database } = syncWithMovements(data.MOVIMENTAZIONE);
    data.MAGAZZINO = magazzino;
    data.DATABASE = database;
    await saveBreweryData(year, data);
};

export const updateMovementAndSync = async (year: string, originalIndex: number, updatedMovement: Movement) => {
    const data = await getBreweryData(year);
    if (!data || originalIndex < 0 || originalIndex >= data.MOVIMENTAZIONE.length) {
        throw new Error("Movimento non trovato o non valido.");
    }

    data.MOVIMENTAZIONE[originalIndex] = updatedMovement;
    
    if (updatedMovement.KG_LITRI_PZ > 0 && updatedMovement.PREZZO && updatedMovement.PREZZO > 0) {
        const newItem: PriceDBItem = {
            NOME: updatedMovement.NOME.toUpperCase().trim(),
            MARCA: (updatedMovement.MARCA || '').toUpperCase().trim(),
            FORNITORE: (updatedMovement.FORNITORE || '').toUpperCase().trim(),
            PREZZO: updatedMovement.PREZZO,
            DATA_ULTIMO_CARICO: updatedMovement.DATA,
        };
        const index = data.PRICE_DATABASE.findIndex(
            item => item.NOME === newItem.NOME && item.MARCA === newItem.MARCA && item.FORNITORE === newItem.FORNITORE
        );
        if (index > -1) {
            data.PRICE_DATABASE[index] = newItem;
        } else {
            data.PRICE_DATABASE.push(newItem);
        }
    }

    const { magazzino, database } = syncWithMovements(data.MOVIMENTAZIONE);
    data.MAGAZZINO = magazzino;
    data.DATABASE = database;
    await saveBreweryData(year, data);
};

export const deleteMovementByIndexAndSync = async (year: string, index: number) => {
    const data = await getBreweryData(year);
    if (data && index >= 0 && index < data.MOVIMENTAZIONE.length) {
        data.MOVIMENTAZIONE.splice(index, 1);
        const { magazzino, database } = syncWithMovements(data.MOVIMENTAZIONE);
        data.MAGAZZINO = magazzino;
        data.DATABASE = database;
        await saveBreweryData(year, data);
    }
};

export const deleteMovementsByInvoiceAndSync = async (year: string, invoiceId: string) => {
    const data = await getBreweryData(year);
    if (!data) return;
    data.MOVIMENTAZIONE = data.MOVIMENTAZIONE.filter(m => m.N_FATTURA !== invoiceId);
    const { magazzino, database } = syncWithMovements(data.MOVIMENTAZIONE);
    data.MAGAZZINO = magazzino;
    data.DATABASE = database;
    await saveBreweryData(year, data);
};

export const saveDataToSheet = async <T extends BrewerySheet>(year: string, sheet: T, newData: BreweryData[T]) => {
    const data = await getBreweryData(year) || getDefaultData();
    data[sheet] = newData;
    await saveBreweryData(year, data);
};

export const upsertItemInSheet = async <T extends Exclude<keyof BreweryData, 'COST_COEFFICIENTS'>>(year: string, sheet: T, item: BreweryData[T][number], uniqueKey: keyof BreweryData[T][number]) => {
    const data = await getBreweryData(year) || getDefaultData();
    const sheetData = data[sheet] as any[];
    const index = sheetData.findIndex(i => i[uniqueKey] === item[uniqueKey]);
    if (index > -1) sheetData[index] = item;
    else sheetData.push(item);
    data[sheet] = sheetData as BreweryData[T];
    await saveBreweryData(year, data);
};

export const deleteItemFromSheetById = async <T extends Exclude<keyof BreweryData, 'COST_COEFFICIENTS'>>(
    year: string,
    sheet: T,
    itemId: string,
    idKey: keyof BreweryData[T][number] = 'id' as any
) => {
    const data = await getBreweryData(year);
    if (!data) return;
    const sheetData = data[sheet] as any[];
    const updatedSheetData = sheetData.filter(item => item[idKey] !== itemId);
    data[sheet] = updatedSheetData as BreweryData[T];
    await saveBreweryData(year, data);
};

export const getSheetData = async <T extends BrewerySheet>(year: string, sheet: T): Promise<BreweryData[T]> => {
    const data = await getBreweryData(year);
    return data?.[sheet] || getDefaultData()[sheet];
};

export const getAllBreweryData = async (): Promise<Record<string, BreweryData>> => {
    const allData: Record<string, BreweryData> = {};
    const db = await getDb();
    const years = await db.getAllKeys('brewery_data');
    for (const year of years) {
        const data = await getBreweryData(year);
        if (data) allData[year] = data;
    }
    return allData;
};

export const importAllBreweryData = async (dataToImport: Record<string, BreweryData>): Promise<void> => {
    const db = await getDb();
    await db.clear('brewery_data');
    for (const year in dataToImport) {
        if (Object.prototype.hasOwnProperty.call(dataToImport, year)) {
            const yearData = dataToImport[year];
            if(typeof yearData === 'object' && yearData !== null) {
                await saveBreweryData(year, yearData);
            }
        }
    }
};

const parseItalianDate = (dateStr: string): Date | null => {
    if (!dateStr) return null;
    const parts = dateStr.split('/');
    if (parts.length === 3) {
        const [day, month, year] = parts.map(Number);
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) return new Date(year, month - 1, day);
    }
    return null;
};

export const checkAndProcessWarehouseStatus = async (year: string): Promise<WarehouseStatus> => {
    let data = await getBreweryData(year);
    if (!data) return { dischargedItems: [], expiringSoonItems: [], outOfStockItems: [], expiringBeerItems: [] };
    
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const lotStock = new Map<string, number>();
    data.MOVIMENTAZIONE.forEach(m => {
        if (m.NOME && m.LOTTO_FORNITORE) {
            const key = `${m.NOME.toUpperCase()}|${m.LOTTO_FORNITORE.toUpperCase()}`;
            lotStock.set(key, (lotStock.get(key) || 0) + m.KG_LITRI_PZ);
        }
    });

    const uniqueLotsWithScadenza = new Map<string, Movement>();
    data.MOVIMENTAZIONE.filter(m => m.DATA_SCADENZA && m.KG_LITRI_PZ > 0).forEach(m => {
        uniqueLotsWithScadenza.set(`${m.NOME.toUpperCase()}|${m.LOTTO_FORNITORE.toUpperCase()}`, m);
    });

    const newDischargeMovements: Movement[] = [];
    const dischargedItems: WarehouseStatus['dischargedItems'] = [];
    const expiringSoonItems: WarehouseStatus['expiringSoonItems'] = [];

    uniqueLotsWithScadenza.forEach((movement, key) => {
        const stock = lotStock.get(key) || 0;
        if (stock <= 0.01) return;
        const scadenzaDate = parseItalianDate(movement.DATA_SCADENZA!);
        if (!scadenzaDate) return;
        scadenzaDate.setHours(0,0,0,0);
        const diffDays = Math.ceil((scadenzaDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays < 0) {
            const dischargeMovement: Movement = {
                DATA: today.toLocaleDateString('it-IT'), TIPOLOGIA: movement.TIPOLOGIA, NOME: movement.NOME,
                MARCA: movement.MARCA, FORNITORE: movement.FORNITORE, KG_LITRI_PZ: -stock,
                N_FATTURA: `SCADENZA_AUTO_${Date.now()}`, LOTTO_FORNITORE: movement.LOTTO_FORNITORE,
                LOTTO_PRODUZIONE: 'OLTRE LA DATA DI SCADENZA',
            };
            newDischargeMovements.push(dischargeMovement);
            dischargedItems.push({ nome: movement.NOME, lotto: movement.LOTTO_FORNITORE, qta: stock });
        } else if (diffDays <= 30) {
            expiringSoonItems.push({ nome: movement.NOME, lotto: movement.LOTTO_FORNITORE, scadenza: movement.DATA_SCADENZA!, giacenza: stock });
        }
    });

    if (newDischargeMovements.length > 0) {
        await addMovementsAndSync(year, newDischargeMovements);
    }
    
    const finalData = await getBreweryData(year) || data;
    
    // Custom calculation to find out-of-stock items, since syncWithMovements now filters them out.
    const warehouseMap = new Map<string, number>();
    finalData.MOVIMENTAZIONE.forEach(m => {
        const key = `${m.TIPOLOGIA.toUpperCase().trim()}|${m.NOME.toUpperCase().trim()}|${(m.MARCA || '').toUpperCase().trim()}|${(m.FORNITORE || '').toUpperCase().trim()}`;
        warehouseMap.set(key, (warehouseMap.get(key) || 0) + m.KG_LITRI_PZ);
    });

    const outOfStockItems: WarehouseStatus['outOfStockItems'] = [];
    warehouseMap.forEach((giacenza, key) => {
        if (giacenza <= 0.01) {
            const [tipologia, nome, marca, fornitore] = key.split('|');
            outOfStockItems.push({ nome, marca, fornitore, tipologia });
        }
    });


    // Calculate expiring beer items
    const beerStock = new Map<string, { qta: number; dataScadenza: string }>();
    (finalData.BEER_WAREHOUSE_INITIAL || []).forEach(item => {
        const key = `${item.cliente}|${item.nomeBirra}|${item.lotto}|${item.formato}`;
        const current = beerStock.get(key) || { qta: 0, dataScadenza: item.dataScadenza };
        current.qta += item.quantita;
        beerStock.set(key, current);
    });
    (finalData.BEER_MOVEMENTS || []).forEach(mov => {
        const key = `${mov.cliente}|${mov.nomeBirra}|${mov.lotto}|${mov.formato}`;
        const current = beerStock.get(key);
        if (current) {
            current.qta += mov.quantita; // mov.quantita is negative for sales/adjustments
            beerStock.set(key, current);
        }
    });

    const expiringBeerItems: WarehouseStatus['expiringBeerItems'] = [];
    beerStock.forEach((stockInfo, key) => {
        if (stockInfo.qta <= 0) return;
        
        const scadenzaDate = parseItalianDate(stockInfo.dataScadenza);
        if (!scadenzaDate) return;
        scadenzaDate.setHours(0,0,0,0);
        const diffDays = Math.ceil((scadenzaDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        if (diffDays >= 0 && diffDays <= 90) {
             const [cliente, birra, lotto, formato] = key.split('|');
             expiringBeerItems.push({
                 cliente, birra, lotto, formato,
                 scadenza: stockInfo.dataScadenza,
                 qta: stockInfo.qta,
             });
        }
    });

    return { dischargedItems, expiringSoonItems, outOfStockItems, expiringBeerItems };
};

export const checkLottoExists = async (year: string, lottoId: string): Promise<boolean> => {
    const data = await getBreweryData(year);
    if (!data || !data.COTTE_HEAD) return false;
    return data.COTTE_HEAD.some(cotta => cotta.LOTTO.toUpperCase() === lottoId.toUpperCase());
};

export const updatePriceInDb = async (year: string, itemIdentifier: { NOME: string, MARCA: string, FORNITORE: string }, newPrice: number) => {
    const data = await getBreweryData(year);
    if (!data) return;

    const priceDb = data.PRICE_DATABASE || [];
    const index = priceDb.findIndex(p => 
        p.NOME === itemIdentifier.NOME &&
        p.MARCA === itemIdentifier.MARCA &&
        p.FORNITORE === itemIdentifier.FORNITORE
    );

    const today = new Date().toLocaleDateString('it-IT');

    if (index > -1) {
        priceDb[index].PREZZO = newPrice;
        priceDb[index].DATA_ULTIMO_CARICO = today;
    } else {
        priceDb.push({
            ...itemIdentifier,
            PREZZO: newPrice,
            DATA_ULTIMO_CARICO: today,
        });
    }

    await saveDataToSheet(year, 'PRICE_DATABASE', priceDb);
};

export const editWarehouseItem = async (year: string, oldItem: RawWarehouseItem, newItem: Omit<RawWarehouseItem, 'GIACENZA'>) => {
    const data = await getBreweryData(year);
    if (!data) return;

    data.MOVIMENTAZIONE = data.MOVIMENTAZIONE.map(mov => {
        if (
            mov.TIPOLOGIA.toUpperCase().trim() === oldItem.TIPOLOGIA.toUpperCase().trim() &&
            mov.NOME.toUpperCase().trim() === oldItem.NOME.toUpperCase().trim() &&
            (mov.MARCA || '').toUpperCase().trim() === (oldItem.MARCA || '').toUpperCase().trim() &&
            (mov.FORNITORE || '').toUpperCase().trim() === (oldItem.FORNITORE || '').toUpperCase().trim()
        ) {
            return { ...mov, ...newItem };
        }
        return mov;
    });

    data.PRICE_DATABASE = data.PRICE_DATABASE.map(price => {
        if (
            price.NOME.toUpperCase().trim() === oldItem.NOME.toUpperCase().trim() &&
            (price.MARCA || '').toUpperCase().trim() === (oldItem.MARCA || '').toUpperCase().trim() &&
            (price.FORNITORE || '').toUpperCase().trim() === (oldItem.FORNITORE || '').toUpperCase().trim()
        ) {
            return { ...price, NOME: newItem.NOME, MARCA: newItem.MARCA, FORNITORE: newItem.FORNITORE };
        }
        return price;
    });
    
    const { magazzino, database } = syncWithMovements(data.MOVIMENTAZIONE);
    data.MAGAZZINO = magazzino;
    data.DATABASE = database;
    await saveBreweryData(year, data);
};

export const deleteWarehouseItem = async (year: string, itemToDelete: RawWarehouseItem) => {
    const data = await getBreweryData(year);
    if (!data) return;

    if (itemToDelete.GIACENZA >= 0.01) {
        throw new Error("Cannot delete an item with a stock greater than zero.");
    }

    data.MOVIMENTAZIONE = data.MOVIMENTAZIONE.filter(mov => 
        !(
            mov.TIPOLOGIA.toUpperCase().trim() === itemToDelete.TIPOLOGIA.toUpperCase().trim() &&
            mov.NOME.toUpperCase().trim() === itemToDelete.NOME.toUpperCase().trim() &&
            (mov.MARCA || '').toUpperCase().trim() === (itemToDelete.MARCA || '').toUpperCase().trim() &&
            (mov.FORNITORE || '').toUpperCase().trim() === (itemToDelete.FORNITORE || '').toUpperCase().trim()
        )
    );

    data.PRICE_DATABASE = data.PRICE_DATABASE.filter(price =>
        !(
            price.NOME.toUpperCase().trim() === itemToDelete.NOME.toUpperCase().trim() &&
            (price.MARCA || '').toUpperCase().trim() === (itemToDelete.MARCA || '').toUpperCase().trim() &&
            (price.FORNITORE || '').toUpperCase().trim() === (itemToDelete.FORNITORE || '').toUpperCase().trim()
        )
    );

    const { magazzino, database } = syncWithMovements(data.MOVIMENTAZIONE);
    data.MAGAZZINO = magazzino;
    data.DATABASE = database;
    await saveBreweryData(year, data);
};

export const saveCottaAndPackaging = async (year: string, {
    header,
    ingredientMovements,
    packagingMovements,
    newPackagingData
}: {
    header: BrewHeader;
    ingredientMovements: Movement[];
    packagingMovements: Movement[];
    newPackagingData: PackagingData[];
}) => {
    const data = await getBreweryData(year) || getDefaultData();

    // 1. Update Header
    const headerIndex = data.COTTE_HEAD.findIndex(h => h.LOTTO === header.LOTTO);
    if (headerIndex > -1) {
        data.COTTE_HEAD[headerIndex] = header;
    } else {
        data.COTTE_HEAD.push(header);
    }

    // 2. Add all new movements
    data.MOVIMENTAZIONE.push(...ingredientMovements, ...packagingMovements);

    // 3. Add new packaging data
    data.CONFEZIONAMENTO.push(...newPackagingData);

    // 4. Sync warehouse and database
    const { magazzino, database } = syncWithMovements(data.MOVIMENTAZIONE);
    data.MAGAZZINO = magazzino;
    data.DATABASE = database;

    // 5. Save all changes
    await saveBreweryData(year, data);
};