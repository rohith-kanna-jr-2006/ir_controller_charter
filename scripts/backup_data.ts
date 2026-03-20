import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Train } from '../server/models/Train.ts';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/indian-railways';

async function backup() {
  try {
    await mongoose.connect(MONGODB_URI, { retryWrites: true, w: 'majority' });
    console.log('Connected to MongoDB for backup');

    const trains = await Train.find({});
    console.log(`Found ${trains.length} trains to backup.`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const folder = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(folder)) fs.mkdirSync(folder);

    const fileName = path.join(folder, `backup_trains_${timestamp}.json`);
    fs.writeFileSync(fileName, JSON.stringify(trains, null, 2));

    console.log(`✓ Backup successful: ${fileName}`);
    process.exit(0);
  } catch (err) {
    console.error('Backup failed:', err);
    process.exit(1);
  }
}

backup();
