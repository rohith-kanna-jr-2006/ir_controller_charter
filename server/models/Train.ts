import mongoose, { Schema, Document } from 'mongoose';

export interface ISchedulePoint {
  stationId: string;
  stationName?: string;
  index?: number;
  arrivalTime: Date;
  departureTime: Date;
  runtime_day_offset: number;
  timetable_day?: number;
  actual_day?: number;
  time?: string;
  absolute_time: number;
  absolute_departure_time: number;
}

export interface ITrain extends Document {
  id: string;
  number: string;
  name: string;
  type: string;
  color: string;
  priority: number;
  durationMinutes?: number;
  originStationCode?: string;
  destinationStationCode?: string;
  points: ISchedulePoint[];
  stops: ISchedulePoint[];
  timetable: ISchedulePoint[];
  days_raw?: string;
  days_of_service: number[];
  days_normalized: number[];
  daysOfService: number[];
  createdAt: Date;
  updatedAt: Date;
}

const SchedulePointSchema = new Schema<ISchedulePoint>(
  {
    stationId: { type: String, required: true },
    stationName: { type: String },
    index: { type: Number },
    arrivalTime: { type: Date, required: true },
    departureTime: { type: Date, required: true },
    runtime_day_offset: { type: Number, default: 0 },
    timetable_day: { type: Number },
    actual_day: { type: Number },
    time: { type: String },
    absolute_time: { type: Number, required: true },
    absolute_departure_time: { type: Number, required: true },
  },
  { _id: false }
);

const TrainSchema = new Schema<ITrain>(
  {
    id: { type: String, required: true, unique: true },
    number: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    type: { type: String, required: true },
    color: { type: String, required: true },
    priority: { type: Number, required: true },
    durationMinutes: Number,
    originStationCode: String,
    destinationStationCode: String,
    points: [SchedulePointSchema],
    stops: [SchedulePointSchema],
    timetable: [SchedulePointSchema],
    days_raw: String,
    days_of_service: [Number],
    days_normalized: [Number],
    daysOfService: [Number],
  },
  { timestamps: true }
);

// Create index on frequently queried fields
TrainSchema.index({ priority: 1, createdAt: -1 });
// TrainSchema.index({ id: 1 }, { unique: true });
// TrainSchema.index({ number: 1 }, { unique: true });
TrainSchema.index({ type: 1 });
TrainSchema.index({ createdAt: -1 });

export const Train = mongoose.model<ITrain>('Train', TrainSchema);
