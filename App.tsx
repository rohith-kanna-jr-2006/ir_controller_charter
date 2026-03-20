
import React, { useState, useMemo, useEffect } from 'react';
import MasterChart from './components/MasterChart';
import ControlBar from './components/ControlBar';
import AddTrainModal from './components/AddTrainModal';
import { ZONES, DIVISIONS, GET_JUNCTION_HUBS } from './constants';
import { ChartConfig, TrainPath, Station, TrainType } from './types';
import { trainService } from './services/trainService';

type ViewMode = 'HOME' | 'CHART' | 'TRAINS';

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>('HOME');
  const [config, setConfig] = useState<ChartConfig>({
    zone: 'SR',
    division: 'THIRUVANANTHAPURAM',
    board: 'Thiruvananthapuram (TVC) - Kanyakumari (CAPE)',
    date: new Date().toISOString().split('T')[0],
    shift: 'ALL_DAY',
    startTime: 0,
    duration: 24
  });

  const [trains, setTrains] = useState<TrainPath[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'TRAINS' | 'JUNCTIONS'>('TRAINS');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalStartTab, setModalStartTab] = useState<'MANUAL' | 'IMPORT' | 'EXTRACT' | 'REVIEW' | undefined>(undefined);
  const [selectedTrain, setSelectedTrain] = useState<TrainPath | null>(null);
  const [editingTrain, setEditingTrain] = useState<TrainPath | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hiddenTrains, setHiddenTrains] = useState<Set<string>>(new Set());
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set());

  const toggleTrainVisibility = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHiddenTrains(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleDeleteSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedForDeletion(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };


  useEffect(() => {
    refreshData();
  }, []);

  const activeDivision = useMemo(() => DIVISIONS.find(d => d.id === config.division) || DIVISIONS[0], [config.division]);
  const displayStations = useMemo(() => activeDivision.stations.filter(s => s.section === config.board), [activeDivision, config.board]);
  const junctionHubs = useMemo(() => GET_JUNCTION_HUBS(), []);

  const findStationGlobally = (stationId: string): Station | undefined => {
    for (const div of DIVISIONS) {
      const found = div.stations.find(s => s.id === stationId);
      if (found) return found;
    }
    const cleanCode = stationId.split('_')[0];
    for (const div of DIVISIONS) {
      const found = div.stations.find(s => s.code === cleanCode);
      if (found) return found;
    }
    return undefined;
  };

  const getShiftedTrain = (t: TrainPath, targetDateStr: string): TrainPath => {
    if (!t.points || t.points.length === 0) return t;
    const [y, m, d] = targetDateStr.split('-').map(Number);
    const targetBase = new Date(y, m - 1, d, 0, 0, 0).getTime();
    const firstArr = t.points[0].arrivalTime;
    const sourceBase = new Date(firstArr.getFullYear(), firstArr.getMonth(), firstArr.getDate(), 0, 0, 0).getTime();
    const shiftMs = targetBase - sourceBase;
    return {
      ...t,
      points: t.points.map(p => ({
        ...p,
        arrivalTime: new Date(p.arrivalTime.getTime() + shiftMs),
        departureTime: new Date(p.departureTime.getTime() + shiftMs)
      }))
    };
  };

  const filteredTrainsForChart = useMemo(() => {
    try {
      const [y, m, d] = config.date.split('-').map(Number);
      const startOfChartDay = new Date(y, m - 1, d, config.startTime, 0, 0);
      const endOfChartDay = new Date(startOfChartDay.getTime() + config.duration * 3600000);
      const chartDayIndex = startOfChartDay.getDay();

      return trains
        .map(t => getShiftedTrain(t, config.date))
        .filter(t => {
          const serviceDays = t.days_of_service || t.days_normalized || t.daysOfService || [0, 1, 2, 3, 4, 5, 6];
          const runsOnDay = serviceDays.includes(chartDayIndex);
          if (!runsOnDay) return false;
          const inWindow = t.points.some(p => {
            const arr = p.arrivalTime.getTime();
            const dep = p.departureTime.getTime();
            const winStart = startOfChartDay.getTime();
            const winEnd = endOfChartDay.getTime();
            return (arr >= winStart && arr <= winEnd) || (dep >= winStart && dep <= winEnd);
          });
          const inSection = t.points.some(p => {
            const pStn = findStationGlobally(p.stationId);
            return pStn && displayStations.some(s => s.code === pStn.code);
          });
          return inWindow && inSection;
        })
        .sort((a, b) => {
          if (a.priority !== b.priority) return a.priority - b.priority;
          // Sort by alphanumeric train number naturally
          return a.number.localeCompare(b.number, undefined, { numeric: true, sensitivity: 'base' });
        });
    } catch (e) { return []; }
  }, [trains, config.date, config.startTime, config.duration, displayStations]);

  const allTrainsFiltered = useMemo(() => {
    // limit registry to selected division stations as well as search string
    const divisionCodes = new Set(activeDivision.stations.map(s => s.code));
    return trains.filter(t => {
      const matchesSearch =
        t.number.includes(searchQuery) ||
        t.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;
      // if no division selected (shouldn't happen) allow all
      if (divisionCodes.size === 0) return true;
      // check if train passes through that division
      const passes = t.points.some(p => {
        const st = findStationGlobally(p.stationId);
        return st && divisionCodes.has(st.code);
      });
      return passes;
    }).sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.number.localeCompare(b.number, undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [trains, searchQuery, activeDivision]);

  const handleSelectTrain = (train: TrainPath) => setSelectedTrain(train);
  const handleEditTrain = (train: TrainPath, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingTrain(train);
    setIsAddModalOpen(true);
    setSelectedTrain(null);
  };

  const printConflictReport = () => {
    if (!selectedTrain) return;
    
    const kmMap = new Map<string, number>(displayStations.map(s => [s.id, s.km]));
    const codeMap = new Map<string, string>(displayStations.map(s => [s.id, s.code]));
    const nameMap = new Map<string, string>(displayStations.map(s => [s.id, s.name]));

    const getSegments = (t: TrainPath) => {
      const segs: { t1: number, y1: number, t2: number, y2: number, origin: string, dest: string, originName: string, destName: string, dir: number }[] = [];
      let prevValid: { tArr: number, tDep: number, y: number, id: string, code: string, name: string } | null = null;
      t.points.forEach(p => {
        if (kmMap.has(p.stationId)) {
          const curr = { 
            tArr: p.arrivalTime.getTime(), 
            tDep: p.departureTime.getTime(), 
            y: kmMap.get(p.stationId)!, 
            id: p.stationId, 
            code: codeMap.get(p.stationId)!,
            name: nameMap.get(p.stationId)!
          };
          if (prevValid) {
            segs.push({ 
              t1: prevValid.tDep, y1: prevValid.y, 
              t2: curr.tArr, y2: curr.y, 
              origin: prevValid.code, dest: curr.code,
              originName: prevValid.name,
              destName: curr.name,
              dir: Math.sign(curr.y - prevValid.y)
            });
          }
          prevValid = curr;
        }
      });
      return segs;
    };

    const targetSegs = getSegments(selectedTrain);
    const conflicts: { otherTrain: string, otherName: string, otherSource: string, otherDest: string, type: string, details?: string, time: Date, location: string }[] = [];
    const activeTrains = filteredTrainsForChart.filter(t => !hiddenTrains.has(t.id));

    for (const other of activeTrains) {
      if (other.id === selectedTrain.id) continue;
      const otherSegs = getSegments(other);

      const oSrcPt = other.points[0]?.stationId;
      const oDstPt = other.points[other.points.length-1]?.stationId;
      const otherSource = other.originStationCode || (oSrcPt ? (findStationGlobally(oSrcPt)?.name || oSrcPt.split('_')[0]) : 'Unknown');
      const otherDest = other.destinationStationCode || (oDstPt ? (findStationGlobally(oDstPt)?.name || oDstPt.split('_')[0]) : 'Unknown');

      for (const ts of targetSegs) {
        for (const os of otherSegs) {
          const s1_x = ts.t2 - ts.t1;
          const s1_y = ts.y2 - ts.y1;
          const s2_x = os.t2 - os.t1;
          const s2_y = os.y2 - os.y1;

          const denom = (-s2_x * s1_y + s1_x * s2_y);
          if (denom === 0) continue;

          // ua is the parameter for target segment (ts)
          // ub is the parameter for other segment (os)
          const ua = (s2_x * (ts.y1 - os.y1) - s2_y * (ts.t1 - os.t1)) / denom;
          const ub = (-s1_y * (ts.t1 - os.t1) + s1_x * (ts.y1 - os.y1)) / denom;

          // By using >= 0 and <= 1 we capture exactly boundary crosses
          // We can use a tiny epsilon to avoid floating point misses for EXACT overlaps
          const EPSILON = 0.0001;
          if (ua >= -EPSILON && ua <= 1 + EPSILON && ub >= -EPSILON && ub <= 1 + EPSILON) {
            // Clamp ua to 0-1 for accurate coordinate mapping
            const clampedUa = Math.max(0, Math.min(1, ua));
            const ixT = ts.t1 + clampedUa * (ts.t2 - ts.t1);
            const ixY = ts.y1 + clampedUa * (ts.y2 - ts.y1); // Interpolated Distance/Station

            const isSameDirection = ts.dir === os.dir;

            let conflictDetails = '';
            if (isSameDirection) {
              // Same Slope (Overtaking) - Calculate Speed (Steepness)
              const speedTarget = Math.abs((ts.y2 - ts.y1) / (ts.t2 - ts.t1));
              const speedOther = Math.abs((os.y2 - os.y1) / (os.t2 - os.t1));
              if (speedTarget > speedOther) {
                conflictDetails = `Overtaking: Faster ${selectedTrain.number} passes slower ${other.number}`;
              } else if (speedOther > speedTarget) {
                conflictDetails = `Overtaking: Faster ${other.number} passes slower ${selectedTrain.number}`;
              } else {
                conflictDetails = `Overtaking: Identical speeds (Parallel run)`;
              }
            } else {
              // Opposite Slopes
              conflictDetails = `Crossing ("X" Shape Meet)`;
            }

            conflicts.push({
              otherTrain: `${other.number}`,
              otherName: other.name,
              otherSource: otherSource,
              otherDest: otherDest,
              type: isSameDirection ? 'TRACK OVERTAKE' : 'MID-SECTION CROSSING',
              details: conflictDetails,
              time: new Date(ixT),
              location: `Section: ${ts.originName} - ${ts.destName} (near km ${ixY.toFixed(1)})`
            });
          }
        }
      }

      const tMap = new Map();
      selectedTrain.points.forEach(p => tMap.set(p.stationId, p));

      other.points.forEach(op => {
        if (kmMap.has(op.stationId) && tMap.has(op.stationId)) {
          const tp = tMap.get(op.stationId);
          const t_a = tp.arrivalTime.getTime();
          const t_d = tp.departureTime.getTime();
          const o_a = op.arrivalTime.getTime();
          const o_d = op.departureTime.getTime();

          if (Math.max(t_a, o_a) <= Math.min(t_d, o_d)) {
             // Determine overall direction of travel for both trains
             const tFirst = tMap.get(selectedTrain.points[0].stationId);
             const tLast = tMap.get(selectedTrain.points[selectedTrain.points.length-1].stationId);
             const tDir = Math.sign(kmMap.get(tLast.stationId)! - kmMap.get(tFirst.stationId)!);

             const oFirst = other.points[0];
             const oLast = other.points[other.points.length-1];
             const oDir = Math.sign((kmMap.get(oLast.stationId) || 0) - (kmMap.get(oFirst.stationId) || 0));

             const isSameDirection = tDir === oDir;

             conflicts.push({
               otherTrain: `${other.number}`,
               otherName: other.name,
               otherSource: otherSource,
               otherDest: otherDest,
               type: isSameDirection ? 'STATION OVERTAKE' : 'STATION CROSSING',
               time: new Date(Math.max(t_a, o_a)),
               location: `Station: ${nameMap.get(op.stationId)} (${codeMap.get(op.stationId)})`
             });
          }
        }
      });
    }

    // Deduplicate conflicts that happen exactly at the boundary (e.g. caught by both math intersection and station overlap)
    const uniqueConflicts = [];
    const conflictSet = new Set();
    conflicts.forEach(c => {
      // Tolerate slight mathematical differences in time (up to 1 minute) for deduplication
      const timeMin = Math.round(c.time.getTime() / 60000);
      const key = `${c.otherTrain}_${timeMin}_${c.type.includes('OVERTAKE') ? 'OVERTAKE' : 'CROSSING'}`;
      if (!conflictSet.has(key)) {
        conflictSet.add(key);
        uniqueConflicts.push(c);
      }
    });

    uniqueConflicts.sort((a,b) => a.time.getTime() - b.time.getTime());

    const numCrossings = uniqueConflicts.filter(c => c.type.includes('CROSSING')).length;
    const numOvertakes = uniqueConflicts.filter(c => c.type.includes('OVERTAKE')).length;
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const daysStr = (selectedTrain.daysOfService || [0,1,2,3,4,5,6]).map(d => dayNames[d]).join(', ');
    
    const src = findStationGlobally(selectedTrain.points[0]?.stationId);
    const dst = findStationGlobally(selectedTrain.points[selectedTrain.points.length-1]?.stationId);

    const printWin = window.open('', '_blank');
    if (!printWin) {
      alert("Please allow popups to view the print report.");
      return;
    }

    const html = `
      <html>
        <head>
          <title>Graph Conflict & Schedule Report - ${selectedTrain.number}</title>
          <style>
            body { font-family: 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; padding: 30px; color: #1a1a1a; line-height: 1.4; }
            h1 { font-size: 24px; font-weight: 800; border-bottom: 3px solid #000; padding-bottom: 10px; margin-bottom: 20px; text-transform: uppercase; letter-spacing: -0.5px; }
            .header-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0; }
            .header-item { font-size: 13px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
            .header-val { font-size: 15px; font-weight: 800; color: #0f172a; margin-top: 4px; }
            h2 { font-size: 18px; font-weight: 800; margin-top: 40px; margin-bottom: 15px; display: flex; items-center: center; gap: 10px; }
            h2::before { content: ""; display: inline-block; width: 4px; height: 18px; background: #4f46e5; border-radius: 2px; }
            table { border-collapse: collapse; width: 100%; margin-top: 10px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); border-radius: 8px; overflow: hidden; }
            th, td { border: 1px solid #e2e8f0; padding: 12px 15px; font-size: 13px; text-align: left; }
            th { background-color: #f1f5f9; font-weight: 800; color: #475569; text-transform: uppercase; font-size: 11px; letter-spacing: 0.05em; }
            tr:nth-child(even) { background-color: #f8fafc; }
            .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 800; text-transform: uppercase; }
            .badge-overtake { background: #fee2e2; color: #b91c1c; }
            .badge-crossing { background: #dcfce7; color: #15803d; }
            @media print {
              button { display: none; }
              body { padding: 0; }
              table { box-shadow: none; }
            }
          </style>
        </head>
        <body>
          <button onclick="window.print()" style="margin-bottom:20px; padding:12px 24px; background:#4f46e5; color:white; border:none; border-radius:8px; font-weight:800; cursor:pointer; font-size:14px; box-shadow:0 4px 12px rgba(79,70,229,0.3);">Print Report</button>
          
          <h1>${selectedTrain.number} - ${selectedTrain.name}</h1>
          
          <div class="header-grid">
            <div>
              <div class="header-item">Source Station</div>
              <div class="header-val">${src ? `${src.name} (${src.code})` : (selectedTrain.originStationCode || 'N/A')}</div>
            </div>
            <div>
              <div class="header-item">Destination Station</div>
              <div class="header-val">${dst ? `${dst.name} (${dst.code})` : (selectedTrain.destinationStationCode || 'N/A')}</div>
            </div>
            <div>
              <div class="header-item">Operating Zone / Division</div>
              <div class="header-val">${config.zone} / ${config.division}</div>
            </div>
            <div>
              <div class="header-item">Days of Service</div>
              <div class="header-val">${daysStr}</div>
            </div>
            <div>
              <div class="header-item">Service Priority</div>
              <div class="header-val">P${selectedTrain.priority}</div>
            </div>
            <div>
              <div class="header-item">Detected Conflicts</div>
              <div class="header-val">
                <span style="color:#b91c1c">${numOvertakes} Overtakes</span> &nbsp; 
                <span style="color:#15803d">${numCrossings} Crossings</span>
              </div>
            </div>
          </div>

          <h2>1. Service Itinerary (Schedule)</h2>
          <table>
            <thead>
              <tr>
                <th style="width: 50px;">S.No</th>
                <th>Station Name and Code (Arrival)</th>
                <th>Station Name and Code (Departure)</th>
                <th style="width: 80px;">Day</th>
              </tr>
            </thead>
            <tbody>
              ${[...selectedTrain.points].sort((a,b) => a.arrivalTime.getTime() - b.arrivalTime.getTime()).map((p, idx) => {
                const stn = findStationGlobally(p.stationId);
                const nameStr = stn ? `${stn.name} (${stn.code})` : p.stationId.split('_')[0];
                return `
                  <tr>
                    <td style="font-weight: 800; color: #64748b;">${idx + 1}</td>
                    <td>
                      <div style="font-weight: 800;">${nameStr}</div>
                      <div style="font-family: monospace; font-size: 14px; margin-top: 2px;">${p.arrivalTime.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', hourCycle:'h23' })}</div>
                    </td>
                    <td>
                      <div style="font-weight: 800;">${nameStr}</div>
                      <div style="font-family: monospace; font-size: 14px; margin-top: 2px;">${p.departureTime.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', hourCycle:'h23' })}</div>
                    </td>
                    <td style="font-weight: 800;">1</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          <h2>2. Detected Graph Conflicts (Crossings & Overtakes)</h2>
          <table>
            <thead>
              <tr>
                 <th>Time</th>
                 <th>Event Type</th>
                 <th>Station / Section</th>
                 <th>Conflicting Train</th>
                 <th>Operation Logic</th>
              </tr>
            </thead>
            <tbody>
              ${uniqueConflicts.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding: 30px; color: #94a3b8;">No mid-section crossings or overtakes detected for this train slice.</td></tr>' : ''}
              ${uniqueConflicts.map(c => {
                const isStation = c.location.startsWith('Station:');
                const locParts = c.location.replace(/^(Station:|Section:)\s*/, '').split(' (');
                const mainLoc = locParts[0];
                const detailLoc = locParts.length > 1 ? '(' + locParts[1] : '';
                
                return `
                  <tr>
                     <td style="font-family: monospace; font-weight: 800; font-size: 14px;">${c.time.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', hourCycle:'h23' })}</td>
                     <td><span class="badge ${c.type.includes('OVERTAKE') ? 'badge-overtake' : 'badge-crossing'}">${c.type}</span></td>
                     <td>
                       <div style="font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; margin-bottom: 2px;">${isStation ? 'At Station' : 'Mid-Section'}</div>
                       <div style="font-weight: 800; color: #0f172a;">${mainLoc}</div>
                       <div style="font-size: 11px; color: #64748b; font-style: italic;">${detailLoc}</div>
                     </td>
                     <td>
                       <div style="font-weight: 800; color: #4f46e5;">${c.otherTrain}</div>
                       <div style="font-size: 11px; font-weight: 600; color: #64748b; text-transform: uppercase;">${c.otherName}</div>
                     </td>
                     <td style="font-size: 11px; color: #64748b;">${c.details || 'Station Halt Meet'}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>

          <div style="margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 11px; color: #94a3b8; text-align: center;">
            Report generated on ${new Date().toLocaleString()} for Board Slice: ${config.board}
          </div>
        </body>
      </html>
    `;
    printWin.document.write(html);
    printWin.document.close();
    printWin.focus();
  };

  const handleDeleteTrain = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (window.confirm("Are you sure you want to decommission this service record?")) {
      // Optimistic update
      const backup = [...trains];
      setTrains(prev => prev.filter(t => t.id !== id));
      if (selectedTrain?.id === id) setSelectedTrain(null);

      try {
        await trainService.deleteTrain(id);
        // data already removed from state, nothing else to do
        console.log(`✓ Train ${id} deleted successfully`);
      } catch (error) {
        console.error("Failed to delete train, rolling back", error);
        setTrains(backup);
        alert("Failed to delete train. Please try again.");
      }
    }
  };

  const handleConfigChange = (newConfig: ChartConfig) => {
    let startTime = 0; let duration = 6;
    if (newConfig.shift === 'NIGHT') { startTime = 0; duration = 6; }
    else if (newConfig.shift === 'MORNING') { startTime = 6; duration = 6; }
    else if (newConfig.shift === 'AFTERNOON') { startTime = 12; duration = 6; }
    else if (newConfig.shift === 'EVENING') { startTime = 18; duration = 6; }
    else if (newConfig.shift === 'ALL_DAY') { startTime = 0; duration = 24; }
    setConfig({ ...newConfig, startTime, duration });
  };

  const handleAddTrain = async (newTrain: TrainPath, options?: { saveToServer?: boolean }) => {
    // Optimistic update
    setTrains(prev => [...prev, newTrain]);
    setIsAddModalOpen(false);

    try {
      if (options?.saveToServer === false) {
        await trainService.saveLocally(newTrain);
      } else {
        await trainService.saveTrain(newTrain);
      }
      // no need to refresh everything, just ensure we have correct state
      console.log(`✓ Train "${newTrain.name}" saved successfully`);
    } catch (error) {
      console.error("Failed to save train, rolling back", error);
      setTrains(prev => prev.filter(t => t.id !== newTrain.id));
      alert("Failed to save train. Please try again.");
    }
  };

  const handleUpdateTrain = async (updatedTrain: TrainPath) => {
    // Optimistic update
    const backup = [...trains];
    setTrains(prev => prev.map(t => t.id === updatedTrain.id ? updatedTrain : t));
    setIsAddModalOpen(false);
    setEditingTrain(null);

    try {
      await trainService.updateTrain(updatedTrain);
      console.log(`✓ Train "${updatedTrain.name}" updated successfully`);
    } catch (error) {
      console.error("Failed to update train, rolling back", error);
      setTrains(backup);
      alert("Failed to update train. Please try again.");
    }
  };

  const refreshData = async () => {
    // Fast path: Load from localStorage first to show UI immediately
    const localData = trainService.getLocalData();
    if (localData.length > 0) {
      setTrains(localData);
    } else {
      setIsLoading(true);
    }

    try {
      const data = await trainService.getAllTrains();
      // Check if data is actually different before setting state to avoid unnecessary re-renders
      setTrains(data);
    } catch (error) {
      console.warn("Failed to fetch fresh data", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedForDeletion.size === 0) return;
    
    if (window.confirm(`Are you sure you want to decommission ${selectedForDeletion.size} service records?`)) {
      // Optimistic update
      const backup = [...trains];
      const selectedIds = new Set<string>(selectedForDeletion);
      setTrains(prev => prev.filter(t => !selectedIds.has(t.id)));
      const deletedCount = selectedForDeletion.size;
      setSelectedForDeletion(new Set<string>());

      try {
        await trainService.deleteBulk(selectedIds);
        console.log(`✓ ${deletedCount} trains deleted successfully`);
      } catch (error) {
        console.error("Failed to bulk delete trains, rolling back", error);
        setTrains(backup);
        alert("Failed to delete some trains. Rolling back changes.");
      }
    }
  };

  const handleSelectAll = () => {
    if (selectedForDeletion.size === allTrainsFiltered.length) {
      setSelectedForDeletion(new Set());
    } else {
      setSelectedForDeletion(new Set(allTrainsFiltered.map(t => t.id)));
    }
  };

  // View Components
  const HomeView = () => (
    <div className="flex-grow flex items-center justify-center p-8 bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 overflow-auto">
      <div className="max-w-6xl w-full grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="col-span-1 md:col-span-2 text-center mb-8">
          <div className="inline-flex items-center gap-3 px-4 py-2 bg-red-600/20 rounded-full border border-red-500/30 mb-6">
            <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></div>
            <span className="text-red-400 font-black text-xs uppercase tracking-widest">Southern Railway Division HQ</span>
          </div>
          <h1 className="text-6xl font-black text-white tracking-tighter mb-4 leading-none">TRAFFIC CONTROL<br/><span className="text-indigo-400">COMMAND CENTER</span></h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">Professional-grade master chart visualization and service registry management for the Indian Railways controller desk.</p>
        </div>

        <button 
          onClick={() => setViewMode('CHART')}
          className="group relative bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-indigo-500 p-10 rounded-[3rem] transition-all flex flex-col items-start text-left shadow-2xl hover:shadow-indigo-500/20 active:scale-95"
        >
          <div className="w-16 h-16 bg-indigo-600 rounded-3xl flex items-center justify-center mb-8 shadow-lg shadow-indigo-600/30 group-hover:scale-110 transition-transform">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" /></svg>
          </div>
          <h2 className="text-3xl font-black text-white mb-3">Live Master Chart</h2>
          <p className="text-slate-400 font-medium">Visualize time-distance paths (Marey charts), manage station delays, and analyze traffic patterns.</p>
          <div className="mt-8 flex items-center gap-2 text-indigo-400 font-black text-xs uppercase tracking-widest group-hover:translate-x-2 transition-transform">
            Launch Console <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </div>
        </button>

        <button 
          onClick={() => setViewMode('TRAINS')}
          className="group relative bg-slate-800/50 hover:bg-slate-800 border border-slate-700 hover:border-emerald-500 p-10 rounded-[3rem] transition-all flex flex-col items-start text-left shadow-2xl hover:shadow-emerald-500/20 active:scale-95"
        >
          <div className="w-16 h-16 bg-emerald-600 rounded-3xl flex items-center justify-center mb-8 shadow-lg shadow-emerald-600/30 group-hover:scale-110 transition-transform">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 002 2h2a2 2 0 002-2" /></svg>
          </div>
          <h2 className="text-3xl font-black text-white mb-3">Service Registry</h2>
          <p className="text-slate-400 font-medium">Add new services, import timetables via PDF/JSON, and manage the complete database of trains and schedules.</p>
          <div className="mt-8 flex items-center gap-2 text-emerald-400 font-black text-xs uppercase tracking-widest group-hover:translate-x-2 transition-transform">
            Access Database <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </div>
        </button>
      </div>
    </div>
  );

  const TrainRegistryView = () => (
    <div className="flex-grow flex flex-col bg-slate-50 min-h-0">
      <div className="p-8 pb-4 flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter mb-2">Service Registry</h1>
          <p className="text-slate-500 font-medium uppercase text-[10px] tracking-widest">Master Database of Active Railway Services</p>
        </div>
        <div className="flex gap-4">
          <div className="relative">
            <input 
              type="text" 
              placeholder="Search by Train Number or Name..." 
              className="w-80 pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <svg className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>

          {selectedForDeletion.size > 0 ? (
            <button 
              onClick={handleBulkDelete}
              className="px-6 py-3 bg-rose-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-rose-900/20 hover:bg-rose-700 transition-all flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              Delete ({selectedForDeletion.size})
            </button>
          ) : (
            <button onClick={() => { setEditingTrain(null); setIsAddModalOpen(true); }} className="px-6 py-3 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-indigo-900/20 hover:bg-indigo-700 transition-all flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4" /></svg>
              Add New Service
            </button>
          )}
        </div>
      </div>

      <div className="px-8 flex justify-between items-center mb-2">
        <button 
          onClick={handleSelectAll}
          className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline flex items-center gap-2"
        >
          <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedForDeletion.size === allTrainsFiltered.length && allTrainsFiltered.length > 0 ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300'}`}>
            {selectedForDeletion.size === allTrainsFiltered.length && allTrainsFiltered.length > 0 && (
              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
            )}
          </div>
          {selectedForDeletion.size === allTrainsFiltered.length && allTrainsFiltered.length > 0 ? 'Deselect All' : 'Select All'}
        </button>
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          {allTrainsFiltered.length} Services Found
        </span>
      </div>

      <div className="flex-grow p-8 pt-0 overflow-y-auto custom-scrollbar">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {allTrainsFiltered.map(t => (
            <div 
              key={t.id} 
              onClick={(e) => toggleDeleteSelection(t.id, e)}
              className={`bg-white border rounded-3xl p-6 shadow-sm hover:shadow-xl transition-all group flex flex-col cursor-pointer relative ${selectedForDeletion.has(t.id) ? 'border-indigo-600 ring-2 ring-indigo-600/10' : 'border-slate-200'}`}
            >
              <div className="absolute top-6 left-6 z-20">
                <div className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-all ${selectedForDeletion.has(t.id) ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-200 opacity-0 group-hover:opacity-100'}`}>
                   {selectedForDeletion.has(t.id) && (
                     <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
                   )}
                </div>
              </div>

              <div className="flex justify-between items-start mb-6 pl-8">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl text-white shadow-lg" style={{ backgroundColor: t.color }}>
                    {t.number.substring(0, 2)}
                  </div>
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 tracking-tighter">{t.number}</h3>
                    <div className="flex gap-1.5 mt-1">
                      <span className="text-[9px] font-black px-2 py-0.5 bg-slate-100 text-slate-600 rounded-md uppercase">{t.type}</span>
                      <span className="text-[9px] font-black px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded-md uppercase">P{t.priority}</span>
                      {(!t.days_normalized || t.days_normalized.length === 0) && (
                        <span className="text-[9px] font-black px-2 py-0.5 bg-rose-600 text-white rounded-md uppercase animate-pulse">ERROR: MISSING DAYS</span>
                      )}
                    </div>
                    <div className="mt-1">
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{t.days_raw || (t.days_normalized?.length === 7 ? 'Daily' : 'Unspecified Frequency')}</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={(e) => { e.stopPropagation(); handleEditTrain(t); }} className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-100"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteTrain(t.id); }} className="p-2 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                </div>
              </div>
              <p className="text-sm font-bold text-slate-700 uppercase mb-6 flex-grow pl-8">{t.name}</p>
              <div className="pt-4 border-t border-slate-100 flex justify-between items-center pl-8">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Route Span</span>
                  <span className="text-xs font-black text-slate-900">{t.points.length} Checkpoints</span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); handleSelectTrain(t); }} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline">View Schedule</button>
              </div>
            </div>
          ))}
          {allTrainsFiltered.length === 0 && (
            <div className="col-span-full py-20 text-center">
              <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center mx-auto mb-4 text-slate-300">
                <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
              </div>
              <h3 className="text-xl font-bold text-slate-900">No services found</h3>
              <p className="text-slate-500">Try adjusting your search or add a new service record.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50 overflow-hidden text-slate-900 font-sans">
      <header className="bg-black text-white px-4 py-3 flex items-center justify-between text-xs font-bold flex-shrink-0 border-b border-slate-800 z-30">
        <div className="flex items-center gap-6">
          <button onClick={() => setViewMode('HOME')} className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center font-black text-lg shadow-inner group-hover:scale-110 transition-transform">IR</div>
            <span className="tracking-[0.1em] uppercase font-black text-xs hidden lg:block">Controller Command System</span>
          </button>
          
          <nav className="flex items-center gap-1 ml-4 bg-slate-900 rounded-xl p-1 border border-slate-800">
            <button 
              onClick={() => setViewMode('CHART')}
              className={`px-4 py-1.5 rounded-lg text-[10px] uppercase font-black tracking-widest transition-all ${viewMode === 'CHART' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Master Chart
            </button>
            <button 
              onClick={() => setViewMode('TRAINS')}
              className={`px-4 py-1.5 rounded-lg text-[10px] uppercase font-black tracking-widest transition-all ${viewMode === 'TRAINS' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}
            >
              Train Registry
            </button>
          </nav>
        </div>
        
        <div className="flex gap-4 items-center">
          <div className="flex items-center gap-2 text-[9px] uppercase tracking-tighter text-slate-400">
            <span className={`w-2 h-2 rounded-full ${isLoading ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`}></span>
            {isLoading ? 'Syncing...' : 'DB Online'}
          </div>
          <button onClick={() => setViewMode('HOME')} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors" title="Home">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
          </button>
        </div>
      </header>

      {viewMode === 'CHART' && (
        <>
          <ControlBar 
            config={config} 
            onConfigChange={handleConfigChange} 
            onOpenAddModal={(mode) => { setEditingTrain(null); setModalStartTab(mode); setIsAddModalOpen(true); }} 
            onSave={() => alert("Snapshot saved.")} 
            onImport={refreshData}
            trains={trains}
          />
          <div className="bg-slate-900 text-white px-4 py-1.5 text-[10px] flex justify-between items-center shadow-lg font-bold uppercase tracking-widest flex-shrink-0 z-10 border-t border-white/5">
            <span className="text-slate-400">BOARD: <span className="text-white">{config.board}</span></span>
            <span className="text-indigo-400 font-mono">{config.date}</span>
          </div>
        </>
      )}

      <main className="flex-grow flex min-h-0 relative overflow-hidden">
        {viewMode === 'HOME' && <HomeView />}
        {viewMode === 'TRAINS' && <TrainRegistryView />}
        {viewMode === 'CHART' && (
          <div className="flex-grow flex min-h-0 relative overflow-hidden bg-slate-100">
            <div className="flex-grow flex p-3 min-h-0 overflow-hidden relative">
              <MasterChart trains={filteredTrainsForChart.filter(t => !hiddenTrains.has(t.id))} stations={displayStations} config={config} onTrainClick={handleSelectTrain} />
            </div>
            <aside className={`${isSidebarOpen ? 'w-80' : 'w-0'} bg-white border-l border-slate-200 transition-all duration-300 flex flex-col overflow-hidden shadow-xl z-20`}>
              <div className="flex border-b border-slate-100 bg-slate-50/50">
                <button onClick={() => setActiveSidebarTab('TRAINS')} className={`flex-1 py-3 text-[10px] font-black uppercase transition-all ${activeSidebarTab === 'TRAINS' ? 'bg-white text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}>Active</button>
                <button onClick={() => setActiveSidebarTab('JUNCTIONS')} className={`flex-1 py-3 text-[10px] font-black uppercase transition-all ${activeSidebarTab === 'JUNCTIONS' ? 'bg-white text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-400'}`}>Hubs</button>
              </div>
              <div className="p-4 flex flex-col h-full overflow-hidden">
                {activeSidebarTab === 'TRAINS' ? (
                  <div className="flex-grow flex flex-col min-h-0 overflow-hidden">
                    <div className="flex-grow overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                      {filteredTrainsForChart.map((t, idx) => {
                        const showHeader = idx === 0 || filteredTrainsForChart[idx - 1].priority !== t.priority;
                        return (
                          <React.Fragment key={t.id}>
                            {showHeader && (
                              <div className="pt-3 pb-1 flex items-center gap-2">
                                <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest whitespace-nowrap">Priority {t.priority}</span>
                                <div className="h-[1px] w-full bg-slate-100"></div>
                              </div>
                            )}
                            <div 
                              className={`p-3 rounded-xl border cursor-pointer group flex items-center justify-between transition-all ${selectedForDeletion.has(t.id) ? 'border-indigo-600 bg-indigo-50/50 shadow-sm ring-1 ring-indigo-600/10' : selectedTrain?.id === t.id ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-100 bg-white hover:border-slate-300'}`} 
                              onClick={() => handleSelectTrain(t)}
                            >
                              <div className="flex items-center gap-3 truncate flex-grow">
                                <button 
                                  onClick={(e) => toggleDeleteSelection(t.id, e)}
                                  className={`w-4 h-4 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${selectedForDeletion.has(t.id) ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300 opacity-0 group-hover:opacity-100'}`}
                                >
                                  {selectedForDeletion.has(t.id) && (
                                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
                                  )}
                                </button>
                                <div className={`truncate flex-grow ${hiddenTrains.has(t.id) ? 'opacity-40' : ''}`}>
                                  <span className="font-black text-[13px] tracking-tighter" style={{ color: t.color }}>{t.number}</span>
                                  <p className="text-[10px] font-bold text-slate-700 truncate uppercase">{t.name}</p>
                                </div>
                              </div>
                              <button onClick={(e) => toggleTrainVisibility(t.id, e)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors ml-2" title={hiddenTrains.has(t.id) ? "Show Train on Chart" : "Hide Train from Chart"}>
                                {hiddenTrains.has(t.id) ? (
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" /></svg>
                                ) : (
                                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                                )}
                              </button>
                            </div>
                          </React.Fragment>
                        );
                      })}
                    </div>
                    {selectedForDeletion.size > 0 && (
                      <div className="pt-4 border-t border-slate-100 mt-4 space-y-2">
                        <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">
                          <span>Selected: {selectedForDeletion.size}</span>
                          <button onClick={() => setSelectedForDeletion(new Set())} className="text-indigo-600 hover:underline">Clear</button>
                        </div>
                        <button 
                          onClick={handleBulkDelete}
                          className="w-full py-3 bg-rose-600 text-white font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg shadow-rose-900/20 hover:bg-rose-700 transition-all flex items-center justify-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          Bulk Decommission
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex-grow overflow-y-auto space-y-3 pr-1 custom-scrollbar">
                    {junctionHubs.map(hub => (
                      <div key={hub.code} className="p-4 rounded-2xl border border-slate-100 bg-slate-50 shadow-sm">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="px-2 py-0.5 bg-slate-900 text-white font-black rounded text-[10px]">{hub.code}</div>
                          <h3 className="font-black text-xs text-slate-900 uppercase">{hub.name}</h3>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {hub.sections.map(section => (
                            <button key={section} onClick={() => handleConfigChange({ ...config, board: section })} className={`px-2 py-1 rounded text-[8px] font-bold border ${config.board === section ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500'}`}>{section}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </aside>
          </div>
        )}
      </main>

      <AddTrainModal
        isOpen={isAddModalOpen}
        startTab={modalStartTab}
        onClose={() => { setIsAddModalOpen(false); setEditingTrain(null); setModalStartTab(undefined); }}
        onAdd={handleAddTrain}
        onUpdate={handleUpdateTrain}
        stations={displayStations}
        chartDate={config.date}
        initialTrain={editingTrain}
      />

      {selectedTrain && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-sm">
          <div className="bg-white w-full max-w-4xl shadow-2xl rounded-3xl border border-slate-200 p-8 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-6">
                <div className="p-5 bg-slate-900 rounded-2xl text-white shadow-2xl">
                  <h3 className="text-5xl font-black tracking-tighter">{selectedTrain.number}</h3>
                </div>
                <div>
                  <h3 className="text-3xl font-black text-slate-900 truncate max-w-md">{selectedTrain.name}</h3>
                  <div className="flex gap-2 mt-2 flex-wrap">
                    <span className="px-3 py-1 bg-slate-100 rounded-full text-[10px] font-black uppercase text-slate-500">Service: {selectedTrain.type}</span>
                    <span className="px-3 py-1 bg-amber-100 rounded-full text-[10px] font-black uppercase text-amber-700">Priority: P{selectedTrain.priority}</span>
                    <span className="px-3 py-1 bg-indigo-50 rounded-full text-[10px] font-black uppercase text-indigo-600">Frequency: {selectedTrain.days_raw || 'Daily'}</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setSelectedTrain(null)} className="p-3 bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-colors">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="flex-grow overflow-y-auto rounded-3xl border border-slate-100 bg-slate-50/50 p-4 custom-scrollbar">
              <table className="w-full text-left">
                <thead className="sticky top-0 bg-slate-50/80 backdrop-blur z-10">
                  <tr className="text-[10px] font-black text-slate-400 uppercase"><th className="px-6 py-4">Day</th><th className="px-6 py-4">Station</th><th className="px-6 py-4">Arr</th><th className="px-6 py-4">Dep</th></tr>
                </thead>
                <tbody>
                  {[...selectedTrain.points].sort((a,b) => (a.absolute_time || a.arrivalTime.getTime()) - (b.absolute_time || b.arrivalTime.getTime())).map((p, idx) => {
                    const stn = findStationGlobally(p.stationId);
                    const dayNum = p.runtime_day_offset !== undefined ? p.runtime_day_offset + 1 : Math.floor((p.absolute_time || 0) / 1440) + 1;
                    return (
                      <tr key={idx} className="bg-white border-b border-slate-50">
                        <td className="px-6 py-4"><span className="text-[10px] font-black">Day {dayNum}</span></td>
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="font-black text-slate-900">{stn?.name || p.stationId.split('_')[0]}</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase">{stn?.code || 'EXT'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono font-bold">{p.arrivalTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</td>
                        <td className="px-6 py-4 font-mono font-bold">{p.departureTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-8 pt-6 border-t border-slate-100 flex justify-between items-center">
              <button onClick={() => handleDeleteTrain(selectedTrain.id)} className="px-6 py-3 border-2 border-rose-100 text-rose-600 font-black text-xs uppercase tracking-widest rounded-2xl hover:bg-rose-50">Decommission</button>
              <div className="flex gap-4">
                <button onClick={printConflictReport} className="px-6 py-3 bg-slate-800 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl hover:bg-black flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                  Print Graph Conflicts
                </button>
                <button onClick={() => handleEditTrain(selectedTrain)} className="px-8 py-3 bg-indigo-600 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-indigo-900/20">Modify Schedule</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
