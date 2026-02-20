
import React, { useState, useCallback, useMemo } from 'react';
import { STRINGS } from '../constants';
import Loader from '../components/Loader';

declare const XLSX: any;
declare const jspdf: any;

type DeliverableStatus = {
    building: string;
    deliverable: string;
    latestUpdate: Date | null;
    latestFileName: string;
    status: 'OK' | 'Late';
};

type WeeklySummary = {
    total: number;
    ok: number;
    late: number;
    windowStart: Date;
    windowEnd: Date;
};

const WeeklyUpdatesPage: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [analysisResult, setAnalysisResult] = useState<DeliverableStatus[] | null>(null);
    const [summary, setSummary] = useState<WeeklySummary | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    /**
     * Logic: Friday starts a new delivery cycle. Thursday is the deadline.
     * The "Current Week" window starts on the most recent Friday and ends the following Thursday.
     */
    const getDeliveryWindow = () => {
        const today = new Date();
        const day = today.getDay(); // 0: Sun, 1: Mon, ..., 4: Thu, 5: Fri, 6: Sat
        
        // Find the most recent Friday
        // If today is Friday(5), diff is 0.
        // If today is Sat(6), diff is 1.
        // If today is Sun(0), diff is 2.
        // If today is Mon(1), diff is 3.
        // If today is Tue(2), diff is 4.
        // If today is Wed(3), diff is 5.
        // If today is Thu(4), diff is 6.
        const diffToFri = (day + 2) % 7; 
        
        const windowStart = new Date(today);
        windowStart.setDate(today.getDate() - diffToFri);
        windowStart.setHours(0, 0, 0, 0);

        const windowEnd = new Date(windowStart);
        windowEnd.setDate(windowStart.getDate() + 6);
        windowEnd.setHours(23, 59, 59, 999);

        return { start: windowStart, end: windowEnd };
    };

    const handleFileChange = useCallback((selectedFile: File | null) => {
        if (!selectedFile) {
            setFile(null);
            setAnalysisResult(null);
            setSummary(null);
            return;
        }
        setFile(selectedFile);
        setError(null);
    }, []);

    const parseExcel = () => {
        if (!file) return;
        setIsLoading(true);
        setError(null);

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = event.target?.result;
                const workbook = XLSX.read(data, { type: 'binary' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const json = XLSX.utils.sheet_to_json(worksheet);

                if (json.length === 0) {
                    throw new Error("The file is empty.");
                }

                // Header normalization logic
                const headers = Object.keys(json[0] || {});
                const findHeader = (target: string) => headers.find(h => 
                    h.toLowerCase().trim().replace(/\s+/g, '') === target.toLowerCase().trim().replace(/\s+/g, '')
                );

                const pathHeader = findHeader('Folder name and path');
                const nameHeader = findHeader('Name');
                const updateHeader = findHeader('Last Updated');

                if (!pathHeader || !nameHeader || !updateHeader) {
                    throw new Error("Required columns not found. Ensure the file has 'Folder name and path', 'Name', and 'Last Updated'.");
                }

                const window = getDeliveryWindow();
                const groupings: Record<string, { latest: Date | null, fileName: string }> = {};

                json.forEach((row: any) => {
                    const path = String(row[pathHeader] || '');
                    const segments = path.split('/');
                    
                    /**
                     * Folder Path Logic:
                     * 3rd item = Building Name (Index 2)
                     * 4th item = Deliverable (Index 3)
                     */
                    if (segments.length < 4) return;
                    
                    const building = segments[2]?.trim();
                    const deliverable = segments[3]?.trim();
                    
                    if (!building || !deliverable) return;

                    const groupKey = `${building} ||| ${deliverable}`;

                    let updateDate: Date | null = null;
                    const rawDateValue = row[updateHeader];
                    
                    if (rawDateValue) {
                        // Handle standard JS date parsing or Excel serial
                        if (typeof rawDateValue === 'number') {
                            updateDate = new Date((rawDateValue - 25569) * 86400 * 1000);
                        } else {
                            // Example format from prompt: "Jan 15, 2026 2:24 PM"
                            updateDate = new Date(rawDateValue);
                        }
                    }

                    if (updateDate && !isNaN(updateDate.getTime())) {
                        if (!groupings[groupKey] || updateDate > (groupings[groupKey].latest || new Date(0))) {
                            groupings[groupKey] = {
                                latest: updateDate,
                                fileName: String(row[nameHeader] || 'Unknown')
                            };
                        }
                    } else if (!groupings[groupKey]) {
                         groupings[groupKey] = {
                            latest: null,
                            fileName: 'No valid date found'
                        };
                    }
                });

                const results: DeliverableStatus[] = Object.entries(groupings).map(([key, info]) => {
                    const [building, deliverable] = key.split(' ||| ');
                    // "OK" if updated within the current window (Fri to Thu)
                    const status = (info.latest && info.latest >= window.start && info.latest <= window.end) ? 'OK' : 'Late';
                    return {
                        building,
                        deliverable,
                        latestUpdate: info.latest,
                        latestFileName: info.fileName,
                        status
                    };
                });

                // Sort by Building then Deliverable
                results.sort((a, b) => a.building.localeCompare(b.building) || a.deliverable.localeCompare(b.deliverable));

                const okCount = results.filter(r => r.status === 'OK').length;
                
                setAnalysisResult(results);
                setSummary({
                    total: results.length,
                    ok: okCount,
                    late: results.length - okCount,
                    windowStart: window.start,
                    windowEnd: window.end
                });

            } catch (err) {
                setError(err instanceof Error ? err.message : "Error parsing file.");
            } finally {
                setIsLoading(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleExport = () => {
        if (!analysisResult || !summary) return;
        
        const dataToExport = analysisResult.map(r => ({
            'Building': r.building,
            'Deliverable': r.deliverable,
            'Weekly Status': r.status,
            'Latest Update Date': r.latestUpdate ? r.latestUpdate.toLocaleString() : 'N/A',
            'Latest File Name': r.latestFileName
        }));

        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Weekly Delivery Report");
        XLSX.writeFile(workbook, `Weekly_Report_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return (
        <div className="flex flex-col items-center w-full animate-fade-in">
            <div className="w-full max-w-2xl bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl border border-slate-700">
                <div className="flex items-center justify-center gap-3 mb-2">
                    <svg className="w-8 h-8 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    <h2 className="text-xl font-bold text-slate-200">{STRINGS.uploadWeeklyExcel}</h2>
                </div>
                <p className="text-center text-xs text-slate-400 mb-6">{STRINGS.deliveryCycle}</p>

                <label
                    onDragEnter={() => setIsDragging(true)}
                    onDragOver={(e) => e.preventDefault()}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={(e) => { e.preventDefault(); setIsDragging(false); handleFileChange(e.dataTransfer.files[0]); }}
                    htmlFor="weekly-upload"
                    className={`flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer bg-slate-800/50 hover:bg-slate-700/50 transition-all duration-300 ${isDragging ? 'border-sky-400 scale-105 shadow-[0_0_20px_rgba(56,189,248,0.2)]' : 'border-slate-600'}`}
                >
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <svg className={`w-10 h-10 mb-3 transition-transform duration-300 ${isDragging ? 'scale-110' : ''} text-slate-500`} aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2" /></svg>
                        <p className="mb-2 text-sm text-slate-400 font-semibold text-sky-400">{STRINGS.uploadButton}</p>
                        <p className="text-[10px] text-slate-500">Folder Path, Name, Last Updated columns required</p>
                    </div>
                    <input id="weekly-upload" type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={e => handleFileChange(e.target.files ? e.target.files[0] : null)} />
                </label>

                {file && <div className="mt-4 text-center text-sm text-slate-300 truncate font-medium bg-slate-700/50 py-2 px-3 rounded-md border border-slate-600">Selected: {file.name}</div>}

                <button
                    onClick={parseExcel}
                    disabled={!file || isLoading}
                    className="mt-8 w-full bg-sky-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-sky-500 disabled:bg-slate-600 transition-all duration-300 transform hover:scale-[1.02] shadow-lg shadow-sky-600/20 active:scale-95"
                >
                    {isLoading ? STRINGS.analyzing : STRINGS.analyzeWeekly}
                </button>
                {error && <p className="mt-4 text-center text-red-400 text-sm font-medium">{error}</p>}
            </div>

            {isLoading && <div className="mt-8"><Loader text="Extracting folder logic..." /></div>}

            {summary && analysisResult && (
                <div className="mt-8 w-full max-w-6xl animate-fade-in space-y-6">
                    {/* Summary Dashboard Dashboard */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl text-center flex flex-col justify-center transform transition hover:scale-105">
                            <h4 className="text-slate-400 text-xs font-black uppercase tracking-[0.2em] mb-3">Unique Deliverables</h4>
                            <div className="text-5xl font-black text-slate-100">{summary.total}</div>
                            <div className="mt-4 w-full bg-slate-700 h-1 rounded-full overflow-hidden">
                                <div className="bg-sky-500 h-full w-full"></div>
                            </div>
                        </div>
                        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl text-center flex flex-col justify-center transform transition hover:scale-105 border-b-4 border-b-green-500/50">
                            <h4 className="text-green-400 text-xs font-black uppercase tracking-[0.2em] mb-3">On Time (OK)</h4>
                            <div className="text-5xl font-black text-green-500">{summary.ok}</div>
                            <div className="mt-4 w-full bg-slate-700 h-1 rounded-full overflow-hidden">
                                <div className="bg-green-500 h-full" style={{ width: `${(summary.ok / summary.total) * 100}%` }}></div>
                            </div>
                        </div>
                        <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl text-center flex flex-col justify-center transform transition hover:scale-105 border-b-4 border-b-red-500/50">
                            <h4 className="text-red-400 text-xs font-black uppercase tracking-[0.2em] mb-3">Pending (Late)</h4>
                            <div className="text-5xl font-black text-red-500">{summary.late}</div>
                            <div className="mt-4 w-full bg-slate-700 h-1 rounded-full overflow-hidden">
                                <div className="bg-red-500 h-full" style={{ width: `${(summary.late / summary.total) * 100}%` }}></div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-2xl overflow-hidden">
                        <div className="p-5 sm:p-8 bg-slate-800/80 backdrop-blur border-b border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div>
                                <h3 className="text-xl font-black text-slate-100 tracking-tight">{STRINGS.weeklySummary}</h3>
                                <div className="flex items-center gap-2 mt-2">
                                    <span className="px-2 py-0.5 bg-sky-500/10 text-sky-400 text-[10px] font-bold rounded border border-sky-500/20 uppercase tracking-widest">
                                        Current Window
                                    </span>
                                    <p className="text-xs text-slate-400 font-mono">
                                        {summary.windowStart.toLocaleDateString()} — {summary.windowEnd.toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                            <button 
                                onClick={handleExport} 
                                className="flex items-center gap-2 px-6 py-2.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm font-bold text-slate-100 transition-all shadow-lg active:scale-95"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                Export CSV
                            </button>
                        </div>
                        
                        <div className="overflow-x-auto max-h-[500px]">
                            <table className="w-full text-sm text-left text-slate-300">
                                <thead className="text-xs text-slate-400 uppercase bg-slate-900/80 sticky top-0 backdrop-blur z-10">
                                    <tr>
                                        <th className="px-8 py-5 border-b border-slate-700">Building Name</th>
                                        <th className="px-8 py-5 border-b border-slate-700">Deliverable Type</th>
                                        <th className="px-8 py-5 border-b border-slate-700">Latest Update</th>
                                        <th className="px-8 py-5 border-b border-slate-700 text-center">Cycle Status</th>
                                        <th className="px-8 py-5 border-b border-slate-700">Latest File Reference</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-700/50">
                                    {analysisResult.map((row, idx) => (
                                        <tr key={idx} className="hover:bg-slate-700/30 transition-all duration-200 group">
                                            <td className="px-8 py-4">
                                                <div className="font-bold text-slate-200 group-hover:text-sky-300 transition-colors">{row.building}</div>
                                                <div className="text-[9px] text-slate-500 font-mono mt-0.5">FOLDER LVL 3</div>
                                            </td>
                                            <td className="px-8 py-4">
                                                <span className="px-2 py-1 bg-slate-700 text-sky-400 font-mono text-[10px] rounded border border-slate-600 uppercase">
                                                    {row.deliverable}
                                                </span>
                                            </td>
                                            <td className="px-8 py-4">
                                                <div className="text-xs font-semibold text-slate-300">
                                                    {row.latestUpdate ? row.latestUpdate.toLocaleDateString() : 'N/A'}
                                                </div>
                                                <div className="text-[10px] text-slate-500 mt-0.5">
                                                    {row.latestUpdate ? row.latestUpdate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Date Missing'}
                                                </div>
                                            </td>
                                            <td className="px-8 py-4 text-center">
                                                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter border ${
                                                    row.status === 'OK' 
                                                        ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                                                        : 'bg-red-500/10 text-red-400 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.1)]'
                                                }`}>
                                                    <div className={`w-1.5 h-1.5 rounded-full ${row.status === 'OK' ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></div>
                                                    {row.status}
                                                </div>
                                            </td>
                                            <td className="px-8 py-4">
                                                <div className="text-[11px] text-slate-400 truncate max-w-[240px] italic font-mono bg-slate-900/30 p-1.5 rounded" title={row.latestFileName}>
                                                    {row.latestFileName}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {analysisResult.length === 0 && (
                            <div className="py-20 text-center text-slate-500 italic">
                                No valid data matching the building/deliverable folder structure was found.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default WeeklyUpdatesPage;
