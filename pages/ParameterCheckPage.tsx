
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { STRINGS } from '../constants';
import Loader from '../components/Loader';
import type { ParameterCheckResult } from '../types';

declare const XLSX: any;
declare const jspdf: any;

type SourceFileSummary = {
  sourceFile: string;
  totalElements: number;
  filledCells: number;
  emptyCells: number;
  completionPercentage: number;
  filledPercentage: number;
  emptyPercentage: number;
};

type ComplianceResult = {
    matched: string[];
    missing: string[];
    extra: string[];
    complianceScore: number;
};

const TabButton: React.FC<{
    isActive: boolean;
    onClick: () => void;
    children: React.ReactNode;
}> = ({ isActive, onClick, children }) => {
    const baseClasses = "px-4 sm:px-6 py-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-500 whitespace-nowrap";
    const activeClasses = "text-white border-b-2 border-sky-500 bg-slate-800/50";
    const inactiveClasses = "text-slate-400 hover:text-white border-b-2 border-transparent";
    return <button onClick={onClick} className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}>{children}</button>;
};

// Helper component for File Upload to reduce duplication
const FileUploadArea: React.FC<{
    id: string;
    label: string;
    subLabel?: string;
    file: File | null;
    onFileChange: (file: File | null) => void;
}> = ({ id, label, subLabel, file, onFileChange }) => {
    const [isDragging, setIsDragging] = useState(false);

    const handleDragEnter = useCallback((e: React.DragEvent<HTMLLabelElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }, []);
    const handleDragOver = useCallback((e: React.DragEvent<HTMLLabelElement>) => { e.preventDefault(); e.stopPropagation(); }, []);
    const handleDragLeave = useCallback((e: React.DragEvent<HTMLLabelElement>) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); }, []);
    const handleDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
        e.preventDefault(); e.stopPropagation(); setIsDragging(false);
        if (e.dataTransfer.files?.[0]) validateAndSetFile(e.dataTransfer.files[0]);
    }, []);

    const validateAndSetFile = (selectedFile: File | null) => {
        if (!selectedFile) {
            onFileChange(null);
            return;
        }
        const validTypes = [ 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv' ];
        if (validTypes.includes(selectedFile.type) || selectedFile.name.endsWith('.csv') || selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
            onFileChange(selectedFile);
        } else {
            alert('Please select a valid Excel or CSV file.'); // Simple alert for invalid type in sub-component
            onFileChange(null);
        }
    };

    return (
        <div className="w-full">
            <h4 className="text-sm font-semibold text-slate-300 mb-2 text-center">{label}</h4>
            <label
                onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                htmlFor={id}
                className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer bg-slate-800/50 hover:bg-slate-700/50 transition-all duration-300 ${isDragging ? 'border-sky-400 scale-105' : 'border-slate-600'}`}
            >
                <div className="flex flex-col items-center justify-center pt-5 pb-6 px-2 text-center">
                    <svg className="w-8 h-8 mb-2 text-slate-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2" /></svg>
                    <p className="text-xs text-slate-400"><span className="font-semibold text-sky-400">Click</span> or drop file</p>
                    {subLabel && <p className="text-[10px] text-slate-500 mt-1">{subLabel}</p>}
                </div>
                <input id={id} type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={e => validateAndSetFile(e.target.files ? e.target.files[0] : null)} />
            </label>
            {file && <div className="mt-2 text-center text-xs text-slate-300 truncate" title={file.name}><span className="font-medium">Selected:</span> {file.name}</div>}
        </div>
    );
};

const ParameterCheckPage: React.FC = () => {
    // File states
    const [dataFile, setDataFile] = useState<File | null>(null);
    const [loinFile, setLoinFile] = useState<File | null>(null);
    
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Data states
    const [analysisSummary, setAnalysisSummary] = useState<ParameterCheckResult[] | null>(null);
    const [sourceFileSummary, setSourceFileSummary] = useState<SourceFileSummary[] | null>(null);
    const [complianceResult, setComplianceResult] = useState<ComplianceResult | null>(null);
    const [totalElements, setTotalElements] = useState<number>(0);

    // UI states
    const [activeTab, setActiveTab] = useState<'parameters' | 'sourceFiles' | 'analysis' | 'compliance'>('parameters');
    const [selectedParameter, setSelectedParameter] = useState('all');
    const [isParameterFilterOpen, setIsParameterFilterOpen] = useState(false);
    const [parameterSearchTerm, setParameterSearchTerm] = useState('');
    const [complianceFilter, setComplianceFilter] = useState<'all' | 'matched' | 'missing' | 'extra'>('all');
    const [complianceSearchTerm, setComplianceSearchTerm] = useState('');
    const filterRef = useRef<HTMLDivElement>(null);

    // Effect to handle clicks outside the custom dropdown
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
                setIsParameterFilterOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);
    
    const resetState = () => {
        setAnalysisSummary(null);
        setSourceFileSummary(null);
        setComplianceResult(null);
        setTotalElements(0);
        setSelectedParameter('all');
        setParameterSearchTerm('');
        setIsParameterFilterOpen(false);
        setComplianceFilter('all');
        setComplianceSearchTerm('');
        setActiveTab('parameters');
    };

    const handleDataFileChange = (selectedFile: File | null) => {
        setDataFile(selectedFile);
        setError(null);
        resetState();
    };

    const handleLoinFileChange = (selectedFile: File | null) => {
        setLoinFile(selectedFile);
        setError(null);
        resetState();
    };

    const readExcelFile = (file: File): Promise<any[]> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = event.target?.result;
                    const workbook = XLSX.read(data, { type: 'binary', cellNF: false, cellText: false });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                    resolve(json);
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = (err) => reject(err);
            reader.readAsBinaryString(file);
        });
    };

    const handleAnalyze = async () => {
        if (!dataFile) return;

        setIsLoading(true);
        setError(null);
        resetState();

        try {
            // 1. Process Main Data File
            const jsonData = await readExcelFile(dataFile);

            if (jsonData.length === 0) {
                throw new Error("The selected data file is empty.");
            }
            
            const totalRows = jsonData.length;
            setTotalElements(totalRows);

            const allHeaders = Object.keys(jsonData[0]);
            const excludedColumns = ['category name', 'element id', 'source file', 'file name'];
            const analyzableHeaders = allHeaders.filter(h => !excludedColumns.includes(h.toLowerCase()));

            // --- Source File Analysis ---
            const sourceFileHeader = allHeaders.find(h => h.toLowerCase() === 'source file' || h.toLowerCase() === 'file name');
            if (!sourceFileHeader) {
                throw new Error('A "Source File" or "File Name" column is required in the Model Data File.');
            }
            
            // --- Process LOIN File (if uploaded) for Compliance ---
            if (loinFile) {
                const standardData = await readExcelFile(loinFile);
                if (standardData.length > 0) {
                    let standardParams: string[] = [];
                    const loinHeaders = Object.keys(standardData[0]);
                    
                    // Check if "LOIN Parameter" column exists (case insensitive)
                    const loinParamHeader = loinHeaders.find(h => h.trim().toLowerCase() === 'loin parameter');

                    if (loinParamHeader) {
                        // Interpretation: The parameters are listed in the rows of this column
                         const paramSet = new Set<string>();
                         standardData.forEach(row => {
                             const val = String(row[loinParamHeader] || '').trim();
                             if (val) paramSet.add(val);
                         });
                         standardParams = Array.from(paramSet);
                    } else {
                        // Fallback: Headers are the parameters (Template style)
                        standardParams = loinHeaders.filter(h => !excludedColumns.includes(h.toLowerCase()));
                    }
                    
                    // Normalization for comparison: Case Sensitive (only trim)
                    const normalize = (s: string) => s.trim();
                    
                    const dataHeaderSet = new Set<string>();
                    analyzableHeaders.forEach(h => dataHeaderSet.add(normalize(h)));

                    const standardParamSet = new Set<string>();
                    standardParams.forEach(p => standardParamSet.add(normalize(p)));
                    
                    const matched: string[] = [];
                    const missing: string[] = [];
                    const extra: string[] = [];

                    // Find Matched and Missing (Based on LOIN file)
                    standardParams.forEach(stdP => {
                        const normStd = normalize(stdP);
                        if (dataHeaderSet.has(normStd)) {
                            matched.push(stdP);
                        } else {
                            missing.push(stdP);
                        }
                    });

                    // Find Extra (In Data but not in LOIN)
                    analyzableHeaders.forEach(dataP => {
                        const normData = normalize(dataP);
                        if (!standardParamSet.has(normData)) {
                            extra.push(dataP);
                        }
                    });

                    const totalExpected = standardParams.length;
                    // If no parameters are expected, and we found no matches, score depends on context. 
                    // Here, if expected > 0, calculate %, otherwise 100% if we truly have nothing to check against.
                    const complianceScore = totalExpected > 0 ? (matched.length / totalExpected) * 100 : (matched.length > 0 ? 100 : 0);

                    setComplianceResult({
                        matched: matched.sort((a, b) => a.localeCompare(b)),
                        missing: missing.sort((a, b) => a.localeCompare(b)),
                        extra: extra.sort((a, b) => a.localeCompare(b)),
                        complianceScore
                    });
                    // Auto switch to compliance tab if LOIN file is uploaded
                    setActiveTab('compliance');
                }
            }


            const uniqueSourceFiles = [...new Set(jsonData.map(row => String(row[sourceFileHeader] || '').trim()).filter(Boolean))];

            const perSourceSummary = uniqueSourceFiles.map(sf => {
                const rowsForFile = jsonData.filter(row => String(row[sourceFileHeader] || '').trim() === sf);
                if (rowsForFile.length === 0) return null;

                let filledParamCells = 0;
                let emptyParamCells = 0;

                rowsForFile.forEach(row => {
                    analyzableHeaders.forEach(header => {
                        const value = row[header];
                        if (value !== null && value !== undefined && String(value).trim() !== '') {
                            filledParamCells++;
                        } else {
                            emptyParamCells++;
                        }
                    });
                });
                
                const totalParamCells = filledParamCells + emptyParamCells;
                const filledPercentage = totalParamCells > 0 ? (filledParamCells / totalParamCells) * 100 : 0;
                const emptyPercentage = totalParamCells > 0 ? (emptyParamCells / totalParamCells) * 100 : 0;
                
                return { 
                    sourceFile: sf, 
                    totalElements: rowsForFile.length, 
                    filledCells: filledParamCells, 
                    emptyCells: emptyParamCells, 
                    completionPercentage: filledPercentage,
                    filledPercentage,
                    emptyPercentage,
                };
            }).filter((item): item is SourceFileSummary => item !== null);

            setSourceFileSummary(perSourceSummary);

            // --- Global Parameter Analysis ---
            const summary = analyzableHeaders.map(header => {
                const filledCount = jsonData.reduce((count, row) => {
                    const value = row[header];
                    return (value !== null && value !== undefined && String(value).trim() !== '') ? count + 1 : count;
                }, 0);
                return {
                    parameter: header,
                    filled: filledCount,
                    empty: totalRows - filledCount,
                    percentage: totalRows > 0 ? (filledCount / totalRows) * 100 : 0,
                };
            });
            setAnalysisSummary(summary);

        } catch (err) {
            setError(err instanceof Error ? err.message : "An error occurred while analyzing the files.");
        } finally {
            setIsLoading(false);
        }
    };
    
    // State checks for rendering
    const hasResults = analysisSummary && sourceFileSummary;
    
     const parameterNames = useMemo(() => {
        if (!analysisSummary) return [];
        return analysisSummary.map(item => item.parameter).sort((a, b) => a.localeCompare(b));
    }, [analysisSummary]);

    const filteredParameterNames = useMemo(() => parameterNames.filter(name => name.toLowerCase().includes(parameterSearchTerm.toLowerCase())), [parameterNames, parameterSearchTerm]);
    const filteredAnalysisResult = useMemo(() => {
        if (!analysisSummary) return null;
        if (selectedParameter === 'all') return analysisSummary;
        return analysisSummary.filter(item => item.parameter === selectedParameter);
    }, [analysisSummary, selectedParameter]);

    const handleSelectParameter = (parameter: string) => {
        setSelectedParameter(parameter);
        setIsParameterFilterOpen(false);
        setParameterSearchTerm('');
    };

    const handleExport = (format: 'excel' | 'pdf') => {
        if (!dataFile) return;

        const baseFileName = dataFile.name.split('.').slice(0, -1).join('.');
        const doc = format === 'pdf' ? new jspdf.jsPDF({ orientation: 'landscape' }) : null;

        if (activeTab === 'compliance' && complianceResult) {
            // Flatten compliance data for export (export all regardless of filter for now)
            const exportRows: any[] = [];
            complianceResult.missing.forEach(p => exportRows.push({ Parameter: p, Status: 'Missing', Detail: 'Required but not found in data' }));
            complianceResult.extra.forEach(p => exportRows.push({ Parameter: p, Status: 'Extra', Detail: 'Found in data but not in LOIN' }));
            complianceResult.matched.forEach(p => exportRows.push({ Parameter: p, Status: 'Matched', Detail: 'Present in both' }));

             if (format === 'excel') {
                const ws = XLSX.utils.json_to_sheet(exportRows);
                ws['!cols'] = [{ wch: 40 }, { wch: 15 }, { wch: 40 }];
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Parameter Compliance');
                XLSX.writeFile(wb, `${baseFileName}_Compliance_Report.xlsx`);
            } else if (doc) {
                doc.text(`Parameter Compliance (Score: ${complianceResult.complianceScore.toFixed(1)}%)`, 14, 16);
                (doc as any).autoTable({
                    startY: 22,
                    head: [Object.keys(exportRows[0])],
                    body: exportRows.map(Object.values),
                    headStyles: { fillColor: [30, 41, 59] }
                });
                doc.save(`${baseFileName}_Compliance_Report.pdf`);
            }

        } else if (activeTab === 'parameters' && filteredAnalysisResult) {
            const dataToExport = filteredAnalysisResult.map(item => ({
                [STRINGS.parameter]: item.parameter,
                [STRINGS.filled]: item.filled,
                [STRINGS.empty]: item.empty,
                [`${STRINGS.percentageFilled} (%)`]: item.percentage.toFixed(2),
            }));
            if (format === 'excel') {
                const ws = XLSX.utils.json_to_sheet(dataToExport);
                ws['!cols'] = [{ wch: 40 }, { wch: 10 }, { wch: 10 }, { wch: 20 }];
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Parameter Summary');
                XLSX.writeFile(wb, `${baseFileName}_Parameter_Summary.xlsx`);
            } else if (doc) {
                doc.text("Parameter Completion Analysis", 14, 16);
                (doc as any).autoTable({
                    startY: 22,
                    head: [Object.keys(dataToExport[0])],
                    body: dataToExport.map(Object.values),
                });
                doc.save(`${baseFileName}_Parameter_Summary.pdf`);
            }
        } else if (activeTab === 'sourceFiles' && sourceFileSummary) {
            const dataToExport = sourceFileSummary.map(item => ({
                'Source File': item.sourceFile,
                'Total Elements': item.totalElements,
                'Filled Parameters': item.filledCells,
                'Empty Parameters': item.emptyCells,
                'Completion (%)': item.completionPercentage.toFixed(2),
            }));
            if (format === 'excel') {
                const ws = XLSX.utils.json_to_sheet(dataToExport);
                ws['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 15 }];
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Source File Summary');
                XLSX.writeFile(wb, `${baseFileName}_SourceFile_Summary.xlsx`);
            } else if (doc) {
                doc.text("Source File Analysis", 14, 16);
                (doc as any).autoTable({
                    startY: 22,
                    head: [Object.keys(dataToExport[0])],
                    body: dataToExport.map(Object.values),
                });
                doc.save(`${baseFileName}_SourceFile_Summary.pdf`);
            }
        }
    };


    return (
        <div className="flex flex-col items-center w-full animate-fade-in">
            <div className="w-full max-w-4xl bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl border border-slate-700">
                <h2 className="text-xl font-bold text-center mb-2 text-slate-200">{STRINGS.uploadParamFile}</h2>
                <div className="text-center text-xs text-slate-400 mb-6 bg-slate-700/30 p-2 rounded-md border border-slate-600">
                    <p><strong>1. LOIN Parameter File:</strong> Contains the list of required parameters.</p>
                    <p className="text-[10px] text-slate-500 mt-1">Supported formats: A list in a column named "LOIN Parameter", OR a template file with headers.</p>
                    <p className="mt-2"><strong>2. Model Data File:</strong> The Excel export from the model to be checked.</p>
                </div>
                
                <div className="flex flex-col md:flex-row gap-8">
                    <FileUploadArea 
                        id="loin-upload" 
                        label="1. LOIN Parameter File" 
                        subLabel="Standard/Required Parameters"
                        file={loinFile} 
                        onFileChange={handleLoinFileChange} 
                    />
                    <FileUploadArea 
                        id="data-upload" 
                        label="2. Model Data File" 
                        subLabel="File to check"
                        file={dataFile} 
                        onFileChange={handleDataFileChange} 
                    />
                </div>

                <button onClick={handleAnalyze} disabled={!dataFile || isLoading} className="mt-8 w-full bg-sky-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-sky-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 focus:ring-offset-slate-900">
                    {isLoading ? STRINGS.analyzingParameters : STRINGS.analyzeParameters}
                </button>
                {error && <p className="mt-4 text-center text-red-400">{error}</p>}
            </div>

            {isLoading && <div className="mt-8"><Loader text={STRINGS.analyzingParameters} /></div>}

            {hasResults && (
                 <div className="mt-8 w-full max-w-6xl animate-fade-in">
                    <div className="bg-slate-800 shadow-lg rounded-xl border border-slate-700">
                        {/* TABS */}
                        <div className="flex border-b border-slate-700 overflow-x-auto">
                            {complianceResult && (
                                <TabButton isActive={activeTab === 'compliance'} onClick={() => setActiveTab('compliance')}>
                                    Parameter Compliance
                                </TabButton>
                            )}
                            <TabButton isActive={activeTab === 'parameters'} onClick={() => setActiveTab('parameters')}>
                                Parameter Completion
                            </TabButton>
                            <TabButton isActive={activeTab === 'sourceFiles'} onClick={() => setActiveTab('sourceFiles')}>
                                Source File Analysis
                            </TabButton>
                            <TabButton isActive={activeTab === 'analysis'} onClick={() => setActiveTab('analysis')}>
                                {STRINGS.analysisTab}
                            </TabButton>
                        </div>
                        
                        {/* COMPLIANCE TAB */}
                        {activeTab === 'compliance' && complianceResult && (
                            <div>
                                <div className="p-4 sm:p-6 border-b border-slate-700">
                                    <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
                                        <div className="w-full md:w-auto">
                                            <h3 className="text-lg font-bold text-slate-100">Parameter Compliance Check</h3>
                                            <div className="flex flex-wrap gap-2 mt-2 text-sm">
                                                <button onClick={() => setComplianceFilter('all')} className={`px-3 py-1 rounded-md font-medium transition-colors ${complianceFilter === 'all' ? 'bg-slate-600 text-white' : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700'}`}>All</button>
                                                <button onClick={() => setComplianceFilter('matched')} className={`px-3 py-1 rounded-md font-medium transition-colors ${complianceFilter === 'matched' ? 'bg-green-500/30 text-green-300 border border-green-500/50' : 'bg-slate-700/50 text-green-400 hover:bg-slate-700 border border-transparent'}`}>Matched: {complianceResult.matched.length}</button>
                                                <button onClick={() => setComplianceFilter('missing')} className={`px-3 py-1 rounded-md font-medium transition-colors ${complianceFilter === 'missing' ? 'bg-red-500/30 text-red-300 border border-red-500/50' : 'bg-slate-700/50 text-red-400 hover:bg-slate-700 border border-transparent'}`}>Missing: {complianceResult.missing.length}</button>
                                                <button onClick={() => setComplianceFilter('extra')} className={`px-3 py-1 rounded-md font-medium transition-colors ${complianceFilter === 'extra' ? 'bg-sky-500/30 text-sky-300 border border-sky-500/50' : 'bg-slate-700/50 text-sky-400 hover:bg-slate-700 border border-transparent'}`}>Extra: {complianceResult.extra.length}</button>
                                            </div>
                                            
                                            <div className="mt-3">
                                                <div className="relative">
                                                    <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                                        <svg className="w-4 h-4 text-slate-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
                                                            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z"/>
                                                        </svg>
                                                    </div>
                                                    <input 
                                                        type="text" 
                                                        className="block w-full p-2 pl-10 text-sm text-slate-200 border border-slate-600 rounded-lg bg-slate-700 focus:ring-sky-500 focus:border-sky-500 placeholder-slate-400" 
                                                        placeholder="Search compliance parameters..." 
                                                        value={complianceSearchTerm}
                                                        onChange={(e) => setComplianceSearchTerm(e.target.value)}
                                                    />
                                                </div>
                                            </div>

                                            <div className="mt-2 text-xs text-slate-400">Compliance Score: <span className="text-slate-200 font-bold">{complianceResult.complianceScore.toFixed(1)}%</span></div>
                                        </div>
                                        <div className="flex gap-2">
                                             <button onClick={() => handleExport('excel')} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-200 bg-slate-700/50 rounded-md hover:bg-slate-700 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3 1h10v2H5V6zm0 3h10v2H5V9zm0 3h10v2H5v-2z" /></svg>{STRINGS.exportExcel}</button>
                                            <button onClick={() => handleExport('pdf')} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-200 bg-slate-700/50 rounded-md hover:bg-slate-700 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0v12h8V4H6z" clipRule="evenodd" /><path d="M8 8h4v1H8V8zm0 2h4v1H8v-1zm0 2h2v1H8v-1z" /></svg>{STRINGS.exportPdf}</button>
                                        </div>
                                    </div>
                                </div>
                                <div className="overflow-x-auto max-h-[60vh]">
                                    <table className="w-full text-sm text-left text-slate-300">
                                        <thead className="text-xs text-slate-400 uppercase bg-slate-800/50 sticky top-0">
                                            <tr>
                                                <th scope="col" className="px-6 py-3">Parameter Name</th>
                                                <th scope="col" className="px-6 py-3">Status</th>
                                                <th scope="col" className="px-6 py-3">Detail</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {/* Missing */}
                                            {(complianceFilter === 'all' || complianceFilter === 'missing') && complianceResult.missing.filter(p => p.toLowerCase().includes(complianceSearchTerm.toLowerCase())).map(p => (
                                                <tr key={`missing-${p}`} className="border-b border-slate-700 hover:bg-slate-700/30">
                                                    <td className="px-6 py-4 font-medium text-red-300">{p}</td>
                                                    <td className="px-6 py-4"><span className="px-2 py-0.5 text-xs rounded-full bg-red-500/20 text-red-300 border border-red-500/30">Missing</span></td>
                                                    <td className="px-6 py-4 text-slate-400">Required in LOIN but not found in Data</td>
                                                </tr>
                                            ))}
                                            {/* Extra */}
                                            {(complianceFilter === 'all' || complianceFilter === 'extra') && complianceResult.extra.filter(p => p.toLowerCase().includes(complianceSearchTerm.toLowerCase())).map(p => (
                                                <tr key={`extra-${p}`} className="border-b border-slate-700 hover:bg-slate-700/30">
                                                    <td className="px-6 py-4 font-medium text-sky-300">{p}</td>
                                                    <td className="px-6 py-4"><span className="px-2 py-0.5 text-xs rounded-full bg-sky-500/20 text-sky-300 border border-sky-500/30">Extra</span></td>
                                                    <td className="px-6 py-4 text-slate-400">Found in Data but not in LOIN</td>
                                                </tr>
                                            ))}
                                            {/* Matched */}
                                            {(complianceFilter === 'all' || complianceFilter === 'matched') && complianceResult.matched.filter(p => p.toLowerCase().includes(complianceSearchTerm.toLowerCase())).map(p => (
                                                <tr key={`matched-${p}`} className="border-b border-slate-700 hover:bg-slate-700/30">
                                                    <td className="px-6 py-4 font-medium text-green-300">{p}</td>
                                                    <td className="px-6 py-4"><span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-300 border border-green-500/30">Matched</span></td>
                                                    <td className="px-6 py-4 text-slate-400">Present in both</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* PARAMETER COMPLETION TAB */}
                        {activeTab === 'parameters' && filteredAnalysisResult && (
                            <div>
                                <div className="p-4 sm:p-6 border-b border-slate-700">
                                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                                        <div>
                                            <h3 className="text-lg font-bold text-slate-100">{STRINGS.parameterAnalysisTitle}</h3>
                                            <p className="text-sm text-slate-400 mt-1">Showing analysis for <span className="font-semibold text-slate-300">{totalElements.toLocaleString()}</span> total elements.</p>
                                        </div>
                                        <div className="flex gap-2">
                                             <button onClick={() => handleExport('excel')} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-200 bg-slate-700/50 rounded-md hover:bg-slate-700 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3 1h10v2H5V6zm0 3h10v2H5V9zm0 3h10v2H5v-2z" /></svg>{STRINGS.exportExcel}</button>
                                            <button onClick={() => handleExport('pdf')} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-200 bg-slate-700/50 rounded-md hover:bg-slate-700 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0v12h8V4H6z" clipRule="evenodd" /><path d="M8 8h4v1H8V8zm0 2h4v1H8v-1zm0 2h2v1H8v-1z" /></svg>{STRINGS.exportPdf}</button>
                                        </div>
                                    </div>
                                    <div className="mt-4 relative" ref={filterRef}>
                                        <label htmlFor="parameter-filter-button" className="sr-only">{STRINGS.filterByParameter}</label>
                                        <button id="parameter-filter-button" type="button" onClick={() => setIsParameterFilterOpen(!isParameterFilterOpen)} className="bg-slate-700 border border-slate-600 text-slate-200 text-sm rounded-lg focus:ring-sky-500 focus:border-sky-500 block w-full p-2.5 text-left flex justify-between items-center" aria-haspopup="listbox" aria-expanded={isParameterFilterOpen}>
                                            <span className="truncate">{selectedParameter === 'all' ? STRINGS.allParameters : selectedParameter}</span>
                                            <svg className={`w-4 h-4 ml-2 transition-transform transform ${isParameterFilterOpen ? 'rotate-180' : 'rotate-0'}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                        </button>
                                        {isParameterFilterOpen && (<div className="absolute z-10 mt-1 w-full bg-slate-700 border border-slate-600 rounded-lg shadow-lg"><div className="p-2"><input type="text" placeholder="Search parameters..." value={parameterSearchTerm} onChange={(e) => setParameterSearchTerm(e.target.value)} className="w-full bg-slate-800 border border-slate-600 rounded-md p-2 text-sm text-slate-200 focus:ring-sky-500 focus:border-sky-500" autoFocus /></div><ul className="max-h-60 overflow-y-auto"><li onClick={() => handleSelectParameter('all')} className="cursor-pointer px-4 py-2 text-sm text-slate-200 hover:bg-slate-600" role="option" aria-selected={selectedParameter === 'all'}>{STRINGS.allParameters}</li>{filteredParameterNames.map(name => (<li key={name} onClick={() => handleSelectParameter(name)} className="cursor-pointer px-4 py-2 text-sm text-slate-200 hover:bg-slate-600" role="option" aria-selected={selectedParameter === name}>{name}</li>))}{filteredParameterNames.length === 0 && (<li className="px-4 py-2 text-sm text-slate-400">No parameters found.</li>)}</ul></div>)}
                                    </div>
                                </div>
                                <div className="overflow-x-auto max-h-[60vh]">
                                    <table className="w-full text-sm text-left text-slate-300">
                                        <thead className="text-xs text-slate-400 uppercase bg-slate-800/50 sticky top-0"><tr><th scope="col" className="px-6 py-3 min-w-[200px]">{STRINGS.parameter}</th><th scope="col" className="px-6 py-3">{STRINGS.filled}</th><th scope="col" className="px-6 py-3">{STRINGS.empty}</th><th scope="col" className="px-6 py-3 min-w-[200px]">{STRINGS.percentageFilled}</th></tr></thead>
                                        <tbody>
                                            {filteredAnalysisResult.length > 0 ? (filteredAnalysisResult.map(item => (<tr key={item.parameter} className="border-b border-slate-700 hover:bg-slate-700/30"><td className="px-6 py-4 font-medium whitespace-nowrap">{item.parameter}</td><td className="px-6 py-4 text-green-400">{item.filled.toLocaleString()}</td><td className="px-6 py-4 text-red-400">{item.empty.toLocaleString()}</td><td className="px-6 py-4"><div className="flex items-center gap-4"><div className="w-full bg-slate-700 rounded-full h-2.5"><div className="bg-sky-500 h-2.5 rounded-full" style={{ width: `${item.percentage}%` }}></div></div><span className="font-mono text-xs w-16 text-right">{item.percentage.toFixed(2)}%</span></div></td></tr>))) : (<tr><td colSpan={4} className="text-center py-8 text-slate-400">No parameters match the current filter.</td></tr>)}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* SOURCE FILE TAB */}
                        {activeTab === 'sourceFiles' && (
                             <div>
                                <div className="p-4 sm:p-6 border-b border-slate-700">
                                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                                        <div>
                                            <h3 className="text-lg font-bold text-slate-100">Source File Analysis</h3>
                                            <p className="text-sm text-slate-400 mt-1">Showing analysis for <span className="font-semibold text-slate-300">{sourceFileSummary.length}</span> unique source files.</p>
                                        </div>
                                         <div className="flex gap-2">
                                            <button onClick={() => handleExport('excel')} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-200 bg-slate-700/50 rounded-md hover:bg-slate-700 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3 1h10v2H5V6zm0 3h10v2H5V9zm0 3h10v2H5v-2z" /></svg>{STRINGS.exportExcel}</button>
                                            <button onClick={() => handleExport('pdf')} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-200 bg-slate-700/50 rounded-md hover:bg-slate-700 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0v12h8V4H6z" clipRule="evenodd" /><path d="M8 8h4v1H8V8zm0 2h4v1H8v-1zm0 2h2v1H8v-1z" /></svg>{STRINGS.exportPdf}</button>
                                        </div>
                                    </div>
                                </div>
                                <div className="overflow-x-auto max-h-[60vh]">
                                    <table className="w-full text-sm text-left text-slate-300">
                                        <thead className="text-xs text-slate-400 uppercase bg-slate-800/50 sticky top-0">
                                            <tr>
                                                <th scope="col" className="px-6 py-3">Source File</th>
                                                <th scope="col" className="px-6 py-3">Total Elements</th>
                                                <th scope="col" className="px-6 py-3">Filled Parameters</th>
                                                <th scope="col" className="px-6 py-3">Empty Parameters</th>
                                                <th scope="col" className="px-6 py-3 min-w-[200px]">Completion</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sourceFileSummary.map(item => (
                                                <tr key={item.sourceFile} className="border-b border-slate-700 hover:bg-slate-700/30">
                                                    <td className="px-6 py-4 font-medium whitespace-nowrap">{item.sourceFile}</td>
                                                    <td className="px-6 py-4">{item.totalElements.toLocaleString()}</td>
                                                    <td className="px-6 py-4 text-green-400">{item.filledCells.toLocaleString()}</td>
                                                    <td className="px-6 py-4 text-red-400">{item.emptyCells.toLocaleString()}</td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-full bg-slate-700 rounded-full h-2.5">
                                                                <div className="bg-sky-500 h-2.5 rounded-full" style={{ width: `${item.completionPercentage}%` }}></div>
                                                            </div>
                                                            <span className="font-mono text-xs w-16 text-right">{item.completionPercentage.toFixed(2)}%</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* ANALYSIS TAB (CHART) */}
                        {activeTab === 'analysis' && (
                            <div className="p-4 sm:p-6">
                                <h3 className="text-lg font-bold text-slate-100">Analysis per Source File</h3>
                                <p className="text-sm text-slate-400 mt-1">Percentage of filled vs. empty parameters for each source file.</p>
                                
                                <div className="flex justify-center gap-6 my-6">
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 bg-sky-500 rounded-sm"></div>
                                        <span className="text-sm text-slate-300">Filled Parameters (%)</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 bg-red-500 rounded-sm"></div>
                                        <span className="text-sm text-slate-300">Empty Parameters (%)</span>
                                    </div>
                                </div>

                                <div className="mt-8 mx-auto" style={{ height: '400px', maxWidth: '1000px' }}>
                                    <div className="w-full h-full flex gap-4">
                                        <div className="h-full flex flex-col justify-between text-xs text-slate-400 py-4">
                                            <span>100%</span>
                                            <span>75%</span>
                                            <span>50%</span>
                                            <span>25%</span>
                                            <span>0%</span>
                                        </div>
                                        <div className="flex-grow h-full border-l border-b border-slate-600 flex justify-around items-end gap-2 sm:gap-4 px-2 sm:px-4">
                                            {sourceFileSummary.map(item => (
                                                <div key={item.sourceFile} className="flex-grow flex flex-col items-center gap-2 h-full justify-end max-w-[100px]">
                                                    <div className="flex gap-1 sm:gap-1.5 w-full items-end h-full justify-center">
                                                        <div className="w-1/2 bg-sky-500 rounded-t-sm sm:rounded-t-md hover:bg-sky-400 transition-colors group relative" style={{ height: `${item.filledPercentage}%` }}>
                                                             <span 
                                                                className="absolute left-0 right-0 text-center text-[10px] font-bold pointer-events-none"
                                                                style={{
                                                                    top: item.filledPercentage > 12 ? '4px' : 'auto',
                                                                    bottom: item.filledPercentage <= 12 ? '100%' : 'auto',
                                                                    marginBottom: item.filledPercentage <= 12 ? '4px' : '0',
                                                                    color: item.filledPercentage > 12 ? 'white' : '#e2e8f0'
                                                                }}
                                                            >
                                                                {item.filledPercentage.toFixed(2)}%
                                                            </span>
                                                            <div className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs font-semibold text-white bg-slate-900 border border-slate-700 rounded-md shadow-lg whitespace-nowrap z-10">
                                                                Filled: {item.filledPercentage.toFixed(2)}%
                                                            </div>
                                                        </div>
                                                        <div className="w-1/2 bg-red-500 rounded-t-sm sm:rounded-t-md hover:bg-red-400 transition-colors group relative" style={{ height: `${item.emptyPercentage}%` }}>
                                                            <span 
                                                                className="absolute left-0 right-0 text-center text-[10px] font-bold pointer-events-none"
                                                                style={{
                                                                    top: item.emptyPercentage > 12 ? '4px' : 'auto',
                                                                    bottom: item.emptyPercentage <= 12 ? '100%' : 'auto',
                                                                    marginBottom: item.emptyPercentage <= 12 ? '4px' : '0',
                                                                    color: item.emptyPercentage > 12 ? 'white' : '#e2e8f0'
                                                                }}
                                                            >
                                                                {item.emptyPercentage.toFixed(2)}%
                                                            </span>
                                                            <div className="absolute hidden group-hover:block bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 text-xs font-semibold text-white bg-slate-900 border border-slate-700 rounded-md shadow-lg whitespace-nowrap z-10">
                                                                Empty: {item.emptyPercentage.toFixed(2)}%
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span className="text-xs text-slate-300 font-medium w-full text-center break-words" title={item.sourceFile}>{item.sourceFile}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                 </div>
            )}
        </div>
    );
};

export default ParameterCheckPage;
