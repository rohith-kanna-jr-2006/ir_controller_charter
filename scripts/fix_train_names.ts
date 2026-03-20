import mongoose from 'mongoose';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.join(process.cwd(), '.env') });

// Setup model manually here rather than importing to avoid any complex dependency issues with server folder
const TrainSchema = new mongoose.Schema({
  id: String,
  number: String,
  name: String,
  type: String,
  color: String,
  priority: Number,
  durationMinutes: Number,
  originStationCode: String,
  destinationStationCode: String,
  points: Array,
  daysOfService: Array,
}, { timestamps: true, strict: false });

const Train = (mongoose.models.Train || mongoose.model('Train', TrainSchema)) as any;

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/indian-railways';

const fixTrainNames = async () => {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to DB');

        const trains = await Train.find({});
        console.log(`Found ${trains.length} trains.`);

        let updatedCount = 0;

        for (const train of trains) {
            if (!train.name) continue;

            let parsedName = train.name;
            const cutoffMatch = parsedName.match(/\s[A-Z]{2,4}\//);
            if (cutoffMatch) {
                parsedName = parsedName.substring(0, cutoffMatch.index).trim();
            } else {
                const typeZoneMatch = parsedName.match(/\s(?:Type|Zone):/);
                if (typeZoneMatch) {
                    parsedName = parsedName.substring(0, typeZoneMatch.index).trim();
                }
            }

            parsedName = parsedName.replace(/[\s\-]+$/, '');

            if (train.number && !parsedName.startsWith(train.number)) {
                parsedName = `${train.number} - ${parsedName}`;
            }

            if (parsedName !== train.name) {
                console.log(`Updating ${train.number}:`);
                console.log(`  Old: ${train.name}`);
                console.log(`  New: ${parsedName}`);
                train.name = parsedName;
                await train.save();
                updatedCount++;
            }
        }

        console.log(`Updated ${updatedCount} train names.`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

fixTrainNames();
