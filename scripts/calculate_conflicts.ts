import mongoose from 'mongoose';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/indian-railways';
import { Train } from '../server/models/Train.ts';
import fs from 'fs';
import { DIVISIONS } from '../constants.tsx';

async function run() {
  let allTrains: any[] = [];
  try {
     const data = fs.readFileSync('db.json', 'utf-8');
     allTrains = JSON.parse(data);
  } catch (e) {
     try {
       const res = await fetch('http://127.0.0.1:3001/api/trains');
       allTrains = await res.json();
     } catch(err) {
       console.error('Failed to fetch from API', err);
     }
  }
  
  if (!Array.isArray(allTrains) || allTrains.length === 0) {
     console.error('No trains found. Nothing to calculate.');
     return;
  }
  
  console.log(`Loaded ${allTrains.length} trains.`);
  
  const parseDaysOfService = (daysStr: any): Set<number> => {
    if (Array.isArray(daysStr)) return new Set(daysStr);
    if (!daysStr || typeof daysStr !== 'string') return new Set([0, 1, 2, 3, 4, 5, 6]);

    const normalized = daysStr.toLowerCase().trim();
    if (normalized === 'daily') return new Set([0, 1, 2, 3, 4, 5, 6]);

    const daysMap: Record<string, number> = {
      'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6,
      'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4, 'friday': 5, 'saturday': 6
    };

    if (normalized.startsWith('except ')) {
      const excludedStr = normalized.replace('except ', '').trim();
      const excludedParts = excludedStr.split(/[\s,]+/).map(d => d.trim().substring(0, 3));
      const excludedNums = excludedParts.map(d => daysMap[d]).filter(d => d !== undefined);
      const allDays = [0, 1, 2, 3, 4, 5, 6];
      return new Set(allDays.filter(d => !excludedNums.includes(d)));
    }

    const parts = normalized.split(/[\s,]+/).map(d => d.trim().substring(0, 3));
    const nums = parts.map(d => daysMap[d]).filter(d => d !== undefined);
    return new Set(nums);
  };

  // Assign normalized days to each train
  allTrains.forEach(t => {
    t.days = new Set(t.days_normalized || t.daysOfService || [0, 1, 2, 3, 4, 5, 6]);
  });

  const kmMap = new Map<string, number>();
  const codeMap = new Map<string, string>();
  const nameMap = new Map<string, string>();
  
  DIVISIONS.forEach(div => {
    div.stations.forEach(s => {
      kmMap.set(s.id, s.km);
      codeMap.set(s.id, s.code);
      nameMap.set(s.id, s.name);
    });
  });

  const getContiguousSegments = (t: any) => {
    const segs: any[] = [];
    let prevValid: any = null;
    if (!t.points) return [];
    t.points.forEach((p: any) => {
      if (kmMap.has(p.stationId)) {
        const arrival = new Date(p.arrivalTime).getTime();
        const departure = new Date(p.departureTime).getTime();
        const y = kmMap.get(p.stationId)!;
        const curr = { tArr: arrival, tDep: departure, y, id: p.stationId, code: codeMap.get(p.stationId)! };
        
        if (prevValid) {
          segs.push({ 
            t1: prevValid.tDep, y1: prevValid.y, 
            t2: curr.tArr, y2: curr.y, 
            origin: prevValid.code, dest: curr.code,
            dir: Math.sign(curr.y - prevValid.y)
          });
        }
        
        if (curr.tDep >= curr.tArr) {
          segs.push({
            t1: curr.tArr, y1: curr.y,
            t2: curr.tDep, y2: curr.y,
            origin: curr.code, dest: curr.code,
            dir: 0
          });
        }
        prevValid = curr;
      }
    });
    return segs;
  };

  const getPosition = (segs: any[], t: number) => {
    for (const s of segs) {
        if (t >= s.t1 && t <= s.t2) {
            if (s.t2 === s.t1) return s.y1;
            return s.y1 + (t - s.t1) * (s.y2 - s.y1) / (s.t2 - s.t1);
        }
    }
    return null;
  };

  const getNearestStation = (km: number) => {
    let closest = '';
    let minDiff = Infinity;
    kmMap.forEach((k, id) => {
      const diff = Math.abs(k - km);
      if (diff < minDiff) {
        minDiff = diff;
        closest = `${nameMap.get(id)} (${codeMap.get(id)})`;
      }
    });
    return closest;
  };

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const finalReport: Record<string, any[]> = {};

  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const dayName = dayNames[dayIdx];
    const activeTrains = allTrains.filter(t => t.days.has(dayIdx));
    const dayEvents: any[] = [];
    
    console.log(`Processing ${dayName} with ${activeTrains.length} active trains...`);

    for (let i = 0; i < activeTrains.length; i++) {
        const tA = activeTrains[i];
        const segsA = getContiguousSegments(tA);
        if (segsA.length === 0) continue;

        for (let j = i + 1; j < activeTrains.length; j++) {
            const tB = activeTrains[j];
            const segsB = getContiguousSegments(tB);
            if (segsB.length === 0) continue;

            const startA = segsA[0].t1;
            const endA = segsA[segsA.length - 1].t2;
            const startB = segsB[0].t1;
            const endB = segsB[segsB.length - 1].t2;

            const t_start = Math.max(startA, startB);
            const t_end = Math.min(endA, endB);

            if (t_start <= t_end) {
                // ... same detection logic ...
                let dirA = 0;
                for(const s of segsA) { if(s.dir !== 0) { dirA = s.dir; break; } }
                let dirB = 0;
                for(const s of segsB) { if(s.dir !== 0) { dirB = s.dir; break; } }
                
                const isCrossing = dirA !== dirB && dirA !== 0 && dirB !== 0;
                const isOvertaking = dirA === dirB && dirA !== 0;

                const pA = tA.priority || 0;
                const pB = tB.priority || 0;

                let prevDiff: number | null = null;
                let prevT: number | null = null;
                let conflictRecorded = false;

                const MINUTE = 60000;
                for (let t = t_start; t <= t_end + MINUTE; t += MINUTE) {
                    const posA = getPosition(segsA, t);
                    const posB = getPosition(segsB, t);
                    
                    if (posA !== null && posB !== null) {
                        const diff = posA - posB;
                        const absDiff = Math.abs(diff);

                        if (absDiff > 10.0) {
                            conflictRecorded = false;
                        }

                        let isConflict = false;
                        let swapHappened = false;
                        
                        if (isCrossing && absDiff <= 2.0) {
                            isConflict = true;
                        }
                        
                        if (isOvertaking && prevDiff !== null) {
                            if ((prevDiff < 0 && diff > 0) || (prevDiff > 0 && diff < 0)) {
                                isConflict = true;
                                swapHappened = true;
                            }
                        }

                        if (isConflict && !conflictRecorded) {
                            let eventType = '';
                            let action = '';
                            let faster = 'N/A';

                            if (isCrossing) {
                                eventType = 'CROSSING';
                                // Higher priority has smaller number (1 is highest)
                                const prefTrain = pA <= pB ? tA : tB;
                                const delTrain = pA <= pB ? tB : tA;
                                action = `Higher priority Train ${prefTrain.number} wins crossing, Train ${delTrain.number} waits`;
                            } else if (isOvertaking) {
                                eventType = 'OVERTAKING';
                                const speedA = Math.abs(segsA[segsA.length-1].y2 - segsA[0].y1) / (endA - startA || 1);
                                const speedB = Math.abs(segsB[segsB.length-1].y2 - segsB[0].y1) / (endB - startB || 1);
                                
                                let fasterTrain = speedA >= speedB ? tA : tB;
                                let slowerTrain = speedA >= speedB ? tB : tA;

                                if (pA < pB && swapHappened) {
                                    fasterTrain = tA; slowerTrain = tB;
                                } else if (pB < pA && swapHappened) {
                                    fasterTrain = tB; slowerTrain = tA;
                                }

                                faster = fasterTrain.number;

                                if ((fasterTrain.id === tA.id && pA <= pB) || (fasterTrain.id === tB.id && pB <= pA)) {
                                    action = `Higher priority Train ${fasterTrain.number} performs overtaking`;
                                } else {
                                    eventType = 'ERROR';
                                    action = `Error: Lower priority Train ${fasterTrain.number} overtakes higher priority Train ${slowerTrain.number}`;
                                }
                            }

                            if (eventType !== '') {
                                dayEvents.push({
                                    TrainA: tA.number,
                                    TrainB: tB.number,
                                    Event: eventType,
                                    Time_Interval: `${new Date(prevT || t).toISOString().substring(11, 16)} -> ${new Date(t).toISOString().substring(11, 16)}`,
                                    Location: `~ ${getNearestStation(posA)}`,
                                    Faster_Train: faster,
                                    Priority_Decision: action
                                });
                                conflictRecorded = true;
                            }
                        }
                        prevDiff = diff;
                        prevT = t;
                    }
                }
            }
        }
    }
    
    dayEvents.sort((a,b) => {
        const timeA = a.Time_Interval.split(' -> ')[0];
        const timeB = b.Time_Interval.split(' -> ')[0];
        return timeA.localeCompare(timeB);
    });

    if (dayEvents.length > 0) {
        console.log(`Day: ${dayName}`);
        dayEvents.forEach(e => {
            console.log(`* Train ${e.TrainA} & Train ${e.TrainB} → ${e.Event} at ${e.Time_Interval.split(' -> ')[0]}, location ${e.Location}`);
        });
    }
    
    finalReport[dayName] = dayEvents;
  }

  console.log(`Calculated conflicts for all 7 days.`);
  fs.writeFileSync('train_priorities_report.json', JSON.stringify(finalReport, null, 2));
  await mongoose.disconnect();
}

run().catch(console.error);
