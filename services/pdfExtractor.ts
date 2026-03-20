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
  const allHeadersRegex = /\d{4,5}\/[^\n]+/g;
  const detectedHeaders = text.match(allHeadersRegex);
  console.log("DEBUG: DETECTED HEADERS (Regex Global):", detectedHeaders);

  const headerRegex = /^\s*(\d{4,5})\/([A-Za-z\s\-\(\)\.,\[\]]+)/;
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
      number = match[1].trim();
      name = match[2].trim();
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
      }
    }

    console.log(`DEBUG: SECTION ${idx} PARSING ATTEMPT:`, { number, name, lineCount: sLines.length });

    if (!number || !name) {
      console.log(`DEBUG: SECTION ${idx} FAILED (NO NUMBER/NAME)`);
      return;
    }

    name = name.split(/\s(?:Type|Zone|Departs):/i)[0].trim().replace(/[\s\-]+$/, '');

    const tableIdx = sLines.findIndex(l => /#?\s*Code\b/i.test(l) || /Station\s+Name/i.test(l));
    const startIdx = tableIdx >= 0 ? tableIdx + 1 : sLines.findIndex(l => /\b[A-Z]{2,4}\b.*\d{1,2}:\d{2}/.test(l));
    
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

    console.log(`DEBUG: SECTION ${idx} INTERMEDIATE STOPS COUNT:`, intermediateStops.length);

    // Filter and Day Calculation
    const finalStops: any[] = [];
    let currentDaySequence = 1;
    let lastTimeMinutes = -1;

    intermediateStops.forEach((p) => {
      const sName = p.stationName || '';
      const sCode = p.stationCode;
      
      if (/^\d+$/.test(sName) || sName.length < 3) return;
      if (['EXT', 'UNK', 'PATH', 'EXTERNAL', 'TERMINATED'].includes(sCode)) return;
      if (!/^[A-Z]{2,6}$/.test(sCode)) return;

      const timeToUse = p.arrival !== '00:00' ? p.arrival : p.departure;
      const [h, m] = timeToUse.split(':').map(Number);
      const totalMinutes = h * 60 + m;

      if (lastTimeMinutes !== -1 && totalMinutes < lastTimeMinutes) {
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
