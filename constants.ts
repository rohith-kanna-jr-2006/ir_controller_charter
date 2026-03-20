
import { Zone, Division, TrainType, Station } from './types';
import { 
  CHENNAI_SECTIONS, 
  SALEM_SECTIONS, 
  PALAKKAD_SECTIONS, 
  TVC_SECTIONS, 
  MDU_SECTIONS, 
  TRICHY_SECTIONS 
} from './SouthernRailwaysStationDataList';

export const ZONES: Zone[] = [
  { id: 'SR', name: 'Southern Railway', code: 'SR', headquarters: 'Chennai Central', divisions: ['Chennai', 'Salem', 'Palakkad', 'Thiruvananthapuram', 'Madurai', 'Tiruchchirappalli'] },
  { id: 'CR', name: 'Central Railway', code: 'CR', headquarters: 'Mumbai CSMT', divisions: ['Mumbai', 'Bhusawal', 'Nagpur', 'Pune', 'Solapur'] },
  { id: 'NR', name: 'Northern Railway', code: 'NR', headquarters: 'New Delhi', divisions: ['Delhi', 'Ambala', 'Firozpur', 'Lucknow NR', 'Moradabad'] },
  { id: 'SCR', name: 'South Central Railway', code: 'SCR', headquarters: 'Secunderabad', divisions: ['Secunderabad', 'Hyderabad', 'Vijayawada', 'Guntakal', 'Guntur', 'Nanded'] },
];

export const TRAIN_PRIORITY_MAP: Record<TrainType, number> = {
  [TrainType.ARME_ART]: 1,
  [TrainType.VVIP_SPECIAL]: 2,
  [TrainType.SUBURBAN]: 3,
  [TrainType.VANDE_BHARAT]: 4,
  [TrainType.RAJDHANI]: 4,
  [TrainType.SHATABDI]: 4,
  [TrainType.TEJAS]: 4,
  [TrainType.DURONTO]: 4,
  [TrainType.GATIMAAN]: 5,
  [TrainType.GARIB_RATH]: 5,
  [TrainType.JAN_SHATABDI]: 5,
  [TrainType.SAMPARK_KRANTI]: 5,
  [TrainType.HUMSAFAR]: 5,
  [TrainType.DOUBLE_DECKER]: 5,
  [TrainType.UDAY]: 5,
  [TrainType.SUPERFAST]: 5,
  [TrainType.ANTYODAYA]: 5,
  [TrainType.EXPRESS]: 6,
  [TrainType.INTERCITY]: 6,
  [TrainType.MILITARY_SPECIAL]: 7,
  [TrainType.PASSENGER]: 9,
  [TrainType.MEMU_DEMU]: 9,
  [TrainType.MIXED]: 10,
  [TrainType.MILITARY_STORES]: 11,
  [TrainType.FREIGHT]: 12,
};

const parseStations = (sectionName: string, data: string): Station[] => {
  return data.trim().split('\n').map((line, index) => {
    const parts = line.split(' - ');
    const code = parts[0].trim();
    let name = parts[1]?.trim() || '';
    let km = index * 4;

    if (parts.length >= 3) {
      const explicitKm = parseFloat(parts[parts.length - 1]);
      if (!isNaN(explicitKm)) {
        km = explicitKm;
        name = parts.slice(1, parts.length - 1).join(' - ').trim();
      } else {
        name = parts.slice(1).join(' - ').trim();
      }
    } else {
      name = parts.slice(1).join(' - ').trim();
    }

    return {
      id: `${code}_${sectionName.replace(/\s+/g, '_')}`,
      code: code,
      name: name,
      km: km,
      section: sectionName
    };
  });
};

export const DIVISIONS: Division[] = ZONES.flatMap(zone => 
  zone.divisions.map(divName => {
    let stations: Station[] = [];
    let boards: string[] = [];
    
    if (zone.id === 'SR') {
      let rawSections: Record<string, string> = {};
      switch(divName) {
        case 'Chennai': rawSections = CHENNAI_SECTIONS; break;
        case 'Salem': rawSections = SALEM_SECTIONS; break;
        case 'Palakkad': rawSections = PALAKKAD_SECTIONS; break;
        case 'Thiruvananthapuram': rawSections = TVC_SECTIONS; break;
        case 'Madurai': rawSections = MDU_SECTIONS; break;
        // there are spelling variations in the source data; match either form
        case 'Tiruchirappalli':
        case 'Tiruchchirappalli':
          rawSections = TRICHY_SECTIONS;
          break;
      }
      
      boards = Object.keys(rawSections);
      stations = boards.flatMap(board => parseStations(board, rawSections[board]));
    } else {
      boards = ['MAIN LINE'];
      stations = [
        { id: 'ORG_MAIN_LINE', name: 'Origin', code: 'ORG', km: 0, section: 'MAIN LINE' },
        { id: 'DST_MAIN_LINE', name: 'Destination', code: 'DST', km: 200, section: 'MAIN LINE' }
      ];
    }

    return {
      id: divName.toUpperCase().replace(/\s+/g, '_'),
      name: divName,
      zoneId: zone.id,
      boards: boards,
      stations: stations
    };
  })
);

/**
 * Utility to identify all Junction Hubs where multiple sections meet.
 */
export const GET_JUNCTION_HUBS = () => {
  const codeToSections = new Map<string, Set<string>>();
  const codeToName = new Map<string, string>();

  DIVISIONS.forEach(div => {
    div.stations.forEach(stn => {
      if (!codeToSections.has(stn.code)) {
        codeToSections.set(stn.code, new Set());
      }
      codeToSections.get(stn.code)?.add(stn.section || 'Unknown');
      codeToName.set(stn.code, stn.name);
    });
  });

  const hubs: Array<{ code: string; name: string; sections: string[] }> = [];
  codeToSections.forEach((sections, code) => {
    if (sections.size >= 2) {
      hubs.push({
        code,
        name: codeToName.get(code) || code,
        sections: Array.from(sections)
      });
    }
  });

  return hubs.sort((a, b) => b.sections.length - a.sections.length);
};

export const MOCK_TRAINS = [];
