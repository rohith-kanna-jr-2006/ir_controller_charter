# MongoDB Integration - Setup Guide

## Prerequisites

1. **Node.js** (v14+) - Already required for the frontend
2. **MongoDB** - [Download & Install](https://www.mongodb.com/try/download/community)
3. **npm packages** - Run: `npm install`

## Environment Configuration

The `.env` and `.env.local` files contain MongoDB connection settings:

```env
# MongoDB configuration
MONGODB_URI=mongodb://localhost:27017/indian-railways

# Server configuration
PORT=3001
VITE_API_URL=http://localhost:3001
```

### MongoDB Connection Options:

**Local Development (Default):**

```
mongodb://localhost:27017/indian-railways
```

**MongoDB Atlas (Cloud):**

```
mongodb+srv://username:password@cluster.mongodb.net/indian-railways?retryWrites=true&w=majority
```

## Running the Application

### Terminal 1 - MongoDB Server (if using local installation)

```bash
mongod
```

### Terminal 2 - Backend API Server

```bash
npm run server:dev
```

The server will start on `http://localhost:3001`

### Terminal 3 - Frontend Development Server

```bash
npm run dev
```

Access the app at `http://localhost:5173`

## API Endpoints

### Train Management

| Method | Endpoint                   | Description                                                      |
| ------ | -------------------------- | ---------------------------------------------------------------- |
| GET    | `/api/trains`              | Get all trains (supports filtering: `?type=RAJDHANI&number=123`) |
| GET    | `/api/trains/:id`          | Get a single train by ID                                         |
| POST   | `/api/trains`              | Create a new train                                               |
| PUT    | `/api/trains/:id`          | Update a train (upsert)                                          |
| DELETE | `/api/trains/:id`          | Delete a train                                                   |
| POST   | `/api/trains/bulk/delete`  | Bulk delete trains: `{ ids: ["id1", "id2"] }`                    |
| DELETE | `/api/trains?confirm=true` | Clear all trains                                                 |

### Health Check

```
GET /health
```

## Data Synchronization

The frontend service (`trainService.ts`) now:

1. **Attempts MongoDB first** - When the server is available
2. **Falls back to localStorage** - If the server is unavailable
3. **Auto-checks availability** - Every 30 seconds
4. **Syncs offline changes** - When server comes back online

## Database Schema

MongoDB stores trains with the following structure:

```json
{
  "id": "train-001",
  "number": "12951",
  "name": "Rajdhani Express",
  "type": "RAJDHANI",
  "color": "#FF6B6B",
  "priority": 1,
  "durationMinutes": 960,
  "originStationCode": "NDLS",
  "destinationStationCode": "LKO",
  "points": [
    {
      "stationId": "station-001",
      "arrivalTime": "2024-03-02T06:00:00Z",
      "departureTime": "2024-03-02T06:15:00Z"
    }
  ],
  "daysOfService": [1, 2, 3, 4, 5],
  "createdAt": "2024-03-02T10:30:00Z",
  "updatedAt": "2024-03-02T10:30:00Z"
}
```

## Indexes

The following indexes are created automatically for performance:

- `id` (unique, indexed)
- `number`
- `type`
- `createdAt`

## Development Notes

### Server Files

- `server.ts` - Main Express server
- `server/config.ts` - Database connection
- `server/models/Train.ts` - MongoDB schema
- `server/routes/trains.ts` - API endpoints

### Frontend Files

- `services/trainService.ts` - HTTP client with fallback logic

### Scripts

```json
"server": "node --loader ts-node/esm server.ts",
"server:dev": "node --watch --loader ts-node/esm server.ts"
```

## Troubleshooting

### "MongoDB server unavailable"

- Ensure MongoDB is running: `mongod` (local) or check MongoDB Atlas status
- Check `MONGODB_URI` in `.env` or `.env.local`
- Verify firewall settings allow connections

### "Cannot find module ts-node"

- Run: `npm install`

### Port 3001 already in use

- Kill the process: `lsof -ti:3001 | xargs kill -9` (macOS/Linux)
- Or change `PORT` in `.env`

### CORS errors

- CORS is enabled for development - check backend logs

## Migration from localStorage

The app automatically migrates data when:

1. MongoDB server becomes available
2. All localStorage data is synchronized to MongoDB
3. Subsequent operations use MongoDB with localStorage fallback

## Production Deployment

For production:

1. Use MongoDB Atlas or a managed MongoDB service
2. Set `MONGODB_URI` to your production connection string
3. Build the frontend: `npm run build`
4. Deploy the `server.ts` with your Node.js hosting provider
5. Update `VITE_API_URL` to your production API domain
