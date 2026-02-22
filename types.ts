export interface Movement {
  DATA: string;
  TIPOLOGIA: string;
  NOME: string;
  MARCA: string;
  FORNITORE: string;
  KG_LITRI_PZ: number;
  N_FATTURA: string;
  LOTTO_FORNITORE: string;
  LOTTO_PRODUZIONE: string;
  DATA_SCADENZA?: string;
  PREZZO?: number;
}

export interface PriceDBItem {
    NOME: string;
    MARCA: string;
    FORNITORE: string;
    PREZZO: number;
    DATA_ULTIMO_CARICO: string;
}

export interface DatabaseItem {
  TIPOLOGIA: string;
  NOME: string;
  MARCA: string;
  FORNITORE: string;
}

export interface WarehouseItem {
  TIPOLOGIA: string;
  NOME: string;
  GIACENZA: number;
}

export interface RawWarehouseItem {
    TIPOLOGIA: string;
    NOME: string;
    MARCA: string;
    FORNITORE: string;
    GIACENZA: number;
}


export interface BrewHeader {
  LOTTO: string;
  CLIENTE: string;
  DATA_PROD: string;
  NOME_BIRRA: string;
  FERMENTATORE: string;
  PLATO_INIZIALE: string;
  LITRI_FINALI: string;
  GAS_COTTA: string;
  GAS_CONFEZIONAMENTO: string;
  FLAG_CO2: boolean;
  FLAG_AZOTO: boolean;
  TIPO_BIRRA: string;
  TIPO_FERMENTAZIONE: 'ALTA' | 'BASSA' | '';
  GIORNI_FERMENTAZIONE_PREVISTI: string;
  NOTE?: string;
  // Campi contatori
  mustCounterPrevious?: number;
  mustCounterMeasured?: number;
  gasBrewCounterPrevious?: number;
  gasBrewCounterCurrent?: number;
  gasPackagingCounterPrevious?: number;
  gasPackagingCounterCurrent?: number;
  // Campi per analisi costi
  costAnalysisGasType?: 'gpl' | 'metano';
  costAnalysisUseStorage?: boolean;
  costAnalysisEpalCount?: number;
  isCostAnalysisClosed?: boolean;
  costAnalysisUseLabels?: boolean;
}

export interface FermentationDataPoint {
  LOTTO: string;
  GIORNO: number;
  TEMPERATURA: number;
  PLATO: number;
}

export interface PackagingData {
  DATA: string;
  LOTTO_PROD: string;
  FORMATO: string;
  QTA_UNITA: number;
  LITRI_TOT: number;
  ID_OPERAZIONE: string;
  DATA_SCADENZA: string; // Aggiunto campo scadenza
}

export interface FermenterConfig {
  id: string;
  nome: string;
  capacita: number;
}

export interface Cliente {
  id: string;
  nome: string;
}

export interface RecipeIngredient {
    tipologia: string;
    nome: string;
    qta: number;
}

export interface Birra {
  id: string;
  clienteId: string;
  nomeBirra: string;
  tipologia: string;
  platoIniziale: string;
  ricetta?: RecipeIngredient[];
}

export interface CostCoefficients {
    prezzo_gpl_mc?: number;
    prezzo_metano_mc?: number;
    coefficiente_accise?: number;
    spese_stoccaggio?: number;
    costo_epal?: number;
    costo_co2?: number;
    costo_azoto?: number;
    spese_gestione_litro?: number;
    costo_lavaggio_fusto_acciaio?: number;
    costo_etichetta?: number;
}

export interface QuoteIngredient {
    id: number;
    priceDbId: string;
    qta: string;
}

export interface QuotePackaging {
    id: number;
    formato: string;
    qta: string;
}

export interface Quote {
    id: string;
    date: string;
    cliente: string;
    nomeBirra: string;
    plato: string;
    litriFinali: string;
    gasConsumato: string;
    gasType: 'gpl' | 'metano';
    useCo2: boolean;
    useAzoto: boolean;
    useStorage: boolean;
    epalCount: string;
    useLabels: boolean;
    ingredients: QuoteIngredient[];
    packaging: QuotePackaging[];
}

// FIX: Add BeerStockItem interface to be used for representing beer stock. This fixes an import error in BeerWarehouseView.tsx.
export interface BeerStockItem {
    cliente: string;
    nomeBirra: string;
    lotto: string;
    formato: string;
    quantita: number;
    dataScadenza: string;
}

export interface InitialBeerStock {
    cliente: string;
    nomeBirra: string;
    lotto: string;
    formato: string;
    quantita: number;
    dataScadenza: string;
}

export interface BeerMovement {
    id: string;
    data: string;
    type: 'SALE' | 'ADJUSTMENT'; // Vendita o Rettifica Inventariale
    cliente: string;
    nomeBirra: string;
    lotto: string;
    formato: string;
    quantita: number; // Sarà un numero negativo
    relatedDocId?: string; // ID della commissione d'ordine o dell'inventario
}

export interface SalesOrderItem {
    beerName: string;
    format: string;
    quantity: number;
}

export interface SalesOrder {
    id: string;
    date: string;
    client: string;
    items: SalesOrderItem[];
}

export interface BeerInventoryCheckItem {
    cliente: string;
    nomeBirra: string;
    lotto: string;
    formato: string;
    quantitaCalcolata: number;
    quantitaFisica: number;
    discrepanza: number;
}

export interface BeerInventoryCheck {
    id: string; // e.g., 'INV_2024_07'
    date: string; // e.g., '01/07/2024'
    items: BeerInventoryCheckItem[];
}

export interface BreweryData {
  MOVIMENTAZIONE: Movement[];
  DATABASE: DatabaseItem[];
  MAGAZZINO: RawWarehouseItem[];
  COTTE_HEAD: BrewHeader[];
  FERMENTAZIONE: FermentationDataPoint[];
  CONFEZIONAMENTO: PackagingData[];
  CANTINA_CONFIG: FermenterConfig[];
  CLIENTI: Cliente[];
  BIRRE: Birra[];
  PRICE_DATABASE: PriceDBItem[];
  COST_COEFFICIENTS: CostCoefficients;
  QUOTES: Quote[];
  // Nuove tabelle per magazzino birra finita
  BEER_WAREHOUSE_INITIAL: InitialBeerStock[];
  BEER_MOVEMENTS: BeerMovement[];
  SALES_ORDERS: SalesOrder[];
  BEER_INVENTORY_CHECKS: BeerInventoryCheck[];
}

export type BrewerySheet = keyof BreweryData;

export interface WarehouseStatus {
    dischargedItems: { nome: string; lotto: string; qta: number }[];
    expiringSoonItems: { nome:string; lotto: string; scadenza: string; giacenza: number }[];
    outOfStockItems: { nome: string; marca: string; fornitore: string; tipologia: string; }[];
    expiringBeerItems: { cliente: string; birra: string; lotto: string; formato: string; scadenza: string; qta: number }[];
}