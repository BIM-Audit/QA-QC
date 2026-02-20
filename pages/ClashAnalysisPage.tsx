
import React, { useState, useCallback, useMemo } from 'react';
import { STRINGS } from '../constants';
import Loader from '../components/Loader';
import { PdfIcon } from '../components/Icons';

declare const XLSX: any;
declare const jspdf: any;
declare const html2canvas: any;

// --- Types ---

type ClashRow = {
  name: string;
  status: string;
  clashes: number;
  new: number;
  active: number;
  reviewed: number;
  approved: number;
  resolved: number;
  selectionA: string;
  selectionB: string;
  // Computed
  disciplinePair: string;
  disciplineA: string;
  disciplineB: string;
};

type ClashData = {
  rows: ClashRow[];
  totalClashes: number;
  statusCounts: Record<string, number>;
  disciplinePairCounts: Record<string, number>;
  uniqueDisciplines: string[];
};

type Tab = 'dashboard' | 'discipline' | 'check_discipline' | 'filter_discipline';

// --- Components ---

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

const generateAsciiBar = (val: number, max: number, maxLength = 20) => {
    if (max === 0) return '';
    // Fix: Ensure the operands of the division are explicitly treated as numbers
    const length = Math.round((Number(val) / Number(max)) * maxLength);
    // Using a block character for the bar
    return '█'.repeat(length);
};

// SVG-based Pie Chart to allow for "Data in Pie Chart" (Labels)
const StatusPieChart: React.FC<{ counts: Record<string, number>, total: number }> = ({ counts, total }) => {
    const statusColors: Record<string, string> = {
        New: '#ef4444',      // red-500
        Active: '#f97316',   // orange-500
        Reviewed: '#3b82f6', // blue-500
        Approved: '#22c55e', // green-500
        Resolved: '#64748b', // slate-500
    };

    if (total === 0) return <div className="w-64 h-64 rounded-full bg-slate-700 flex items-center justify-center text-slate-500">No Data</div>;

    let cumulativePercent = 0;

    function getCoordinatesForPercent(percent: number) {
        // Fix: Explicitly ensure arithmetic operands are treated as numbers
        const x = Math.cos(2 * Math.PI * Number(percent));
        const y = Math.sin(2 * Math.PI * Number(percent));
        return [x, y];
    }

    const slices = Object.entries(counts).map(([status, count]) => {
        const val = count as number;
        if (val === 0) return null;
        // Fix: Ensure division operands are treated as numbers
        const percent = Number(val) / Number(total);
        const [startX, startY] = getCoordinatesForPercent(cumulativePercent);
        cumulativePercent += percent;
        const [endX, endY] = getCoordinatesForPercent(cumulativePercent);

        const largeArcFlag = percent > 0.5 ? 1 : 0;
        const pathData = [
            `M ${startX} ${startY}`,
            `A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY}`,
            `L 0 0`,
        ].join(' ');

        // Calculate label position (centroid-ish)
        // Fix: Ensure arithmetic operands are numbers to avoid potential typing errors
        const labelPercent = Number(cumulativePercent) - (Number(percent) / 2);
        const [labelX, labelY] = getCoordinatesForPercent(labelPercent);
        const labelRadius = 0.65; // Distance from center

        return (
            <g key={status}>
                <path d={pathData} fill={statusColors[status]} />
                {percent > 0.05 && (
                    <text 
                        x={labelX * labelRadius} 
                        y={labelY * labelRadius} 
                        fill="white" 
                        fontSize="0.12" 
                        fontWeight="bold" 
                        textAnchor="middle" 
                        dominantBaseline="middle"
                        style={{ pointerEvents: 'none' }}
                    >
                        {val.toLocaleString()}
                    </text>
                )}
            </g>
        );
    }).filter(Boolean);

    return (
        <svg viewBox="-1.1 -1.1 2.2 2.2" className="w-64 h-64 transform -rotate-90">
            {slices}
            <circle cx="0" cy="0" r="0.45" fill="#1e293b" /> 
        </svg>
    );
};

const ClashAnalysisPage: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [clashData, setClashData] = useState<ClashData | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('dashboard');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    
    // Filter states for Filter Per Discipline Tab
    const [catDisc1, setCatDisc1] = useState<string>('All');
    const [catDisc2, setCatDisc2] = useState<string>('All');

    // --- Parsers ---

    const normalizeHeader = (h: string) => h.toLowerCase().trim().replace(/[^a-z0-9]/g, '');

    const extractDiscipline = (val: string): string => {
        if (!val) return 'UNKNOWN';
        const parts = val.split('-');
        if (parts.length > 0) return parts[0].trim().toUpperCase();
        return val.trim().toUpperCase();
    };

    const handleFileChange = useCallback((selectedFile: File | null) => {
        if (!selectedFile) {
            setFile(null);
            setClashData(null);
            return;
        }

        const validTypes = ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'];
        if (validTypes.includes(selectedFile.type) || selectedFile.name.endsWith('.csv') || selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
            setFile(selectedFile);
            setError(null);
            setClashData(null);
            setCatDisc1('All');
            setCatDisc2('All');
        } else {
            setError('Please select a valid Excel or CSV file.');
        }
    }, []);

    const analyzeFile = () => {
        if (!file) return;
        setIsLoading(true);
        setError(null);

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const bstr = event.target?.result;
                const workbook = XLSX.read(bstr, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet, { defval: 0 });

                if (!json || json.length === 0) {
                    setError("File appears to be empty.");
                    setIsLoading(false);
                    return;
                }

                const headers = Object.keys(json[0]);
                const getHeader = (keyStr: string) => headers.find(h => normalizeHeader(h) === keyStr);

                const nameH = getHeader('name');
                const statusH = getHeader('status');
                const clashesH = getHeader('clashes');
                const selAH = getHeader('selectiona');
                const selBH = getHeader('selectionb');
                
                if (!nameH || !statusH || !clashesH) {
                     setError("Missing required columns. Ensure 'Name', 'Status', and 'Clashes' columns exist.");
                     setIsLoading(false);
                     return;
                }

                const newH = getHeader('new');
                const activeH = getHeader('active');
                const reviewedH = getHeader('reviewed');
                const approvedH = getHeader('approved');
                const resolvedH = getHeader('resolved');

                const rows: ClashRow[] = [];
                let totalClashes = 0;
                const statusCounts: Record<string, number> = { New: 0, Active: 0, Reviewed: 0, Approved: 0, Resolved: 0 };
                const disciplinePairCounts: Record<string, number> = {};
                const disciplinesSet = new Set<string>();

                json.forEach((row: any) => {
                    const name = String(row[nameH] || '');
                    if (!name) return;

                    const status = String(row[statusH] || 'Active');
                    const numClashes = Number(row[clashesH] || 0);

                    const valNew = newH ? Number(row[newH] || 0) : (status.toLowerCase() === 'new' ? numClashes : 0);
                    const valActive = activeH ? Number(row[activeH] || 0) : (status.toLowerCase() === 'active' ? numClashes : 0);
                    const valReviewed = reviewedH ? Number(row[reviewedH] || 0) : (status.toLowerCase() === 'reviewed' ? numClashes : 0);
                    const valApproved = approvedH ? Number(row[approvedH] || 0) : (status.toLowerCase() === 'approved' ? numClashes : 0);
                    const valResolved = resolvedH ? Number(row[resolvedH] || 0) : (status.toLowerCase() === 'resolved' ? numClashes : 0);

                    const selA = selAH ? String(row[selAH] || 'Unknown') : 'Unknown';
                    const selB = selBH ? String(row[selBH] || 'Unknown') : 'Unknown';

                    const discA = extractDiscipline(selA);
                    const discB = extractDiscipline(selB);
                    
                    disciplinesSet.add(discA);
                    disciplinesSet.add(discB);

                    const disciplinePair = [discA, discB].sort().join(' - ');

                    rows.push({
                        name,
                        status,
                        clashes: numClashes,
                        new: valNew,
                        active: valActive,
                        reviewed: valReviewed,
                        approved: valApproved,
                        resolved: valResolved,
                        selectionA: selA,
                        selectionB: selB,
                        disciplinePair,
                        disciplineA: discA,
                        disciplineB: discB
                    });

                    totalClashes += numClashes;
                    
                    statusCounts.New += valNew;
                    statusCounts.Active += valActive;
                    statusCounts.Reviewed += valReviewed;
                    statusCounts.Approved += valApproved;
                    statusCounts.Resolved += valResolved;

                    disciplinePairCounts[disciplinePair] = (disciplinePairCounts[disciplinePair] || 0) + numClashes;
                });

                setClashData({
                    rows,
                    totalClashes,
                    statusCounts,
                    disciplinePairCounts,
                    uniqueDisciplines: Array.from(disciplinesSet).sort()
                });
                setActiveTab('dashboard');
            } catch (err) {
                console.error(err);
                setError("Failed to parse Excel file.");
            } finally {
                setIsLoading(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleExportExcel = () => {
        if (!clashData) return;
        
        const dataToExport = clashData.rows.map(r => ({
            'Clash Test Name': r.name,
            'Total Clashes': r.clashes,
            'New': r.new,
            'Active': r.active,
            'Reviewed': r.reviewed,
            'Approved': r.approved,
            'Resolved': r.resolved,
            'Selection A': r.selectionA,
            'Selection B': r.selectionB,
            'Discipline Pair': r.disciplinePair
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Clash Details");
        XLSX.writeFile(workbook, `Clash_Report_${file?.name || 'Analysis'}.xlsx`);
    };

    const handleExportPdf = () => {
        if (!clashData) return;
        const doc = new jspdf.jsPDF();
        
        doc.setFontSize(18);
        doc.text("Clash Analysis Report", 14, 22);
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Report for: ${file?.name || 'Navisworks Data'}`, 14, 30);

        // --- Summary Table ---
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text("Executive Summary", 14, 45);
        
        const summaryHeaders = [["Status", "Count", "Percentage"]];
        const summaryBody = Object.entries(clashData.statusCounts).map(([status, count]) => [
            status,
            count.toLocaleString(),
            `${clashData.totalClashes > 0 ? ((Number(count) / Number(clashData.totalClashes)) * 100).toFixed(1) : 0}%`
        ]);

        (doc as any).autoTable({
            startY: 50,
            head: summaryHeaders,
            body: summaryBody,
            theme: 'grid',
            headStyles: { fillColor: [30, 41, 59] }
        });

        // --- Detailed Table ---
        doc.addPage();
        doc.setFontSize(16);
        doc.text("Detailed Clash Tests", 14, 22);
        
        const detailedHeaders = [["Clash Test", "Total", "New", "Active", "Reviewed", "Approved", "Resolved"]];
        const detailedBody = clashData.rows.map(r => [
            r.name,
            r.clashes,
            r.new,
            r.active,
            r.reviewed,
            r.approved,
            r.resolved
        ]);

        (doc as any).autoTable({
            startY: 30,
            head: detailedHeaders,
            body: detailedBody,
            theme: 'striped',
            headStyles: { fillColor: [30, 41, 59] },
            styles: { fontSize: 8 }
        });

        doc.save(`Clash_Report_${file?.name || 'Analysis'}.pdf`);
    };

    // --- Drag & Drop ---
    const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        if (e.dataTransfer.files?.[0]) handleFileChange(e.dataTransfer.files[0]);
    };

    // --- Render Helpers ---

    const renderDashboard = () => {
        if (!clashData) return null;
        const { totalClashes, statusCounts, rows } = clashData;

        const top10Tests = [...rows].sort((a, b) => b.active - a.active).slice(0, 10);
        const maxActive = top10Tests.length > 0 ? top10Tests[0].active : 0;

        const statusColors: Record<string, string> = {
            New: '#ef4444',
            Active: '#f97316',
            Reviewed: '#3b82f6',
            Approved: '#22c55e',
            Resolved: '#64748b',
        };

        return (
            <div className="space-y-8 animate-fade-in">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {Object.entries(statusCounts).map(([status, count]) => (
                        <div key={status} className="bg-slate-700/50 p-4 rounded-lg border border-slate-600 text-center shadow-sm">
                            <div className="text-sm text-slate-400 mb-2">{status}</div>
                            <div className="text-3xl font-bold text-slate-100">{(count as number).toLocaleString()}</div>
                            <div className="text-sm font-bold text-sky-400 mt-2">
                                {/* Fix: Ensure operands of division are treated as numbers */}
                                {Number(totalClashes) > 0 ? ((Number(count) / Number(totalClashes)) * 100).toFixed(1) : 0}%
                            </div>
                        </div>
                    ))}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 flex flex-col items-center shadow-lg">
                        <h3 className="text-lg font-bold text-slate-200 mb-6">Clash Status Distribution</h3>
                        <div className="relative mb-10 flex items-center justify-center">
                            <StatusPieChart counts={statusCounts} total={totalClashes} />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full px-4">
                            {Object.entries(statusCounts).map(([status, count]) => {
                                const val = count as number;
                                // Fix: Explicitly ensure arithmetic operands are numbers to avoid potential typing errors
                                const percentage = Number(totalClashes) > 0 ? ((Number(val) / Number(totalClashes)) * 100).toFixed(1) : 0;
                                return (
                                <div key={status} className="flex items-center gap-3 bg-slate-900/40 border border-slate-700/50 rounded-xl px-4 py-3 shadow-sm hover:border-slate-600 transition-colors">
                                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: statusColors[status] }}></div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <span className="text-slate-300 text-xs font-bold uppercase tracking-tight">{status}</span>
                                        </div>
                                        <div className="flex items-baseline gap-1.5 mt-0.5">
                                            <span className="text-slate-100 text-sm font-black">{val.toLocaleString()}</span>
                                            <span className="text-sky-400 text-[10px] font-bold">({percentage}%)</span>
                                        </div>
                                    </div>
                                </div>
                            )})}
                        </div>
                    </div>

                    <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
                        <h3 className="text-lg font-bold text-slate-200 mb-6">Top 10 Worst Clash Test (Active Only)</h3>
                        <div className="space-y-5">
                            {top10Tests.map((test) => {
                                const val = test.active;
                                return (
                                <div key={test.name}>
                                    <div className="flex justify-between text-xs mb-1.5">
                                        <span className="font-medium text-slate-300 truncate max-w-[60%]">{test.name}</span>
                                        <span>
                                            <span className="font-bold text-slate-100">{val.toLocaleString()}</span>
                                            <span className="text-slate-500 ml-1">(Active)</span>
                                        </span>
                                    </div>
                                    <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
                                        <div 
                                            className="bg-orange-500 h-3 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(249,115,22,0.3)]"
                                            // Fix: Explicitly ensure arithmetic operands are numbers for style calculation
                                            style={{ width: Number(maxActive) > 0 ? `${(Number(val) / Number(maxActive)) * 100}%` : '0%' }}
                                        ></div>
                                    </div>
                                </div>
                            )})}
                            {top10Tests.length === 0 && (
                                <div className="text-center text-slate-500 py-8">No data available.</div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderClashTests = () => {
        if (!clashData) return null;
        const sortedRows = [...clashData.rows].sort((a, b) => b.clashes - a.clashes);
        const maxTotal = sortedRows.length > 0 ? sortedRows[0].clashes : 0;

        return (
            <div className="bg-slate-800 shadow-lg rounded-xl border border-slate-700 overflow-hidden animate-fade-in">
                <div className="p-4 border-b border-slate-700 bg-slate-800/50">
                    <h3 className="text-lg font-bold text-slate-200">Clash Test List</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-slate-300">
                        <thead className="text-xs text-slate-400 uppercase bg-slate-800/50 sticky top-0 z-10">
                            <tr>
                                <th className="px-6 py-3 bg-slate-800">Clash Test</th>
                                <th className="px-6 py-3 bg-slate-800">Total</th>
                                <th className="px-6 py-3 bg-slate-800 text-red-400">New</th>
                                <th className="px-6 py-3 bg-slate-800 text-orange-400">Active</th>
                                <th className="px-6 py-3 bg-slate-800 text-blue-400">Reviewed</th>
                                <th className="px-6 py-3 bg-slate-800 text-green-400">Approved</th>
                                <th className="px-6 py-3 bg-slate-800 text-slate-400">Resolved</th>
                                <th className="px-6 py-3 bg-slate-800 min-w-[200px]">Distribution Bar</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedRows.map((row, idx) => (
                                <tr key={idx} className="border-b border-slate-700 hover:bg-slate-700/30 transition-colors">
                                    <td className="px-6 py-4 font-medium text-slate-200">{row.name}</td>
                                    <td className="px-6 py-4 font-bold text-white bg-slate-700/30">{row.clashes}</td>
                                    <td className="px-6 py-4 text-red-300">{row.new}</td>
                                    <td className="px-6 py-4 text-orange-300">{row.active}</td>
                                    <td className="px-6 py-4 text-blue-300">{row.reviewed}</td>
                                    <td className="px-6 py-4 text-green-300">{row.approved}</td>
                                    <td className="px-6 py-4 text-slate-500">{row.resolved}</td>
                                    <td className="px-6 py-4 font-mono text-xs text-sky-400 tracking-tighter">
                                        {generateAsciiBar(row.clashes, maxTotal)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    };

    const renderDisciplineChart = () => {
        if (!clashData) return null;
        const { disciplinePairCounts, totalClashes } = clashData;
        const sortedPairs = (Object.entries(disciplinePairCounts) as [string, number][]).sort(([, a], [, b]) => b - a);
        const maxCount = sortedPairs.length > 0 ? sortedPairs[0][1] : 0;

        return (
            <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-lg">
                <h3 className="text-lg font-bold text-slate-200 mb-6">Analysis Per Discipline (Horizontal Bar Chart)</h3>
                <div className="space-y-4">
                    {sortedPairs.map(([pair, count]) => {
                        const val = count as number;
                        // Fix: Ensure arithmetic operands are treated as numbers in the division
                        const percentage = Number(totalClashes) > 0 ? (Number(val) / Number(totalClashes)) * 100 : 0;
                        return (
                            <div key={pair}>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="font-medium text-slate-300">{pair}</span>
                                    <span className="text-slate-400">
                                        <span className="font-bold text-white">{val.toLocaleString()}</span>
                                        <span className="ml-1 text-xs">({percentage.toFixed(1)}%)</span>
                                    </span>
                                </div>
                                <div className="w-full bg-slate-700 rounded-full h-4 overflow-hidden">
                                    <div 
                                        className="bg-sky-500 h-4 rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(14,165,233,0.3)]"
                                        // Fix: Explicitly ensure arithmetic operands are numbers for style calculation
                                        style={{ width: Number(maxCount) > 0 ? `${(Number(val) / Number(maxCount)) * 100}%` : '0%' }}
                                    ></div>
                                </div>
                            </div>
                        );
                    })}
                    {sortedPairs.length === 0 && (
                        <div className="text-center text-slate-500 py-8">No discipline pairs found.</div>
                    )}
                </div>
            </div>
        );
    }

    const renderCheckPerDiscipline = () => {
        if (!clashData) return null;
        return (
            <div className="space-y-8 animate-fade-in">
                {renderDisciplineChart()}
            </div>
        );
    };

    const renderFilterPerDiscipline = () => {
        if (!clashData) return null;
        const { rows } = clashData;
        const disc1Options = Array.from(new Set(rows.map(r => r.disciplineA))).filter(Boolean).sort();
        const disc2Options = Array.from(new Set(rows.map(r => r.disciplineB))).filter(Boolean).sort();

        const filteredRows = rows.filter(row => {
            const { disciplineA, disciplineB } = row;
            const match1 = (catDisc1 === 'All' || disciplineA === catDisc1);
            const match2 = (catDisc2 === 'All' || disciplineB === catDisc2);
            return match1 && match2;
        });

        const totalFilteredClashes = filteredRows.reduce((sum, r) => sum + r.clashes, 0);
        const totalNew = filteredRows.reduce((sum, r) => sum + r.new, 0);
        const totalActive = filteredRows.reduce((sum, r) => sum + r.active, 0);
        const totalReviewed = filteredRows.reduce((sum, r) => sum + r.reviewed, 0);
        const totalApproved = filteredRows.reduce((sum, r) => sum + r.approved, 0);
        const totalResolved = filteredRows.reduce((sum, r) => sum + r.resolved, 0);

        return (
            <div className="space-y-6 animate-fade-in">
                <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-lg">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-slate-200">Filter by Discipline</h3>
                        <button onClick={() => { setCatDisc1('All'); setCatDisc2('All'); }} className="text-xs text-sky-400 hover:text-sky-300 underline">Clear Filters</button>
                    </div>
                    
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-slate-400 mb-1">Filter Discipline 1 (Selection A)</label>
                            <select value={catDisc1} onChange={(e) => setCatDisc1(e.target.value)} className="w-full p-2.5 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:ring-2 focus:ring-sky-500">
                                <option value="All">All Disciplines</option>
                                {disc1Options.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-slate-400 mb-1">Filter Discipline 2 (Selection B)</label>
                            <select value={catDisc2} onChange={(e) => setCatDisc2(e.target.value)} className="w-full p-2.5 bg-slate-700 border border-slate-600 rounded-lg text-slate-200 focus:ring-2 focus:ring-sky-500">
                                <option value="All">All Disciplines</option>
                                {disc2Options.map(d => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="mt-4 text-sm text-slate-400">Found <span className="font-bold text-white">{filteredRows.length}</span> clash tests matching filters. Total Clashes: <span className="font-bold text-white">{totalFilteredClashes.toLocaleString()}</span>.</div>
                </div>

                <div className="bg-slate-800 shadow-lg rounded-xl border border-slate-700 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-slate-300">
                            <thead className="text-xs text-slate-400 uppercase bg-slate-800/50 sticky top-0 z-10">
                                <tr>
                                    <th className="px-6 py-3 bg-slate-800">Test Name</th>
                                    <th className="px-6 py-3 bg-slate-800 text-center">Total</th>
                                    <th className="px-6 py-3 bg-slate-800 text-center text-red-400">New</th>
                                    <th className="px-6 py-3 bg-slate-800 text-center text-orange-400">Active</th>
                                    <th className="px-6 py-3 bg-slate-800 text-center text-blue-400">Reviewed</th>
                                    <th className="px-6 py-3 bg-slate-800 text-center text-green-400">Approved</th>
                                    <th className="px-6 py-3 bg-slate-800 text-center text-slate-400">Resolved</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRows.length > 0 ? filteredRows.map((row, idx) => (
                                    <tr key={idx} className="border-b border-slate-700 hover:bg-slate-700/30 transition-colors">
                                        <td className="px-6 py-4 font-medium text-slate-200">{row.name}</td>
                                        <td className="px-6 py-4 text-center font-bold text-white bg-slate-700/30">{row.clashes}</td>
                                        <td className="px-6 py-4 text-center text-red-300">{row.new}</td>
                                        <td className="px-6 py-4 text-center text-orange-300">{row.active}</td>
                                        <td className="px-6 py-4 text-center text-blue-300">{row.reviewed}</td>
                                        <td className="px-6 py-4 text-center text-green-300">{row.approved}</td>
                                        <td className="px-6 py-4 text-center text-slate-500">{row.resolved}</td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-500">No clash tests found matching this discipline pair.</td></tr>
                                )}
                            </tbody>
                            {filteredRows.length > 0 && (
                                <tfoot className="text-xs font-bold uppercase bg-slate-700/50 border-t border-slate-600">
                                    <tr>
                                        <td className="px-6 py-4 text-right text-slate-200">Total</td>
                                        <td className="px-6 py-4 text-center text-white">{totalFilteredClashes.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-center text-red-300">{totalNew.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-center text-orange-300">{totalActive.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-center text-blue-300">{totalReviewed.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-center text-green-300">{totalApproved.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-center text-slate-500">{totalResolved.toLocaleString()}</td>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col items-center w-full animate-fade-in relative">
            <div className="w-full max-w-4xl bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl border border-slate-700 mb-8">
                <h2 className="text-xl font-bold text-center mb-4 text-slate-200">{STRINGS.clashAnalysisPage}</h2>
                {!clashData ? (
                    <>
                        <label onDragEnter={handleDragEnter} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} htmlFor="clash-upload" className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer bg-slate-800/50 hover:bg-slate-700/50 transition-all duration-300 ${isDragging ? 'border-sky-400 scale-105' : 'border-slate-600'}`}>
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <svg className="w-10 h-10 mb-3 text-slate-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2" /></svg>
                                <p className="mb-2 text-sm text-slate-400"><span className="font-semibold text-sky-400">{STRINGS.uploadButton}</span> {STRINGS.dropHere}</p>
                                <p className="text-xs text-slate-500">Navisworks Export (Excel)</p>
                            </div>
                            <input id="clash-upload" type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={e => handleFileChange(e.target.files ? e.target.files[0] : null)} />
                        </label>
                        {file && <div className="mt-4 text-center text-sm text-slate-300"><span className="font-medium">Selected:</span> {file.name}</div>}
                        <button onClick={analyzeFile} disabled={!file || isLoading} className="mt-6 w-full bg-sky-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-sky-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-all duration-300">{isLoading ? STRINGS.analyzing : STRINGS.clashAnalyzeButton}</button>
                        {error && <p className="mt-4 text-center text-red-400">{error}</p>}
                    </>
                ) : (
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <div>
                            <h3 className="font-bold text-slate-200 text-lg truncate max-w-[300px]">{file?.name}</h3>
                            <p className="text-sm text-slate-400">Total Clashes: {clashData.totalClashes.toLocaleString()}</p>
                        </div>
                         <div className="flex flex-wrap gap-2">
                            <button onClick={handleExportExcel} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-700 hover:bg-slate-600 rounded-md transition-colors shadow-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-green-400" viewBox="0 0 20 20" fill="currentColor"><path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5zm3 1h10v2H5V6zm0 3h10v2H5V9zm0 3h10v2H5v-2z" /></svg>
                                {STRINGS.exportExcel}
                            </button>
                            <button onClick={handleExportPdf} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-200 bg-slate-700 hover:bg-slate-600 rounded-md transition-colors shadow-sm">
                                <PdfIcon className="h-4 w-4 text-red-400" />
                                {STRINGS.exportPdf}
                            </button>
                            <button onClick={() => { setClashData(null); setFile(null); }} className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-100 bg-red-600/80 hover:bg-red-600 rounded-md transition-colors shadow-lg">
                                Reset
                            </button>
                        </div>
                    </div>
                )}
            </div>
            {isLoading && <div className="mb-8"><Loader text={STRINGS.analyzing} /></div>}
            {clashData && (
                <div className="w-full max-w-7xl">
                    <div className="bg-slate-800 rounded-t-xl border-b border-slate-700 flex overflow-x-auto no-scrollbar">
                        <TabButton isActive={activeTab === 'dashboard'} onClick={() => setActiveTab('dashboard')}>Summary Dashboard</TabButton>
                        <TabButton isActive={activeTab === 'discipline'} onClick={() => setActiveTab('discipline')}>Clash Test</TabButton>
                        <TabButton isActive={activeTab === 'check_discipline'} onClick={() => setActiveTab('check_discipline')}>Check Per Discipline</TabButton>
                        <TabButton isActive={activeTab === 'filter_discipline'} onClick={() => setActiveTab('filter_discipline')}>Filter Per Discipline</TabButton>
                    </div>
                    <div className="bg-slate-900 py-8 min-h-[500px]">
                        {activeTab === 'dashboard' && renderDashboard()}
                        {activeTab === 'discipline' && renderClashTests()}
                        {activeTab === 'check_discipline' && renderCheckPerDiscipline()}
                        {activeTab === 'filter_discipline' && renderFilterPerDiscipline()}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ClashAnalysisPage;
