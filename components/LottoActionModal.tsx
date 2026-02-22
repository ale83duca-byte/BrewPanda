
import React from 'react';
import { Modal } from './Modal';
import { useTranslation } from '../i18n';
import { BeakerIcon, DocumentTextIcon } from './icons'; // Assuming you have a calculator or similar icon

interface LottoActionModalProps {
    lottoId: string;
    onClose: () => void;
    onOpenBrewPage: () => void;
    onOpenCostAnalysis: () => void;
}

export const LottoActionModal: React.FC<LottoActionModalProps> = ({ lottoId, onClose, onOpenBrewPage, onOpenCostAnalysis }) => {
    const { t } = useTranslation();

    return (
        <Modal
            title={t('lottoAction.modalTitle', { lottoId })}
            isOpen={true}
            onClose={onClose}
            size="sm"
        >
            <div className="space-y-4">
                <button
                    onClick={onOpenBrewPage}
                    className="w-full flex items-center justify-center p-4 bg-brew-blue text-white font-bold rounded-lg hover:bg-opacity-90 transition-all text-lg"
                >
                    <BeakerIcon className="w-6 h-6 mr-3" />
                    {t('lottoAction.openBrewPage')}
                </button>
                <button
                    onClick={onOpenCostAnalysis}
                    className="w-full flex items-center justify-center p-4 bg-brew-orange text-white font-bold rounded-lg hover:bg-opacity-90 transition-all text-lg"
                >
                    <DocumentTextIcon className="w-6 h-6 mr-3" />
                    {t('lottoAction.openCostAnalysis')}
                </button>
            </div>
        </Modal>
    );
};
