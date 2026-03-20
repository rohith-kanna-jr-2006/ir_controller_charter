import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Train } from '../server/models/Train';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/indian-railways';

async function main() {
  try {
    await mongoose.connect(MONGODB_URI, { retryWrites: true, w: 'majority' });
    console.log('Connected to', MONGODB_URI);

    const result = await Train.updateMany(
      { type: 'FAST_PASSENGER' },
      { $set: { type: 'PASSENGER' } }
    );

    console.log(`Migration complete. Updated ${result.modifiedCount} trains.`);
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

main();
