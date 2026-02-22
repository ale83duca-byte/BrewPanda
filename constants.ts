
export const COL_MOV = [
    'DATA', 'TIPOLOGIA', 'NOME', 'MARCA', 'FORNITORE', 
    'KG_LITRI_PZ', 'N_FATTURA', 'LOTTO_FORNITORE', 'LOTTO_PRODUZIONE'
];

export const STD_NOMI_MAGAZZINO: Record<string, string[]> = {
    "BOTTIGLIE": ["BOTTIGLIA 33CL", "BOTTIGLIA 50CL", "BOTTIGLIA 75CL"],
    "FUSTI": [
        "FUSTO ACCIAIO 20L", "FUSTO ACCIAIO 24L", "FUSTO ACCIAIO 30L", 
        "KEYKEG 20L", "KEYKEG 30L",
        "FUSTO POLYKEG 20LT", "FUSTO POLYKEG 24LT",
        "FUSTO POLYKEG 20LT CON SACCA", "FUSTO POLYKEG 24LT CON SACCA"
    ],
    "CARTONI": ["CARTONE X 33CL", "CARTONE X 50CL", "CARTONE X 75CL"],
    "TAPPI": ["TAPPO CORONA 26", "TAPPO CORONA 29"]
};

export const TIPOLOGIE_PRODOTTI = [
    "MALTI", "LUPPOLI", "LIEVITI", "ADDITIVI", "SANIFICANTI", "TAPPI", "FUSTI", "CARTONI", "BOTTIGLIE"
];

export const CONFIG_PACKAGING: Record<string, { pezziPerCartone: number; litriUnit: number; nomeInvCont: string; nomeInvScatola: string | null }> = {
    "BOTT. 33CL": { pezziPerCartone: 24, litriUnit: 0.33, nomeInvCont: "BOTTIGLIA 33CL", nomeInvScatola: "CARTONE X 33CL" },
    "BOTT. 50CL": { pezziPerCartone: 15, litriUnit: 0.50, nomeInvCont: "BOTTIGLIA 50CL", nomeInvScatola: "CARTONE X 50CL" },
    "BOTT. 75CL": { pezziPerCartone: 6,  litriUnit: 0.75, nomeInvCont: "BOTTIGLIA 75CL", nomeInvScatola: "CARTONE X 75CL" },
    "FUSTO ACCIAIO 20L":  { pezziPerCartone: 1,  litriUnit: 20.0, nomeInvCont: "FUSTO ACCIAIO 20L",  nomeInvScatola: null },
    "FUSTO ACCIAIO 24L":  { pezziPerCartone: 1,  litriUnit: 24.0, nomeInvCont: "FUSTO ACCIAIO 24L",  nomeInvScatola: null },
    "FUSTO ACCIAIO 30L":  { pezziPerCartone: 1,  litriUnit: 30.0, nomeInvCont: "FUSTO ACCIAIO 30L",  nomeInvScatola: null },
    "KEYKEG 20L": { pezziPerCartone: 1,  litriUnit: 20.0, nomeInvCont: "KEYKEG 20L", nomeInvScatola: null },
    "KEYKEG 30L": { pezziPerCartone: 1,  litriUnit: 30.0, nomeInvCont: "KEYKEG 30L", nomeInvScatola: null },
    "FUSTO POLYKEG 20LT": { pezziPerCartone: 1, litriUnit: 20.0, nomeInvCont: "FUSTO POLYKEG 20LT", nomeInvScatola: null },
    "FUSTO POLYKEG 24LT": { pezziPerCartone: 1, litriUnit: 24.0, nomeInvCont: "FUSTO POLYKEG 24LT", nomeInvScatola: null },
    "FUSTO POLYKEG 20LT CON SACCA": { pezziPerCartone: 1, litriUnit: 20.0, nomeInvCont: "FUSTO POLYKEG 20LT CON SACCA", nomeInvScatola: null },
    "FUSTO POLYKEG 24LT CON SACCA": { pezziPerCartone: 1, litriUnit: 24.0, nomeInvCont: "FUSTO POLYKEG 24LT CON SACCA", nomeInvScatola: null },
};

export const PRICE_LIST_FORMATS = [
    'FUSTI 20 LT',
    'FUSTO 5 LT',
    'FUSTI 24 LT',
    'CARTONI 75X6',
    'CARTONI 50X15',
    'CARTONI 33X12',
    'CARTONI 33X24',
    'ACCIAIO 20 LT'
];