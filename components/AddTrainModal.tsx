
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TrainPath, TrainType, Station, SchedulePoint, ChartConfig } from '../types';
import { TRAIN_PRIORITY_MAP, DIVISIONS } from '../constants';
import { extractTextFromPdfFile, parseTimetableText } from '../services/pdfExtractor';

interface AddTrainModalProps {
  isOpen: boolean;
  onClose: () => void;
  // second argument: options { saveToServer?: boolean } - undefined or true = save to server
  onAdd: (train: TrainPath, options?: { saveToServer?: boolean }, detectedConfig?: Partial<ChartConfig>) => void;
  onUpdate?: (train: TrainPath) => void;
  stations: Station[];
  chartDate: string;
  initialTrain?: TrainPath | null;
  startTab?: 'MANUAL' | 'IMPORT' | 'EXTRACT' | 'REVIEW';
}

const TYPE_COLORS: Record<string, string> = {
  [TrainType.ARME_ART]: '#000000',
  [TrainType.VVIP_SPECIAL]: '#7e22ce',
  [TrainType.SUBURBAN]: '#0ea5e9',
  [TrainType.VANDE_BHARAT]: '#f97316',
  [TrainType.RAJDHANI]: '#dc2626',
  [TrainType.SHATABDI]: '#2563eb',
  [TrainType.DURONTO]: '#fbbf24',
  [TrainType.TEJAS]: '#db2777',
  [TrainType.GATIMAAN]: '#059669',
  [TrainType.GARIB_RATH]: '#16a34a',
  [TrainType.JAN_SHATABDI]: '#1e40af',
  [TrainType.SAMPARK_KRANTI]: '#ea580c',
  [TrainType.HUMSAFAR]: '#4f46e5',
  [TrainType.DOUBLE_DECKER]: '#ca8a04',
  [TrainType.UDAY]: '#7c3aed',
  [TrainType.SUPERFAST]: '#ef4444',
  [TrainType.EXPRESS]: '#f43f5e',
  [TrainType.INTERCITY]: '#0891b2',
  [TrainType.MILITARY_SPECIAL]: '#14532d',
  [TrainType.PASSENGER]: '#0e7490',
  [TrainType.MEMU_DEMU]: '#475569',
  [TrainType.ANTYODAYA]: '#9333ea',
  [TrainType.MIXED]: '#78350f',
  [TrainType.MILITARY_STORES]: '#422006',
  [TrainType.FREIGHT]: '#1e293b',
};

const DAYS = [
  { label: 'S', value: 0 },
  { label: 'M', value: 1 },
  { label: 'T', value: 2 },
  { label: 'W', value: 3 },
  { label: 'T', value: 4 },
  { label: 'F', value: 5 },
  { label: 'S', value: 6 },
];

const findStationGlobally = (stationId: string): Station | undefined => {
  if (!stationId) return undefined;
  for (const div of DIVISIONS) {
    const found = div.stations.find(s => s.id === stationId);
    if (found) return found;
  }
  return undefined;
};

const findStationByCode = (code: string, priorityStations?: Station[]): Station | null => {
  if (!code) return null;
  const cleanCode = code.trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (!cleanCode) return null;

  if (priorityStations) {
    const local = priorityStations.find(s => s.code === cleanCode);
    if (local) return local;
  }

  for (const div of DIVISIONS) {
    const match = div.stations.find(s => s.code.toUpperCase() === cleanCode);
    if (match) return match;
  }
  return null;
};

const normalizeRailwayTime = (timeStr: string): string | null => {
  if (!timeStr) return null;
  let cleanTime = timeStr.trim().toLowerCase();
  cleanTime = cleanTime.replace(/o/g, '0').replace(/[il]/g, '1');

  const isPM = cleanTime.includes('pm');
  const isAM = cleanTime.includes('am');
  cleanTime = cleanTime.replace(/[ap]m/g, '').trim();
  cleanTime = cleanTime.replace('.', ':');

  let hours = 0; let minutes = 0;
  if (cleanTime.includes(':')) {
    const parts = cleanTime.split(':');
    hours = parseInt(parts[0], 10);
    minutes = parseInt(parts[1], 10) || 0;
  } else {
    const numeric = cleanTime.replace(/\D/g, '');
    if (numeric.length === 4) {
      hours = parseInt(numeric.substring(0, 2), 10);
      minutes = parseInt(numeric.substring(2, 4), 10);
    }
    else if (numeric.length === 3) {
      hours = parseInt(numeric.substring(0, 1), 10);
      minutes = parseInt(numeric.substring(1, 3), 10);
    }
    else if (numeric.length > 0) {
      hours = parseInt(numeric, 10);
      minutes = 0;
    }
  }

  if (isNaN(hours) || isNaN(minutes)) return null;
  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;
  if (hours === 24) hours = 0;

  hours = Math.min(23, Math.max(0, hours));
  minutes = Math.min(59, Math.max(0, minutes));

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
};

interface UIStop {
  stationId: string;
  arrivalTime: string;
  departureTime: string;
  dayOffset: number;
  codeInput: string;
}

const parseDaysOfService = (daysStr: any): number[] => {
  if (Array.isArray(daysStr)) return daysStr;
  if (!daysStr || typeof daysStr !== 'string') return [0, 1, 2, 3, 4, 5, 6];

  const normalized = daysStr.toLowerCase().trim();
  if (normalized === 'daily') return [0, 1, 2, 3, 4, 5, 6];

  const daysMap: Record<string, number> = {
    'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6,
    'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6
  };

  if (normalized.startsWith('except ')) {
    const excludedStr = normalized.replace('except ', '').trim();
    const excludedParts = excludedStr.split(/[\s,]+/).map(d => d.trim().substring(0, 3));
    const excludedNums = excludedParts.map(d => daysMap[d]).filter(d => d !== undefined);
    const allDays = [0, 1, 2, 3, 4, 5, 6];
    return allDays.filter(d => !excludedNums.includes(d));
  }

  const parts = normalized.split(/[\s,]+/).map(d => d.trim().substring(0, 3));
  const nums = parts.map(d => daysMap[d]).filter(d => d !== undefined);
  return nums.length > 0 ? nums : [0, 1, 2, 3, 4, 5, 6];
};

const AddTrainModal: React.FC<AddTrainModalProps> = ({ isOpen, onClose, onAdd, onUpdate, stations, chartDate, initialTrain, startTab }) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeTab, setActiveTab] = useState<'MANUAL' | 'IMPORT' | 'EXTRACT' | 'REVIEW'>('MANUAL');
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<TrainType>(TrainType.VANDE_BHARAT);
  const [color, setColor] = useState(TYPE_COLORS[TrainType.VANDE_BHARAT]);
  const [priority, setPriority] = useState<number>(TRAIN_PRIORITY_MAP[TrainType.VANDE_BHARAT]);
  const [daysOfService, setDaysOfService] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [bulkText, setBulkText] = useState('');
  const [points, setPoints] = useState<UIStop[]>([]);
  const [detectedTrains, setDetectedTrains] = useState<TrainPath[]>([]);
  const [expandedReviewTrainId, setExpandedReviewTrainId] = useState<string | null>(null);
  const [autoSaveToServer, setAutoSaveToServer] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 });
  const [scanError, setScanError] = useState<{ message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const divisionStations = useMemo(() => {
    const grouped: Record<string, Station[]> = {};
    for (const div of DIVISIONS) {
      for (const stn of div.stations) {
        if (!grouped[stn.section || 'Uncategorized']) grouped[stn.section || 'Uncategorized'] = [];
        if (!grouped[stn.section || 'Uncategorized'].some(s => s.code === stn.code)) {
          grouped[stn.section || 'Uncategorized'].push(stn);
        }
      }
    }
    return grouped;
  }, []);

  useEffect(() => {
    if (isOpen) {
      if (initialTrain) {
        setNumber(initialTrain.number || '');
        setName(initialTrain.name || '');
        setType(initialTrain.type || TrainType.EXPRESS);
        setColor(initialTrain.color || TYPE_COLORS[initialTrain.type || TrainType.EXPRESS]);
        setPriority(initialTrain.priority || TRAIN_PRIORITY_MAP[initialTrain.type || TrainType.EXPRESS]);
        setDaysOfService([...(initialTrain.daysOfService || [0, 1, 2, 3, 4, 5, 6])]);

        const [y, m, d] = chartDate.split('-').map(Number);
        const chartBase = new Date(y, m - 1, d);

        setPoints((initialTrain.points || []).map(p => {
          const stn = findStationGlobally(p.stationId);
          const pDate = new Date(p.arrivalTime);
          const diffTime = pDate.getTime() - chartBase.getTime();
          const dayOffset = Math.floor(diffTime / (1000 * 60 * 60 * 24));

          return {
            stationId: p.stationId,
            codeInput: stn?.code || '',
            dayOffset: Math.max(0, dayOffset),
            arrivalTime: p.arrivalTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
            departureTime: p.departureTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
          };
        }));
        setActiveTab('MANUAL');
      } else {
        setNumber(''); setName('');
        const defaultType = TrainType.VANDE_BHARAT;
        setType(defaultType); setColor(TYPE_COLORS[defaultType]); setPriority(TRAIN_PRIORITY_MAP[defaultType]);
        setDaysOfService([0, 1, 2, 3, 4, 5, 6]);
        setPoints([{ stationId: stations[0]?.id || '', codeInput: stations[0]?.code || '', dayOffset: 0, arrivalTime: '08:00', departureTime: '08:05' }]);
        setActiveTab(startTab || 'MANUAL');
      }
      setDetectedTrains([]);
    }
  }, [initialTrain, isOpen, stations, chartDate, startTab]);

  const handleTypeChange = (newType: TrainType) => {
    setType(newType); setPriority(TRAIN_PRIORITY_MAP[newType]); setColor(TYPE_COLORS[newType]);
  };

  const handlePriorityChange = (newPriority: number) => {
    setPriority(newPriority);
  };

  const toggleDay = (day: number) => {
    if (daysOfService.includes(day)) {
      setDaysOfService(daysOfService.filter(d => d !== day));
    } else {
      setDaysOfService([...daysOfService, day]);
    }
  };

  const handleCodeChange = (index: number, code: string) => {
    const newPoints = [...points];
    newPoints[index].codeInput = code.toUpperCase();
    const station = findStationByCode(code, stations);
    if (station) {
      newPoints[index].stationId = station.id;
      newPoints[index].codeInput = station.code; // normalize exact code
    }
    setPoints(newPoints);
  };

  const movePoint = (index: number, direction: -1 | 1) => {
    const np = [...points];
    const target = index + direction;
    if (target < 0 || target >= np.length) return;
    const temp = np[target];
    np[target] = np[index];
    np[index] = temp;
    setPoints(np);
  };

  const processFiles = async (files: FileList) => {
    // no AI, just delegate to local extractor
    await processLocalExtract(files);
  };

  const processLocalExtract = async (files: FileList) => {
    setIsScanning(true);
    setScanError(null);
    setScanProgress({ current: 0, total: files.length });
    const [y, m, d] = chartDate.split('-').map(Number);

    try {
      const fileArray = Array.from(files);
      const collectedTrains: any[] = [];

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        setScanProgress({ current: i + 1, total: fileArray.length });
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          try {
            const text = await extractTextFromPdfFile(file);
            const parsed = parseTimetableText(text);
            if (parsed && parsed.trains && parsed.trains.length > 0) {
              const parsedStations = parsed.trains[0].stops;
              console.log("PARSED STATIONS:", parsedStations.length);
              console.log(parsedStations);
              collectedTrains.push(...parsed.trains);
            }
          } catch (ex) {
            console.error('Local PDF parse failed for', file.name, ex);
          }
        } else {
          // non-pdf: skip for now
        }
        await new Promise(r => setTimeout(r, 300));
      }

      if (collectedTrains.length > 0) {
        const results = mapAiResultToTrains(collectedTrains, stations, y, m, d);
        setDetectedTrains(results);
        setActiveTab('REVIEW');
      } else {
        alert('No schedules were found in the selected files using the local extractor. Try clearer PDF pages or use the IMPORT tab.');
      }
    } catch (err) {
      console.error('Local batch extraction failed:', err);
      alert('Local extraction failed. See console for details.');
    } finally {
      setIsScanning(false);
    }
  };

  const handleBulkImport = () => {
    if (!bulkText.trim()) return;
    const rows = bulkText.trim().split(/\r?\n/);
    const newPoints: any[] = [];
    
    // Determine reference start day from current state
    const referenceStartDay = daysOfService.length > 0 ? daysOfService[0] : 0;

    rows.forEach(row => {
      const tokens = row.trim().split(/\s+/).filter(Boolean);
      if (tokens.length < 3) return;

      // STEP 1: Starts with a number
      if (!/^\d+$/.test(tokens[0])) return;
      
      const timeMatches = row.match(/(\d{1,2}:\d{2})/g) || [];
      // STEP 1: Must contain at least one time
      if (timeMatches.length === 0) return;

      const index = parseInt(tokens[0], 10);
      const stationCode = tokens[1];
      
      // STEP 2 & 4: Identify start of times to isolate name
      let firstTimeIdx = -1;
      for (let j = 0; j < tokens.length; j++) {
        if (/^\d{1,2}:\d{2}$/.test(tokens[j])) {
          firstTimeIdx = j;
          break;
        }
      }
      if (firstTimeIdx === -1) return;

      const stationName = tokens.slice(2, firstTimeIdx).join(' ');
      const arrival = timeMatches[0];
      const departure = timeMatches[1] || arrival;

      // STEP 2 (Day Extraction):
      let timetable_day = 1;
      for (let j = tokens.length - 1; j >= firstTimeIdx; j--) {
        const val = parseInt(tokens[j], 10);
        if (!isNaN(val) && val >= 1 && val <= 7 && !tokens[j].includes(':')) {
           timetable_day = val;
           break;
        }
      }

      const dayOffset = timetable_day - 1;
      const actual_day = (referenceStartDay + (timetable_day - 1)) % 7;

      const foundStation = findStationByCode(stationCode, stations);
      newPoints.push({ 
        index,
        stationId: foundStation?.id || `${stationCode}_EXTERNAL`, 
        stationName: stationName || foundStation?.name || stationCode,
        codeInput: foundStation?.code || stationCode, 
        dayOffset, 
        timetable_day,
        actual_day,
        time: arrival,
        arrivalTime: arrival, 
        departureTime: departure 
      });
    });

    if (newPoints.length > 0) {
      const [y, m, d] = chartDate.split('-').map(Number);
      const tempTrain: TrainPath = {
        id: `M-${Date.now()}`,
        number: 'MANUAL',
        name: 'Manual Text Input',
        type: TrainType.EXPRESS,
        color: TYPE_COLORS[TrainType.EXPRESS],
        priority: TRAIN_PRIORITY_MAP[TrainType.EXPRESS],
        points: newPoints.map(p => ({
          stationId: p.stationId,
          stationName: p.stationName,
          index: p.index,
          arrivalTime: new Date(y, m-1, d, parseInt(p.arrivalTime.split(':')[0]), parseInt(p.arrivalTime.split(':')[1])),
          departureTime: new Date(y, m-1, d, parseInt(p.departureTime.split(':')[0]), parseInt(p.departureTime.split(':')[1])),
          runtime_day_offset: p.dayOffset,
          timetable_day: p.timetable_day,
          actual_day: p.actual_day,
          time: p.time,
          absolute_time: (p.dayOffset * 1440) + (parseInt(p.arrivalTime.split(':')[0]) * 60) + parseInt(p.arrivalTime.split(':')[1]),
          absolute_departure_time: (p.dayOffset * 1440) + (parseInt(p.departureTime.split(':')[0]) * 60) + parseInt(p.departureTime.split(':')[1])
        })),
        stops: newPoints.map(p => ({
          stationId: p.stationId,
          stationName: p.stationName,
          index: p.index,
          arrivalTime: new Date(y, m-1, d, parseInt(p.arrivalTime.split(':')[0]), parseInt(p.arrivalTime.split(':')[1])),
          departureTime: new Date(y, m-1, d, parseInt(p.departureTime.split(':')[0]), parseInt(p.departureTime.split(':')[1])),
          runtime_day_offset: p.dayOffset,
          timetable_day: p.timetable_day,
          actual_day: p.actual_day,
          time: p.time,
          absolute_time: (p.dayOffset * 1440) + (parseInt(p.arrivalTime.split(':')[0]) * 60) + parseInt(p.arrivalTime.split(':')[1]),
          absolute_departure_time: (p.dayOffset * 1440) + (parseInt(p.departureTime.split(':')[0]) * 60) + parseInt(p.departureTime.split(':')[1])
        })),
        timetable: [], // Will be filled in Review
        days_normalized: [...daysOfService],
        days_of_service: [...daysOfService],
        daysOfService: [...daysOfService]
      };

      tempTrain.points.forEach(p => {
        p.arrivalTime.setDate(p.arrivalTime.getDate() + (p.runtime_day_offset || 0));
        p.departureTime.setDate(p.departureTime.getDate() + (p.runtime_day_offset || 0));
      });

      setDetectedTrains([...detectedTrains, tempTrain]);
      setActiveTab('REVIEW');
    }
  };

  const mapAiResultToTrains = (trains: any[], stations: Station[], y: number, m: number, d: number): TrainPath[] => {
    return trains.map((t: any) => {
      const typeStr = (t.type || '').toUpperCase();
      // match against TrainType keys, preferring longer names first to avoid
    // substrings (e.g. JAN_SHATABDI vs SHATABDI)
    const allKeys = Object.keys(TrainType) as TrainType[];
    const sortedKeys = allKeys.slice().sort((a, b) => {
      const na = a.replace(/_/g, ' ');
      const nb = b.replace(/_/g, ' ');
      return nb.length - na.length;
    });
    const trainTypeKey = (sortedKeys.find(k =>
      typeStr.includes(k) ||
      k.includes(typeStr) ||
      typeStr.replace(/_/g, '').includes(k.replace(/_/g, ''))
    ) as TrainType) || TrainType.EXPRESS;

      const stopsToMap = t.stops || t.points || [];
      const mappedPoints = stopsToMap.map((p: any) => {
        const stn = findStationByCode(p.stationCode, stations);
        const rawArr = p.arrival || p.departure || '00:00';
        const rawDep = p.departure || p.arrival || '00:00';

        const arrivalTime = normalizeRailwayTime(rawArr) || '00:00';
        const departureTime = normalizeRailwayTime(rawDep) || '00:00';

        const [ah, am] = arrivalTime.split(':').map(Number);
        const [dh, dm] = departureTime.split(':').map(Number);

        const dayOffset = (p.day && p.day > 0) ? p.day - 1 : 0;

        const arrivalDate = new Date(y, m - 1, d, ah, am);
        arrivalDate.setDate(arrivalDate.getDate() + dayOffset);

        const departureDate = new Date(y, m - 1, d, dh, dm);
        departureDate.setDate(departureDate.getDate() + dayOffset);

        const absoluteArrival = (dayOffset * 1440) + (ah * 60) + am;
        const absoluteDeparture = (dayOffset * 1440) + (dh * 60) + dm;

        return {
          stationId: stn?.id || `${(p.stationCode || 'UNK').toUpperCase()}_EXTERNAL`,
          stationName: p.stationName,
          index: p.index,
          arrivalTime: arrivalDate,
          departureTime: departureDate,
          runtime_day_offset: dayOffset,
          timetable_day: p.timetable_day,
          actual_day: p.actual_day,
          time: p.time,
          absolute_time: absoluteArrival,
          absolute_departure_time: absoluteDeparture
        };
      });

      const normalizedDays = parseDaysOfService(t.daysOfService || 'Daily');
      const finalPoints = mappedPoints;

      const trainNumber = (t.number || '00000').toString().trim();
      return {
        id: `T-${trainNumber.toUpperCase()}`,
        number: trainNumber,
        name: t.name || 'Extracted Service',
        type: trainTypeKey,
        color: TYPE_COLORS[trainTypeKey],
        priority: TRAIN_PRIORITY_MAP[trainTypeKey],
        points: finalPoints,
        stops: finalPoints,
        data: { stops: finalPoints }, // Level 1 nesting
        train: { stops: finalPoints }, // Level 2 nesting
        path: { stops: finalPoints }, // Level 3 nesting (as suggested)
        timetable: mappedPoints.map(p => ({
          stationId: p.stationId,
          stationName: p.stationName,
          index: p.index,
          arrivalTime: p.arrivalTime,
          departureTime: p.departureTime,
          runtime_day_offset: p.runtime_day_offset,
          timetable_day: (p as any).timetable_day,
          actual_day: (p as any).actual_day,
          time: (p as any).time
        })),
        days_raw: (t.daysOfService || 'Daily').toString(),
        days_normalized: normalizedDays,
        days_of_service: normalizedDays,
        daysOfService: normalizedDays
      } as any;
    });
  };

  const handleTextImport = () => {
    if (!bulkText.trim()) return;
    const [y, m, d] = chartDate.split('-').map(Number);
    const parsed = parseTimetableText(bulkText);
    if (parsed && parsed.trains && parsed.trains.length > 0) {
      const results = mapAiResultToTrains(parsed.trains, stations, y, m, d);
      setDetectedTrains([...detectedTrains, ...results]);
      setActiveTab('REVIEW');
    } else {
      alert("Could not identify any train schedules in the text. Ensure the header and station table are present.");
    }
  };

  const handleReviewCommit = () => {
    detectedTrains.forEach(train => onAdd(train, { saveToServer: autoSaveToServer }));
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!number || !name || points.length === 0) return;
    const [y, m, d] = chartDate.split('-').map(Number);
    const formatted = points.map(p => {
      const [ah, am] = p.arrivalTime.split(':').map(Number);
      const [dh, dm] = p.departureTime.split(':').map(Number);

      const arrivalDate = new Date(y, m - 1, d, ah, am);
      arrivalDate.setDate(arrivalDate.getDate() + p.dayOffset);

      const departureDate = new Date(y, m - 1, d, dh, dm);
      departureDate.setDate(departureDate.getDate() + p.dayOffset);

      const absoluteArrival = (p.dayOffset * 1440) + (ah * 60) + am;
      const absoluteDeparture = (p.dayOffset * 1440) + (dh * 60) + dm;

      return {
        stationId: p.stationId,
        arrivalTime: arrivalDate,
        departureTime: departureDate,
        runtime_day_offset: p.dayOffset,
        absolute_time: absoluteArrival,
        absolute_departure_time: absoluteDeparture
      };
    });

    const trainId = initialTrain ? initialTrain.id : `T-${number.trim().toUpperCase()}`;

    const trainData: TrainPath = {
      id: trainId,
      number: number.trim(),
      name, type, color, priority, 
      points: formatted,
      stops: formatted,
      timetable: formatted,
      days_raw: initialTrain?.days_raw || (daysOfService.length === 7 ? 'Daily' : daysOfService.map(d => DAYS.find(day => day.value === d)?.label).join(',')),
      days_normalized: [...daysOfService].sort(),
      days_of_service: [...daysOfService].sort(),
      daysOfService: [...daysOfService].sort()
    };
    if (initialTrain && onUpdate) onUpdate(trainData);
    else onAdd(trainData, { saveToServer: autoSaveToServer });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 z-[100] transition-all ${isMinimized ? 'pointer-events-none' : 'bg-slate-900/60 backdrop-blur-sm'}`}>
      <div className={`fixed transition-all duration-300 bg-white rounded-2xl shadow-2xl border border-slate-300 flex flex-col overflow-hidden ${isMinimized ? 'bottom-4 right-4 w-64 pointer-events-auto' : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[620px]'}`}>
        <div className="bg-slate-900 px-4 py-3 flex justify-between items-center text-white cursor-default select-none shadow-lg">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-5 h-5 rounded flex-shrink-0 border border-white/20 shadow-inner" style={{ backgroundColor: color }}></div>
            <span className="text-xs font-black uppercase tracking-widest truncate">
              {activeTab === 'REVIEW' ? `Review Batch (${detectedTrains.length} Services)` : initialTrain ? `Modify: ${initialTrain.number}` : 'Long-Distance Service Setup'}
            </span>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setIsMinimized(!isMinimized)} className="p-1.5 hover:bg-slate-700 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d={isMinimized ? "M4 4l16 16" : "M20 12H4"} /></svg>
            </button>
            <button type="button" onClick={onClose} className="p-1.5 hover:bg-rose-600 rounded-lg transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>
        {!isMinimized && (
          <div className="flex flex-col bg-slate-50">
            <div className="flex border-b border-slate-200 bg-white shadow-sm z-10">
              <button type="button" onClick={() => setActiveTab('MANUAL')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'MANUAL' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/20' : 'text-slate-400 hover:bg-slate-50'}`}>Manual Adjust</button>
              <button type="button" onClick={() => setActiveTab('EXTRACT')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'EXTRACT' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/20' : 'text-slate-400 hover:bg-slate-50'}`}>Extract PDF</button>
              <button type="button" onClick={() => setActiveTab('IMPORT')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'IMPORT' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50/20' : 'text-slate-400 hover:bg-slate-50'}`}>Text Batch</button>
              {detectedTrains.length > 0 && (
                <button type="button" onClick={() => setActiveTab('REVIEW')} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'REVIEW' ? 'text-amber-600 border-b-2 border-amber-600 bg-amber-50/20' : 'text-slate-400 hover:bg-slate-50'}`}>Review Results</button>
              )}
            </div>

            <div className="p-6 space-y-5 max-h-[600px] overflow-y-auto custom-scrollbar min-h-[300px]">
              {activeTab === 'EXTRACT' ? (
                <div className="flex flex-col items-center justify-center p-12 border-4 border-dashed border-slate-200 rounded-3xl bg-white relative overflow-hidden group hover:border-indigo-400 transition-all">
                  {isScanning && (
                    <div className="absolute inset-0 bg-indigo-600/10 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center">
                      <div className="relative w-24 h-24 mb-6">
                        <div className="absolute inset-0 border-4 border-indigo-200 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-indigo-600 rounded-full border-t-transparent animate-spin"></div>
                      </div>
                      <p className="text-indigo-600 font-black text-xs uppercase tracking-widest animate-pulse">Processing Files...</p>
                      <div className="w-48 h-1 bg-slate-200 rounded-full mt-4 overflow-hidden">
                        <div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${(scanProgress.current / scanProgress.total) * 100}%` }}></div>
                      </div>
                    </div>
                  )}
                  <div className="text-center">
                    {scanError && (
                      <div className="w-full mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-sm">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-black">Extraction Error</div>
                            <div className="text-[11px] mt-1">{scanError.message}</div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <button type="button" onClick={() => setActiveTab('IMPORT')} className="text-xs font-black uppercase px-3 py-1 bg-rose-600 text-white rounded-xl">Open Import</button>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="w-20 h-20 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-6 text-indigo-400 group-hover:scale-110 transition-transform">
                      <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <h4 className="text-slate-900 font-black text-lg mb-2">Local PDF Extractor</h4>
                    <p className="text-slate-500 text-xs mb-8 max-w-[280px] mx-auto font-medium">Select one or more timetable PDFs and extract schedules directly in your browser.</p>
                    <div className="flex items-center justify-center gap-3">
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="px-6 py-3 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl hover:bg-indigo-700 transition-all active:scale-95">Select Files</button>
                      <button type="button" onClick={async () => { if (fileInputRef.current?.files && fileInputRef.current.files.length > 0) { await processLocalExtract(fileInputRef.current.files); } else fileInputRef.current?.click(); }} className="px-4 py-3 bg-slate-100 text-slate-700 font-black text-xs uppercase tracking-widest rounded-2xl shadow-sm hover:bg-slate-200 transition-all active:scale-95">Extract Locally</button>
                    </div>
                    <input type="file" ref={fileInputRef} multiple className="hidden" accept=".pdf,image/*" onChange={e => { if (e.target.files && e.target.files.length > 0) processFiles(e.target.files); }} />
                  </div>
                </div>
              ) : activeTab === 'IMPORT' ? (
                <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-xl space-y-4">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Raw Schedule Text</span>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setBulkText('')} className="text-[10px] font-bold text-slate-400 hover:text-rose-500">Clear</button>
                    </div>
                  </div>
                  <textarea
                    className="w-full h-48 p-4 bg-slate-50 border border-slate-100 rounded-2xl text-[11px] font-mono outline-none custom-scrollbar focus:bg-white focus:ring-2 focus:ring-indigo-500/10 transition-all"
                    value={bulkText}
                    onChange={e => setBulkText(e.target.value)}
                    placeholder="Paste messy text copied from PDF here... (e.g. Train 12623, MAS 23:00, TVC 11:00)"
                  />
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleTextImport}
                      className="flex-[2] flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white text-[11px] font-black py-4 rounded-2xl shadow-lg hover:shadow-indigo-200 transition-all active:scale-95"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      Parse Text
                    </button>
                    <button
                      type="button"
                      onClick={handleBulkImport}
                      className="flex-1 bg-slate-900 text-white text-[11px] font-black py-4 rounded-2xl uppercase hover:bg-black transition-all active:scale-95 border border-slate-800"
                    >
                      Classic Parse
                    </button>
                  </div>
                  <p className="text-[9px] text-center text-slate-400 font-bold uppercase tracking-widest pt-2">Tip: Copy the whole table from India Rail Info & paste here</p>
                </div>
              ) : activeTab === 'REVIEW' ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-center px-1 mb-2">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Detection Queue</span>
                    <button type="button" onClick={() => setDetectedTrains([])} className="text-[10px] font-black text-rose-500 hover:text-rose-700">Clear All</button>
                  </div>
                  {detectedTrains.map((t, idx) => {
                    const isExpanded = expandedReviewTrainId === t.id;
                    return (
                      <div key={t.id} className={`bg-white rounded-2xl border transition-all ${isExpanded ? 'border-indigo-400 shadow-md ring-1 ring-indigo-500/10' : 'border-slate-200 shadow-sm'} overflow-hidden`}>
                        <div className="p-4 flex items-center justify-between group hover:border-amber-300 transition-all cursor-pointer" onClick={() => setExpandedReviewTrainId(isExpanded ? null : t.id)}>
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center font-black text-white shadow-lg" style={{ backgroundColor: t.color }}>
                              {t.number.substring(0, 2)}
                            </div>
                            <div>
                              <h5 className="font-black text-sm text-slate-800 tracking-tight">{t.number} - {t.name}</h5>
                              <div className="flex gap-2 mt-1">
                                <span className="text-[9px] font-black px-1.5 py-0.5 bg-slate-100 rounded-md text-slate-500 uppercase">{t.type}</span>
                                <span className="text-[9px] font-black px-1.5 py-0.5 bg-indigo-50 rounded-md text-indigo-600 uppercase">{t.stops?.length || 0} STOPS</span>
                                {console.log("SERVICE OBJECT:", t)}
                                {console.log("STOPS FIELD:", t.stops)}
                                <div className="hidden">{JSON.stringify(t)}</div>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <button 
                              type="button" 
                              onClick={(e) => {
                                e.stopPropagation();
                                setNumber(t.number);
                                setName(t.name);
                                setType(t.type);
                                setColor(t.color);
                                setPriority(t.priority);
                                setDaysOfService([...(t.daysOfService || [0, 1, 2, 3, 4, 5, 6])]);
                                setPoints(t.points.map(p => {
                                  const stn = findStationGlobally(p.stationId);
                                  return {
                                    stationId: p.stationId,
                                    codeInput: stn?.code || 'UNK',
                                    dayOffset: p.runtime_day_offset || 0,
                                    arrivalTime: p.arrivalTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }),
                                    departureTime: p.departureTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
                                  };
                                }));
                                setDetectedTrains(detectedTrains.filter((_, i) => i !== idx));
                                setActiveTab('MANUAL');
                              }}
                              className="p-2 text-indigo-500 hover:bg-indigo-50 rounded-xl transition-all"
                              title="Tweak & Edit"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button type="button" onClick={(e) => { e.stopPropagation(); setDetectedTrains(detectedTrains.filter((_, i) => i !== idx)); }} className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                            <div className={`p-2 transition-all ${isExpanded ? 'rotate-180 text-indigo-600' : 'text-slate-300'}`}>
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-slate-50 bg-slate-50/30">
                            <table className="w-full text-left border-collapse mt-2">
                              <thead>
                                <tr className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">
                                  <th className="pb-2">Day</th>
                                  <th className="pb-2">Station</th>
                                  <th className="pb-2">Arr</th>
                                  <th className="pb-2 text-right">Dep</th>
                                </tr>
                              </thead>
                              <tbody className="text-[10px] font-bold text-slate-600">
                                {t.stops.map((p, pidx) => {
                                  const stn = findStationGlobally(p.stationId);
                                  return (
                                    <tr key={pidx} className="border-b border-white hover:bg-white/40 transition-colors">
                                      <td className="py-1.5 opacity-60">Day {p.runtime_day_offset + 1}</td>
                                      <td className="py-1.5">{p.stationName || stn?.name || p.stationId.split('_')[0]}</td>
                                      <td className="py-1.5 font-mono text-indigo-600">{p.arrivalTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</td>
                                      <td className="py-1.5 font-mono text-indigo-600 text-right">{p.departureTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {detectedTrains.length === 0 && (
                    <div className="text-center py-12">
                      <p className="text-slate-400 font-bold text-sm">Review queue is empty.</p>
                      <button type="button" onClick={() => setActiveTab('EXTRACT')} className="mt-4 text-indigo-600 font-black text-xs uppercase">Back to Extract</button>
                    </div>
                  )}
                </div>
              ) : (
                <form id="train-form" onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Train Number</label>
                      <input required type="text" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-black outline-none focus:border-indigo-500 shadow-sm" value={number} onChange={e => setNumber(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Class/Category</label>
                      <select className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none" value={type} onChange={e => handleTypeChange(e.target.value as TrainType)}>
                        {Object.keys(TrainType).map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-1">
                      <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Chart Color</label>
                      <div className="flex gap-2">
                        <input type="color" className="w-10 h-10 p-1 bg-white border border-slate-200 rounded-xl cursor-pointer" value={color} onChange={e => setColor(e.target.value)} />
                        <input type="text" className="flex-grow px-2 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-mono uppercase outline-none" value={color} onChange={e => setColor(e.target.value)} />
                      </div>
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Priority (P1-P12)</label>
                      <div className="flex items-center gap-3">
                        <input required type="range" min="1" max="12" step="1" className="flex-grow accent-indigo-600" value={priority} onChange={e => handlePriorityChange(parseInt(e.target.value, 10))} />
                        <span className="w-12 h-10 flex items-center justify-center bg-indigo-600 text-white font-black rounded-xl text-sm shadow-lg">P{priority}</span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-1">
                      <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Service Name</label>
                      <input required type="text" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none" value={name} onChange={e => setName(e.target.value)} />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-[9px] font-black text-slate-400 uppercase mb-1">Days of Service</label>
                      <div className="flex gap-1">
                        {DAYS.map(d => (
                          <button
                            key={d.value}
                            type="button"
                            onClick={() => toggleDay(d.value)}
                            className={`w-7 h-7 rounded-lg text-[10px] font-black transition-all border ${daysOfService.includes(d.value)
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                              : 'bg-white text-slate-400 border-slate-200 hover:border-indigo-300'
                              }`}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 border-t border-slate-200 pt-4">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-black text-slate-900 uppercase tracking-tighter">Route Checkpoints</span>
                      <button type="button" onClick={() => setPoints([...points, { stationId: '', codeInput: '', dayOffset: 0, arrivalTime: '08:00', departureTime: '08:05' }])} className="text-[10px] font-black text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-xl border border-indigo-100">+ Add Stop</button>
                    </div>
                    <div className="space-y-2">
                      {points.map((point, index) => {
                        const currentStation = findStationGlobally(point.stationId);
                        const isDuplicate = point.stationId && points.filter(p => p.stationId === point.stationId).length > 1;
                        return (
                          <div key={index} className={`flex gap-2 items-center bg-white p-2 rounded-2xl border shadow-sm group ${isDuplicate ? 'border-rose-500 bg-rose-50' : 'border-slate-200'}`}>
                            <div className="flex flex-col gap-1">
                              <input type="text" placeholder="CODE" className="w-16 px-2 py-2 text-[10px] border border-slate-100 rounded-xl font-mono font-black bg-slate-50 uppercase text-center focus:border-indigo-500 outline-none" value={point.codeInput} onChange={e => handleCodeChange(index, e.target.value)} />
                              <select
                                className="w-16 px-1 py-1 text-[8px] border border-slate-100 rounded-lg bg-indigo-50 font-black text-indigo-600 outline-none"
                                value={point.dayOffset}
                                onChange={e => { const np = [...points]; np[index].dayOffset = parseInt(e.target.value, 10); setPoints(np); }}
                              >
                                <option value={0}>Day 1</option>
                                <option value={1}>Day 2</option>
                                <option value={2}>Day 3</option>
                                <option value={3}>Day 4</option>
                                <option value={4}>Day 5</option>
                                <option value={5}>Day 6</option>
                                <option value={6}>Day 7</option>
                              </select>
                            </div>
                            <select
                              className="flex-grow px-3 py-2 text-xs border border-slate-100 rounded-xl bg-slate-50 font-bold outline-none"
                              value={point.stationId}
                              onChange={e => {
                                const np = [...points];
                                np[index].stationId = e.target.value;
                                const stn = findStationGlobally(e.target.value);
                                np[index].codeInput = stn?.code || '';
                                setPoints(np);
                              }}
                            >
                              <option value="">Select Stop...</option>
                              <optgroup label="Active Chart Path">
                                {stations.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                              </optgroup>
                              <optgroup label="Extended Network">
                                {Object.values(divisionStations).flat().filter((s: Station) => !stations.some(local => local.code === s.code)).map((s: Station) => (
                                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                                ))}
                              </optgroup>
                            </select>
                            <div className="flex gap-1">
                              <input 
                                type="text" 
                                placeholder="Arr"
                                className="w-24 px-2 py-1 text-[10px] border border-slate-100 rounded-lg font-bold bg-slate-50 text-center focus:border-indigo-500 outline-none" 
                                value={point.arrivalTime} 
                                onChange={e => { const np = [...points]; np[index].arrivalTime = e.target.value; setPoints(np); }}
                                onBlur={e => { const np = [...points]; np[index].arrivalTime = normalizeRailwayTime(e.target.value) || e.target.value; setPoints(np); }}
                              />
                              <input 
                                type="text" 
                                placeholder="Dep"
                                className="w-24 px-2 py-1 text-[10px] border border-slate-100 rounded-lg font-bold bg-slate-50 text-center focus:border-indigo-500 outline-none" 
                                value={point.departureTime} 
                                onChange={e => { const np = [...points]; np[index].departureTime = e.target.value; setPoints(np); }}
                                onBlur={e => { const np = [...points]; np[index].departureTime = normalizeRailwayTime(e.target.value) || e.target.value; setPoints(np); }}
                              />
                            </div>
                            <div className="flex flex-col justify-center space-y-1">
                              <button type="button" onClick={() => movePoint(index, -1)} disabled={index === 0} className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed" title="Move up">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                              </button>
                              <button type="button" onClick={() => movePoint(index, 1)} disabled={index === points.length - 1} className="p-1 text-slate-400 hover:text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed" title="Move down">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              </button>
                            </div>
                            {isDuplicate && (
                              <div className="flex items-center text-rose-600" title="Duplicate stop">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M12 20c4.418 0 8-3.582 8-8s-3.582-8-8-8-8 3.582-8 8 3.582 8 8 8z" /></svg>
                              </div>
                            )}
                            <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all">
                              <button type="button" title="Insert stop below" onClick={() => {
                                const np = [...points];
                                np.splice(index + 1, 0, { stationId: '', codeInput: '', dayOffset: point.dayOffset, arrivalTime: point.departureTime, departureTime: point.departureTime });
                                setPoints(np);
                              }} className="p-1 text-slate-300 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
                              </button>
                              <button type="button" title="Delete stop" onClick={() => setPoints(points.filter((_, i) => i !== index))} className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </form>
              )}
            </div>

            <div className="bg-white p-5 flex justify-end items-center gap-4 border-t border-slate-200">
              <button type="button" onClick={onClose} className="text-[11px] font-black text-slate-400 uppercase tracking-widest px-4 py-2 hover:bg-slate-100 rounded-xl">Discard</button>
              <div className="flex items-center gap-4 mr-auto">
                <label className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
                  <input type="checkbox" checked={autoSaveToServer} onChange={e => setAutoSaveToServer(e.target.checked)} className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase">Save to server immediately</span>
                </label>
              </div>
              {activeTab === 'REVIEW' ? (
                <button type="button" onClick={handleReviewCommit} className="px-8 py-3 bg-amber-600 text-white text-[11px] font-black rounded-xl uppercase shadow-xl hover:bg-amber-700 active:scale-95 transition-all">Commit All ({detectedTrains.length})</button>
              ) : (
                <button form="train-form" type="submit" className="px-8 py-3 bg-indigo-600 text-white text-[11px] font-black rounded-xl uppercase shadow-xl hover:bg-indigo-700 active:scale-95 transition-all">Commit to Chart</button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddTrainModal;
