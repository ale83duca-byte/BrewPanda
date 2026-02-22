
import React, { useState, useEffect, useCallback } from 'react';
import { getSheetData, deleteItemFromSheetById } from '../services/dataService';
import type { Quote } from '../types';
import { useTranslation } from '../i18n';
import { PlusIcon, TrashIcon } from './icons';
import { useToast } from '../hooks/useToast';
import { Modal } from './Modal';

interface QuotesListViewProps {
    selectedYear: string;
    onNewQuote: () => void;
    onOpenQuote: (quoteId: string) => void;
}

export const QuotesListView: React.FC<QuotesListViewProps> = ({ selectedYear, onNewQuote, onOpenQuote }) => {
    const { t } = useTranslation();
    const { showToast } = useToast();
    const [quotes, setQuotes] = useState<Quote[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    
    const loadQuotes = useCallback(async () => {
        setIsLoading(true);
        const data = await getSheetData(selectedYear, 'QUOTES') as Quote[];
        setQuotes(data.sort((a,b) => new Date(b.date.split('/').reverse().join('-')).getTime() - new Date(a.date.split('/').reverse().join('-')).getTime()));
        setIsLoading(false);
    }, [selectedYear]);

    useEffect(() => {
        loadQuotes();
    }, [loadQuotes]);

    const handleDelete = async () => {
        if (!confirmDeleteId) return;
        await deleteItemFromSheetById(selectedYear, 'QUOTES', confirmDeleteId);
        showToast(t('toast.quoteDeleted'), 'success');
        setConfirmDeleteId(null);
        await loadQuotes();
    };

    if (isLoading) {
        return <p>Caricamento preventivi...</p>
    }

    return (
        <div className="bg-brew-dark-secondary p-4 rounded-lg shadow-lg">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-brew-accent">{t('brewQuote.quoteListTitle')}</h2>
                <button onClick={onNewQuote} className="flex items-center gap-2 bg-brew-green text-white font-bold py-2 px-4 rounded-md hover:bg-opacity-90">
                    <PlusIcon className="w-5 h-5" /> {t('brewQuote.newQuoteButton')}
                </button>
            </div>
            <div className="overflow-x-auto max-h-[70vh]">
                <table className="w-full text-sm text-left text-gray-300">
                    <thead className="text-xs text-brew-dark uppercase bg-brew-accent sticky top-0">
                        <tr>
                            <th className="px-3 py-3">{t('brewQuote.quoteName')}</th>
                            <th className="px-3 py-3">{t('costAnalysis.client')}</th>
                            <th className="px-3 py-3">{t('brewQuote.date')}</th>
                            <th className="px-3 py-3 text-right">Azioni</th>
                        </tr>
                    </thead>
                    <tbody>
                        {quotes.map(quote => (
                            <tr key={quote.id} className="border-b border-slate-700">
                                <td className="px-3 py-2 font-semibold text-brew-accent">{quote.nomeBirra}</td>
                                <td className="px-3 py-2">{quote.cliente}</td>
                                <td className="px-3 py-2">{quote.date}</td>
                                <td className="px-3 py-2 text-right">
                                    <button onClick={() => onOpenQuote(quote.id)} className="font-bold text-brew-blue hover:underline mr-4">{t('brewQuote.openButton')}</button>
                                    <button onClick={() => setConfirmDeleteId(quote.id)} className="text-red-500 hover:text-red-400"><TrashIcon className="w-4 h-4 inline"/></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {quotes.length === 0 && (
                    <p className="text-center text-slate-400 mt-8 py-4">{t('brewQuote.noQuotes')}</p>
                )}
            </div>
            {confirmDeleteId && (
                <Modal title={t('brewQuote.deleteConfirmTitle')} isOpen={true} onClose={() => setConfirmDeleteId(null)} size="sm">
                     <p>{t('brewQuote.deleteConfirmMessage')}</p>
                     <div className="flex justify-end gap-4 pt-4">
                        <button onClick={() => setConfirmDeleteId(null)} className="px-4 py-2 rounded-md bg-slate-600 hover:bg-slate-500">{t('costAnalysis.cancel')}</button>
                        <button onClick={handleDelete} className="px-4 py-2 rounded-md bg-brew-red font-bold hover:bg-opacity-80">{t('costAnalysis.confirm')}</button>
                     </div>
                </Modal>
            )}
        </div>
    );
};
