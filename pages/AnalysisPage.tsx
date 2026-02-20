
import React, { useState, useCallback, useRef } from 'react';
import { useAnalysis } from '../context/AnalysisContext';
import { STRINGS } from '../constants';
import ResultDisplay from '../components/ResultDisplay';
import Checkbox from '../components/Checkbox';
import { cleanText } from '../utils/text';
import type { PdfDocument } from '../types';

// @ts-ignore
const pdfjsLib = window.pdfjsLib;

const AnalysisPage: React.FC = () => {
    const { analysisResult, setAnalysisResult, setPdfText, setDocuments, setPdfImages, setPdfFileName } = useAnalysis();
    const [files, setFiles] = useState<File[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [preserveFormatting, setPreserveFormatting] = useState(false);
    const [useOcr, setUseOcr] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressMessage, setProgressMessage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

     const handleFilesSelected = useCallback((selectedFiles: FileList | null) => {
        if (!selectedFiles) return;

        const newFiles = Array.from(selectedFiles);
        const pdfFiles = newFiles.filter(file => file.type === 'application/pdf');

        if (pdfFiles.length !== newFiles.length) {
            setError('Some selected files were not PDFs and have been ignored.');
        } else {
            setError(null);
        }

        if (pdfFiles.length === 0) return;

        const uniqueNewPdfs = pdfFiles.filter(newPdf =>
            !files.some(existingFile => existingFile.name === newPdf.name && existingFile.size === newPdf.size)
        );

        setFiles(prevFiles => [...prevFiles, ...uniqueNewPdfs]);
        setAnalysisResult(null);
        setPdfText(null);
        setDocuments([]);
        setPdfImages(null);
    }, [files, setAnalysisResult, setPdfText, setDocuments, setPdfImages]);

    const removeFile = (indexToRemove: number) => {
        setFiles(prevFiles => prevFiles.filter((_, index) => index !== indexToRemove));
    };

    /**
     * LOCAL ANALYSIS ENGINE (Non-AI)
     * Performs structural analysis and keyword extraction.
     */
    const performLocalAnalysis = (text: string, fileName: string): string => {
        const lines = text.split('\n').filter(l => l.trim().length > 0);
        const words = text.split(/\s+/).filter(w => w.length > 1);
        const uniqueWords = new Set(words.map(w => w.toLowerCase()));
        
        // 1. Metadata Extraction via Regex
        const extractField = (pattern: RegExp) => {
            const match = text.match(pattern);
            return match ? match[1].trim() : 'Not Found';
        };

        const projectName = extractField(/(?:Project Name|Project|Title)[:\s]+([^\n\r]+)/i);
        const projectNum = extractField(/(?:Project Number|Project No|Ref)[:\s]+([A-Z0-9-]+)/i);
        const date = extractField(/(?:Date|Dated)[:\s]+(\d{1,2}[\/\-\s]\d{1,2}[\/\-\s]\d{2,4}|[A-Z][a-z]+ \d{1,2},? \d{4})/i);
        const revision = extractField(/(?:Revision|Rev)[:\s]+([A-Z0-9]+)/i);

        // 2. Keyword Frequency
        const stopWords = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'shall', 'will', 'must', 'been', 'each', 'such']);
        const wordFreq: Record<string, number> = {};
        words.forEach(w => {
            const cleanW = w.toLowerCase().replace(/[^a-z]/g, '');
            if (cleanW.length > 3 && !stopWords.has(cleanW)) {
                wordFreq[cleanW] = (wordFreq[cleanW] || 0) + 1;
            }
        });
        const topKeywords = Object.entries(wordFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([word, count]) => `**${word.toUpperCase()}** (${count})`)
            .join(', ');

        // 3. BIM Code Detection (Hyphenated Uppercase strings)
        const codeMatches = text.match(/\b[A-Z0-9]{2,6}(?:-[A-Z0-9]{2,6}){2,}\b/g) || [];
        const uniqueCodes = Array.from(new Set(codeMatches)).slice(0, 10);

        // 4. Structural Summary
        return `### 📊 Local Document Intelligence
---
#### **Document Metadata**
- **Filename:** \`${fileName}\`
- **Detected Project Name:** ${projectName}
- **Project Reference:** ${projectNum}
- **Revision / Version:** ${revision}
- **Detected Date:** ${date}

#### **Structure & Content**
- **Word Count:** ${words.length.toLocaleString()}
- **Unique Vocabulary:** ${uniqueWords.size.toLocaleString()} words
- **Line Density:** ${lines.length} lines of text detected.
- **Top Keywords:** ${topKeywords || 'No dominant keywords identified.'}

#### **BIM / Naming Patterns Found**
${uniqueCodes.length > 0 ? uniqueCodes.map(c => `- \`${c}\``).join('\n') : '*No specific BIM naming patterns detected.*'}

#### **Content Insight**
This document appears to be a ${lines.length > 500 ? 'comprehensive specification' : 'brief report/instruction'}. The most frequent terms suggest a focus on **${Object.keys(wordFreq).sort((a,b)=>wordFreq[b]-wordFreq[a])[0]?.toUpperCase() || 'general documentation'}**.

---
*Note: This analysis was generated locally using pattern recognition heuristics (No Cloud AI).*`;
    };

    const handleAnalyze = async () => {
        if (files.length === 0) return;

        setIsLoading(true);
        setError(null);
        setAnalysisResult(null);
        setProgress(0);
        setProgressMessage("Extracting text locally...");

        try {
            const newDocuments: PdfDocument[] = [];
            let totalPages = 0;
            let pagesProcessed = 0;

            const pdfPromises = files.map(file => file.arrayBuffer().then(ab => pdfjsLib.getDocument(ab).promise));
            const pdfDocs = await Promise.all(pdfPromises);
            totalPages = pdfDocs.reduce((sum, pdf) => sum + pdf.numPages, 0);

            const allResults: string[] = [];

            for (const [docIndex, pdf] of pdfDocs.entries()) {
                const file = files[docIndex];
                let singleDocumentText = '';
                const numPages = pdf.numPages;

                for (let i = 1; i <= numPages; i++) {
                    pagesProcessed++;
                    setProgress(Math.round((pagesProcessed / totalPages) * 90));
                    setProgressMessage(`Extracting ${file.name} (p${i}/${numPages})...`);
                    
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    const items = textContent.items as any[];

                    if (items.length > 0) {
                        const lines: { [y: number]: any[] } = {};
                        items.forEach(item => {
                            const y = Math.round(item.transform[5]);
                            if (!lines[y]) lines[y] = [];
                            lines[y].push(item);
                        });

                        const sortedYCoords = Object.keys(lines).map(parseFloat).sort((a, b) => b - a);
                        const pageLines = sortedYCoords.map(y => {
                            return lines[y]
                                .sort((a, b) => a.transform[4] - b.transform[4])
                                .map(item => item.str)
                                .join(' ');
                        });
                        singleDocumentText += pageLines.join('\n') + '\n\n';
                    }
                }
                const cleanedDocText = cleanText(singleDocumentText);
                newDocuments.push({ name: file.name, text: cleanedDocText });
                
                // PERFORM LOCAL HEURISTIC ANALYSIS
                const result = performLocalAnalysis(cleanedDocText, file.name);
                allResults.push(`## Report: *${file.name}*\n\n${result}`);
            }

            setProgress(100);
            const combinedText = newDocuments.map(doc => `--- DOCUMENT: ${doc.name} ---\n${doc.text}`).join('\n\n');
            
            setPdfText(cleanText(combinedText));
            setDocuments(newDocuments);
            setAnalysisResult(allResults.join('\n\n\n'));
            setPdfFileName(files.length > 1 ? `${files.length} files` : files[0].name);

        } catch (err) {
            setError(err instanceof Error ? err.message : STRINGS.errorOccurred);
        } finally {
            setIsLoading(false);
            setProgressMessage(null);
            setProgress(0);
        }
    };
    
    return (
        <div className="flex flex-col items-center w-full animate-fade-in">
            <div className="w-full max-w-2xl bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl border border-slate-700">
                <h2 className="text-xl font-bold text-center mb-2 text-slate-200">{STRINGS.uploadPdf}</h2>
                <p className="text-xs text-center text-slate-500 mb-4 italic">Local Engine: Document metadata and patterns are extracted directly in your browser.</p>
                
                <label 
                    onDragEnter={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragOver={(e) => e.preventDefault()}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files) handleFilesSelected(e.dataTransfer.files); }}
                    htmlFor="pdf-upload" 
                    className={`mt-4 flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer bg-slate-800/50 hover:bg-slate-700/50 transition-all duration-300 ${isDragging ? 'border-sky-400 scale-105 shadow-2xl' : 'border-slate-600'}`}
                >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                         <svg className={`w-10 h-10 mb-3 transition-transform duration-300 ${isDragging ? 'scale-110 -translate-y-1 text-sky-400' : 'text-slate-500'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-4-4V6a4 4 0 014-4h1.586A3 3 0 0113.172 3.172L14.828 4.828A3 3 0 0116.414 5H20a2 2 0 012 2v10a2 2 0 01-2 2H7zM7 10l4 4 4-4"></path></svg>
                        <p className="mb-2 text-sm text-slate-400"><span className="font-semibold text-sky-400">{STRINGS.uploadButton}</span> {STRINGS.dropHere}</p>
                    </div>
                     <input id="pdf-upload" ref={fileInputRef} type="file" className="hidden" accept="application/pdf" multiple onChange={e => handleFilesSelected(e.target.files)} />
                </label>

                {files.length > 0 && (
                     <div className="mt-4 space-y-2">
                        <h4 className="text-sm font-semibold text-slate-300">Selected Files:</h4>
                        <ul className="max-h-32 overflow-y-auto space-y-1 pr-2 border-t border-b border-slate-700 py-2">
                            {files.map((file, index) => (
                                <li key={`${file.name}-${index}`} className="flex items-center justify-between bg-slate-700/50 p-2 rounded-md text-sm">
                                    <span className="text-slate-300 truncate" title={file.name}>{file.name}</span>
                                    <button onClick={() => removeFile(index)} className="text-slate-400 hover:text-red-400 ml-2 p-1 rounded-full focus:outline-none focus:ring-2 focus:ring-red-500" aria-label={`Remove ${file.name}`}>
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
                
                <div className="mt-6 border-t border-slate-700 pt-6">
                    <h3 className="text-lg font-semibold text-center mb-4 text-slate-300">{STRINGS.extractionOptions}</h3>
                    <div className="flex justify-center gap-8">
                        <Checkbox id="preserve-formatting" label={STRINGS.preserveFormatting} checked={preserveFormatting} onChange={e => setPreserveFormatting(e.target.checked)} />
                        {/* OCR option disabled for local-only demo unless heavy libraries are added, but we'll keep the UI for consistency */}
                        <Checkbox id="use-ocr" label={STRINGS.extractFromImages} checked={useOcr} onChange={e => setUseOcr(e.target.checked)} />
                    </div>
                </div>

                <button
                    onClick={handleAnalyze}
                    disabled={files.length === 0 || isLoading}
                    className="mt-8 w-full bg-sky-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-sky-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-all duration-300 shadow-xl"
                >
                    {isLoading ? "Processing..." : "Run Local Analysis"}
                </button>

                 {error && <p className="mt-4 text-center text-red-400 text-sm font-bold">{error}</p>}
            </div>

            {isLoading && !analysisResult && (
                <div className="mt-8 w-full max-w-2xl animate-fade-in">
                    <p className="text-center text-base font-medium text-slate-300 mb-3">{progressMessage || "Scanning document structure..."}</p>
                    <div className="w-full bg-slate-700 rounded-full h-2.5 overflow-hidden">
                        <div
                            className="bg-sky-500 h-full rounded-full transition-all duration-300 ease-linear"
                            style={{ width: `${progress}%` }}
                            role="progressbar"
                            aria-valuenow={progress}
                            aria-valuemin="0"
                            aria-valuemax="100"
                        ></div>
                    </div>
                </div>
            )}

            <ResultDisplay title="Local Extraction Results" content={analysisResult} />
        </div>
    );
};

export default AnalysisPage;
