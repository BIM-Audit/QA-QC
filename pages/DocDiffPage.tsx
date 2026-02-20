
import React, { useState, useCallback } from 'react';
import { STRINGS } from '../constants';
import Loader from '../components/Loader';
import ResultDisplay from '../components/ResultDisplay';
import { summarizeDifferences } from '../services/geminiService';
import { cleanText } from '../utils/text';

// @ts-ignore
const pdfjsLib = window.pdfjsLib;
// @ts-ignore
const Diff = window.Diff;

const DocDiffPage: React.FC = () => {
    const [file1, setFile1] = useState<File | null>(null);
    const [file2, setFile2] = useState<File | null>(null);
    const [text1, setText1] = useState<string | null>(null);
    const [text2, setText2] = useState<string | null>(null);
    const [diffChunks, setDiffChunks] = useState<any[] | null>(null);
    const [summary, setSummary] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const extractText = async (file: File): Promise<string> => {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(' ');
            fullText += pageText + '\n\n';
        }
        return cleanText(fullText);
    };

    const handleCompare = async () => {
        if (!file1 || !file2) return;

        setIsLoading(true);
        setError(null);
        setDiffChunks(null);
        setSummary(null);

        try {
            const t1 = await extractText(file1);
            const t2 = await extractText(file2);

            setText1(t1);
            setText2(t2);

            // Perform Diff
            // Using word diff for better readability in docs
            const diff = Diff.diffWords(t1, t2);
            setDiffChunks(diff);

            // Generate AI Summary
            const summaryResult = await summarizeDifferences(t1, t2);
            setSummary(summaryResult);

        } catch (err) {
            setError("Failed to process documents. Please ensure both are valid PDFs.");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const FileUploader: React.FC<{
        label: string;
        file: File | null;
        onFileChange: (f: File | null) => void;
    }> = ({ label, file, onFileChange }) => {
        const [isDragging, setIsDragging] = useState(false);
        return (
            <div className="w-full">
                <label className="block text-sm font-medium text-slate-300 mb-2 text-center">{label}</label>
                <label
                    onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        if (e.dataTransfer.files?.[0]) onFileChange(e.dataTransfer.files[0]);
                    }}
                    className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-slate-800/50 hover:bg-slate-700/50 transition-all duration-300 ${isDragging ? 'border-sky-400 scale-105' : 'border-slate-600'}`}
                >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <svg className="w-8 h-8 mb-2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                        <p className="text-xs text-slate-400"><span className="font-semibold text-sky-400">Click</span> or drop PDF</p>
                    </div>
                    <input type="file" className="hidden" accept="application/pdf" onChange={(e) => onFileChange(e.target.files?.[0] || null)} />
                </label>
                {file && <div className="mt-2 text-center text-xs text-slate-300 truncate">{file.name}</div>}
            </div>
        );
    };

    return (
        <div className="flex flex-col items-center w-full animate-fade-in">
            <div className="w-full max-w-4xl bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl border border-slate-700 mb-8">
                <h2 className="text-xl font-bold text-center mb-6 text-slate-200">{STRINGS.docDiffPage}</h2>
                <div className="flex flex-col md:flex-row gap-8">
                    <FileUploader label={STRINGS.diffOriginalFile} file={file1} onFileChange={setFile1} />
                    <FileUploader label={STRINGS.diffNewFile} file={file2} onFileChange={setFile2} />
                </div>
                <button
                    onClick={handleCompare}
                    disabled={!file1 || !file2 || isLoading}
                    className="mt-8 w-full bg-sky-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-sky-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-all duration-300"
                >
                    {isLoading ? STRINGS.analyzing : STRINGS.diffCompareButton}
                </button>
                {error && <p className="mt-4 text-center text-red-400">{error}</p>}
            </div>

            {isLoading && <div className="mb-8"><Loader text="Comparing Documents..." /></div>}

            {summary && (
                <div className="w-full max-w-6xl mb-8">
                    <ResultDisplay title={STRINGS.diffSummaryTitle} content={summary} />
                </div>
            )}

            {diffChunks && (
                <div className="w-full max-w-7xl grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                    {/* Original Document Panel */}
                    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg flex flex-col">
                        <div className="p-3 bg-slate-700/50 border-b border-slate-600 font-semibold text-center text-slate-200">
                            Original Document (Red = Removed)
                        </div>
                        <div className="p-4 text-sm leading-relaxed whitespace-pre-wrap font-mono h-[600px] overflow-y-auto">
                            {diffChunks.map((part: any, index: number) => {
                                // In original doc: Show removed parts (red), show common parts. Hide added parts.
                                if (part.added) return null;
                                const style = part.removed ? { backgroundColor: 'rgba(239, 68, 68, 0.3)', color: '#fca5a5', textDecoration: 'line-through' } : {};
                                return <span key={index} style={style}>{part.value}</span>;
                            })}
                        </div>
                    </div>

                    {/* Modified Document Panel */}
                    <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-lg flex flex-col">
                        <div className="p-3 bg-slate-700/50 border-b border-slate-600 font-semibold text-center text-slate-200">
                            Modified Document (Green = Added)
                        </div>
                        <div className="p-4 text-sm leading-relaxed whitespace-pre-wrap font-mono h-[600px] overflow-y-auto">
                            {diffChunks.map((part: any, index: number) => {
                                // In new doc: Show added parts (green), show common parts. Hide removed parts.
                                if (part.removed) return null;
                                const style = part.added ? { backgroundColor: 'rgba(34, 197, 94, 0.3)', color: '#86efac', fontWeight: 'bold' } : {};
                                return <span key={index} style={style}>{part.value}</span>;
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DocDiffPage;
