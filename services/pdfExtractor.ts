import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import { TrainType } from '../types';

// Use worker from package
try {
  // @ts-ignore
  if (typeof window !== 'undefined' && 'URL' in window) {
    GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', 'http://localhost').toString();
  }
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
  console.log("DEBUG: RAW PDF TEXT STARTING (First 500 chars):", text.substring(0, 500));
  
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  console.log("DEBUG: TOTAL LINES DETECTED:", lines.length);
  if (lines.length === 0) return { trains: [] };

  // STEP 1: DETECT ALL TRAIN SECTIONS
  // Matches: "12345/Name" OR "Train Name"
  const headerRegex = /^\s*(?:(\d{4,5})\/|Train\s+)([A-Za-z0-9\s\-\(\)\.,\[\]]+)/i;
  const sections: { headerLine: string; lines: string[]; text: string }[] = [];
  
  let currentSectionLines: string[] = [];
  let currentHeader = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(headerRegex);

    if (match) {
      if (currentSectionLines.length > 0) {
        sections.push({ 
          headerLine: currentHeader, 
          lines: [...currentSectionLines],
          text: currentSectionLines.join('\n')
        });
      }
      currentHeader = line;
      currentSectionLines = [line];
    } else {
      currentSectionLines.push(line);
    }
  }

  if (currentSectionLines.length > 0) {
    sections.push({ 
      headerLine: currentHeader, 
      lines: currentSectionLines,
      text: currentSectionLines.join('\n')
    });
  }

  console.log("DEBUG: SPLIT SECTIONS COUNT:", sections.length);

  // Fallback: If no headers matched, treat whole thing as one section
  if (sections.length === 0 || sections.every(s => !s.headerLine)) {
    console.log("DEBUG: NO HEADERS FOUND, USING FALLBACK (FULL TEXT AS SINGLE SECTION)");
    sections.length = 0;
    sections.push({ headerLine: lines[0], lines, text });
  }

  const finalTrains: any[] = [];

  // STEP 2: PARSE EACH SECTION
  sections.forEach((section, idx) => {
    const sLines = section.lines;
    let number = '';
    let name = '';
    const match = section.headerLine.match(headerRegex);

    if (match) {
      number = match[1]?.trim() || '';
      name = match[2]?.trim() || section.headerLine;
    } else {
      const backupHeader = sLines.find(l => /\b\d{4,5}\b/.test(l) && /-/.test(l));
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
      } else {
        name = sLines[0]; // Final fallback: first line is name
      }
    }

    console.log(`DEBUG: SECTION ${idx} PARSING ATTEMPT:`, { number, name, lineCount: sLines.length });

    if (!name || name === 'Unknown') {
      console.log(`DEBUG: SECTION ${idx} FAILED (NO NAME)`);
      return;
    }

    name = name.split(/\s(?:Type|Zone|Departs):/i)[0].trim().replace(/[\s\-]+$/, '');

    // Improved Start detection: find first line with a station code and time
    const tableIdx = sLines.findIndex(l => /#?\s*Code\b/i.test(l) || /Station\s+Name/i.test(l));
    const firstRowIdx = sLines.findIndex(l => /^\s*\d+\s+[A-Z]{2,5}\s+.*\d{1,2}:\d{2}/.test(l));
    const startIdx = tableIdx >= 0 ? tableIdx + 1 : (firstRowIdx >= 0 ? firstRowIdx : -1);
    
    if (startIdx < 0) {
      console.log(`DEBUG: SECTION ${idx} FAILED (NO TIMETABLE START FOUND)`);
      return;
    }

    const intermediateStops: any[] = [];
    for (let i = startIdx; i < sLines.length; i++) {
      const row = sLines[i];
      if (/https?:\/\/|www\.|indiarailinfo|202\d|Generated|Page\s+\d/i.test(row)) continue;
      if (i > startIdx && row.match(headerRegex)) break;

      const tokens = row.split(/\s+/).filter(Boolean);
      if (tokens.length < 2) continue;

      const timeMatches = row.match(/(\d{1,2}:\d{2})/g) || [];
      if (timeMatches.length === 0) continue;

      // New parsing logic: [Index] [Code] [Name...] [Arr] [Dep] ... [Day X]
      let stationCode = 'UNK';
      let stationName = '';
      let arrival = '00:00';
      let departure = '00:00';
      let explicitDay = -1;

      // Find all time indices
      const timeIndices = tokens.map((t, idx) => /^\d{1,2}:\d{2}$/.test(t) ? idx : -1).filter(idx => idx !== -1);
      
      if (timeIndices.length > 0) {
        const firstTimeIdx = timeIndices[0];
        
        // If first token is numeric index, station code is second
        const hasLeadingIndex = /^\d+$/.test(tokens[0]);
        stationCode = (hasLeadingIndex ? tokens[1] : tokens[0]).toUpperCase();
        
        const nameStart = hasLeadingIndex ? 2 : 1;
        stationName = tokens.slice(nameStart, firstTimeIdx).join(' ') || stationCode;
        
        arrival = tokens[firstTimeIdx];
        departure = timeIndices.length > 1 ? tokens[timeIndices[1]] : arrival;

        // Check for "Day X" or similar
        const dayMatch = row.match(/Day\s*(\d+)/i);
        if (dayMatch) {
          explicitDay = parseInt(dayMatch[1], 10);
        }
      } else {
        continue; // No times found
      }

      intermediateStops.push({ 
        index: intermediateStops.length + 1,
        stationCode, 
        stationName,
        arrival, 
        departure,
        explicitDay
      });
    }

    console.log(`DEBUG: SECTION ${idx} INTERMEDIATE STOPS COUNT:`, intermediateStops.length);

    // Filter and Day Calculation
    const finalStops: any[] = [];
    let currentDaySequence = 1;
    let lastTimeMinutes = -1;

    intermediateStops.forEach((p) => {
      const sName = p.stationName || '';
      const sCode = p.stationCode;
      
      if (/^\d+$/.test(sName) || sName.length < 2) return;
      if (['EXT', 'UNK', 'PATH', 'EXTERNAL', 'TERMINATED'].includes(sCode)) return;
      if (!/^[A-Z0-9]{2,7}$/.test(sCode)) return;

      const timeToUse = p.arrival !== '00:00' ? p.arrival : p.departure;
      const [h, m] = timeToUse.split(':').map(Number);
      const totalMinutes = h * 60 + m;

      // Use explicit day if found, otherwise calculate sequentiallly
      if (p.explicitDay !== -1) {
        currentDaySequence = p.explicitDay;
      } else if (lastTimeMinutes !== -1 && totalMinutes < lastTimeMinutes) {
        currentDaySequence++;
      }
      
      finalStops.push({
        ...p,
        stationName: sName,
        stationCode: sCode,
        day: currentDaySequence,
        timetable_day: currentDaySequence,
        actual_day: currentDaySequence,
        time: p.arrival
      });
      lastTimeMinutes = totalMinutes;
    });

    const dedupedStops = finalStops.filter((s, i, arr) => {
      if (i > 0 && s.stationCode === arr[i-1].stationCode) return false;
      return true;
    });

    console.log(`DEBUG: SECTION ${idx} FINAL DEDUPED STOPS:`, dedupedStops.length);

    if (dedupedStops.length >= 2) {
      // Guess type
      let finalType: string = TrainType.EXPRESS;
      const searchStr = (section.headerLine + ' ' + section.text).toUpperCase();
      Object.values(TrainType).forEach(t => {
        if (searchStr.includes(t.replace(/_/g, ' ')) || searchStr.includes(t)) {
          finalType = t;
        }
      });

      finalTrains.push({
        number: number || '00000',
        name: name || 'Extracted Service',
        type: finalType,
        daysOfService: "Daily",
        stops: dedupedStops
      });
    }
  });

  console.log("DEBUG: FINAL TRAINS FOUND:", finalTrains.length);
  if (finalTrains.length > 0) {
    console.log("DEBUG: FIRST TRAIN PREVIEW:", { 
      number: finalTrains[0].number, 
      name: finalTrains[0].name, 
      stopCount: finalTrains[0].stops.length 
    });
  }
  return { trains: finalTrains };
};
