import { parseTimetableText } from './services/pdfExtractor.ts';

const text = `12084 - Coimbatore - Mayiladuthurai Jan Shatabdi Express CBE/Coimbatore Jn to MV/Mayiladuturai Jn Type: Jan Shatabdi Zone: SR 6h 30m - 362 km - 8 halts - Departs Sun,Mon,Wed,Thu,Fri,Sat # Code Station Name Arr Dep Halt PF Day Km Spd Elv Zone 1 CBE Coimbatore Jn 07:15 6 1 0 56 411 SR 2 IGU Irugur Jn 07:34 07:35 1m 1 18 109 377 SR 3 TUP Tiruppur 07:53 07:55 2m 2 1 51 75 306 SR 4 ED Erode Jn 08:35 08:40 5m 3 1 101 73 171 SR 5 KRR Karur Jn 09:33 09:35 2m 3 1 166 54 120 SR 6 TPJ Tiruchchirappalli Jn 11:00 11:10 10m 2 1 242 57 86 SR 7 TJ Thanjavur Jn 12:02 12:04 2m 1 1 292 75 57 SR 8 PML Papanasam 12:24 12:25 1m 1 317 78 32 SR 9 KMU Kumbakonam 12:36 12:38 2m 1 1 331 28 32 SR 10 MV Mayiladuturai Jn 13:45 3 1 362 - 13 SR India Rail Info https://indiarailinfo.com Jan 25 2026 (11:52) Jan 25 2026 (11:52) 1 1`;

console.log(JSON.stringify(parseTimetableText(text), null, 2));
