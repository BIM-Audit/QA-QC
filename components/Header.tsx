import React from 'react';
import { TOP_LEVEL_PAGES, STRINGS } from '../constants';
import type { Page } from '../types';

interface HeaderProps {
  currentPage: Page;
  setCurrentPage: (page: Page) => void;
}

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


const Header: React.FC<HeaderProps> = ({ currentPage, setCurrentPage }) => {
  return (
    <nav className="flex items-center space-x-2 bg-slate-800/50 p-1 rounded-lg overflow-x-auto">
      <NavButton
        isActive={currentPage === TOP_LEVEL_PAGES.PDF_ANALYSIS}
        onClick={() => setCurrentPage(TOP_LEVEL_PAGES.PDF_ANALYSIS)}
      >
        {STRINGS.analysisPage}
      </NavButton>
      <NavButton
        isActive={currentPage === TOP_LEVEL_PAGES.VALIDATION}
        onClick={() => setCurrentPage(TOP_LEVEL_PAGES.VALIDATION)}
      >
        {STRINGS.validationSuitePage}
      </NavButton>
      <NavButton
        isActive={currentPage === TOP_LEVEL_PAGES.MODEL_CHECKER}
        onClick={() => setCurrentPage(TOP_LEVEL_PAGES.MODEL_CHECKER)}
      >
        {STRINGS.modelCheckerPage}
      </NavButton>
    </nav>
  );
};

export default Header;