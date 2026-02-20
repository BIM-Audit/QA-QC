
import React, { useState, useCallback, useMemo } from 'react';
import { STRINGS } from '../constants';
import Loader from '../components/Loader';
import { PdfIcon } from '../components/Icons';
import { cleanText } from '../utils/text';

declare const XLSX: any;
declare const jspdf: any;

// Milestones Constants
const MILESTONES = [
    '50% CONCEPT DESIGN',
    '100% CONCEPT DESIGN',
    '50% SCHEMATIC DESIGN',
    '100% SCHEMATIC DESIGN'
];

// Types for duplicate-aware comparison
type FileFormatCounts = Map<string, number>;
type FileDataItem = { originalCase: string; formatCounts: FileFormatCounts; milestones: Set<string> };
type FileDataMap = Map<string, FileDataItem>;
type FileUploadResult = { data: FileDataMap; totalRows: number; rawText: string } | null;

const FileUploader: React.FC<{
  title: string;
  onFileUploaded: (file: File | null, result: FileUploadResult) => void;
  nameColumns: string[];
  formatColumn: string;
  milestoneColumns?: string[];
  id: string;
  description?: React.ReactNode;
}> = ({ title, onFileUploaded, nameColumns, formatColumn, milestoneColumns, id, description }) => {
    const [file, setFile] = useState<File | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [rawTextPreview, setRawTextPreview] = useState<string>('');

    const handleFileChange = useCallback((selectedFile: File | null) => {
        if (!selectedFile) {
            setFile(null);
            setError(null);
            setRawTextPreview('');
            onFileUploaded(null, null);
            return;
        }

        const validTypes = ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'];
        if (validTypes.includes(selectedFile.type) || selectedFile.name.endsWith('.csv') || selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = event.target?.result;
                    const workbook = XLSX.read(data, { type: 'binary' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

                    if (json.length === 0) {
                        setError("File is empty.");
                        onFileUploaded(null, null);
                        setFile(null);
                        return;
                    }

                    // 1. Clean data and extract raw text simultaneously
                    let combinedText = "";
                    const cleanedJson = json.map((row: any) => {
                        const cleanedRow: any = {};
                        let rowText = "";
                        for (const key in row) {
                            const cleanKey = cleanText(key);
                            const val = row[key];
                            const cleanVal = typeof val === 'string' ? cleanText(val) : val;
                            cleanedRow[cleanKey] = cleanVal;
                            rowText += `${cleanVal} | `;
                        }
                        combinedText += rowText + "\n";
                        return cleanedRow;
                    });

                    const headers = Object.keys(cleanedJson[0] || {});
                    
                    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

                    const findHeader = (possibleNames: string[]): string | undefined => {
                        for (const name of possibleNames) {
                            const normalizedName = normalize(name);
                            const header = headers.find(h => normalize(h) === normalizedName);
                            if (header) return header;
                        }
                        return undefined;
                    };

                    const actualNameHeader = findHeader(nameColumns);
                    const actualFormatHeader = findHeader([formatColumn]);
                    
                    const actualMilestoneHeaders = new Map<string, string>();
                    if (milestoneColumns) {
                         milestoneColumns.forEach(mc => {
                            let header = findHeader([mc]);
                            if (!header) {
                                const parts = mc.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(p => p.length > 1);
                                header = headers.find(h => {
                                    const lowerH = h.toLowerCase();
                                    return parts.every(p => lowerH.includes(p));
                                });
                            }
                            if (header) actualMilestoneHeaders.set(mc, header);
                         });
                    }

                    if (!actualNameHeader) {
                        setError(`Required name column not found. Expected one of: ${nameColumns.join(', ')}.`);
                        onFileUploaded(null, null);
                        setFile(null);
                        return;
                    }
                    if (!actualFormatHeader) {
                        setError(`Column "${formatColumn}" not found.`);
                        onFileUploaded(null, null);
                        setFile(null);
                        return;
                    }
                    
                    const columnData: FileDataMap = new Map();
                    let totalRows = 0;

                    cleanedJson.forEach((row: any) => {
                        const originalBaseName = String(row[actualNameHeader]).trim();
                        if (!originalBaseName) return; 

                        totalRows++;
                        const extension = String(row[actualFormatHeader] || '').trim().replace(/^\./, '').toLowerCase();
                        const lowerCaseBaseName = originalBaseName.toLowerCase();

                        const rowMilestones = new Set<string>();
                        actualMilestoneHeaders.forEach((header, key) => {
                             const val = row[header];
                             const s = String(val === undefined || val === null ? '' : val).trim().toLowerCase();
                             const falseValues = ['no', 'false', 'n/a', '-', '0', 'nan', ''];
                             if (!falseValues.includes(s)) {
                                 rowMilestones.add(key);
                             }
                        });

                        if (!columnData.has(lowerCaseBaseName)) {
                            columnData.set(lowerCaseBaseName, { 
                                originalCase: originalBaseName, 
                                formatCounts: new Map(),
                                milestones: rowMilestones
                            });
                        } else {
                            const item = columnData.get(lowerCaseBaseName)!;
                            rowMilestones.forEach(m => item.milestones.add(m));
                        }
                        
                        if (extension) {
                            const item = columnData.get(lowerCaseBaseName)!;
                            const currentCount = item.formatCounts.get(extension) || 0;
                            item.formatCounts.set(extension, currentCount + 1);
                        }
                    });

                    setFile(selectedFile);
                    setError(null);
                    setRawTextPreview(combinedText.substring(0, 1000) + (combinedText.length > 1000 ? "..." : ""));
                    onFileUploaded(selectedFile, { data: columnData, totalRows, rawText: combinedText });

                } catch (err) {
                    console.error(err);
                    setError("Error parsing the file.");
                    onFileUploaded(null, null);
                    setFile(null);
                }
            };
            reader.onerror = () => {
                setError("Error reading the file.");
                onFileUploaded(null, null);
                setFile(null);
            };
            reader.readAsBinaryString(selectedFile);
        } else {
            setError('Please select a valid Excel or CSV file.');
            onFileUploaded(null, null);
            setFile(null);
        }
    }, [onFileUploaded, nameColumns, formatColumn, milestoneColumns]);

    const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileChange(e.dataTransfer.files[0]);
        }
    };
    
    return (
        <div className="w-full">
            <h3 className="text-lg font-semibold text-center mb-4 text-slate-300">{title}</h3>
            {description && (
                <div className="text-center text-xs text-slate-400 -mt-2 mb-3 bg-slate-700/30 p-2 rounded-md border border-slate-600">
                    {description}
                </div>
            )}
            <label htmlFor={id} onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-slate-800/50 hover:bg-slate-700/50 transition-all duration-300 ${isDragging ? 'border-sky-400' : 'border-slate-600'}`}>
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <svg className="w-8 h-8 mb-2 text-slate-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2" /></svg>
                    <p className="text-sm text-slate-400"><span className="font-semibold text-sky-400">{STRINGS.uploadButton}</span> {STRINGS.dropHere}</p>
                </div>
                <input id={id} type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={e => handleFileChange(e.target.files ? e.target.files[0] : null)} />
            </label>
            {file && (
                <div className="mt-4 space-y-2">
                    <div className="text-center text-sm text-slate-300 truncate" title={file.name}><span className="font-medium">{STRINGS.fileLabel}</span> {file.name}</div>
                    {rawTextPreview && (
                        <div className="animate-fade-in">
                            <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Extracted & Cleaned Text Sample:</p>
                            <div className="bg-slate-900/50 border border-slate-700 rounded p-2 h-20 overflow-y-auto font-mono text-[10px] text-slate-400 leading-tight">
                                {rawTextPreview}
                            </div>
                        </div>
                    )}
                </div>
            )}
            {error && <p className="mt-2 text-center text-red-400 text-sm">{error}</p>}
        </div>
    );
};

type ComparisonStatus = 'matched' | 'missing_in_acc' | 'extra_in_acc' | 'count_mismatch';
type MIDPComparisonResultItem = {
    baseName: string;
    format: string;
    status: ComparisonStatus;
    midpCount: number;
    accCount: number;
    milestones: Set<string>;
};

const MIDPCheckPage: React.FC = () => {
    const [accFile, setAccFile] = useState<File | null>(null);
    const [midpFile, setMidpFile] = useState<File | null>(null);
    const [accData, setAccData] = useState<FileUploadResult>(null);
    const [midpData, setMidpData] = useState<FileUploadResult>(null);
    const [comparisonResult, setComparisonResult] = useState<MIDPComparisonResultItem[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [filter, setFilter] = useState<ComparisonStatus | 'all'>('all');
    const [selectedMilestone, setSelectedMilestone] = useState<string>('All Milestones');
    const [selectedFormat, setSelectedFormat] = useState<string>('All Formats');

    const fileDescription = (
        <>
            Requires columns: <strong>"Model Name"</strong> or <strong>"Drawing Name"</strong> and <strong>"Format"</strong>.
            <br/>
            Optional Milestone Columns: <em>50% CONCEPT DESIGN</em>, etc.
        </>
    );

    const handleCompare = () => {
        if (!midpData?.data || !accData?.data) return;
        setIsLoading(true);
        setComparisonResult(null);
        setFilter('all');
        setSelectedFormat('All Formats');
        
        setTimeout(() => {
            const results: MIDPComparisonResultItem[] = [];
            const midpMap = midpData!.data;
            const accMap = accData!.data;

            // Gather all unique base names and formats to ensure "separated" logic
            const allBaseNames = new Set([...midpMap.keys(), ...accMap.keys()]);

            for (const lowerBaseName of allBaseNames) {
                const midpItem = midpMap.get(lowerBaseName);
                const accItem = accMap.get(lowerBaseName);
                const originalName = midpItem?.originalCase || accItem?.originalCase || lowerBaseName;

                // Merge milestones for this file
                const combinedMilestones = new Set<string>();
                midpItem?.milestones.forEach(m => combinedMilestones.add(m));
                accItem?.milestones.forEach(m => combinedMilestones.add(m));

                const allFormatsForThisBase = new Set<string>();
                midpItem?.formatCounts.forEach((_, f) => allFormatsForThisBase.add(f));
                accItem?.formatCounts.forEach((_, f) => allFormatsForThisBase.add(f));

                for (const format of allFormatsForThisBase) {
                    const midpCount = midpItem?.formatCounts.get(format) || 0;
                    const accCount = accItem?.formatCounts.get(format) || 0;

                    let status: ComparisonStatus = 'matched';
                    if (midpCount > 0 && accCount === 0) {
                        status = 'missing_in_acc';
                    } else if (midpCount === 0 && accCount > 0) {
                        status = 'extra_in_acc';
                    } else if (midpCount !== accCount) {
                        status = 'count_mismatch';
                    }

                    results.push({
                        baseName: originalName,
                        format: format.toUpperCase(),
                        midpCount,
                        accCount,
                        status,
                        milestones: combinedMilestones
                    });
                }
            }

            results.sort((a, b) => a.baseName.localeCompare(b.baseName) || a.format.localeCompare(b.format));
            setComparisonResult(results);
            setIsLoading(false);
        }, 100);
    };

    const handleExportExcel = () => {
        if (!comparisonResult) return;

        const dataToExport = comparisonResult.map(item => {
            let statusText = '';
            switch (item.status) {
                case 'matched': statusText = '✓ Matched'; break;
                case 'count_mismatch': statusText = `⚠️ Count Mismatch (MIDP: ${item.midpCount}, ACC: ${item.accCount})`; break;
                case 'missing_in_acc': statusText = '✗ Missing in ACC'; break;
                case 'extra_in_acc': statusText = '💡 Extra in ACC'; break;
            }
            
            const exportRow: Record<string, any> = {
                'File Name': item.baseName,
                'Format': item.format,
                'Status': statusText,
                'MIDP Required Count': item.midpCount,
                'ACC Actual Count': item.accCount,
            };

            MILESTONES.forEach(milestone => {
                exportRow[milestone] = item.milestones.has(milestone) ? 'Yes' : '';
            });

            return exportRow;
        });

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const cols = [{ wch: 40 }, { wch: 10 }, { wch: 40 }, { wch: 15 }, { wch: 15 }];
        MILESTONES.forEach(() => cols.push({ wch: 25 }));
        
        worksheet['!cols'] = cols;
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "MIDP Results");
        XLSX.writeFile(workbook, 'MIDP_Separated_Results.xlsx');
    };

    const handleExportPdf = () => {
        if (!comparisonResult) return;
        const doc = new jspdf.jsPDF({ orientation: 'landscape' });
        const headers = ["File Name", "Format", "Status", "MIDP Req.", "ACC Act.", "Milestones"];
        
        const body = comparisonResult.map(item => [
            item.baseName,
            item.format,
            item.status.replace(/_/g, ' ').toUpperCase(),
            item.midpCount,
            item.accCount,
            Array.from(item.milestones).join(', ')
        ]);

        doc.text("MIDP Separated Results", 14, 16);
        (doc as any).autoTable({
            startY: 20,
            head: [headers],
            body: body,
            theme: 'grid',
            headStyles: { fillColor: [30, 41, 59] },
            styles: { fontSize: 8 },
        });
        doc.save('MIDP_Separated_Results.pdf');
    };
    
    const availableFormats = useMemo(() => {
        if (!comparisonResult) return [];
        const formats = new Set<string>();
        comparisonResult.forEach(item => formats.add(item.format));
        return Array.from(formats).sort();
    }, [comparisonResult]);

    const filteredResults = useMemo(() => {
        if (!comparisonResult) return null;
        return comparisonResult.filter(item => {
            const milestoneMatch = selectedMilestone === 'All Milestones' 
                ? true 
                : (selectedMilestone === 'Empty Date' ? item.milestones.size === 0 : item.milestones.has(selectedMilestone));
            const formatMatch = selectedFormat === 'All Formats' ? true : item.format === selectedFormat;
            const statusMatch = filter === 'all' ? true : item.status === filter;
            return milestoneMatch && formatMatch && statusMatch;
        });
    }, [comparisonResult, selectedMilestone, selectedFormat, filter]);

    const summary = useMemo(() => {
        if (!comparisonResult) return null;
        return {
            all: comparisonResult.length,
            matched: comparisonResult.filter(r => r.status === 'matched').length,
            count_mismatch: comparisonResult.filter(r => r.status === 'count_mismatch').length,
            missing_in_acc: comparisonResult.filter(r => r.status === 'missing_in_acc').length,
            extra_in_acc: comparisonResult.filter(r => r.status === 'extra_in_acc').length
        };
    }, [comparisonResult]);

    const getStatusBadge = (status: ComparisonStatus) => {
        switch (status) {
            case 'matched': return <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-green-500/20 text-green-300">✓ Matched</span>;
            case 'count_mismatch': return <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-yellow-500/20 text-yellow-300">⚠️ Count Mismatch</span>;
            case 'missing_in_acc': return <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-red-500/20 text-red-300">✗ Missing in ACC</span>;
            case 'extra_in_acc': return <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-sky-500/20 text-sky-300">💡 Extra in ACC</span>;
            default: return null;
        }
    };

    return (
        <div className="flex flex-col items-center w-full animate-fade-in">
            <div className="w-full max-w-4xl bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl border border-slate-700">
                <h2 className="text-xl font-bold text-center mb-6 text-slate-200">MIDP vs ACC Comparison (Separated View)</h2>
                <div className="flex flex-col md:flex-row gap-8">
                    <FileUploader
                        id="midp-upload"
                        title={STRINGS.uploadMidpData}
                        nameColumns={["Model Name", "Drawing Name", "Name", "File Name"]}
                        formatColumn="Format"
                        milestoneColumns={MILESTONES}
                        onFileUploaded={(file, result) => { setMidpFile(file); setMidpData(result); setComparisonResult(null); }}
                        description={fileDescription}
                    />
                    <FileUploader
                        id="acc-upload"
                        title={STRINGS.uploadAccData}
                        nameColumns={["Model Name", "Drawing Name", "Name", "File Name"]}
                        formatColumn="Format"
                        milestoneColumns={MILESTONES}
                        onFileUploaded={(file, result) => { setAccFile(file); setAccData(result); setComparisonResult(null); }}
                        description={fileDescription}
                    />
                </div>
                <button
                    onClick={handleCompare}
                    disabled={!midpFile || !accFile || isLoading}
                    className="mt-8 w-full bg-sky-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-sky-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105"
                >
                    {isLoading ? STRINGS.comparingFiles : STRINGS.compareFiles}
                </button>
            </div>

            {isLoading && <div className="mt-8"><Loader text={STRINGS.comparingFiles} /></div>}

            {filteredResults && summary && (
                <div className="mt-8 w-full max-w-6xl animate-fade-in">
                    <div className="bg-slate-800 shadow-lg rounded-xl border border-slate-700">
                        <div className="p-4 sm:p-6 border-b border-slate-700">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                <div>
                                    <h3 className="text-lg font-bold text-slate-100">Comparison Results</h3>
                                    <p className="text-xs text-slate-400 mt-1">Each row represents a specific format requirement for a file.</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={handleExportExcel} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-700/50 rounded-md hover:bg-slate-700 transition-colors">
                                        Export Excel
                                    </button>
                                    <button onClick={handleExportPdf} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-700/50 rounded-md hover:bg-slate-700 transition-colors">
                                        Export PDF
                                    </button>
                                </div>
                            </div>
                            
                            <div className="flex flex-wrap gap-2 mt-6">
                                <select
                                    value={selectedMilestone}
                                    onChange={(e) => setSelectedMilestone(e.target.value)}
                                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-700/50 text-slate-300 border border-slate-600 focus:ring-2 focus:ring-sky-500"
                                >
                                    <option value="All Milestones">All Milestones</option>
                                    <option value="Empty Date">Empty Date</option>
                                    {MILESTONES.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>

                                <select
                                    value={selectedFormat}
                                    onChange={(e) => setSelectedFormat(e.target.value)}
                                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-700/50 text-slate-300 border border-slate-600 focus:ring-2 focus:ring-sky-500"
                                >
                                    <option value="All Formats">All Formats</option>
                                    {availableFormats.map(f => <option key={f} value={f}>{f}</option>)}
                                </select>

                                <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === 'all' ? 'bg-sky-600 text-white' : 'bg-slate-700/50 text-slate-400'}`}>
                                    All ({summary.all})
                                </button>
                                <button onClick={() => setFilter('matched')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === 'matched' ? 'bg-green-600 text-white' : 'bg-slate-700/50 text-slate-400'}`}>
                                    Matched ({summary.matched})
                                </button>
                                <button onClick={() => setFilter('count_mismatch')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === 'count_mismatch' ? 'bg-yellow-600 text-white' : 'bg-slate-700/50 text-slate-400'}`}>
                                    Mismatch ({summary.count_mismatch})
                                </button>
                                <button onClick={() => setFilter('missing_in_acc')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === 'missing_in_acc' ? 'bg-red-600 text-white' : 'bg-slate-700/50 text-slate-400'}`}>
                                    Missing ({summary.missing_in_acc})
                                </button>
                                <button onClick={() => setFilter('extra_in_acc')} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === 'extra_in_acc' ? 'bg-sky-600 text-white' : 'bg-slate-700/50 text-slate-400'}`}>
                                    Extra ({summary.extra_in_acc})
                                </button>
                            </div>
                        </div>

                        <div className="overflow-x-auto max-h-[60vh]">
                            <table className="w-full text-sm text-left text-slate-300">
                                <thead className="text-xs text-slate-400 uppercase bg-slate-800/50 sticky top-0">
                                    <tr>
                                        <th scope="col" className="px-6 py-3">File Name</th>
                                        <th scope="col" className="px-6 py-3">Format</th>
                                        <th scope="col" className="px-6 py-3">Status</th>
                                        <th scope="col" className="px-6 py-3 text-center">MIDP Req.</th>
                                        <th scope="col" className="px-6 py-3 text-center">ACC Act.</th>
                                        <th scope="col" className="px-6 py-3">Milestones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredResults.length > 0 ? filteredResults.map((item, index) => (
                                        <tr key={`${item.baseName}-${item.format}-${index}`} className="border-b border-slate-700 hover:bg-slate-700/30">
                                           <td className="px-6 py-4 font-mono text-xs">{item.baseName}</td>
                                           <td className="px-6 py-4"><span className="font-bold text-sky-400">{item.format}</span></td>
                                           <td className="px-6 py-4">{getStatusBadge(item.status)}</td>
                                           <td className="px-6 py-4 text-center font-mono">{item.midpCount}</td>
                                           <td className="px-6 py-4 text-center font-mono">{item.accCount}</td>
                                           <td className="px-6 py-4 text-xs whitespace-normal max-w-[200px]">
                                                {item.milestones.size > 0 ? Array.from(item.milestones).join(', ') : <span className="text-orange-500">N/A</span>}
                                           </td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={6} className="text-center py-12 text-slate-500 italic">No results match the current filter.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MIDPCheckPage;
