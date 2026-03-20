// copy of parseTimetableText from services/pdfExtractor.ts with day detection
function parseTimetableText(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return { trains: [] };
    let headerLine = lines.find(l => /\b\d{2,5}\b/.test(l) && /-/.test(l));
    if (!headerLine) headerLine = lines[0];
    const numberMatch = headerLine.match(/\b(\d{2,5})\b/);
    const number = numberMatch ? numberMatch[1] : '';
    const name = headerLine.replace(number || '', '').replace(/^[:\-\/\s]+/, '').trim();

    const tableIdx = lines.findIndex(l => /#?\s*Code\b/i.test(l) || /Station\s+Name/i.test(l));
    console.log('tableIdx', tableIdx, 'line', lines[tableIdx]);
    let dayColPos = -1;
    if (tableIdx >= 0) {
        dayColPos = lines[tableIdx].toUpperCase().indexOf('DAY');
        console.log('dayColPos', dayColPos);
    }
    const startIdx = tableIdx >= 0 ? tableIdx + 1 : lines.findIndex(l => /\b[A-Z]{2,4}\b.*\d{1,2}:\d{2}/.test(l));
    console.log('startIdx', startIdx, 'line', lines[startIdx]);
    const points = [];

    if (startIdx >= 0) {
        for (let i = startIdx; i < lines.length; i++) {
            const row = lines[i];
            if (/^\s*\d{1,2}\/\d{1,2}\/\d{2,4}|www\.|https?:\/\//i.test(row)) break;
            const codeMatch = row.match(/\b([A-Z]{2,4})\b/);
            const timeMatches = row.match(/(\d{1,2}:\d{2})/g) || [];
            if (codeMatch && timeMatches.length > 0) {
                const stationCode = codeMatch[1];
                let arrival = timeMatches[0];
                let departure = timeMatches[1] || arrival;

                // attempt to read the day from the numeric columns after the last time
                let day = 1;
                // try regex to capture PF and following numeric token (which may be Day)
                let regexDay = 1;
                const regex = /^\s*\d+\s+([A-Z]{2,4})\s+.+?\s+\d{1,2}:\d{2}(?:\s+\d{1,2}:\d{2})?\s+\S+\s+(\d+)(?:\s+(\d+))?/;
                const rmatch = row.match(regex);
                if (rmatch) {
                    // rmatch[1]=code, rmatch[2]=PF, rmatch[3]=maybeDayOrKm
                    const maybe = parseInt(rmatch[3] || '', 10);
                    if (!isNaN(maybe) && maybe >= 1 && maybe <= 7) {
                        regexDay = maybe;
                    }
                }
                console.log('ROW:', row);
                console.log('REGEX MATCH', rmatch);
                day = regexDay;
                points.push({ stationCode, arrival, departure, day });
            }
        }
    }

    return { trains: [{ number, name, points }] };
}

const text = `12084 - Coimbatore - Mayiladuthurai Jan Shatabdi Express
CBE/Coimbatore Jn to MV/Mayiladuturai Jn Type: Jan Shatabdi Zone: SR 6h 30m - 362 km - 8 halts - Departs Sun,Mon,Wed,Thu,Fri,Sat
# Code Station Name Arr Dep Halt PF Day Km Spd Elv Zone
1 CBE Coimbatore Jn 07:15 6 1 0 56 411 SR
2 IGU Irugur Jn 07:34 07:35 1m 1 18 109 377 SR
3 TUP Tiruppur 07:53 07:55 2m 2 1 51 75 306 SR
4 ED Erode Jn 08:35 08:40 5m 3 1 101 73 171 SR
5 KRR Karur Jn 09:33 09:35 2m 3 1 166 54 120 SR
6 TPJ Tiruchchirappalli Jn 11:00 11:10 10m 3 2 242 57 86 SR
7 TJ Thanjavur Jn 12:02 12:04 2m 1 1 292 75 57 SR
8 PML Papanasam 12:24 12:25 1m 1 317 78 32 SR
9 KMU Kumbakonam 12:36 12:38 2m 1 1 331 28 32 SR
10 MV Mayiladuturai Jn 13:45 3 1 362 - 13 SR
India Rail Info https://indiarailinfo.com Jan 25 2026 (11:52) Jan 25 2026 (11:52) 1 1`;

console.log(JSON.stringify(parseTimetableText(text), null, 2));
