import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Train } from '../server/models/Train';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/indian-railways';

async function main() {
  try {
    await mongoose.connect(MONGODB_URI, { retryWrites: true, w: 'majority' });
    console.log('Connected to', MONGODB_URI);

    const train = new Train({
      id: `T-${Date.now()}`,
      number: '99999',
      name: 'Seed Service',
      type: 'EXPRESS',
      color: '#000000',
      priority: 1,
      points: [],
      daysOfService: [0, 1, 2],
    });

    await train.save();
    console.log('Inserted train', train);
  } catch (err) {
    console.error('Seed error', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();
