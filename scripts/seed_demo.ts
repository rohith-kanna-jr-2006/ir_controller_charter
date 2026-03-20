
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Train } from '../server/models/Train';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/indian-railways';

function getAbsoluteMinutes(hours: number, minutes: number, day: number = 1): number {
  return (day - 1) * 1440 + hours * 60 + minutes;
}

function createDate(hours: number, minutes: number, dayOffset: number = 0): Date {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  if (dayOffset > 0) {
    date.setDate(date.getDate() + dayOffset);
  }
  return date;
}

const TEST_TRAINS = [
  {
    id: "train-12624",
    number: "12624",
    name: "MGR Chennai Central Mail",
    type: "SUPERFAST",
    color: "#e11d48", // Rose 600
    priority: 3,
    daysOfService: [0, 1, 2, 3, 4, 5, 6],
    days_normalized: [0, 1, 2, 3, 4, 5, 6],
    originStationCode: "TVC",
    destinationStationCode: "MAS",
    points: [
      {
        stationId: "TVC",
        stationName: "Thiruvananthapuram Central",
        arrivalTime: createDate(15, 0),
        departureTime: createDate(15, 0),
        absolute_time: getAbsoluteMinutes(15, 0),
        absolute_departure_time: getAbsoluteMinutes(15, 0),
        runtime_day_offset: 0
      },
      {
        stationId: "QLN",
        stationName: "Kollam Junction",
        arrivalTime: createDate(15, 58),
        departureTime: createDate(16, 1),
        absolute_time: getAbsoluteMinutes(15, 58),
        absolute_departure_time: getAbsoluteMinutes(16, 1),
        runtime_day_offset: 0
      },
      {
        stationId: "KYJ",
        stationName: "Kayamkulam Junction",
        arrivalTime: createDate(16, 38),
        departureTime: createDate(16, 40),
        absolute_time: getAbsoluteMinutes(16, 38),
        absolute_departure_time: getAbsoluteMinutes(16, 40),
        runtime_day_offset: 0
      },
      {
        stationId: "KTYM",
        stationName: "Kottayam",
        arrivalTime: createDate(17, 47),
        departureTime: createDate(17, 50),
        absolute_time: getAbsoluteMinutes(17, 47),
        absolute_departure_time: getAbsoluteMinutes(17, 50),
        runtime_day_offset: 0
      },
      {
        stationId: "ERN",
        stationName: "Ernakulam Town",
        arrivalTime: createDate(19, 15),
        departureTime: createDate(19, 20),
        absolute_time: getAbsoluteMinutes(19, 15),
        absolute_departure_time: getAbsoluteMinutes(19, 20),
        runtime_day_offset: 0
      }
    ]
  },
  {
    id: "train-12431",
    number: "12431",
    name: "Rajdhani Express",
    type: "RAJDHANI",
    color: "#dc2626", // Red 600
    priority: 1,
    daysOfService: [2, 4, 5], // Tue, Thu, Fri
    days_normalized: [2, 4, 5],
    originStationCode: "TVC",
    destinationStationCode: "NZM",
    points: [
      {
        stationId: "TVC",
        stationName: "Thiruvananthapuram Central",
        arrivalTime: createDate(19, 15),
        departureTime: createDate(19, 15),
        absolute_time: getAbsoluteMinutes(19, 15),
        absolute_departure_time: getAbsoluteMinutes(19, 15),
        runtime_day_offset: 0
      },
      {
        stationId: "QLN",
        stationName: "Kollam Junction",
        arrivalTime: createDate(20, 11),
        departureTime: createDate(20, 13),
        absolute_time: getAbsoluteMinutes(20, 11),
        absolute_departure_time: getAbsoluteMinutes(20, 13),
        runtime_day_offset: 0
      },
      {
        stationId: "ERS",
        stationName: "Ernakulam Junction",
        arrivalTime: createDate(22, 50),
        departureTime: createDate(22, 55),
        absolute_time: getAbsoluteMinutes(22, 50),
        absolute_departure_time: getAbsoluteMinutes(22, 55),
        runtime_day_offset: 0
      },
      {
        stationId: "TCR",
        stationName: "Thrissur",
        arrivalTime: createDate(0, 12, 1),
        departureTime: createDate(0, 15, 1),
        absolute_time: getAbsoluteMinutes(0, 12, 2),
        absolute_departure_time: getAbsoluteMinutes(0, 15, 2),
        runtime_day_offset: 1
      }
    ]
  },
  {
    id: "train-22630",
    number: "22630",
    name: "Intercity Express",
    type: "SUPERFAST",
    color: "#059669", // Emerald 600
    priority: 4,
    daysOfService: [0, 1, 2, 3, 4, 5, 6],
    days_normalized: [0, 1, 2, 3, 4, 5, 6],
    originStationCode: "TEN",
    destinationStationCode: "DG",
    points: [
      {
        stationId: "TEN",
        stationName: "Tirunelveli Junction",
        arrivalTime: createDate(6, 0),
        departureTime: createDate(6, 0),
        absolute_time: getAbsoluteMinutes(6, 0),
        absolute_departure_time: getAbsoluteMinutes(6, 0),
        runtime_day_offset: 0
      },
      {
        stationId: "VPT",
        stationName: "Virudhunagar Junction",
        arrivalTime: createDate(7, 28),
        departureTime: createDate(7, 30),
        absolute_time: getAbsoluteMinutes(7, 28),
        absolute_departure_time: getAbsoluteMinutes(7, 30),
        runtime_day_offset: 0
      },
      {
        stationId: "MDU",
        stationName: "Madurai Junction",
        arrivalTime: createDate(8, 20),
        departureTime: createDate(8, 25),
        absolute_time: getAbsoluteMinutes(8, 20),
        absolute_departure_time: getAbsoluteMinutes(8, 25),
        runtime_day_offset: 0
      },
      {
        stationId: "DG",
        stationName: "Dindigul Junction",
        arrivalTime: createDate(9, 45),
        departureTime: createDate(9, 45),
        absolute_time: getAbsoluteMinutes(9, 45),
        absolute_departure_time: getAbsoluteMinutes(9, 45),
        runtime_day_offset: 0
      }
    ]
  }
];

async function main() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI, { retryWrites: true, w: 'majority' });
    console.log('✓ Successfully connected to', MONGODB_URI);

    console.log('Clearing existing test data (if any)...');
    const testIds = TEST_TRAINS.map(t => t.id);
    await Train.deleteMany({ id: { $in: testIds } });

    console.log('Inserting comprehensive test data...');
    for (const trainData of TEST_TRAINS) {
      // populate 'stops' and 'timetable' if they don't exist
      const fullTrainData = {
        ...trainData,
        stops: trainData.points,
        timetable: trainData.points,
        days_of_service: trainData.daysOfService
      };
      
      const train = new Train(fullTrainData);
      await train.save();
      console.log(`  + Inserted Train ${train.number}: ${train.name}`);
    }

    console.log('\n✓ Seeding complete! You added 3 realistic train services.');
  } catch (err) {
    console.error('✗ Seed error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();
