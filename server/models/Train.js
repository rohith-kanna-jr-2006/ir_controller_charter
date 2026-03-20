"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Train = void 0;
var mongoose_1 = require("mongoose");
var SchedulePointSchema = new mongoose_1.Schema({
    stationId: { type: String, required: true },
    arrivalTime: { type: Date, required: true },
    departureTime: { type: Date, required: true },
}, { _id: false });
var TrainSchema = new mongoose_1.Schema({
    id: { type: String, required: true, unique: true, index: true },
    number: { type: String, required: true },
    name: { type: String, required: true },
    type: { type: String, required: true },
    color: { type: String, required: true },
    priority: { type: Number, required: true },
    durationMinutes: Number,
    originStationCode: String,
    destinationStationCode: String,
    points: [SchedulePointSchema],
    daysOfService: [Number],
}, { timestamps: true });
// Create index on frequently queried fields
TrainSchema.index({ number: 1 });
TrainSchema.index({ type: 1 });
TrainSchema.index({ createdAt: -1 });
exports.Train = mongoose_1.default.model('Train', TrainSchema);
