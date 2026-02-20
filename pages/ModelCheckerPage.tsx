
import React, { useState } from 'react';
import { MODEL_CHECKER_PAGES, STRINGS } from '../constants';
import QaqcPage from './QaqcPage';
import MIDPCheckPage from './MIDPCheckPage';
import ParameterCheckPage from './ParameterCheckPage';
import ClashAnalysisPage from './ClashAnalysisPage';
import type { ModelCheckerPageType } from '../types';

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

const ModelCheckerPage: React.FC = () => {
    const [activeSubPage, setActiveSubPage] = useState<ModelCheckerPageType>(MODEL_CHECKER_PAGES.QAQC);

    return (
        <div className="animate-fade-in">
            <div className="mb-6">
                 <nav className="flex items-center space-x-2 bg-slate-800/50 p-1 rounded-lg overflow-x-auto border border-slate-700 max-w-max mx-auto">
                    <NavButton isActive={activeSubPage === MODEL_CHECKER_PAGES.QAQC} onClick={() => setActiveSubPage(MODEL_CHECKER_PAGES.QAQC)}>
                        {STRINGS.qaqcPage}
                    </NavButton>
                    <NavButton isActive={activeSubPage === MODEL_CHECKER_PAGES.MIDP_CHECK} onClick={() => setActiveSubPage(MODEL_CHECKER_PAGES.MIDP_CHECK)}>
                        {STRINGS.midpCheckPage}
                    </NavButton>
                    <NavButton isActive={activeSubPage === MODEL_CHECKER_PAGES.PARAMETER_CHECK} onClick={() => setActiveSubPage(MODEL_CHECKER_PAGES.PARAMETER_CHECK)}>
                        {STRINGS.parameterCheckPage}
                    </NavButton>
                    <NavButton isActive={activeSubPage === MODEL_CHECKER_PAGES.CLASH_ANALYSIS} onClick={() => setActiveSubPage(MODEL_CHECKER_PAGES.CLASH_ANALYSIS)}>
                        {STRINGS.clashAnalysisPage}
                    </NavButton>
                </nav>
            </div>
            
            <div>
                {activeSubPage === MODEL_CHECKER_PAGES.QAQC && <QaqcPage />}
                {activeSubPage === MODEL_CHECKER_PAGES.MIDP_CHECK && <MIDPCheckPage />}
                {activeSubPage === MODEL_CHECKER_PAGES.PARAMETER_CHECK && <ParameterCheckPage />}
                {activeSubPage === MODEL_CHECKER_PAGES.CLASH_ANALYSIS && <ClashAnalysisPage />}
            </div>
        </div>
    )
}

export default ModelCheckerPage;
