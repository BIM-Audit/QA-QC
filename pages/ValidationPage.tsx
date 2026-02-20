import React, { useState, useCallback, useEffect } from 'react';
import { useAnalysis } from '../context/AnalysisContext';
import { validateData } from '../services/geminiService';
import { STRINGS } from '../constants';
import Loader from '../components/Loader';
import type { ValidationResultItem } from '../types';
import { cleanText } from '../utils/text';

// Declare global variables from CDN scripts
declare const XLSX: any;
declare const jspdf: any;

const ValidationPage: React.FC = () => {
    const { pdfText, pdfFileName, documents } = useAnalysis();

    const [file, setFile] = useState<File | null>(null);
    const [excelData, setExcelData] = useState<Record<string, any>[] | null>(null);
    const [validationResult, setValidationResult] = useState<ValidationResultItem[] | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [selectedDocumentName, setSelectedDocumentName] = useState('All Documents');

    useEffect(() => {
        setSelectedDocumentName('All Documents');
    }, [documents]);

    const handleFileChange = useCallback((selectedFile: File | null) => {
        if (!selectedFile) {
            setFile(null);
            setExcelData(null);
            setError('No file selected.');
            return;
        }

        const validTypes = [
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'text/csv'
        ];

        if (validTypes.includes(selectedFile.type) || selectedFile.name.endsWith('.csv') || selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
            setFile(selectedFile);
            setError(null);
            setValidationResult(null);

            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = event.target?.result;
                    const workbook = XLSX.read(data, { type: 'binary' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet);
                    
                    const cleanedJson = json.map((row: Record<string, any>) => {
                        const cleanedRow: Record<string, any> = {};
                        for (const key in row) {
                            const cleanedKey = cleanText(key);
                            const value = row[key];
                            cleanedRow[cleanedKey] = typeof value === 'string' ? cleanText(value) : value;
                        }
                        return cleanedRow;
                    });

                    setExcelData(cleanedJson);
                } catch (err) {
                    setError("Error parsing Excel file.");
                    setExcelData(null);
                }
            };
            reader.onerror = () => {
                setError("Error reading file.");
                setExcelData(null);
            };
            reader.readAsBinaryString(selectedFile);

        } else {
            setFile(null);
            setExcelData(null);
            setError('Please select a valid Excel or CSV file.');
        }
    }, []);

    const handleDragEnter = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(true);
    }, []);

    const handleDragOver = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        event.stopPropagation();
    }, []);

    const handleDragLeave = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
    }, []);

    const handleDrop = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
        const droppedFiles = event.dataTransfer.files;
        if (droppedFiles && droppedFiles.length > 0) {
            handleFileChange(droppedFiles[0]);
        }
    }, [handleFileChange]);

    const handleValidate = async () => {
        const sourceText = selectedDocumentName === 'All Documents'
            ? pdfText
            : documents.find(d => d.name === selectedDocumentName)?.text;
            
        if (!sourceText || !excelData) return;

        setIsLoading(true);
        setError(null);
        setValidationResult(null);

        try {
            const resultJson = await validateData(sourceText, excelData);
            setValidationResult(JSON.parse(resultJson));
        } catch (err) {
             if (err instanceof SyntaxError) {
                setError("Failed to parse the validation result. The format was invalid.");
            } else {
                setError(err instanceof Error ? err.message : STRINGS.errorOccurred);
            }
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleExportExcel = () => {
        if (!validationResult || validationResult.length === 0) return;

        const dataToExport = validationResult.map(item => ({
            ...item.originalRecord,
            Status: item.status,
            Reasoning: item.reasoning
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);

        // Calculate column widths for better readability
        const headers = Object.keys(dataToExport[0]);
        const columnWidths = headers.map(header => {
            const maxLength = Math.max(
                header.length,
                ...dataToExport.map(row => String(row[header as keyof typeof row] ?? '').length)
            );
            return { wch: Math.min(maxLength + 2, 60) }; // Add padding, cap at 60 chars
        });
        worksheet['!cols'] = columnWidths;

        // Style header row (bold, colored) and add autofilter to create a table
        const range = XLSX.utils.decode_range(worksheet['!ref']!);
        for (let C = range.s.c; C <= range.e.c; ++C) {
            const address = XLSX.utils.encode_cell({ r: range.s.r, c: C });
            if (worksheet[address]) {
                worksheet[address].s = {
                    font: { bold: true, color: { rgb: "FFFFFFFF" } }, // White, bold font
                    fill: { fgColor: { rgb: "FF334155" } }  // Dark grey (slate-700) background
                };
            }
        }
        worksheet['!autofilter'] = { ref: worksheet['!ref']! };

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Validation Results");
        
        const validationTarget = selectedDocumentName === 'All Documents' ? pdfFileName : selectedDocumentName.split('.').slice(0, -1).join('.');
        let exportFileName = `Validation_Results_against_${validationTarget}.xlsx`;
        if (file) {
            const baseName = file.name.split('.').slice(0, -1).join('.');
            exportFileName = `${baseName} Validation vs ${validationTarget}.xlsx`;
        }
        XLSX.writeFile(workbook, exportFileName);
    };

    const handleExportPdf = () => {
        if (!validationResult || validationResult.length === 0) return;
        
        const doc = new jspdf.jsPDF();
        const headers = [...Object.keys(validationResult[0].originalRecord), 'Status', 'Reasoning'];
        const body = validationResult.map(item => [
            ...Object.values(item.originalRecord),
            item.status,
            item.reasoning
        ]);
        
        const validationTarget = selectedDocumentName === 'All Documents' ? pdfFileName : selectedDocumentName;
        doc.text(`${STRINGS.validationResultTitle} for ${file?.name} vs ${validationTarget}`, 14, 16);
        (doc as any).autoTable({
            startY: 20,
            head: [headers],
            body: body,
            theme: 'grid',
            headStyles: { fillColor: [30, 41, 59] }, // slate-800
            styles: { fontSize: 8 },
        });

        const exportFileBaseName = selectedDocumentName === 'All Documents' ? 'All_Documents' : selectedDocumentName.split('.').slice(0, -1).join('.');
        doc.save(`Validation_Results_${exportFileBaseName}.pdf`);
    };

    if (!pdfText) {
        return (
            <div className="flex flex-col items-center justify-center text-center p-8 bg-slate-800 rounded-xl shadow-2xl border border-slate-700 animate-fade-in">
                <svg className="w-16 h-16 mb-4 text-sky-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                <p className="text-lg font-semibold text-slate-200">{STRINGS.pleaseAnalyzeFirst}</p>
            </div>
        );
    }
    
    const tableHeaders = validationResult ? [...Object.keys(validationResult[0].originalRecord), 'Status', 'Reasoning'] : [];

    return (
        <div className="flex flex-col items-center w-full animate-fade-in">
            <div className="w-full max-w-2xl bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl border border-slate-700">
                <h2 className="text-xl font-bold text-center mb-2 text-slate-200">{STRINGS.uploadExcel}</h2>
                <p className="text-center text-sm text-slate-400 mb-4">{STRINGS.comparedWith} <span className="font-semibold">{pdfFileName}</span></p>

                {documents && documents.length > 1 && (
                    <div className="mb-6">
                        <label htmlFor="pdf-select" className="block text-sm font-medium text-slate-300 mb-2 text-center">
                            Please choose which document to validate against:
                        </label>
                        <select
                            id="pdf-select"
                            value={selectedDocumentName}
                            onChange={(e) => setSelectedDocumentName(e.target.value)}
                            className="w-full p-2.5 border border-slate-600 rounded-lg bg-slate-700 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 transition-colors text-slate-200"
                            aria-label="Select PDF to validate against"
                        >
                            <option value="All Documents">All Uploaded Documents</option>
                            {documents.map(doc => (
                                <option key={doc.name} value={doc.name}>{doc.name}</option>
                            ))}
                        </select>
                    </div>
                )}

                <label
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    htmlFor="excel-upload"
                    className={`mt-4 flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg cursor-pointer bg-slate-800/50 hover:bg-slate-700/50 transition-all duration-300 ${isDragging ? 'border-sky-400 scale-105' : 'border-slate-600'}`}
                >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <svg className={`w-10 h-10 mb-3 transition-transform duration-300 ${isDragging ? 'scale-110 -translate-y-1' : ''} text-slate-500`} aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2" /></svg>
                        <p className="mb-2 text-sm text-slate-400"><span className="font-semibold text-sky-400">{STRINGS.uploadButton}</span> {STRINGS.dropHere}</p>
                        <p className="text-xs text-slate-500">XLSX, XLS, or CSV</p>
                    </div>
                    <input id="excel-upload" type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={e => handleFileChange(e.target.files ? e.target.files[0] : null)} />
                </label>

                {file && <div className="mt-4 text-center text-sm text-slate-300"><span className="font-medium">{STRINGS.fileLabel}</span> {file.name}</div>}

                <button
                    onClick={handleValidate}
                    disabled={!excelData || isLoading}
                    className="mt-8 w-full bg-sky-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-sky-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 focus:ring-offset-slate-900"
                >
                    {isLoading ? STRINGS.validating : STRINGS.validateButton}
                </button>
                {error && <p className="mt-4 text-center text-red-400">{error}</p>}
            </div>

            {isLoading && !validationResult && <div className="mt-8"><Loader text={STRINGS.validating} /></div>}

            {validationResult && (
                <div className="mt-8 w-full max-w-6xl animate-fade-in">
                    <div className="bg-slate-800 shadow-lg rounded-xl border border-slate-700">
                        <div className="p-4 sm:p-6 flex justify-between items-center border-b border-slate-700">
                            <div>
                                <h3 className="text-lg font-bold text-slate-100">{STRINGS.validationResultTitle}</h3>
                                <p className="text-sm text-slate-400 mt-1">{validationResult.length} records verified against "{selectedDocumentName}"</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={handleExportExcel} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-200 bg-slate-700/50 rounded-md hover:bg-slate-700 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3 1h10v2H5V6zm0 3h10v2H5V9zm0 3h10v2H5v-2z" /></svg>
                                    {STRINGS.exportExcel}
                                </button>
                                <button onClick={handleExportPdf} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-200 bg-slate-700/50 rounded-md hover:bg-slate-700 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0v12h8V4H6z" clipRule="evenodd" /><path d="M8 8h4v1H8V8zm0 2h4v1H8v-1zm0 2h2v1H8v-1z" /></svg>
                                    {STRINGS.exportPdf}
                                </button>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                           <table className="w-full text-sm text-left text-slate-300">
                                <thead className="text-xs text-slate-400 uppercase bg-slate-800/50">
                                    <tr>
                                        {tableHeaders.map(header => <th key={header} scope="col" className="px-6 py-3">{header}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {validationResult.map((item, index) => (
                                        <tr key={index} className="border-b border-slate-700 hover:bg-slate-700/30">
                                            {Object.values(item.originalRecord).map((value, i) => <td key={i} className="px-6 py-4 whitespace-nowrap">{String(value)}</td>)}
                                            <td className="px-6 py-4">
                                                 <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full inline-block ${
                                                    item.status.toLowerCase() === 'valid' ? 'bg-green-500/20 text-green-300' :
                                                    item.status.toLowerCase() === 'invalid' ? 'bg-red-500/20 text-red-300' :
                                                    'bg-yellow-500/20 text-yellow-300'
                                                }`}>
                                                    {item.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 min-w-[300px]">{item.reasoning}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ValidationPage;