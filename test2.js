const TrainType = {
    ARME_ART: 'ARME_ART',
    VVIP_SPECIAL: 'VVIP_SPECIAL',
    SUBURBAN: 'SUBURBAN',
    VANDE_BHARAT: 'VANDE_BHARAT',
    RAJDHANI: 'RAJDHANI',
    SHATABDI: 'SHATABDI',
    DURONTO: 'DURONTO',
    TEJAS: 'TEJAS',
    GATIMAAN: 'GATIMAAN',
    GARIB_RATH: 'GARIB_RATH',
    JAN_SHATABDI: 'JAN_SHATABDI',
    SAMPARK_KRANTI: 'SAMPARK_KRANTI',
    HUMSAFAR: 'HUMSAFAR',
    DOUBLE_DECKER: 'DOUBLE_DECKER',
    UDAY: 'UDAY',
    SUPERFAST: 'SUPERFAST',
    EXPRESS: 'EXPRESS',
    INTERCITY: 'INTERCITY',
    MILITARY_SPECIAL: 'MILITARY_SPECIAL',
    FAST_PASSENGER: 'FAST_PASSENGER',
    PASSENGER: 'PASSENGER',
    MEMU_DEMU: 'MEMU_DEMU',
    ANTYODAYA: 'ANTYODAYA',
    MIXED: 'MIXED',
    MILITARY_STORES: 'MILITARY_STORES',
    FREIGHT: 'FREIGHT'
};

function parseTimetableText(text) {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return { trains: [] };
    let headerLine = lines.find(l => /\b\d{2,5}\b/.test(l) && /-/.test(l));
    if (!headerLine) headerLine = lines[0];
    const numberMatch = headerLine.match(/\b(\d{2,5})\b/);
    const number = numberMatch ? numberMatch[1] : '';
    const name = headerLine.replace(number || '', '').replace(/^[:\-\/\s]+/, '').trim();
    const tableIdx = lines.findIndex(l => /#?\s*Code\b/i.test(l) || /Station\s+Name/i.test(l));
    const startIdx = tableIdx >= 0 ? tableIdx + 1 : lines.findIndex(l => /\b[A-Z]{2,4}\b.*\d{1,2}:\d{2}/.test(l));
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
                points.push({ stationCode, arrival, departure, day: 1 });
            }
        }
    }
    if (points.length === 0) {
        for (const row of lines) {
            const codeMatch = row.match(/\b([A-Z]{2,4})\b/);
            const timeMatches = row.match(/(\d{1,2}:\d{2})/g) || [];
            if (codeMatch && timeMatches.length > 0) {
                points.push({ stationCode: codeMatch[1], arrival: timeMatches[0], departure: timeMatches[1] || timeMatches[0], day: 1 });
            }
        }
    }
    {
        const globalRegex = /([A-Z]{2,4})[^\d\n]*?(\d{1,2}:\d{2})(?:[^\d\n]*?(\d{1,2}:\d{2}))?/g;
        let m; const extras = [];
        while ((m = globalRegex.exec(text)) !== null) {
            extras.push({ stationCode: m[1], arrival: m[2], departure: m[3] || m[2], day: 1 });
        }
        if (extras.length > 1 && extras.length > points.length) {
            points.length = 0; points.push(...extras);
        }
    }
    let inferredType = TrainType.EXPRESS;
    {
        const allTypes = Object.values(TrainType);
        const sorted = allTypes.slice().sort((a, b) => {
            const na = a.replace(/_/g, ' ');
            const nb = b.replace(/_/g, ' ');
            return nb.length - na.length;
        });
        const searchSpace = (headerLine + ' ' + text).toUpperCase();
        for (const tt of sorted) {
            const norm = tt.replace(/_/g, ' ');
            if (searchSpace.includes(norm) || searchSpace.includes(tt)) {
                inferredType = tt;
                break;
            }
        }
    }
    const train = { number: number || '00000', name: name || 'Unknown', type: inferredType, points };
    return { trains: [train] };
}

const text = `12084 - Coimbatore - Mayiladuthurai Jan Shatabdi Express CBE/Coimbatore Jn to MV/Mayiladuturai Jn Type: Jan Shatabdi Zone: SR 6h 30m - 362 km - 8 halts - Departs Sun,Mon,Wed,Thu,Fri,Sat # Code Station Name Arr Dep Halt PF Day Km Spd Elv Zone 1 CBE Coimbatore Jn 07:15 6 1 0 56 411 SR 2 IGU Irugur Jn 07:34 07:35 1m 1 18 109 377 SR 3 TUP Tiruppur 07:53 07:55 2m 2 1 51 75 306 SR 4 ED Erode Jn 08:35 08:40 5m 3 1 101 73 171 SR 5 KRR Karur Jn 09:33 09:35 2m 3 1 166 54 120 SR 6 TPJ Tiruchchirappalli Jn 11:00 11:10 10m 2 1 242 57 86 SR 7 TJ Thanjavur Jn 12:02 12:04 2m 1 1 292 75 57 SR 8 PML Papanasam 12:24 12:25 1m 1 317 78 32 SR 9 KMU Kumbakonam 12:36 12:38 2m 1 1 331 28 32 SR 10 MV Mayiladuturai Jn 13:45 3 1 362 - 13 SR India Rail Info https://indiarailinfo.com Jan 25 2026 (11:52) Jan 25 2026 (11:52) 1 1`;

console.log(JSON.stringify(parseTimetableText(text), null, 2));
