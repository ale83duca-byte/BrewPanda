
import React from 'react';
import { useTranslation } from '../i18n';

interface HeaderProps {
    selectedYear: string;
    showSaveIndicator: boolean;
}

export const Header: React.FC<HeaderProps> = ({ selectedYear, showSaveIndicator }) => {
    const { t, changeLanguage, locale } = useTranslation();

    return (
        <header className="relative bg-brew-dark p-3 border-b border-slate-700 flex justify-center items-center">
            <h2 className="text-xl font-bold text-brew-light">{t('header.activeYear')}: <span className="text-brew-accent text-2xl">{selectedYear}</span></h2>
            
            <div className="absolute left-4">
                 <div className="flex items-center space-x-1 bg-brew-dark-secondary p-1 rounded-md">
                    <button 
                        onClick={() => changeLanguage('it')}
                        className={`px-3 py-1 text-xs font-bold rounded ${locale === 'it' ? 'bg-brew-accent text-brew-dark' : 'text-brew-light hover:bg-slate-600'}`}
                    >
                        IT
                    </button>
                    <button 
                        onClick={() => changeLanguage('en')}
                        className={`px-3 py-1 text-xs font-bold rounded ${locale === 'en' ? 'bg-brew-accent text-brew-dark' : 'text-brew-light hover:bg-slate-600'}`}
                    >
                        EN
                    </button>
                </div>
            </div>

            <div className={`absolute right-4 transition-opacity duration-500 ${showSaveIndicator ? 'opacity-100' : 'opacity-0'}`}>
                <span className="text-sm font-semibold text-green-400">{t('header.dataSaved')} ✓</span>
            </div>
        </header>
    );
};
