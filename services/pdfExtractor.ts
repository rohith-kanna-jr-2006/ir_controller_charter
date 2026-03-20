import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { TrainType } from '../types';

// Use worker from package
try {
  // @ts-ignore
  GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString();
} catch (e) {
  // fallback: leave default
}

export const extractTextFromPdfFile = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask: any = getDocument({ data: arrayBuffer });
  const doc = await loadingTask.promise;
  const maxPages = doc.numPages;
  let fullText = '';
  for (let i = 1; i <= maxPages; i++) {
    const page: any = await doc.getPage(i);
    const content = await page.getTextContent();
    
    // Group and sort by Y coordinate
    // transform: [a, b, c, d, tx, ty] -> ty is transform[5]
    const items = content.items as any[];
    items.sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4]);
    
    let pageText = '';
    let lastY = -1;
    for (const item of items) {
      if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 5) {
        pageText += '\n';
      }
      pageText += (item.str || '') + ' ';
      lastY = item.transform[5];
    }
    
    fullText += pageText + '\n';
  }
  console.log("EXTRACTED PDF TEXT LENGTH:", fullText.length);
  return fullText;
};

export const parseTimetableText = (text: string) => {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  console.log("PARSER RAW LINES:", lines.length);
  if (lines.length === 0) return { trains: [] };

  // STEP 1: IDENTIFY HEADER LINE (number/train name pattern)
  let number = '';
  let name = '';
  let headerLine = lines[0];

  // Scan for "number/name" pattern (e.g., 16618/Coimbatore - Rameswaram Express)
  const headerIdx = lines.findIndex(l => /^\s*(\d{4,5})\/([A-Za-z\s\-\(\)\.,\[\]]+)/.test(l));
  
  if (headerIdx !== -1) {
    headerLine = lines[headerIdx];
    const match = headerLine.match(/^\s*(\d{4,5})\/(.+)$/);
    if (match) {
      number = match[1].trim();
      name = match[2].trim();
    }
  } else {
    // Fallback search if exact format not found (Step 6 Validation will handle failure)
    const backupHeader = lines.find(l => /\b\d{4,5}\b/.test(l) && /-/.test(l));
    if (backupHeader) {
      const parts = backupHeader.split('/');
      if (parts.length > 1) {
        number = parts[0].match(/\d{4,5}/)?.[0] || '';
        name = parts.slice(1).join('/').trim();
      } else {
        const numMatch = backupHeader.match(/\b(\d{4,5})\b/);
        number = numMatch ? numMatch[1] : '';
        name = backupHeader.split(number)[1]?.replace(/^[\s\-\/]+/, '') || backupHeader;
      }
    }
  }

  // STEP 4: CLEAN NAME
  name = name.split(/\s(?:Type|Zone|Departs):/i)[0].trim().replace(/[\s\-]+$/, '');

  // STEP 6: VALIDATION
  if (!number) console.error("Validation Error: Train number missing in PDF extraction.");
  if (!name || name === 'Unknown') console.error("Validation Error: Train name missing in PDF extraction.");

  const tableIdx = lines.findIndex(l => /#?\s*Code\b/i.test(l) || /Station\s+Name/i.test(l));
  const startIdx = tableIdx >= 0 ? tableIdx + 1 : lines.findIndex(l => /\b[A-Z]{2,4}\b.*\d{1,2}:\d{2}/.test(l));
  const intermediateStops: any[] = [];
  // 1. Initial Extraction
  if (startIdx >= 0) {
    for (let i = startIdx; i < lines.length; i++) {
      const row = lines[i];
      
      // STEP 1: REMOVE INVALID ROWS
      if (/https?:\/\/|www\.|indiarailinfo|202\d|Generated|Page\s+\d/i.test(row)) continue;

      const tokens = row.split(/\s+/).filter(Boolean);
      if (tokens.length < 2) continue;

      const timeMatches = row.match(/(\d{1,2}:\d{2})/g) || [];
      // Need at least one time or a valid looking station row
      if (timeMatches.length === 0) continue;

      const stationCode = (tokens[1] || "UNK").toUpperCase();
      
      let firstTimeIdx = -1;
      for (let j = 0; j < tokens.length; j++) {
        if (/^\d{1,2}:\d{2}$/.test(tokens[j])) {
          firstTimeIdx = j;
          break;
        }
      }
      
      const stationName = firstTimeIdx !== -1 
        ? tokens.slice(2, firstTimeIdx).join(' ') 
        : tokens.slice(2).join(' ') || stationCode;
      
      const arrival = timeMatches[0] || "00:00";
      const departure = timeMatches[1] || arrival;

      intermediateStops.push({ 
        index: intermediateStops.length + 1,
        stationCode, 
        stationName,
        arrival, 
        departure
      });
    }
  }

  // 2. Final Filtering and Day Calculation
  const finalStops: any[] = [];
  let currentDaySequence = 1;
  let lastTimeMinutes = -1;

  intermediateStops.forEach((p) => {
    // STEP 1 & 2: VALID STATION RULE & REMOVE INVALID STOPS
    const sName = p.stationName || '';
    const sCode = p.stationCode;
    
    // Reject numeric names (e.g., "20")
    if (/^\d+$/.test(sName)) return;
    // Reject short names
    if (sName.length < 3) return;
    // Reject placeholder codes
    if (['EXT', 'UNK', 'PATH', 'EXTERNAL', 'TERMINATED'].includes(sCode)) return;
    // Valid code: 2-6 uppercase letters
    if (!/^[A-Z]{2,6}$/.test(sCode)) return;

    // STEP 3: RECALCULATE DAY (DO NOT TRUST IMPORTED COLUMN)
    const timeToUse = p.arrival !== '00:00' ? p.arrival : p.departure;
    const [h, m] = timeToUse.split(':').map(Number);
    const totalMinutes = h * 60 + m;

    if (lastTimeMinutes !== -1 && totalMinutes < lastTimeMinutes) {
      // Time jump detected (e.g., 23:00 -> 01:00)
      currentDaySequence++;
    }
    
    finalStops.push({
      ...p,
      stationName: sName,
      stationCode: sCode,
      day: currentDaySequence, // STEP 5: SEQUENTIAL DAYS (1 -> 2 -> 3)
      timetable_day: currentDaySequence,
      actual_day: currentDaySequence,
      time: p.arrival
    });

    lastTimeMinutes = totalMinutes;
  });

  // STEP 5: FINAL CLEANING
  const dedupedStops = finalStops.filter((s, i, arr) => {
    if (i > 0 && s.stationCode === arr[i-1].stationCode) return false;
    return true;
  });

  if (dedupedStops.length < 2) return { trains: [] };

  // Guess type
  let finalType: string = TrainType.EXPRESS;
  const searchStr = (headerLine + ' ' + text).toUpperCase();
  Object.values(TrainType).forEach(t => {
    if (searchStr.includes(t.replace(/_/g, ' ')) || searchStr.includes(t)) {
      finalType = t;
    }
  });

  return {
    trains: [{
      number: number || '00000',
      name: name || 'Extracted Service',
      type: finalType,
      daysOfService: "Daily",
      stops: dedupedStops
    }]
  };
};
