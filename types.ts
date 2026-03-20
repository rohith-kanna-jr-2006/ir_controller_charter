
export enum TrainType {
  ARME_ART = 'ARME_ART',
  VVIP_SPECIAL = 'VVIP_SPECIAL',
  SUBURBAN = 'SUBURBAN',
  VANDE_BHARAT = 'VANDE_BHARAT',
  RAJDHANI = 'RAJDHANI',
  SHATABDI = 'SHATABDI',
  DURONTO = 'DURONTO',
  TEJAS = 'TEJAS',
  GATIMAAN = 'GATIMAAN',
  GARIB_RATH = 'GARIB_RATH',
  JAN_SHATABDI = 'JAN_SHATABDI',
  SAMPARK_KRANTI = 'SAMPARK_KRANTI',
  HUMSAFAR = 'HUMSAFAR',
  DOUBLE_DECKER = 'DOUBLE_DECKER',
  UDAY = 'UDAY',
  SUPERFAST = 'SUPERFAST',
  EXPRESS = 'EXPRESS',
  INTERCITY = 'INTERCITY',
  MILITARY_SPECIAL = 'MILITARY_SPECIAL',
  PASSENGER = 'PASSENGER',
  MEMU_DEMU = 'MEMU_DEMU',
  ANTYODAYA = 'ANTYODAYA',
  MIXED = 'MIXED',
  MILITARY_STORES = 'MILITARY_STORES',
  FREIGHT = 'FREIGHT'
}

export interface Station {
  id: string;
  name: string;
  code: string;
  km: number;
  section?: string;
}

export interface SchedulePoint {
  stationId: string;
  stationName?: string;
  index?: number;
  arrivalTime: Date;
  departureTime: Date;
  runtime_day_offset?: number; // 0 for same day, 1 for next day, etc.
  timetable_day?: number;
  actual_day?: number;
  time?: string;
}

export interface TrainPath {
  id: string;
  number: string;
  name: string;
  type: TrainType;
  color: string;
  priority: number; // 1 (highest) to 12 (lowest)
  durationMinutes?: number;
  originStationCode?: string;
  destinationStationCode?: string;
  points: SchedulePoint[];
  stops: SchedulePoint[]; // Explicit field as requested for UI binding
  timetable?: SchedulePoint[]; // Alias for 'points'
  days_raw?: string; // Original string e.g. "Sun,Mon,Wed"
  days_normalized: number[]; // Set of integers (0-6)
  days_of_service: number[]; // Explicit set as requested
  daysOfService?: number[]; // Deprecated: use days_of_service
}

export interface Division {
  id: string;
  name: string;
  zoneId: string;
  boards: string[];
  stations: Station[];
}

export interface Zone {
  id: string;
  name: string;
  code: string;
  headquarters: string;
  divisions: string[];
}

export interface ChartConfig {
  zone: string;
  division: string;
  board: string;
  date: string;
  shift: 'NIGHT' | 'MORNING' | 'AFTERNOON' | 'EVENING' | 'ALL_DAY';
  startTime: number;
  duration: number;
}
