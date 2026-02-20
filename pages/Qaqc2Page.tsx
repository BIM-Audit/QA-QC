
import React, { useState, useCallback } from 'react';
import { STRINGS } from '../constants';
import Loader from '../components/Loader';
import { cleanText } from '../utils/text';

declare const XLSX: any;
declare const jspdf: any;

// @ts-ignore
const pdfjsLib = window.pdfjsLib;

interface Qaqc2Summary {
    fileName: string;
    status: 'Pass' | 'Fail';
    errorsCount: number;
    warningsCount: number;
    comment: string;
}

interface Qaqc2Detailed {
    fileName: string;
    segmentName: string;
    segmentValue: string;
    status: 'Correct' | 'Incorrect';
    validOptions: string;
}

interface Qaqc2Results {
    summary: Qaqc2Summary[];
    detailed: Qaqc2Detailed[];
}

const Qaqc2Page: React.FC = () => {
    const [pdfFile, setPdfFile] = useState<File | null>(null);
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<Qaqc2Results | null>(null);
    const [activeTab, setActiveTab] = useState<'summary' | 'detailed'>('summary');

    const handlePdfChange = useCallback((file: File | null) => {
        setPdfFile(file);
        setResults(null);
        setError(null);
    }, []);

    const handleCsvChange = useCallback((file: File | null) => {
        setCsvFile(file);
        setResults(null);
        setError(null);
    }, []);

    const extractTextFromPdf = async (file: File): Promise<string> => {
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

    /**
     * LOCAL VALIDATION ENGINE (Non-AI)
     * 1. Extracts potential project codes from PDF text (Uppercase alphanumeric tokens).
     * 2. Attempts to identify naming convention structure.
     * 3. Validates CSV filenames against the extracted context.
     */
    const performLocalValidation = (pdfText: string, csvData: any[]): Qaqc2Results => {
        // 1. Tokenize PDF to find valid project codes (Words that are all caps and likely from tables)
        const pdfTokens = new Set<string>();
        const words = pdfText.split(/[\s,;|]+/);
        words.forEach(word => {
            const clean = word.trim().replace(/[()[\]{}]/g, '');
            // Look for segments like "ARCH", "01", "G1", etc.
            if (clean.length > 0 && /^[A-Z0-9_-]+$/.test(clean)) {
                pdfTokens.add(clean.toUpperCase());
            }
        });

        // 2. Identify Delimiter (Usually - or _)
        const firstFileName = csvData[0]?.["File Name"] || csvData[0]?.["filename"] || "";
        const delimiter = firstFileName.includes('-') ? '-' : (firstFileName.includes('_') ? '_' : null);

        // 3. Try to detect Segment Labels from PDF (Heuristic)
        // Look for common patterns like [Project]-[Originator]...
        const structureMatch = pdfText.match(/\[([^\]]+)\](?:[-_]\[([^\]]+)\])+/);
        const labels = structureMatch ? structureMatch[0].replace(/[\[\]]/g, '').split(/[-_]/) : [];

        const summary: Qaqc2Summary[] = [];
        const detailed: Qaqc2Detailed[] = [];

        csvData.forEach(row => {
            const fullName = String(row["File Name"] || row["filename"] || "").trim();
            if (!fullName) return;

            const segments = delimiter ? fullName.split(delimiter) : [fullName];
            let errors = 0;
            const issues: string[] = [];

            segments.forEach((seg, index) => {
                const segmentName = labels[index] || `Segment ${index + 1}`;
                const isValid = pdfTokens.has(seg.toUpperCase());

                if (!isValid) {
                    errors++;
                    issues.push(`${segmentName} (${seg})`);
                }

                detailed.push({
                    fileName: fullName,
                    segmentName,
                    segmentValue: seg,
                    status: isValid ? 'Correct' : 'Incorrect',
                    validOptions: isValid ? 'Matched in PDF Rules' : 'Value not found in PDF tables/rules'
                });
            });

            summary.push({
                fileName: fullName,
                status: errors === 0 ? 'Pass' : 'Fail',
                errorsCount: errors,
                warningsCount: 0,
                comment: errors === 0 ? 'All segments matched rules.' : `Invalid: ${issues.join(', ')}`
            });
        });

        return { summary, detailed };
    };

    const processFiles = async () => {
        if (!pdfFile || !csvFile) {
            setError("Please upload both a PDF and a CSV file.");
            return;
        }

        setIsLoading(true);
        setError(null);
        setResults(null);

        try {
            const pdfText = await extractTextFromPdf(pdfFile);

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const bstr = event.target?.result;
                    const workbook = XLSX.read(bstr, { type: 'binary' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet);
                    
                    if (json.length === 0) {
                        setError('The uploaded CSV appears to be empty.');
                        setIsLoading(false);
                        return;
                    }

                    // Perform local logic instead of calling Gemini
                    const validationResults = performLocalValidation(pdfText, json);
                    setResults(validationResults);
                    setActiveTab('summary');
                } catch (err) {
                    console.error(err);
                    setError('Error processing CSV. Ensure the "File Name" column exists.');
                } finally {
                    setIsLoading(false);
                }
            };
            reader.readAsBinaryString(csvFile);

        } catch (err) {
            console.error(err);
            setError('An error occurred during file processing.');
            setIsLoading(false);
        }
    };

    const handleExportExcel = () => {
        if (!results) return;
        const workbook = XLSX.utils.book_new();
        const summaryWs = XLSX.utils.json_to_sheet(results.summary);
        XLSX.utils.book_append_sheet(workbook, summaryWs, "Summary Check");
        const detailedWs = XLSX.utils.json_to_sheet(results.detailed);
        XLSX.utils.book_append_sheet(workbook, detailedWs, "Detailed Item Breakdown");
        XLSX.writeFile(workbook, `QAQC2_Audit_${csvFile?.name || 'Report'}.xlsx`);
    };

    const FileUploader: React.FC<{
        id: string;
        label: string;
        file: File | null;
        onFileChange: (f: File | null) => void;
        accept: string;
        icon: 'pdf' | 'csv';
    }> = ({ id, label, file, onFileChange, accept, icon }) => {
        const [isDragging, setIsDragging] = useState(false);
        return (
            <div className="w-full">
                <h3 className="text-sm font-semibold text-slate-300 mb-3 text-center uppercase tracking-widest">{label}</h3>
                <label 
                    onDragEnter={() => setIsDragging(true)}
                    onDragLeave={() => setIsDragging(false)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.[0]) onFileChange(e.dataTransfer.files[0]); }}
                    htmlFor={id}
                    className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-2xl cursor-pointer bg-slate-800/30 hover:bg-slate-700/30 transition-all duration-300 ${isDragging ? 'border-sky-400 scale-[1.02]' : 'border-slate-600'}`}
                >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 border ${icon === 'pdf' ? 'bg-red-500/10 border-red-500/20' : 'bg-green-500/10 border-green-500/20'}`}>
                            {icon === 'pdf' ? (
                                <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path></svg>
                            ) : (
                                <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                            )}
                        </div>
                        <p className="text-sm text-slate-300 mb-1"><span className="font-bold text-sky-400">{STRINGS.uploadButton}</span> {STRINGS.dropHere}</p>
                        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-tight">{accept.replace('.', '')} format</p>
                    </div>
                    <input id={id} type="file" className="hidden" accept={accept} onChange={(e) => onFileChange(e.target.files?.[0] || null)} />
                </label>
                {file && (
                    <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-slate-300 font-bold bg-slate-700/50 py-1.5 px-3 rounded-lg border border-slate-600 truncate animate-fade-in">
                        <svg className="w-3 h-3 text-green-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"></path></svg>
                        {file.name}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex flex-col items-center w-full animate-fade-in max-w-6xl mx-auto">
            <div className="w-full max-w-5xl bg-slate-800 p-6 sm:p-12 rounded-3xl shadow-2xl border border-slate-700">
                <div className="flex flex-col items-center mb-10">
                    <div className="p-4 bg-sky-500/10 rounded-2xl border border-sky-500/20 mb-4 shadow-inner">
                        <svg className="w-8 h-8 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 v2M7 7h10"></path></svg>
                    </div>
                    <h2 className="text-3xl font-black text-slate-100 tracking-tight text-center">{STRINGS.qaqc2Page}</h2>
                    <p className="mt-2 text-slate-400 text-sm max-w-md text-center">Local Deterministic Audit: No Cloud AI required. Extracting naming rules and valid codes directly from your PDF source.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                    <FileUploader 
                        id="qaqc2-pdf-upload" 
                        label={STRINGS.qaqc2UploadPdf} 
                        file={pdfFile} 
                        onFileChange={handlePdfChange} 
                        accept=".pdf"
                        icon="pdf"
                    />
                    <FileUploader 
                        id="qaqc2-csv-upload" 
                        label={STRINGS.qaqc2UploadCsv} 
                        file={csvFile} 
                        onFileChange={handleCsvChange} 
                        accept=".csv"
                        icon="csv"
                    />
                </div>

                <button
                    onClick={processFiles}
                    disabled={!pdfFile || !csvFile || isLoading}
                    className="mt-12 w-full bg-sky-600 text-white font-black py-5 px-8 rounded-2xl hover:bg-sky-500 disabled:bg-slate-700/50 disabled:text-slate-500 disabled:cursor-not-allowed transition-all duration-300 shadow-2xl shadow-sky-600/30 flex items-center justify-center gap-3 uppercase tracking-widest text-sm"
                >
                    {isLoading ? <><Loader text="" /> Processing...</> : "Run Local Validation"}
                </button>

                {error && <div className="mt-8 p-5 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 text-sm font-bold text-center">{error}</div>}
            </div>

            {isLoading && !results && <div className="mt-12"><Loader text="Analyzing document structure and verifying file names..." /></div>}
            
            {results && (
                <div className="mt-10 w-full animate-fade-in space-y-6">
                    <div className="bg-slate-800 rounded-3xl border border-slate-700 shadow-2xl overflow-hidden">
                        <div className="p-6 sm:p-8 border-b border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <h3 className="text-xl font-black text-slate-100 uppercase tracking-tight">Audit Results</h3>
                                <p className="text-sm text-slate-400 mt-1">Verified locally against patterns found in {pdfFile?.name}.</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleExportExcel} className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded-xl text-xs font-bold text-slate-200 transition-all">
                                    Export Audit Report
                                </button>
                            </div>
                        </div>

                        <div className="flex border-b border-slate-700">
                            <button
                                onClick={() => setActiveTab('summary')}
                                className={`px-8 py-4 text-sm font-black uppercase tracking-widest transition-all ${activeTab === 'summary' ? 'text-sky-400 bg-slate-900/50 border-b-2 border-sky-400' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                Tab 1: Summary Check
                            </button>
                            <button
                                onClick={() => setActiveTab('detailed')}
                                className={`px-8 py-4 text-sm font-black uppercase tracking-widest transition-all ${activeTab === 'detailed' ? 'text-sky-400 bg-slate-900/50 border-b-2 border-sky-400' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                Tab 2: Item Breakdown
                            </button>
                        </div>

                        <div className="overflow-x-auto max-h-[600px] bg-slate-900/20">
                            {activeTab === 'summary' ? (
                                <table className="w-full text-sm text-left text-slate-300">
                                    <thead className="text-[10px] text-slate-500 uppercase font-black bg-slate-900/50 sticky top-0 backdrop-blur z-10">
                                        <tr>
                                            <th className="px-8 py-4">File Name</th>
                                            <th className="px-8 py-4">Overall Status</th>
                                            <th className="px-8 py-4 text-center">Errors</th>
                                            <th className="px-8 py-4 text-center">Warnings</th>
                                            <th className="px-8 py-4">Comment</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700/30">
                                        {results.summary.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-slate-700/20 transition-colors">
                                                <td className="px-8 py-4 font-mono text-xs">{row.fileName}</td>
                                                <td className="px-8 py-4">
                                                    <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${row.status === 'Pass' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                                                        {row.status}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-4 text-center font-bold text-slate-400">{row.errorsCount}</td>
                                                <td className="px-8 py-4 text-center font-bold text-slate-500">{row.warningsCount}</td>
                                                <td className="px-8 py-4 text-xs italic text-slate-400">{row.comment}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <table className="w-full text-sm text-left text-slate-300">
                                    <thead className="text-[10px] text-slate-500 uppercase font-black bg-slate-900/50 sticky top-0 backdrop-blur z-10">
                                        <tr>
                                            <th className="px-8 py-4">File Name</th>
                                            <th className="px-8 py-4">Segment Name</th>
                                            <th className="px-8 py-4">Segment Value</th>
                                            <th className="px-8 py-4">Status</th>
                                            <th className="px-8 py-4">Expected/Valid Rules</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700/30">
                                        {results.detailed.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-slate-700/20 transition-colors">
                                                <td className="px-8 py-4 font-mono text-[10px] text-slate-500 truncate max-w-[150px]" title={row.fileName}>{row.fileName}</td>
                                                <td className="px-8 py-4 font-bold text-slate-300">{row.segmentName}</td>
                                                <td className="px-8 py-4 font-mono text-xs text-sky-400">{row.segmentValue}</td>
                                                <td className="px-8 py-4">
                                                     <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.status === 'Correct' ? 'text-green-500' : 'text-red-500'}`}>
                                                        {row.status}
                                                    </span>
                                                </td>
                                                <td className="px-8 py-4 text-xs leading-relaxed max-w-sm">{row.validOptions}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Qaqc2Page;
