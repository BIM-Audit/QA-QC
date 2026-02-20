import React, { useState } from 'react';
import { AnalysisProvider } from './context/AnalysisContext';
import { TOP_LEVEL_PAGES, STRINGS } from './constants';
import Header from './components/Header';
import WelcomePage from './pages/WelcomePage';
import AnalysisPage from './pages/AnalysisPage';
import ValidationSuitePage from './pages/ValidationSuitePage';
import ModelCheckerPage from './pages/ModelCheckerPage';
import type { Page } from './types';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>(TOP_LEVEL_PAGES.PDF_ANALYSIS);
  const [showWelcome, setShowWelcome] = useState(true);

  if (showWelcome) {
    return <WelcomePage onGetStarted={() => setShowWelcome(false)} />;
  }

  return (
    <AnalysisProvider>
      <div className="min-h-screen bg-slate-900 text-slate-200 font-sans">
        <header className="bg-slate-900/70 backdrop-blur-lg shadow-md sticky top-0 z-10 border-b border-slate-800">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center py-4">
                    <h1 className="text-2xl font-bold text-sky-400">{STRINGS.appTitle}</h1>
                    <Header currentPage={currentPage} setCurrentPage={setCurrentPage} />
                </div>
            </div>
        </header>
        <main className="container mx-auto p-4 sm:p-6 lg:p-8">
          {currentPage === TOP_LEVEL_PAGES.PDF_ANALYSIS && <AnalysisPage />}
          {currentPage === TOP_LEVEL_PAGES.VALIDATION && <ValidationSuitePage />}
          {currentPage === TOP_LEVEL_PAGES.MODEL_CHECKER && <ModelCheckerPage />}
        </main>
         <footer className="text-center py-4 text-slate-500 text-sm">
            <p>&copy; {new Date().getFullYear()} {STRINGS.appTitle}. {STRINGS.footerText}</p>
        </footer>
      </div>
    </AnalysisProvider>
  );
}

export default App;