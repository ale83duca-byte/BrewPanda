import * as XLSX from 'xlsx';
import type { BreweryData, BrewHeader, Movement, PackagingData, FermentationDataPoint } from '../types';

const headerStyle = { font: { bold: true, color: { rgb: "ECF0F1" } }, fill: { fgColor: { rgb: "34495e" } }, alignment: { horizontal: 'center' } };
const titleStyle = { font: { bold: true, sz: 18 }, alignment: { horizontal: 'center' } };
const sectionTitleStyle = { font: { bold: true, sz: 14 } };
const totalLabelStyle = { font: { bold: true }, alignment: { horizontal: 'right' } };
const totalValueStyle = { font: { bold: true, sz: 12 } };

const getColumnWidths = (data: any[][]): { wch: number }[] => {
    if (!data || data.length === 0) return [];
    
    const widths: { wch: number }[] = [];
    const numCols = data.reduce((max, row) => Math.max(max, (row || []).length), 0);

    for (let C = 0; C < numCols; C++) {
        widths[C] = { wch: 0 };
    }

    data.forEach(row => {
        (row || []).forEach((cell, C) => {
            const cellValue = cell === null || cell === undefined ? '' : String(cell);
            const cellLength = cellValue.length;
            if (widths[C].wch < cellLength) {
                widths[C].wch = cellLength;
            }
        });
    });

    widths.forEach((width, C) => {
        widths[C].wch = Math.max(12, width.wch + 2);
    });

    return widths;
};


const applyStylesToSheet = (ws: XLSX.WorkSheet, styles: { [cell: string]: any }) => {
    Object.keys(styles).forEach(cellAddress => {
        if (ws[cellAddress]) {
            ws[cellAddress].s = styles[cellAddress];
        } else {
            XLSX.utils.sheet_add_aoa(ws, [[null]], { origin: cellAddress });
            ws[cellAddress].s = styles[cellAddress];
        }
    });
};

export const excel = (data: BreweryData, year: string): void => {
    try {
        exportData(data, year);
    } catch(e) {
        console.error("Failed to export to Excel", e);
        alert("Esportazione Excel fallita.");
    }
};

function exportData(data: BreweryData, year: string) {
    const wb = XLSX.utils.book_new();

    (Object.keys(data) as Array<keyof BreweryData>).forEach(sheetName => {
        const sheetContent = data[sheetName];
        const sheetData = Array.isArray(sheetContent) ? sheetContent : [sheetContent];

        if (sheetData.length === 0 || (sheetData.length === 1 && Object.keys(sheetData[0] || {}).length === 0)) {
            const ws = XLSX.utils.aoa_to_sheet([[`Nessun dato per ${sheetName}`]]);
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
            return;
        }
        
        const ws = XLSX.utils.json_to_sheet(sheetData);

        const aoaDataForWidth = [Object.keys(sheetData[0] || {}), ...sheetData.map(row => Object.values(row))];
        ws['!cols'] = getColumnWidths(aoaDataForWidth);
        ws['!pageSetup'] = { orientation: 'portrait', paper: 9 };

        const range = XLSX.utils.decode_range(ws['!ref'] as string);
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const address = XLSX.utils.encode_cell({ r: 0, c: C });
            if (ws[address]) ws[address].s = headerStyle;
        }

        XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    XLSX.writeFile(wb, `birrificio_${year}.xlsx`);
}

function generateAndDownloadInventory(inventory: Movement[], year: string) {
    const wb = XLSX.utils.book_new();
    const sheetName = 'Inventario Iniziale';

    const ws_data = [
        [`Inventario Iniziale Magazzino - 01/01/${year}`],
        [], 
        ['TIPOLOGIA', 'NOME PRODOTTO', 'MARCA', 'GIACENZA INIZIALE'],
        ...inventory
            .sort((a, b) => a.TIPOLOGIA.localeCompare(b.TIPOLOGIA) || a.NOME.localeCompare(b.NOME))
            .map(item => [item.TIPOLOGIA, item.NOME, item.MARCA, item.KG_LITRI_PZ])
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    ws['!cols'] = getColumnWidths(ws_data);
    ws['!pageSetup'] = { orientation: 'portrait', paper: 9 };
    
    applyStylesToSheet(ws, {
        'A1': titleStyle, 'A3': headerStyle, 'B3': headerStyle, 'C3': headerStyle, 'D3': headerStyle
    });

    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, `inventario_iniziale_${year}.xlsx`);
}


export const exportInventoryToExcel = (inventory: Movement[], year: string): void => {
    try {
        generateAndDownloadInventory(inventory, year);
    } catch(e) {
        console.error("Failed to export inventory to Excel", e);
        alert("Esportazione inventario fallita.");
    }
};

export const exportCostAnalysisToExcel = (
    lotto: BrewHeader,
    rawMaterialsCosts: any,
    otherCosts: any,
    analysisSummary: any,
    packagingAnalysis: { bottles: any[], kegs: any[] } | null
) => {
    const wb = XLSX.utils.book_new();
    let ws_data: (string | number | null)[][] = [];
    const styles: { [cell: string]: any } = {};

    // --- TITLE ---
    ws_data.push([`ANALISI COSTI LOTTO: ${lotto.LOTTO}`]);
    styles[`A${ws_data.length}`] = titleStyle;
    ws_data.push([], []);

    // --- HEADER INFO ---
    ws_data.push(['Cliente:', lotto.CLIENTE, null, 'Nome Birra:', lotto.NOME_BIRRA]);
    styles[`A${ws_data.length}`] = totalLabelStyle; styles[`D${ws_data.length}`] = totalLabelStyle;
    ws_data.push(['Data Produzione:', lotto.DATA_PROD, null, 'Litri Finali:', lotto.LITRI_FINALI]);
    styles[`A${ws_data.length}`] = totalLabelStyle; styles[`D${ws_data.length}`] = totalLabelStyle;
    ws_data.push([], []);

    // --- RAW MATERIALS ---
    ws_data.push(['COSTI MATERIE PRIME']);
    styles[`A${ws_data.length}`] = sectionTitleStyle;
    ws_data.push(['Ingrediente', 'Q.tà Usata', 'Prezzo Unit.', 'Costo Totale']);
    ['A','B','C','D'].forEach(c => styles[`${c}${ws_data.length}`] = headerStyle);
    
    Object.keys(rawMaterialsCosts.costsByCategory).sort().forEach(category => {
        ws_data.push([]);
        ws_data.push([`${category.toUpperCase()}`]);
        styles[`A${ws_data.length}`] = { font: { bold: true, sz: 11 }};
        rawMaterialsCosts.costsByCategory[category].items.forEach((item: any) => {
            ws_data.push([item.nome, item.qta, item.prezzoUnitario, item.costoTotale]);
        });
        ws_data.push([null, null, `Subtotale ${category}`, rawMaterialsCosts.costsByCategory[category].total]);
        styles[`C${ws_data.length}`] = totalLabelStyle; styles[`D${ws_data.length}`] = totalValueStyle;
    });
    ws_data.push([], []);

    ws_data.push([null, null, 'Totale Costo Materie Prime', rawMaterialsCosts.grandTotal]);
    styles[`C${ws_data.length}`] = totalLabelStyle; styles[`D${ws_data.length}`] = totalValueStyle;
    ws_data.push([], []);

    // --- OTHER COSTS ---
    ws_data.push(['ALTRI COSTI']);
    styles[`A${ws_data.length}`] = sectionTitleStyle;
    ws_data.push(['Descrizione', 'Dettaglio Calcolo', 'Costo']);
    ['A','B','C'].forEach(c => styles[`${c}${ws_data.length}`] = headerStyle);
    ws_data.push(['Costo Gas Totale', `${otherCosts.gas.used.toFixed(2)} m³ * €${otherCosts.gas.price.toFixed(2)}/m³`, otherCosts.gas.total]);
    if(otherCosts.additionalGases.total > 0) { ws_data.push(['Gas Aggiuntivi (CO2/Azoto)', null, otherCosts.additionalGases.total]); }
    ws_data.push(['Accise', `${otherCosts.exciseDuty.plato.toFixed(2)}°P * ${otherCosts.exciseDuty.hl.toFixed(4)} hL * €${otherCosts.exciseDuty.coeff.toFixed(2)}`, otherCosts.exciseDuty.total]);
    if(otherCosts.storage.total > 0) { ws_data.push(['Stoccaggio', null, otherCosts.storage.total]); }
    if(otherCosts.epal.total > 0) { ws_data.push(['Epal', `${otherCosts.epal.count} pz * €${otherCosts.epal.price.toFixed(2)}/pz`, otherCosts.epal.total]); }
    ws_data.push(['Spese Gestione Birrificio', `${otherCosts.management.liters.toFixed(2)} L * €${otherCosts.management.coeff.toFixed(2)}/L`, otherCosts.management.total]);
    ws_data.push([null, 'Totale Altri Costi', otherCosts.grandTotal]);
    styles[`B${ws_data.length}`] = totalLabelStyle; styles[`C${ws_data.length}`] = totalValueStyle;
    ws_data.push([], []);
    
    let packagingCols = 4;
    // --- PACKAGING ---
    if(packagingAnalysis && (packagingAnalysis.kegs.length > 0 || packagingAnalysis.bottles.length > 0)) {
        ws_data.push(['ANALISI COSTI CONFEZIONAMENTO']);
        styles[`A${ws_data.length}`] = sectionTitleStyle;
        
        if(packagingAnalysis.kegs.length > 0) {
            ws_data.push([]);
            ws_data.push(['Formato Fusto', 'Costo Birra / L', 'Costo Contenitore / L', 'Prezzo Finale / L']);
            ['A','B','C','D'].forEach(c => styles[`${c}${ws_data.length}`] = headerStyle);
            packagingAnalysis.kegs.forEach(item => {
                ws_data.push([item.formato, item.beerCostPerLiter, item.containerCostPerLiter, item.finalPricePerLiter]);
            });
        }

        if(packagingAnalysis.bottles.length > 0) {
            ws_data.push([]);
            packagingCols = 9;
            const bottleHeaders = ['Formato Bottiglia', 'Q.tà', 'Costo Birra/bott.', 'Costo Bottiglia', 'Costo Tappo', 'Incid. Cartone', 'Costo Etichetta', 'Finale/bott.', 'Totale Formato'];
            ws_data.push(bottleHeaders);
            ['A','B','C','D','E','F','G','H','I'].forEach(c => styles[`${c}${ws_data.length}`] = headerStyle);
            packagingAnalysis.bottles.forEach(item => {
                ws_data.push([item.formato, item.totalBottles, item.beerCost, item.bottleCost, item.capPrice, item.cartonCostPerBottle, item.labelCost, item.finalPricePerBottle, item.totalCostForFormat]);
            });
        }
        ws_data.push([]);
    }

    // --- GRAND TOTALS ---
    ws_data.push([null, null, 'GRAN TOTALE COSTI LOTTO', analysisSummary.grandTotal]);
    styles[`C${ws_data.length}`] = totalLabelStyle; styles[`D${ws_data.length}`] = totalValueStyle;
    ws_data.push([null, null, 'PREZZO EFFETTIVO AL LITRO (SOLO BIRRA)', analysisSummary.beerPricePerLiter]);
    styles[`C${ws_data.length}`] = totalLabelStyle; styles[`D${ws_data.length}`] = totalValueStyle;

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws['!cols'] = getColumnWidths(ws_data);
    ws['!pageSetup'] = { orientation: 'portrait', paper: 9 };
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: packagingCols - 1 } }];
    applyStylesToSheet(ws, styles);
    
    XLSX.utils.book_append_sheet(wb, ws, `Costi Lotto ${lotto.LOTTO}`);
    XLSX.writeFile(wb, `costi_lotto_${lotto.LOTTO}.xlsx`);
};


export const exportBrewSheetToExcel = (
    header: BrewHeader,
    ingredients: { tipologia: string; nome: string; lotto_fornitore: string; qta: string; }[],
    fermentationData: FermentationDataPoint[],
    packagingData: PackagingData[]
) => {
    const wb = XLSX.utils.book_new();
    const ws_data: (string | number | null)[][] = [];
    const styles: { [cell: string]: any } = {};

    ws_data.push([`FOGLIO COTTA - LOTTO: ${header.LOTTO}`]); styles[`A${ws_data.length}`] = titleStyle;
    ws_data.push([], []);
    
    ws_data.push(['TESTATA']); styles[`A${ws_data.length}`] = sectionTitleStyle;
    ws_data.push(['Cliente:', header.CLIENTE, 'Data Produzione:', header.DATA_PROD]);
    ws_data.push(['Nome Birra:', header.NOME_BIRRA, 'Tipologia:', header.TIPO_BIRRA]);
    ws_data.push(['Litri Finali:', header.LITRI_FINALI, 'Plato Iniziale:', header.PLATO_INIZIALE]);
    ws_data.push([], []);

    ws_data.push(['INGREDIENTI UTILIZZATI']); styles[`A${ws_data.length}`] = sectionTitleStyle;
    ws_data.push(['Tipologia', 'Nome', 'Lotto Fornitore', 'Quantità']);
    ['A','B','C','D'].forEach(c => styles[`${c}${ws_data.length}`] = headerStyle);
    
    ingredients.forEach(item => {
        ws_data.push([item.tipologia, item.nome, item.lotto_fornitore, parseFloat(item.qta.replace(',', '.')) || 0]);
    });
    ws_data.push([], []);

    ws_data.push(['GESTIONE CANTINA']); styles[`A${ws_data.length}`] = sectionTitleStyle;
    ws_data.push(['Fermentatore:', header.FERMENTATORE || 'CHIUSO', 'Tipo Fermentazione:', header.TIPO_FERMENTAZIONE]);
    ws_data.push(['Giorni Previsti:', header.GIORNI_FERMENTAZIONE_PREVISTI, 'Gas Cotta (m³):', header.GAS_COTTA]);
    ws_data.push(['Gas Confezionamento (m³):', header.GAS_CONFEZIONAMENTO, 'Gas Aggiuntivi:', `${header.FLAG_CO2 ? 'CO2 ' : ''}${header.FLAG_AZOTO ? 'Azoto' : ''}`.trim()]);
    ws_data.push([], []);

    ws_data.push(['DATI FERMENTAZIONE']); styles[`A${ws_data.length}`] = sectionTitleStyle;
    ws_data.push(['Giorno', 'Temperatura (°C)', 'Plato (°P)']);
    ['A','B','C'].forEach(c => styles[`${c}${ws_data.length}`] = headerStyle);
    fermentationData.forEach(p => { ws_data.push([p.GIORNO, p.TEMPERATURA, p.PLATO]); });
    ws_data.push([], []);

    ws_data.push(['CONFEZIONAMENTO']); styles[`A${ws_data.length}`] = sectionTitleStyle;
    ws_data.push(['Data', 'Formato', 'Pezzi', 'Litri Totali']);
    ['A','B','C','D'].forEach(c => styles[`${c}${ws_data.length}`] = headerStyle);
    packagingData.forEach(p => { ws_data.push([p.DATA, p.FORMATO, p.QTA_UNITA, p.LITRI_TOT]); });
    ws_data.push([], []);
    
    ws_data.push(['NOTE']); styles[`A${ws_data.length}`] = sectionTitleStyle;
    ws_data.push([header.NOTE || 'Nessuna nota.']);
    
    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws['!cols'] = getColumnWidths(ws_data);
    ws['!pageSetup'] = { orientation: 'portrait', paper: 9 };
    ws['!merges'] = [ XLSX.utils.decode_range('A1:D1'), { s: {r: ws_data.length-1, c: 0}, e: {r: ws_data.length-1, c: 3} }];
    applyStylesToSheet(ws, styles);

    XLSX.utils.book_append_sheet(wb, ws, `Cotta ${header.LOTTO}`);
    XLSX.writeFile(wb, `foglio_cotta_${header.LOTTO}.xlsx`);
};

export const exportQuoteToExcel = (
    quoteData: any,
    rawMaterialsCosts: any,
    otherCosts: any,
    analysisSummary: any,
    packagingAnalysis: { bottles: any[], kegs: any[] } | null
) => {
    const wb = XLSX.utils.book_new();
    let ws_data: (string | number | null)[][] = [];
    const styles: { [cell: string]: any } = {};

    ws_data.push([`PREVENTIVO PER BIRRA: ${quoteData.nomeBirra}`]); styles[`A${ws_data.length}`] = titleStyle;
    ws_data.push([], []);
    ws_data.push(['Cliente:', quoteData.cliente]); styles[`A${ws_data.length}`] = totalLabelStyle;
    ws_data.push(['Litri Stimati:', parseFloat(quoteData.litriFinali.replace(',', '.')) || 0]); styles[`A${ws_data.length}`] = totalLabelStyle;
    ws_data.push([], []);

    ws_data.push(['COSTI MATERIE PRIME']); styles[`A${ws_data.length}`] = sectionTitleStyle;
    ws_data.push(['Ingrediente', 'Q.tà', 'Prezzo Unit.', 'Costo Totale']);
    ['A','B','C','D'].forEach(c => styles[`${c}${ws_data.length}`] = headerStyle);
    rawMaterialsCosts.items.forEach((item: any) => {
        ws_data.push([item.nome, item.qta, item.prezzoUnitario, item.costoTotale]);
    });
    ws_data.push([null, null, 'Totale Materie Prime', rawMaterialsCosts.grandTotal]);
    styles[`C${ws_data.length}`] = totalLabelStyle; styles[`D${ws_data.length}`] = totalValueStyle;
    ws_data.push([], []);

    ws_data.push(['ALTRI COSTI']); styles[`A${ws_data.length}`] = sectionTitleStyle;
    ws_data.push(['Descrizione', 'Costo']);
    ['A','B'].forEach(c => styles[`${c}${ws_data.length}`] = headerStyle);
    ws_data.push(['Costo Gas Totale', otherCosts.gas.total]);
    if(otherCosts.additionalGases.total > 0) { ws_data.push(['Gas Aggiuntivi', otherCosts.additionalGases.total]); }
    ws_data.push(['Accise', otherCosts.exciseDuty.total]);
    if(otherCosts.storage.total > 0) { ws_data.push(['Stoccaggio', otherCosts.storage.total]); }
    if(otherCosts.epal.total > 0) { ws_data.push(['Epal', otherCosts.epal.total]); }
    ws_data.push(['Spese Gestione', otherCosts.management.total]);
    ws_data.push(['Totale Altri Costi', otherCosts.grandTotal]);
    styles[`A${ws_data.length}`] = totalLabelStyle; styles[`B${ws_data.length}`] = totalValueStyle;
    ws_data.push([], []);
    
    let packagingCols = 4;
    if(packagingAnalysis && (packagingAnalysis.kegs.length > 0 || packagingAnalysis.bottles.length > 0)) {
        ws_data.push(['ANALISI COSTI CONFEZIONAMENTO']); styles[`A${ws_data.length}`] = sectionTitleStyle;
        ws_data.push([]);
        
        if(packagingAnalysis.kegs.length > 0) {
            ws_data.push(['Formato Fusto', 'Costo Birra/L', 'Costo Contenitore/L', 'Prezzo Finale/L']);
            ['A','B','C','D'].forEach(c => styles[`${c}${ws_data.length}`] = headerStyle);
            packagingAnalysis.kegs.forEach(item => { ws_data.push([item.formato, item.beerCostPerLiter, item.containerCostPerLiter, item.finalPricePerLiter]); });
            ws_data.push([]);
        }
        if(packagingAnalysis.bottles.length > 0) {
            packagingCols = 9;
            ws_data.push(['Formato', 'Q.tà', 'Birra', 'Bottiglia', 'Tappo', 'Cartone', 'Etichetta', 'Finale/bott.', 'Totale']);
            ['A','B','C','D','E','F','G','H','I'].forEach(c => styles[`${c}${ws_data.length}`] = headerStyle);
            packagingAnalysis.bottles.forEach(item => {
                ws_data.push([item.formato, item.totalBottles, item.beerCost, item.bottleCost, item.capPrice, item.cartonCostPerBottle, item.labelCost, item.finalPricePerBottle, item.totalCostForFormat]);
            });
        }
        ws_data.push([]);
    }

    ws_data.push([null, null, 'GRAN TOTALE COSTI', analysisSummary.grandTotal]);
    styles[`C${ws_data.length}`] = totalLabelStyle; styles[`D${ws_data.length}`] = totalValueStyle;
    ws_data.push([null, null, 'PREZZO AL LITRO (BIRRA)', analysisSummary.beerPricePerLiter]);
    styles[`C${ws_data.length}`] = totalLabelStyle; styles[`D${ws_data.length}`] = totalValueStyle;

    const ws = XLSX.utils.aoa_to_sheet(ws_data);
    ws['!cols'] = getColumnWidths(ws_data);
    ws['!pageSetup'] = { orientation: 'portrait', paper: 9 };
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: packagingCols - 1 } }];
    applyStylesToSheet(ws, styles);
    
    XLSX.utils.book_append_sheet(wb, ws, `Preventivo`);
    XLSX.writeFile(wb, `preventivo_${quoteData.nomeBirra.replace(/ /g, '_')}.xlsx`);
};

export const exportAllDataToExcel = (allData: Record<string, BreweryData>) => {
    const wb = XLSX.utils.book_new();
    const years = Object.keys(allData).sort();

    if (years.length === 0) {
        console.error("No data to export.");
        return;
    }
    
    const firstYearData = allData[years[0]];
    if (!firstYearData) return;

    const sheetNames = Object.keys(firstYearData) as Array<keyof BreweryData>;

    sheetNames.forEach(sheetName => {
        let combinedData: any[] = [];
        years.forEach(year => {
            const yearData = allData[year]?.[sheetName];
            if (!yearData) return;

            const dataToAdd = Array.isArray(yearData) ? yearData : [yearData];
            
            dataToAdd.forEach(row => {
                if (typeof row === 'object' && row !== null && Object.keys(row).length > 0) {
                    combinedData.push({ ANNO: year, ...row });
                } else if (typeof row !== 'object' || row === null) {
                    // For primitive values or null in array
                    combinedData.push({ ANNO: year, value: row });
                }
            });
        });

        if (combinedData.length > 0) {
            const ws = XLSX.utils.json_to_sheet(combinedData);
            
            const aoaDataForWidth = [Object.keys(combinedData[0] || {}), ...combinedData.map(row => Object.values(row))];
            ws['!cols'] = getColumnWidths(aoaDataForWidth);
            ws['!pageSetup'] = { orientation: 'portrait', paper: 9 };
            
            const range = XLSX.utils.decode_range(ws['!ref'] as string);
            for (let C = range.s.c; C <= range.e.c; ++C) {
                const address = XLSX.utils.encode_cell({ r: 0, c: C });
                if (ws[address]) ws[address].s = headerStyle;
            }
            
            XLSX.utils.book_append_sheet(wb, ws, sheetName);
        }
    });

    XLSX.writeFile(wb, `brewpanda_all_data_backup_${new Date().toISOString().slice(0, 10)}.xlsx`);
};