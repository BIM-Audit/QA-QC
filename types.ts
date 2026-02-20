
import React from 'react';
import { TOP_LEVEL_PAGES, VALIDATION_PAGES, MODEL_CHECKER_PAGES } from './constants';

export type PdfDocument = {
  name: string;
  text: string;
};

export type AnalysisContextType = {
  analysisResult: string | null;
  setAnalysisResult: React.Dispatch<React.SetStateAction<string | null>>;
  pdfText: string | null;
  setPdfText: React.Dispatch<React.SetStateAction<string | null>>;
  documents: PdfDocument[];
  setDocuments: React.Dispatch<React.SetStateAction<PdfDocument[]>>;
  pdfImages: string[] | null;
  setPdfImages: React.Dispatch<React.SetStateAction<string[] | null>>;
  pdfFileName: string | null;
  setPdfFileName: React.Dispatch<React.SetStateAction<string | null>>;
};

export type Page = typeof TOP_LEVEL_PAGES[keyof typeof TOP_LEVEL_PAGES];
export type ValidationPageType = typeof VALIDATION_PAGES[keyof typeof VALIDATION_PAGES];
export type ModelCheckerPageType = typeof MODEL_CHECKER_PAGES[keyof typeof MODEL_CHECKER_PAGES];

export type ComparisonResult = {
  verdict: string;
  reasoning: string;
};

export type ValidationResultItem = {
    originalRecord: Record<string, any>;
    status: 'Valid' | 'Invalid' | 'Needs Review';
    reasoning: string;
    invalidValue?: string;
};

export type MIDPComparisonResultItem = {
  name: string;
  status: 'matched' | 'missing' | 'extra';
};

export type ParameterCheckResult = {
  parameter: string;
  filled: number;
  empty: number;
  percentage: number;
};

export type ProjectUnitsCheckResult = {
    summary: {
      standardFromDocument: string;
      metricCount: number;
      imperialCount: number;
      otherCount: number;
      totalCount: number;
      reasoning: string;
    },
    details: ValidationResultItem[];
};

export type LevelsGridsPinnedResult = {
    levels: ValidationResultItem[];
    grids: ValidationResultItem[];
};

export type QaqcResults = {
    fileName: ValidationResultItem[] | null;
    projectUnits: ProjectUnitsCheckResult | null;
    surveyPoint: ValidationResultItem[] | null;
    projectBasePoint: ValidationResultItem[] | null;
    rvtLinkPinned: ValidationResultItem[] | null;
    revitLinksPath: ValidationResultItem[] | null;
    importedCad: ValidationResultItem[] | null;
    levelsGridsPinned: LevelsGridsPinnedResult | null;
    categoryWorksetName: ValidationResultItem[] | null;
    startingViewName: ValidationResultItem[] | null;
    navisworksViewName: ValidationResultItem[] | null;
    viewsNotInSheets: ValidationResultItem[] | null;
};
