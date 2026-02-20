
import React, { createContext, useState, useContext, useMemo } from 'react';
import type { AnalysisContextType, PdfDocument } from '../types';

const AnalysisContext = createContext<AnalysisContextType | undefined>(undefined);

export const AnalysisProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [pdfText, setPdfText] = useState<string | null>(null);
  const [documents, setDocuments] = useState<PdfDocument[]>([]);
  const [pdfImages, setPdfImages] = useState<string[] | null>(null);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);

  const value = useMemo(() => ({
    analysisResult,
    setAnalysisResult,
    pdfText,
    setPdfText,
    documents,
    setDocuments,
    pdfImages,
    setPdfImages,
    pdfFileName,
    setPdfFileName,
  }), [analysisResult, pdfText, documents, pdfImages, pdfFileName]);

  return (
    <AnalysisContext.Provider value={value}>
      {children}
    </AnalysisContext.Provider>
  );
};

export const useAnalysis = (): AnalysisContextType => {
  const context = useContext(AnalysisContext);
  if (context === undefined) {
    throw new Error('useAnalysis must be used within an AnalysisProvider');
  }
  return context;
};