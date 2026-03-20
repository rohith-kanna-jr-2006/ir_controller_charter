"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var config_ts_1 = require("../server/config.ts");
var Train_ts_1 = require("../server/models/Train.ts");
var fs_1 = require("fs");
var constants_tsx_1 = require("../constants.tsx");
function run() {
    return __awaiter(this, void 0, void 0, function () {
        var allTrains, kmMap, codeMap, nameMap, getContiguousSegments, getPosition, getNearestStation, events, i, tA, segsA, _loop_1, j, dedupedEvents;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, (0, config_ts_1.connectDatabase)()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, Train_ts_1.Train.find().lean()];
                case 2:
                    allTrains = _a.sent();
                    console.log("Loaded ".concat(allTrains.length, " trains."));
                    if (!(allTrains.length === 0)) return [3 /*break*/, 4];
                    console.log('No trains found. Nothing to calculate.');
                    return [4 /*yield*/, (0, config_ts_1.disconnectDatabase)()];
                case 3:
                    _a.sent();
                    return [2 /*return*/];
                case 4:
                    kmMap = new Map();
                    codeMap = new Map();
                    nameMap = new Map();
                    constants_tsx_1.DIVISIONS.forEach(function (div) {
                        div.stations.forEach(function (s) {
                            kmMap.set(s.id, s.km);
                            codeMap.set(s.id, s.code);
                            nameMap.set(s.id, s.name);
                        });
                    });
                    getContiguousSegments = function (t) {
                        var segs = [];
                        var prevValid = null;
                        t.points.forEach(function (p) {
                            if (kmMap.has(p.stationId)) {
                                var arrival = new Date(p.arrivalTime).getTime();
                                var departure = new Date(p.departureTime).getTime();
                                var y = kmMap.get(p.stationId);
                                var curr = { tArr: arrival, tDep: departure, y: y, id: p.stationId, code: codeMap.get(p.stationId) };
                                if (prevValid) {
                                    segs.push({
                                        t1: prevValid.tDep, y1: prevValid.y,
                                        t2: curr.tArr, y2: curr.y,
                                        origin: prevValid.code, dest: curr.code,
                                        dir: Math.sign(curr.y - prevValid.y)
                                    });
                                }
                                if (curr.tDep >= curr.tArr) {
                                    segs.push({
                                        t1: curr.tArr, y1: curr.y,
                                        t2: curr.tDep, y2: curr.y,
                                        origin: curr.code, dest: curr.code,
                                        dir: 0
                                    });
                                }
                                prevValid = curr;
                            }
                        });
                        return segs;
                    };
                    getPosition = function (segs, t) {
                        for (var _i = 0, segs_1 = segs; _i < segs_1.length; _i++) {
                            var s = segs_1[_i];
                            if (t >= s.t1 && t <= s.t2) {
                                if (s.t2 === s.t1)
                                    return s.y1;
                                return s.y1 + (t - s.t1) * (s.y2 - s.y1) / (s.t2 - s.t1);
                            }
                        }
                        return null;
                    };
                    getNearestStation = function (km) {
                        var closest = '';
                        var minDiff = Infinity;
                        kmMap.forEach(function (k, id) {
                            var diff = Math.abs(k - km);
                            if (diff < minDiff) {
                                minDiff = diff;
                                closest = "".concat(nameMap.get(id), " (").concat(codeMap.get(id), ")");
                            }
                        });
                        return closest;
                    };
                    events = [];
                    for (i = 0; i < allTrains.length; i++) {
                        tA = allTrains[i];
                        segsA = getContiguousSegments(tA);
                        if (segsA.length === 0)
                            continue;
                        _loop_1 = function (j) {
                            var tB = allTrains[j];
                            var segsB = getContiguousSegments(tB);
                            if (segsB.length === 0)
                                return "continue";
                            var startA = segsA[0].t1;
                            var endA = segsA[segsA.length - 1].t2;
                            var startB = segsB[0].t1;
                            var endB = segsB[segsB.length - 1].t2;
                            var t_start = Math.max(startA, startB);
                            var t_end = Math.min(endA, endB);
                            if (t_start <= t_end) {
                                // Collect all critical timestamps
                                var criticalTimes_1 = new Set();
                                criticalTimes_1.add(t_start);
                                criticalTimes_1.add(t_end);
                                segsA.forEach(function (s) {
                                    if (s.t1 > t_start && s.t1 < t_end)
                                        criticalTimes_1.add(s.t1);
                                    if (s.t2 > t_start && s.t2 < t_end)
                                        criticalTimes_1.add(s.t2);
                                });
                                segsB.forEach(function (s) {
                                    if (s.t1 > t_start && s.t1 < t_end)
                                        criticalTimes_1.add(s.t1);
                                    if (s.t2 > t_start && s.t2 < t_end)
                                        criticalTimes_1.add(s.t2);
                                });
                                var times = Array.from(criticalTimes_1).sort(function (a, b) { return a - b; });
                                var dirA = 0;
                                for (var _i = 0, segsA_1 = segsA; _i < segsA_1.length; _i++) {
                                    var s = segsA_1[_i];
                                    if (s.dir !== 0) {
                                        dirA = s.dir;
                                        break;
                                    }
                                }
                                var dirB = 0;
                                for (var _b = 0, segsB_1 = segsB; _b < segsB_1.length; _b++) {
                                    var s = segsB_1[_b];
                                    if (s.dir !== 0) {
                                        dirB = s.dir;
                                        break;
                                    }
                                }
                                var isCrossing = dirA !== dirB && dirA !== 0 && dirB !== 0;
                                var isOvertaking = dirA === dirB && dirA !== 0;
                                var pA = tA.priority || 0;
                                var pB = tB.priority || 0;
                                var prevDiff = null;
                                var prevT = null;
                                var conflictRecorded = false;
                                // STEP 2: Sample Train Positions every 1 minute
                                var MINUTE = 60000;
                                for (var t = t_start; t <= t_end + MINUTE; t += MINUTE) {
                                    var posA = getPosition(segsA, t);
                                    var posB = getPosition(segsB, t);
                                    if (posA !== null && posB !== null) {
                                        var diff = posA - posB;
                                        var absDiff = Math.abs(diff);
                                        // Reset if they move far apart
                                        if (absDiff > 10.0) {
                                            conflictRecorded = false;
                                        }
                                        var isConflict = false;
                                        var swapHappened = false;
                                        // STEP 4: Detect CROSSING (with tolerance)
                                        if (isCrossing && absDiff <= 2.0) {
                                            isConflict = true;
                                        }
                                        // STEP 3: Detect OVERTAKING (STRICT)
                                        if (isOvertaking && prevDiff !== null) {
                                            if ((prevDiff < 0 && diff > 0) || (prevDiff > 0 && diff < 0)) {
                                                isConflict = true;
                                                swapHappened = true;
                                            }
                                        }
                                        if (isConflict && !conflictRecorded) {
                                            var eventType = '';
                                            var action = '';
                                            var faster = 'N/A';
                                            // STEP 5: Priority Rule
                                            if (isCrossing) {
                                                eventType = 'CROSSING';
                                                var prefTrain = pA >= pB ? tA : tB;
                                                var delTrain = pA >= pB ? tB : tA;
                                                action = "Higher priority Train ".concat(prefTrain.number, " wins crossing, Train ").concat(delTrain.number, " waits");
                                            }
                                            else if (isOvertaking) {
                                                eventType = 'OVERTAKING';
                                                var speedA = Math.abs(segsA[segsA.length - 1].y2 - segsA[0].y1) / (endA - startA || 1);
                                                var speedB = Math.abs(segsB[segsB.length - 1].y2 - segsB[0].y1) / (endB - startB || 1);
                                                var fasterTrain = speedA >= speedB ? tA : tB;
                                                var slowerTrain = speedA >= speedB ? tB : tA;
                                                if (pA > pB && swapHappened) {
                                                    fasterTrain = tA;
                                                    slowerTrain = tB;
                                                }
                                                else if (pB > pA && swapHappened) {
                                                    fasterTrain = tB;
                                                    slowerTrain = tA;
                                                }
                                                faster = fasterTrain.number;
                                                if ((fasterTrain.id === tA.id && pA >= pB) || (fasterTrain.id === tB.id && pB >= pA)) {
                                                    action = "Higher priority Train ".concat(fasterTrain.number, " perfroms overtaking");
                                                }
                                                else {
                                                    eventType = 'ERROR';
                                                    action = "Error: Lower priority Train ".concat(fasterTrain.number, " overtakes higher priority Train ").concat(slowerTrain.number);
                                                }
                                            }
                                            if (eventType !== '') {
                                                events.push({
                                                    TrainA: tA.number,
                                                    TrainB: tB.number,
                                                    Event: eventType,
                                                    Time_Interval: "".concat(new Date(prevT || t).toISOString().substring(11, 16), " -> ").concat(new Date(t).toISOString().substring(11, 16)),
                                                    Location: "~ ".concat(getNearestStation(posA)),
                                                    Faster_Train: faster,
                                                    Priority_Decision: action
                                                });
                                                conflictRecorded = true;
                                            }
                                        }
                                        prevDiff = diff;
                                        prevT = t;
                                    }
                                }
                            }
                        };
                        for (j = i + 1; j < allTrains.length; j++) {
                            _loop_1(j);
                        }
                    }
                    dedupedEvents = events;
                    dedupedEvents.sort(function (a, b) {
                        var timeA = a.Time_Interval.split(' -> ')[0];
                        var timeB = b.Time_Interval.split(' -> ')[0];
                        return timeA.localeCompare(timeB);
                    });
                    console.log("Found ".concat(dedupedEvents.length, " events using 1-minute simulation interval."));
                    fs_1.default.writeFileSync('train_priorities_report.json', JSON.stringify(dedupedEvents, null, 2));
                    return [4 /*yield*/, (0, config_ts_1.disconnectDatabase)()];
                case 5:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
run().catch(console.error);
