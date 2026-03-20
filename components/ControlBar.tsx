
import React, { useRef } from 'react';
import { ZONES, DIVISIONS } from '../constants';
import { ChartConfig, TrainPath } from '../types';

interface ControlBarProps {
  config: ChartConfig;
  onConfigChange: (config: ChartConfig) => void;
  onOpenAddModal: (mode?: 'EXTRACT') => void;
  onSave: () => void;
  onImport: (data: TrainPath[]) => void;
  trains: TrainPath[];
}

const SHIFTS = [
  { id: 'ALL_DAY', label: 'Full Day (24h)', icon: '🕒' },
  { id: 'NIGHT', label: 'Night (00-06)', icon: '🌙' },
  { id: 'MORNING', label: 'Morning (06-12)', icon: '☀️' },
  { id: 'AFTERNOON', label: 'Afternoon (12-18)', icon: '🌥️' },
  { id: 'EVENING', label: 'Evening (18-24)', icon: '🌆' },
];

const ControlBar: React.FC<ControlBarProps> = ({ config, onConfigChange, /*onOptimize,*/ onOpenAddModal, onSave, onImport, trains, /*isOptimizing*/ }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const filteredDivisions = DIVISIONS.filter(d => d.zoneId === config.zone);
  const currentDivision = filteredDivisions.find(d => d.id === config.division) || filteredDivisions[0];

  const handleZoneChange = (zoneId: string) => {
    const divs = DIVISIONS.filter(d => d.zoneId === zoneId);
    onConfigChange({
      ...config,
      zone: zoneId,
      division: divs[0]?.id || '',
      board: divs[0]?.boards[0] || ''
    });
  };

  const handleDivisionChange = (divisionId: string) => {
    const div = DIVISIONS.find(d => d.id === divisionId);
    onConfigChange({
      ...config,
      division: divisionId,
      board: div?.boards[0] || ''
    });
  };

  const handleShiftChange = (shiftId: any) => {
    onConfigChange({ ...config, shift: shiftId });
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            onImport(parsed);
          } else {
            alert("Invalid registry format.");
          }
        } catch (err) {
          alert("Error parsing registry file.");
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="bg-slate-900 text-white p-3 flex flex-wrap items-center gap-4 text-xs lg:text-sm sticky top-0 z-20 shadow-xl border-b border-slate-800">
      <div className="flex items-center gap-2 border-r border-slate-700 pr-4">
        <label className="font-bold text-slate-500 uppercase text-[10px]">Zone:</label>
        <select 
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500"
          value={config.zone}
          onChange={(e) => handleZoneChange(e.target.value)}
        >
          {ZONES.map(z => <option key={z.id} value={z.id}>{z.code} - {z.name}</option>)}
        </select>
      </div>

      <div className="flex items-center gap-2 border-r border-slate-700 pr-4">
        <label className="font-bold text-slate-500 uppercase text-[10px]">Division:</label>
        <select 
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500"
          value={config.division}
          onChange={(e) => handleDivisionChange(e.target.value)}
        >
          {filteredDivisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      <div className="flex items-center gap-2 border-r border-slate-700 pr-4">
        <label className="font-bold text-slate-500 uppercase text-[10px]">Board:</label>
        <select 
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500"
          value={config.board}
          onChange={(e) => onConfigChange({ ...config, board: e.target.value })}
        >
          {currentDivision?.boards.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      <div className="flex items-center gap-2 border-r border-slate-700 pr-4">
        <label className="font-bold text-slate-500 uppercase text-[10px]">Date:</label>
        <input 
          type="date" 
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-500 invert"
          value={config.date}
          onChange={(e) => onConfigChange({ ...config, date: e.target.value })}
        />
      </div>

      <div className="flex items-center gap-1 border-r border-slate-700 pr-4">
        <label className="font-bold text-slate-500 uppercase text-[10px] mr-1">Shift:</label>
        <div className="flex bg-slate-800 p-0.5 rounded border border-slate-700">
          {SHIFTS.map(s => (
            <button
              key={s.id}
              onClick={() => handleShiftChange(s.id)}
              title={s.label}
              className={`px-2 py-1 rounded text-[10px] font-black transition-all ${
                config.shift === s.id 
                  ? 'bg-indigo-600 text-white shadow-md' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <span className="mr-1">{s.icon}</span>
              <span className="hidden xl:inline">{s.id.replace('_', ' ')}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-grow"></div>

      <div className="flex items-center gap-2">
        <button 
          onClick={() => onOpenAddModal('EXTRACT')}
          className="flex items-center gap-2 px-3 py-1.5 rounded font-bold bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 transition-all text-[10px] uppercase tracking-widest text-indigo-400"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 00-1 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
          Extract PDF
        </button>
        <button 
          onClick={handleImportClick}
          className="flex items-center gap-2 px-3 py-1.5 rounded font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all text-[10px] uppercase tracking-widest text-slate-300"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          Import JSON
        </button>
        <input type="file" ref={fileInputRef} className="hidden" accept=".json" onChange={handleFileChange} />
      </div>

      <div className="flex items-center gap-3 ml-2 border-l border-slate-700 pl-4">
        <button 
          onClick={() => onOpenAddModal()}
          className="flex items-center gap-2 px-3 py-1.5 rounded font-black bg-emerald-600 hover:bg-emerald-500 transition-all text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-900/40"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" />
          </svg>
          New Train
        </button>

      </div>
    </div>
  );
};

export default ControlBar;
