
import React from 'react';
import { Modal } from './Modal';
import type { PriceDBItem } from '../types';
import { useTranslation } from '../i18n';
import { addMonthsAndFormat } from '../utils/dateUtils';

interface PriceSearchModalProps {
    isOpen: boolean;
    onClose: () => void;
    searchTerm: string;
    results: PriceDBItem[];
}

export const PriceSearchModal: React.FC<PriceSearchModalProps> = ({ isOpen, onClose, searchTerm, results }) => {
    const { t } = useTranslation();

    return (
        <Modal
            title={t('priceSearch.modalTitle')}
            isOpen={isOpen}
            onClose={onClose}
            size="xl"
        >
            <div>
                {results.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-300">
                            <thead className="text-xs text-brew-dark uppercase bg-brew-accent">
                                <tr>
                                    <th className="px-4 py-3">{t('priceSearch.product')}</th>
                                    <th className="px-4 py-3">{t('priceSearch.brand')}</th>
                                    <th className="px-4 py-3">{t('priceSearch.supplier')}</th>
                                    <th className="px-4 py-3 text-right">{t('priceSearch.lastPrice')}</th>
                                    <th className="px-4 py-3 text-center">{t('priceSearch.loadDate')}</th>
                                    <th className="px-4 py-3 text-center">{t('priceSearch.priceValidUntil')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((item, index) => (
                                    <tr key={index} className="border-b border-slate-700">
                                        <td className="px-4 py-2 font-medium">{item.NOME}</td>
                                        <td className="px-4 py-2">{item.MARCA}</td>
                                        <td className="px-4 py-2">{item.FORNITORE}</td>
                                        <td className="px-4 py-2 font-bold text-right text-brew-accent">€{item.PREZZO.toFixed(2)}</td>
                                        <td className="px-4 py-2 text-center">{item.DATA_ULTIMO_CARICO}</td>
                                        <td className="px-4 py-2 text-center font-semibold">{addMonthsAndFormat(item.DATA_ULTIMO_CARICO, 6)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="text-center text-slate-400 py-8">
                        {t('priceSearch.noResults', { searchTerm })}
                    </p>
                )}
            </div>
        </Modal>
    );
};
