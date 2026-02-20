import React, { useState } from 'react';
import { useAnalysis } from '../context/AnalysisContext';
import { compareTexts } from '../services/geminiService';
import { STRINGS } from '../constants';
import Loader from '../components/Loader';
import type { ComparisonResult } from '../types';
import { cleanText } from '../utils/text';

const ComparePage: React.FC = () => {
  const { pdfText, pdfFileName } = useAnalysis();
  const [newData, setNewData] = useState('');
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCompare = async () => {
    if (!pdfText || !newData) return;

    setIsLoading(true);
    setError(null);
    setComparisonResult(null);

    try {
      const cleanedNewData = cleanText(newData);
      const resultJson = await compareTexts(pdfText, cleanedNewData);
      setComparisonResult(JSON.parse(resultJson));
    } catch (err) {
      if (err instanceof SyntaxError) {
          setError("Failed to parse the verification result. The format was invalid.");
      } else {
         setError(err instanceof Error ? err.message : STRINGS.errorOccurred);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!pdfText) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-8 bg-slate-800 rounded-xl shadow-2xl border border-slate-700 animate-fade-in">
         <svg className="w-16 h-16 mb-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
        <p className="text-lg font-semibold text-slate-200">{STRINGS.pleaseAnalyzeFirst}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center w-full animate-fade-in">
      <div className="w-full max-w-2xl bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl border border-slate-700">
        <h2 className="text-xl font-bold text-center mb-4 text-slate-200">{STRINGS.compareData}</h2>
        <p className="text-center text-sm text-slate-400 mb-6">{STRINGS.comparedWith} <span className="font-semibold">{pdfFileName}</span></p>

        <textarea
          value={newData}
          onChange={(e) => setNewData(e.target.value)}
          placeholder={STRINGS.enterDataToCompare}
          className="w-full h-40 p-3 border border-slate-600 rounded-lg bg-slate-700/50 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors text-slate-200"
          aria-label="Data to verify"
        />

        <button
          onClick={handleCompare}
          disabled={!newData || isLoading}
          className="mt-8 w-full bg-sky-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-sky-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 focus:ring-offset-slate-900"
        >
          {isLoading ? STRINGS.comparing : STRINGS.compareButton}
        </button>

        {error && <p className="mt-4 text-center text-red-400">{error}</p>}
      </div>
      
      {isLoading && !comparisonResult && <div className="mt-8"><Loader text={STRINGS.comparing} /></div>}

      {comparisonResult && (
         <div className="mt-8 w-full max-w-2xl animate-fade-in">
            <div className="bg-slate-800 shadow-lg rounded-xl overflow-hidden border border-slate-700">
                <div className="p-4 sm:p-6 bg-slate-800/50 border-b border-slate-700">
                    <h3 className="text-lg font-bold text-slate-100">{STRINGS.comparisonResultTitle}</h3>
                    <p className="text-sm text-slate-400 mt-1">{STRINGS.comparedWith} "{pdfFileName}"</p>
                </div>
                <div className="p-4 sm:p-6">
                    <table className="w-full text-left table-fixed">
                        <thead>
                            <tr className="border-b border-slate-600">
                                <th className="p-2 pb-3 text-sm font-semibold text-slate-300 w-[120px]">Result</th>
                                <th className="p-2 pb-3 text-sm font-semibold text-slate-300">Reason</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="p-2 align-top">
                                    <span className={`px-3 py-1 text-xs font-semibold rounded-full inline-block ${
                                        comparisonResult.verdict.toLowerCase() === 'correct' ? 'bg-green-500/20 text-green-300' :
                                        comparisonResult.verdict.toLowerCase() === 'incorrect' ? 'bg-red-500/20 text-red-300' :
                                        'bg-yellow-500/20 text-yellow-300'
                                    }`}>
                                        {comparisonResult.verdict}
                                    </span>
                                </td>
                                <td className="p-2 text-slate-300 whitespace-pre-wrap break-words">{comparisonResult.reasoning}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default ComparePage;