
import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { getSheetData, saveDataToSheet } from '../services/dataService';
import type { CostCoefficients } from '../types';
import { useToast } from '../hooks/useToast';
import { useTranslation } from '../i18n';

interface CoefficientsModalProps {
    selectedYear: string;
    onClose: () => void;
}

const formatNumberForInput = (num: number | undefined): string => {
    if (num === undefined || num === null) return '';
    return String(num);
};

const initialInputState: Record<keyof CostCoefficients, string> = {
    prezzo_gpl_mc: '',
    prezzo_metano_mc: '',
    coefficiente_accise: '',
    spese_stoccaggio: '',
    costo_epal: '',
    costo_co2: '',
    costo_azoto: '',
    spese_gestione_litro: '',
    costo_lavaggio_fusto_acciaio: '',
    costo_etichetta: '',
};


export const CoefficientsModal: React.FC<CoefficientsModalProps> = ({ selectedYear, onClose }) => {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const [inputValues, setInputValues] = useState<Record<keyof CostCoefficients, string>>(initialInputState);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadCoeffs = async () => {
            const data = (await getSheetData(selectedYear, 'COST_COEFFICIENTS')) as CostCoefficients || {};
            const initialInputs: any = {};
            
            const keys: (keyof CostCoefficients)[] = ['prezzo_gpl_mc', 'prezzo_metano_mc', 'coefficiente_accise', 'spese_stoccaggio', 'costo_epal', 'costo_co2', 'costo_azoto', 'spese_gestione_litro', 'costo_lavaggio_fusto_acciaio', 'costo_etichetta'];
            
            keys.forEach(key => {
                initialInputs[key] = formatNumberForInput(data[key]);
            });

            setInputValues(initialInputs);
            setIsLoading(false);
        };
        loadCoeffs();
    }, [selectedYear]);

    const handleInputChange = (field: keyof CostCoefficients, value: string) => {
        if (/^[0-9]*[.,]?[0-9]*$/.test(value)) {
            setInputValues(prev => ({ ...prev, [field]: value }));
        }
    };

    const handleSave = async () => {
        const updatedCoeffs: CostCoefficients = {};
        for (const key in inputValues) {
            if (Object.prototype.hasOwnProperty.call(inputValues, key)) {
                const fieldKey = key as keyof CostCoefficients;
                const stringValue = inputValues[fieldKey] || '0';
                updatedCoeffs[fieldKey] = parseFloat(stringValue.replace(',', '.')) || 0;
            }
        }
        
        await saveDataToSheet(selectedYear, 'COST_COEFFICIENTS', updatedCoeffs);
        showToast("Coefficienti salvati con successo!", 'success');
        onClose();
    };

    if (isLoading) {
        return <Modal title={t('coefficients.modalTitle')} isOpen={true} onClose={onClose}><p>Caricamento...</p></Modal>;
    }
    
    return (
        <Modal title={t('coefficients.modalTitle')} isOpen={true} onClose={onClose} size="lg">
            <div className="space-y-4">

                <div className="bg-brew-dark p-4 rounded-lg border border-slate-600 space-y-4">
                    <Field label={t('coefficients.excise')} title={t('coefficients.exciseTooltip')} labelClassName="!text-base !font-semibold !text-brew-accent">
                        <Input 
                            value={inputValues.coefficiente_accise || ''} 
                            onChange={v => handleInputChange('coefficiente_accise', v)}
                            className="!text-lg !font-bold"
                        />
                    </Field>
                    <Field label={t('coefficients.management')} title={t('coefficients.managementTooltip')} labelClassName="!text-base !font-semibold !text-brew-accent">
                        <Input 
                            value={inputValues.spese_gestione_litro || ''} 
                            onChange={v => handleInputChange('spese_gestione_litro', v)}
                            className="!text-lg !font-bold"
                        />
                    </Field>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <Field label={t('coefficients.gplCost')} title={t('coefficients.gplCostTooltip')}>
                        <Input value={inputValues.prezzo_gpl_mc || ''} onChange={v => handleInputChange('prezzo_gpl_mc', v)} />
                     </Field>
                     <Field label={t('coefficients.metanoCost')} title={t('coefficients.metanoCostTooltip')}>
                        <Input value={inputValues.prezzo_metano_mc || ''} onChange={v => handleInputChange('prezzo_metano_mc', v)} />
                     </Field>
                </div>
                 <Field label={t('coefficients.storage')} title={t('coefficients.storageTooltip')}>
                    <Input value={inputValues.spese_stoccaggio || ''} onChange={v => handleInputChange('spese_stoccaggio', v)} />
                 </Field>
                 <Field label={t('coefficients.epal')} title={t('coefficients.epalTooltip')}>
                    <Input value={inputValues.costo_epal || ''} onChange={v => handleInputChange('costo_epal', v)} />
                 </Field>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label={t('coefficients.co2')} title={t('coefficients.co2Tooltip')}>
                        <Input value={inputValues.costo_co2 || ''} onChange={v => handleInputChange('costo_co2', v)} />
                    </Field>
                    <Field label={t('coefficients.azoto')} title={t('coefficients.azotoTooltip')}>
                        <Input value={inputValues.costo_azoto || ''} onChange={v => handleInputChange('costo_azoto', v)} />
                    </Field>
                </div>
                 <Field label={t('coefficients.steelKegWashing')} title={t('coefficients.steelKegWashingTooltip')}>
                    <Input value={inputValues.costo_lavaggio_fusto_acciaio || ''} onChange={v => handleInputChange('costo_lavaggio_fusto_acciaio', v)} />
                 </Field>
                <Field label={t('coefficients.label')} title={t('coefficients.labelTooltip')}>
                    <Input value={inputValues.costo_etichetta || ''} onChange={v => handleInputChange('costo_etichetta', v)} />
                </Field>

                <div className="pt-5 flex justify-end">
                    <button onClick={handleSave} className="bg-brew-green text-white font-bold py-2 px-6 rounded-md hover:bg-opacity-80 transition-all">
                        {t('coefficients.saveButton')}
                    </button>
                </div>
            </div>
        </Modal>
    );
};


const Field: React.FC<{label: string, title: string, children: React.ReactNode, labelClassName?: string}> = ({ label, title, children, labelClassName }) => (
    <div title={title}>
        <label className={`block text-sm font-medium text-gray-300 mb-1 ${labelClassName || ''}`}>{label}</label>
        {children}
    </div>
);

const Input = (props: { value: string; onChange: (val: string) => void; className?: string}) => {
    return (
        <input
            type="text"
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            className={`w-full bg-brew-dark p-2 rounded-md border border-slate-600 focus:ring-brew-accent focus:border-brew-accent ${props.className || ''}`}
        />
    );
};
