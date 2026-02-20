
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useAnalysis } from '../context/AnalysisContext';
import { STRINGS } from '../constants';
import Loader from '../components/Loader';
import type { ValidationResultItem, QaqcResults } from '../types';
import { cleanText } from '../utils/text';
import Checkbox from '../components/Checkbox';

// Declare global variables from CDN scripts
declare const XLSX: any;
declare const jspdf: any;

type SummaryDataItem = {
    title: string;
    percentage: number;
    passed: number;
    total: number;
    subtitle?: string;
};

// --- Local UI Components for this page ---

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

const SummaryCircle: React.FC<SummaryDataItem> = ({ title, percentage, passed, total, subtitle }) => {
    const safePercentage = Math.max(0, Math.min(100, isNaN(percentage) ? 0 : percentage));
    const isTotalFailure = safePercentage === 0 && total > 0;
    const color = isTotalFailure ? 'text-red-400' : 'text-green-400';
    const ringColor = isTotalFailure ? 'stroke-red-500' : 'stroke-green-500';
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (safePercentage / 100) * circumference;

    return (
        <div className="flex flex-col items-center gap-3 text-center p-4 animate-fade-in">
            <div className="relative inline-flex items-center justify-center w-40 h-40">
                <svg className="w-full h-full">
                    <circle className="stroke-slate-700" strokeWidth="12" fill="transparent" r={radius} cx="50%" cy="50%" />
                    <circle
                        className={`transform -rotate-90 origin-center transition-all duration-1000 ease-out ${ringColor}`}
                        strokeWidth="12"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        fill="transparent"
                        r={radius}
                        cx="50%"
                        cy="50%"
                    />
                </svg>
                <div className="absolute flex flex-col items-center justify-center">
                    <span className={`text-4xl font-bold ${color}`}>{Math.round(safePercentage)}%</span>
                    <span className={`text-sm font-medium ${color}`}>Pass</span>
                </div>
            </div>
            <h4 className="text-base font-semibold text-slate-200">{title}</h4>
            <p className="text-sm text-slate-400 h-10 flex items-center justify-center">{subtitle ?? `${passed.toLocaleString()} / ${total.toLocaleString()} Passed`}</p>
        </div>
    );
};

const ResultsTable: React.FC<{ title: string; data: ValidationResultItem[] | null }> = ({ title, data }) => {
    if (!data || data.length === 0) return null;
    const headers = [...Object.keys(data[0].originalRecord), 'Status', 'Reasoning'];
    const hasInvalidValue = data.some(item => item.invalidValue);
    if (hasInvalidValue) headers.push('Invalid Value');

    return (
        <div className="mb-10 animate-fade-in">
            <h4 className="text-xl font-bold text-slate-100 mb-4">{title}</h4>
            <div className="overflow-x-auto rounded-lg border border-slate-700">
                <table className="w-full text-sm text-left text-slate-300">
                    <thead className="text-xs text-slate-400 uppercase bg-slate-800/50">
                        <tr>
                            {headers.map(header => <th key={header} scope="col" className="px-6 py-3">{header}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {data.map((item, index) => (
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
                                {hasInvalidValue && <td className="px-6 py-4 text-red-300 font-mono">{item.invalidValue ?? ''}</td>}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const QaqcPage: React.FC = () => {
    const { pdfText, pdfFileName, documents } = useAnalysis();

    const [selectedChecks, setSelectedChecks] = useState({ 
        fileName: true, 
        projectUnits: true, 
        surveyPoint: true, 
        projectBasePoint: true, 
        rvtLinkPinned: true, 
        revitLinksPath: true, 
        importedCad: true, 
        levelsGridsPinned: true, 
        categoryWorksetName: true, 
        startingViewName: true,
        navisworksViewName: true,
        viewsNotInSheets: true,
    });
    
    const [file, setFile] = useState<File | null>(null);
    const [excelData, setExcelData] = useState<Record<string, any>[] | null>(null);
    const [results, setResults] = useState<QaqcResults>({ 
        fileName: null, projectUnits: null, surveyPoint: null, projectBasePoint: null, rvtLinkPinned: null, 
        revitLinksPath: null, importedCad: null, levelsGridsPinned: null, categoryWorksetName: null, 
        startingViewName: null, navisworksViewName: null, viewsNotInSheets: null,
    });
    
    const [activeTab, setActiveTab] = useState<'summary' | 'detailed' | 'crs'>('summary');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [selectedDocumentName, setSelectedDocumentName] = useState('All Documents');

    useEffect(() => { setSelectedDocumentName('All Documents'); }, [documents]);

    const handleFileChange = useCallback((selectedFile: File | null) => {
        if (!selectedFile) { setFile(null); setExcelData(null); return; }
        const validTypes = ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'];
        if (validTypes.includes(selectedFile.type) || selectedFile.name.endsWith('.csv') || selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
            setFile(selectedFile);
            setError(null);
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const data = event.target?.result;
                    const workbook = XLSX.read(data, { type: 'binary' });
                    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                    const json = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
                    setExcelData(json.map((row: any) => {
                        const cleanedRow: Record<string, any> = {};
                        for (const key in row) cleanedRow[cleanText(key)] = typeof row[key] === 'string' ? cleanText(row[key]) : row[key];
                        return cleanedRow;
                    }));
                } catch (err) { setError("Error parsing Excel file."); }
            };
            reader.readAsBinaryString(selectedFile);
        } else { setError('Please select a valid Excel or CSV file.'); }
    }, []);

    const summaryData = useMemo((): SummaryDataItem[] => {
        const data: SummaryDataItem[] = [];
        const pushCheck = (res: ValidationResultItem[] | null, title: string) => {
            if (res) {
                const passed = res.filter(r => r.status.toLowerCase() === 'valid').length;
                data.push({ title, percentage: res.length > 0 ? (passed / res.length * 100) : 100, passed, total: res.length });
            }
        };
        pushCheck(results.fileName, STRINGS.qaqcFileName);
        if (results.projectUnits) pushCheck(results.projectUnits.details, STRINGS.qaqcProjectUnits);
        pushCheck(results.surveyPoint, STRINGS.qaqcSurveyPoint);
        pushCheck(results.projectBasePoint, STRINGS.qaqcProjectBasePoint);
        pushCheck(results.rvtLinkPinned, STRINGS.qaqcRvtLinkPinned);
        pushCheck(results.revitLinksPath, STRINGS.qaqcRevitLinksPath);
        pushCheck(results.categoryWorksetName, STRINGS.qaqcCategoryWorksetName);
        pushCheck(results.startingViewName, STRINGS.qaqcStartingViewName);
        pushCheck(results.navisworksViewName, STRINGS.qaqcNavisworksViewName);
        if (results.viewsNotInSheets) data.push({ title: STRINGS.qaqcViewsNotInSheets, percentage: results.viewsNotInSheets.length > 0 ? 0 : 100, passed: 0, total: results.viewsNotInSheets.length, subtitle: results.viewsNotInSheets.length > 0 ? `${results.viewsNotInSheets.length} unplaced views` : 'All placed' });
        if (results.importedCad) data.push({ title: STRINGS.qaqcImportedCad, percentage: results.importedCad.length > 0 ? 0 : 100, passed: 0, total: results.importedCad.length, subtitle: results.importedCad.length > 0 ? `${results.importedCad.length} CAD imports` : 'None' });
        if (results.levelsGridsPinned?.levels?.length > 0) pushCheck(results.levelsGridsPinned.levels, 'Levels Pinned');
        if (results.levelsGridsPinned?.grids?.length > 0) pushCheck(results.levelsGridsPinned.grids, 'Grids Pinned');
        return data;
    }, [results]);

    const handleAnalysis = async () => {
        const sourceText = selectedDocumentName === 'All Documents' ? pdfText : documents.find(d => d.name === selectedDocumentName)?.text;
        if (!sourceText || !excelData) return;

        setIsLoading(true);
        // Improved tokenization to capture codes accurately
        const pdfTokens = new Set();
        sourceText.split(/[\s,;|]+/).forEach(w => {
            const clean = w.trim().replace(/[()[\]{}]/g, '').toUpperCase();
            if (clean.length > 1) {
                pdfTokens.add(clean);
                if (clean.includes('-')) {
                    clean.split('-').forEach(sub => { if (sub.length > 1) pdfTokens.add(sub); });
                }
            }
        });

        const newResults: QaqcResults = { ...results };
        const headers = Object.keys(excelData[0] || {});
        const createRowRecord = (row: any, header: string) => {
            const idH = headers.find(h => ["file name", "filename", "model name"].includes(h.toLowerCase()));
            return { ...(idH ? { [idH]: row[idH] } : {}), [header]: row[header] };
        };

        const metricScore = ['metric', 'millimeter', 'meter'].reduce((acc, k) => acc + (sourceText.toLowerCase().split(k).length - 1), 0);
        const imperialScore = ['imperial', 'inch', 'feet'].reduce((acc, k) => acc + (sourceText.toLowerCase().split(k).length - 1), 0);
        const projectUnitStandard = metricScore >= imperialScore ? 'Metric' : 'Imperial';

        // 1. File Name
        if (selectedChecks.fileName) {
            const h = headers.find(h => ["file name", "filename", "model name"].includes(h.toLowerCase().trim()));
            if (h) newResults.fileName = excelData.reduce<ValidationResultItem[]>((acc, row) => {
                const originalVal = String(row[h] || '').trim();
                if (!originalVal) return acc;
                const valWithoutExt = originalVal.replace(/\.[^/.]+$/, "");
                const segments = valWithoutExt.includes('-') ? valWithoutExt.split('-') : (valWithoutExt.includes('_') ? valWithoutExt.split('_') : [valWithoutExt]);
                const last = segments[segments.length - 1];
                const is6 = /^\d{6}$/.test(last);
                const invalidSegs = segments.slice(0, -1).filter(s => !pdfTokens.has(s.toUpperCase()));
                
                const errors: string[] = [];
                if (!is6) errors.push(`The sequence segment '${last}' must be exactly 6 digits.`);
                if (invalidSegs.length > 0) errors.push(`Segments [${invalidSegs.join(', ')}] are wrong (not found in project rules).`);
                
                const ok = errors.length === 0;
                const reason = ok ? "Valid: Matches all project naming rules." : `Invalid: ${errors.join(' ')}`;

                acc.push({ originalRecord: createRowRecord(row, h), status: ok ? 'Valid' : 'Invalid', reasoning: reason, invalidValue: !ok ? originalVal : undefined });
                return acc;
            }, []);
        }

        // 2. Units
        if (selectedChecks.projectUnits) {
            const h = headers.find(h => h.toLowerCase().trim() === "project units");
            if (h) {
                const details = excelData.reduce<ValidationResultItem[]>((acc, row) => {
                    const val = String(row[h] || '').trim();
                    if (!val) return acc;
                    const ok = val.toLowerCase().includes(projectUnitStandard.toLowerCase());
                    acc.push({ originalRecord: createRowRecord(row, h), status: ok ? 'Valid' : 'Invalid', reasoning: ok ? `Valid: Matches the document's ${projectUnitStandard} standard.` : `Item is wrong: Expected ${projectUnitStandard} but found '${val}'.` });
                    return acc;
                }, []);
                newResults.projectUnits = { summary: { standardFromDocument: projectUnitStandard, metricCount: 0, imperialCount: 0, otherCount: 0, totalCount: details.length, reasoning: "" }, details };
            }
        }

        // 3. Points
        const checkPoints = (key: 'surveyPoint' | 'projectBasePoint', names: string[]) => {
            const h = headers.find(h => names.includes(h.toLowerCase().trim()));
            if (h) newResults[key] = excelData.filter(r => String(r[h] || '').trim()).map(r => {
                const val = String(r[h]);
                const ok = sourceText.includes(val);
                return { 
                    originalRecord: createRowRecord(r, h), 
                    status: ok ? 'Valid' : 'Invalid', 
                    reasoning: ok ? "Valid: Coordinates found in source document." : `Item not found: Coordinates '${val}' were not identified in the PDF rules.`
                };
            });
        };
        if (selectedChecks.surveyPoint) checkPoints('surveyPoint', ["survey point", "sp"]);
        if (selectedChecks.projectBasePoint) checkPoints('projectBasePoint', ["project base point", "pbp"]);

        // 4. RVT Link (Special Logic)
        if (selectedChecks.rvtLinkPinned) {
            const h = headers.find(h => h.toLowerCase().trim() === 'rvt link is pinned');
            if (h) {
                const rows = excelData.filter(r => String(r[h] ?? '').trim() !== '');
                if (rows.length === 0) newResults.rvtLinkPinned = [{ originalRecord: { "Check": "RVT Link" }, status: 'Valid', reasoning: 'Valid: There is no link in the Model.' }];
                else newResults.rvtLinkPinned = rows.map(r => {
                    const isPinned = String(r[h]).toLowerCase() === 'true';
                    return { 
                        originalRecord: createRowRecord(r, h), 
                        status: isPinned ? 'Valid' : 'Invalid', 
                        reasoning: isPinned ? "Valid: The linked model is correctly pinned." : "Item is wrong: Linked models must be pinned to prevent accidental movement." 
                    };
                });
            }
        }

        // 5. Navisworks (Special Logic)
        if (selectedChecks.navisworksViewName) {
            const h = headers.find(h => h.toLowerCase().trim() === 'navisworks view name');
            if (h) {
                const rows = excelData.filter(r => String(r[h] ?? '').trim() !== '');
                if (rows.length === 0) newResults.navisworksViewName = [{ originalRecord: { "Check": "Navisworks View" }, status: 'Invalid', reasoning: 'Item not found: No Navisworks view found in the Model.' }];
                else newResults.navisworksViewName = rows.map(r => {
                    const hasKeyword = String(r[h]).toLowerCase().includes('navisworks');
                    return { 
                        originalRecord: createRowRecord(r, h), 
                        status: hasKeyword ? 'Valid' : 'Invalid', 
                        reasoning: hasKeyword ? "Valid: View name includes the mandatory keyword." : "Item is wrong: View name must include 'Navisworks' keyword."
                    };
                });
            }
        }

        // 6. Starting View
        if (selectedChecks.startingViewName) {
            const h = headers.find(h => h.toLowerCase().trim().includes("starting view"));
            if (h) newResults.startingViewName = excelData.filter(r => String(r[h] || '').trim()).map(r => {
                const viewName = String(r[h]);
                const ok = sourceText.toLowerCase().includes(viewName.toLowerCase());
                return { 
                    originalRecord: createRowRecord(r, h), 
                    status: ok ? 'Valid' : 'Invalid', 
                    reasoning: ok ? "Valid: Starting view name found in project standard." : `Item not found: View '${viewName}' is not defined in the project standard.`
                };
            });
        }

        // 7. Levels/Grids
        if (selectedChecks.levelsGridsPinned) {
            const h = headers.find(h => h.toLowerCase().trim() === "levels-grids / element is pinned");
            if (h) {
                const levels: ValidationResultItem[] = [];
                const grids: ValidationResultItem[] = [];
                excelData.forEach(row => {
                    const val = String(row[h] || "").trim();
                    if (val.includes('/')) {
                        const [cat, pin] = val.split('/').map(s => s.trim().toLowerCase());
                        const isPinned = pin === 'true' || pin === 'yes';
                        const res: ValidationResultItem = { 
                            originalRecord: { [h]: val }, 
                            status: isPinned ? 'Valid' : 'Invalid', 
                            reasoning: isPinned ? `Valid: ${cat} is pinned.` : `Item is wrong: ${cat} must be pinned.` 
                        };
                        if (cat.includes('level')) levels.push(res); else if (cat.includes('grid')) grids.push(res);
                    }
                });
                newResults.levelsGridsPinned = { levels, grids };
            }
        }

        // 8. Revit Links Path
        if (selectedChecks.revitLinksPath) {
            const h = headers.find(h => h.toLowerCase().trim() === 'revit links path');
            if (h) newResults.revitLinksPath = excelData.filter(r => String(r[h] ?? '').trim()).map(r => {
                const path = String(r[h]);
                const ok = path.includes('ACCDocs');
                return { 
                    originalRecord: createRowRecord(r, h), 
                    status: ok ? 'Valid' : 'Invalid', 
                    reasoning: ok ? "Valid: Path utilizes ACCDocs cloud storage." : `Item is wrong: Path '${path}' must use ACCDocs.` 
                };
            });
        }
        
        // 9. Imported CAD
        if (selectedChecks.importedCad) {
            const h = headers.find(h => h.toLowerCase().trim() === 'imported cad');
            if (h) newResults.importedCad = excelData.filter(r => String(r[h] ?? '').trim() !== '').map(r => ({ 
                originalRecord: createRowRecord(r, h), status: 'Invalid', reasoning: "Item is wrong: Imported CAD file found. CAD must be linked." 
            }));
        }

        // 10. Workset Name
        if (selectedChecks.categoryWorksetName) {
             const h = headers.find(h => h.toLowerCase().trim().includes("workset name"));
             if (h) newResults.categoryWorksetName = excelData.filter(r => String(r[h] || '').trim()).map(r => {
                 const wsName = String(r[h]);
                 const ok = sourceText.toLowerCase().includes(wsName.toLowerCase());
                 return { 
                     originalRecord: createRowRecord(r, h), 
                     status: ok ? 'Valid' : 'Invalid', 
                     reasoning: ok ? "Valid: Workset name found in rules." : `Item not found: Workset '${wsName}' not authorized in rules.`
                 };
             });
        }

        // 11. Unplaced Views
        if (selectedChecks.viewsNotInSheets) {
            const h = headers.find(h => ["views not in sheets", "views not in sheet"].includes(h.toLowerCase().trim()));
            if (h) newResults.viewsNotInSheets = excelData.filter(r => String(r[h] ?? '').trim() !== '').map(r => ({ 
                originalRecord: createRowRecord(r, h), status: 'Invalid', reasoning: "Item is wrong: This view is not placed on any drawing sheet." 
            }));
        }

        setResults(newResults);
        setIsLoading(false);
        setActiveTab('summary');
    };

    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();
        
        // Sheet 1: Summary
        const summaryRows = summaryData.map(d => ({ Category: d.title, Compliance: `${d.percentage.toFixed(2)}%`, Passed: d.passed, Total: d.total }));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "SummaryReport");
        
        // Sheet 2: Detailed Results
        const allDetails: any[] = [];
        const addToDetails = (arr: ValidationResultItem[] | null, categoryName: string) => {
            if (arr) {
                arr.forEach(item => {
                    allDetails.push({
                        Category: categoryName,
                        ...item.originalRecord,
                        Status: item.status,
                        Reasoning: item.reasoning
                    });
                });
            }
        };

        addToDetails(results.fileName, "File Name");
        addToDetails(results.projectUnits?.details ?? null, "Project Units");
        addToDetails(results.surveyPoint, "Survey Point");
        addToDetails(results.projectBasePoint, "Base Point");
        addToDetails(results.rvtLinkPinned, "RVT Links");
        addToDetails(results.navisworksViewName, "Navisworks View");
        addToDetails(results.startingViewName, "Starting View");
        addToDetails(results.levelsGridsPinned?.levels ?? null, "Levels");
        addToDetails(results.levelsGridsPinned?.grids ?? null, "Grids");
        addToDetails(results.revitLinksPath, "Links Path");
        addToDetails(results.importedCad, "Imported CAD");
        addToDetails(results.categoryWorksetName, "Workset Names");
        addToDetails(results.viewsNotInSheets, "Unplaced Views");

        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allDetails), "DetailedAudit");
        XLSX.writeFile(wb, `Audit_Report_${file?.name || 'QAQC'}.xlsx`);
    };

    const handleExportPdf = () => {
        const doc = new jspdf.jsPDF({ orientation: 'landscape' });
        doc.text("QA/QC Audit Report", 14, 15);
        
        // Summary Table
        (doc as any).autoTable({ 
            startY: 20, 
            head: [['Check Category', 'Compliance %', 'Status']], 
            body: summaryData.map(d => [d.title, `${d.percentage.toFixed(2)}%`, d.percentage >= 99 ? 'PASS' : 'FAIL']),
            headStyles: { fillColor: [30, 41, 59] }
        });

        // Detailed Tables - Comprehensive list
        const addDetailedSection = (title: string, data: ValidationResultItem[] | null) => {
            if (!data || data.length === 0) return;
            doc.addPage();
            doc.text(`${title} - Detailed Audit`, 14, 15);
            const headers = [...Object.keys(data[0].originalRecord), 'Status', 'Reasoning'];
            const body = data.map(item => [...Object.values(item.originalRecord), item.status, item.reasoning]);
            (doc as any).autoTable({
                startY: 20,
                head: [headers],
                body: body,
                theme: 'striped',
                styles: { fontSize: 7 },
                headStyles: { fillColor: [30, 41, 59] }
            });
        };

        addDetailedSection("File Name", results.fileName);
        addDetailedSection("Project Units", results.projectUnits?.details ?? null);
        addDetailedSection("Survey Point", results.surveyPoint);
        addDetailedSection("Base Point", results.projectBasePoint);
        addDetailedSection("RVT Link is Pinned", results.rvtLinkPinned);
        addDetailedSection("Navisworks View", results.navisworksViewName);
        addDetailedSection("Starting View", results.startingViewName);
        addDetailedSection("Levels", results.levelsGridsPinned?.levels ?? null);
        addDetailedSection("Grids", results.levelsGridsPinned?.grids ?? null);
        addDetailedSection("Revit Links Path", results.revitLinksPath);
        addDetailedSection("Imported CAD", results.importedCad);
        addDetailedSection("Workset Naming", results.categoryWorksetName);
        addDetailedSection("Unplaced Views", results.viewsNotInSheets);

        doc.save(`Audit_Report_${file?.name || 'QAQC'}.pdf`);
    };

    if (!pdfText) return <div className="p-8 text-center text-slate-400">Please analyze a PDF first on the Analysis page.</div>;

    return (
        <div className="flex flex-col items-center w-full animate-fade-in">
            <div className="w-full max-w-2xl bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl border border-slate-700">
                <h2 className="text-xl font-bold text-center mb-6 text-slate-200">{STRINGS.uploadExcelForQaqc}</h2>
                <label onDragEnter={()=>setIsDragging(true)} onDragLeave={()=>setIsDragging(false)} onDragOver={(e)=>e.preventDefault()} onDrop={(e)=>{e.preventDefault(); setIsDragging(false); handleFileChange(e.dataTransfer.files[0])}} htmlFor="qaqc-upload-main" className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer transition-all ${isDragging ? 'border-sky-400 bg-sky-400/5' : 'border-slate-600'}`}>
                    <svg className="w-10 h-10 mb-2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                    <p className="text-slate-400">Click or drop Excel to audit</p>
                    <input id="qaqc-upload-main" type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={e => handleFileChange(e.target.files?.[0] || null)} />
                </label>
                {file && <div className="mt-2 text-center text-xs text-sky-400 font-bold">{file.name}</div>}

                <div className="mt-8 border-t border-slate-700 pt-6">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4 text-center">Select Columns to Verify</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                        <Checkbox id="c-f" label="File Name" checked={selectedChecks.fileName} onChange={e=>setSelectedChecks({...selectedChecks, fileName: e.target.checked})} />
                        <Checkbox id="c-u" label="Units" checked={selectedChecks.projectUnits} onChange={e=>setSelectedChecks({...selectedChecks, projectUnits: e.target.checked})} />
                        <Checkbox id="c-s" label="Survey Point" checked={selectedChecks.surveyPoint} onChange={e=>setSelectedChecks({...selectedChecks, surveyPoint: e.target.checked})} />
                        <Checkbox id="c-b" label="Base Point" checked={selectedChecks.projectBasePoint} onChange={e=>setSelectedChecks({...selectedChecks, projectBasePoint: e.target.checked})} />
                        <Checkbox id="c-r" label="RVT Links" checked={selectedChecks.rvtLinkPinned} onChange={e=>setSelectedChecks({...selectedChecks, rvtLinkPinned: e.target.checked})} />
                        <Checkbox id="c-n" label="Navisworks" checked={selectedChecks.navisworksViewName} onChange={e=>setSelectedChecks({...selectedChecks, navisworksViewName: e.target.checked})} />
                        <Checkbox id="c-st" label="Starting View" checked={selectedChecks.startingViewName} onChange={e=>setSelectedChecks({...selectedChecks, startingViewName: e.target.checked})} />
                        <Checkbox id="c-l" label="Levels/Grids" checked={selectedChecks.levelsGridsPinned} onChange={e=>setSelectedChecks({...selectedChecks, levelsGridsPinned: e.target.checked})} />
                        <Checkbox id="c-rp" label="Links Path" checked={selectedChecks.revitLinksPath} onChange={e=>setSelectedChecks({...selectedChecks, revitLinksPath: e.target.checked})} />
                        <Checkbox id="c-ic" label="Imported CAD" checked={selectedChecks.importedCad} onChange={e=>setSelectedChecks({...selectedChecks, importedCad: e.target.checked})} />
                        <Checkbox id="c-ws" label="Workset Name" checked={selectedChecks.categoryWorksetName} onChange={e=>setSelectedChecks({...selectedChecks, categoryWorksetName: e.target.checked})} />
                        <Checkbox id="c-vns" label="Unplaced Views" checked={selectedChecks.viewsNotInSheets} onChange={e=>setSelectedChecks({...selectedChecks, viewsNotInSheets: e.target.checked})} />
                    </div>
                </div>

                <button onClick={handleAnalysis} disabled={isLoading || !file} className="w-full mt-8 bg-sky-600 py-3 rounded-lg font-bold shadow-xl hover:bg-sky-500 transition-colors">{isLoading ? "Processing..." : "Run QA/QC Audit"}</button>
            </div>

            {summaryData.length > 0 && (
                <div className="mt-8 w-full max-w-6xl bg-slate-800 rounded-xl border border-slate-700 shadow-2xl overflow-hidden">
                    <div className="flex justify-between items-center p-4 border-b border-slate-700">
                        <div className="flex overflow-x-auto">
                            <TabButton isActive={activeTab === 'summary'} onClick={()=>setActiveTab('summary')}>Summary</TabButton>
                            <TabButton isActive={activeTab === 'detailed'} onClick={()=>setActiveTab('detailed')}>Details</TabButton>
                            <TabButton isActive={activeTab === 'crs'} onClick={()=>setActiveTab('crs')}>CRS Compliance</TabButton>
                        </div>
                        <div className="flex gap-2">
                            <button onClick={handleExportExcel} className="px-3 py-1.5 bg-slate-700 rounded text-xs font-bold text-slate-300">Export Excel</button>
                            <button onClick={handleExportPdf} className="px-3 py-1.5 bg-slate-700 rounded text-xs font-bold text-slate-300">Export PDF</button>
                        </div>
                    </div>
                    <div className="p-6">
                        {activeTab === 'summary' && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">{summaryData.map(d => <SummaryCircle key={d.title} {...d} />)}</div>}
                        {activeTab === 'detailed' && (
                            <div className="space-y-4">
                                <ResultsTable title="File Name" data={results.fileName} />
                                <ResultsTable title="Project Units" data={results.projectUnits?.details ?? null} />
                                <ResultsTable title="Survey Point" data={results.surveyPoint} />
                                <ResultsTable title="Project Base Point" data={results.projectBasePoint} />
                                <ResultsTable title="Starting View" data={results.startingViewName} />
                                <ResultsTable title="RVT Links Pinned" data={results.rvtLinkPinned} />
                                <ResultsTable title="Navisworks View" data={results.navisworksViewName} />
                                <ResultsTable title="Levels" data={results.levelsGridsPinned?.levels ?? null} />
                                <ResultsTable title="Grids" data={results.levelsGridsPinned?.grids ?? null} />
                                <ResultsTable title="Revit Links Path" data={results.revitLinksPath} />
                                <ResultsTable title="Imported CAD" data={results.importedCad} />
                                <ResultsTable title="Workset Naming" data={results.categoryWorksetName} />
                                <ResultsTable title="Views Not In Sheets" data={results.viewsNotInSheets} />
                            </div>
                        )}
                        {activeTab === 'crs' && (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-900/50 text-slate-400 uppercase text-[10px] tracking-widest">
                                        <tr>{summaryData.map(d => <th key={d.title} className="px-6 py-4 border-r border-slate-700 last:border-0">{d.title}</th>)}</tr>
                                    </thead>
                                    <tbody>
                                        <tr className="bg-slate-800">
                                            {summaryData.map(d => (
                                                <td key={d.title} className="px-6 py-10 text-center border-r border-slate-700 last:border-0">
                                                    <div className={`text-2xl font-black ${d.percentage >= 99 ? 'text-green-400' : 'text-red-400'}`}>
                                                        {d.percentage.toFixed(2)}%
                                                    </div>
                                                    <div className="text-[10px] text-slate-500 font-bold uppercase mt-1">Pass Rate</div>
                                                </td>
                                            ))}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default QaqcPage;
