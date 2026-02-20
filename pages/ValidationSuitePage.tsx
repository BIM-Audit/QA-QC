import React, { useState } from 'react';
import { VALIDATION_PAGES, STRINGS } from '../constants';
import ComparePage from './ComparePage';
import ValidationPage from './ValidationPage';
import QnAPage from './QnAPage';
import DocDiffPage from './DocDiffPage';
import type { ValidationPageType } from '../types';

const NavButton: React.FC<{
    isActive: boolean;
    onClick: () => void;
    children: React.ReactNode;
}> = ({ isActive, onClick, children }) => {
    const baseClasses = "px-4 py-2 rounded-md text-sm font-medium transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 focus:ring-offset-slate-900 relative whitespace-nowrap";
    const activeClasses = "text-white";
    const inactiveClasses = "text-slate-400 hover:text-white";
    
    return (
        <button onClick={onClick} className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}>
            {children}
            {isActive && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-sky-400 rounded-full"></span>}
        </button>
    );
};

const ValidationSuitePage: React.FC = () => {
    const [activeSubPage, setActiveSubPage] = useState<ValidationPageType>(VALIDATION_PAGES.COMPARISON);

    return (
        <div className="animate-fade-in">
            <div className="mb-6">
                <nav className="flex items-center space-x-2 bg-slate-800/50 p-1 rounded-lg overflow-x-auto border border-slate-700 max-w-max mx-auto">
                    <NavButton isActive={activeSubPage === VALIDATION_PAGES.COMPARISON} onClick={() => setActiveSubPage(VALIDATION_PAGES.COMPARISON)}>
                        {STRINGS.comparisonPage}
                    </NavButton>
                    <NavButton isActive={activeSubPage === VALIDATION_PAGES.VALIDATION} onClick={() => setActiveSubPage(VALIDATION_PAGES.VALIDATION)}>
                        {STRINGS.validationPage}
                    </NavButton>
                    <NavButton isActive={activeSubPage === VALIDATION_PAGES.QNA} onClick={() => setActiveSubPage(VALIDATION_PAGES.QNA)}>
                        {STRINGS.qnaPage}
                    </NavButton>
                    <NavButton isActive={activeSubPage === VALIDATION_PAGES.DOC_DIFF} onClick={() => setActiveSubPage(VALIDATION_PAGES.DOC_DIFF)}>
                        {STRINGS.docDiffPage}
                    </NavButton>
                </nav>
            </div>

            <div>
                {activeSubPage === VALIDATION_PAGES.COMPARISON && <ComparePage />}
                {activeSubPage === VALIDATION_PAGES.VALIDATION && <ValidationPage />}
                {activeSubPage === VALIDATION_PAGES.QNA && <QnAPage />}
                {activeSubPage === VALIDATION_PAGES.DOC_DIFF && <DocDiffPage />}
            </div>
        </div>
    )
}

export default ValidationSuitePage;