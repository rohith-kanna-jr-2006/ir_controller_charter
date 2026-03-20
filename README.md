<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/10HdHluWF1mSxPTeSi0zYdncX5T2eeJQh

## Run Locally

**Prerequisites:**

- Node.js (14+)
- MongoDB (for persistent data storage)

### Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure MongoDB:
   - **Local**: Install [MongoDB Community Edition](https://www.mongodb.com/try/download/community)
   - **Cloud**: Use [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) and update `MONGODB_URI` in `.env`

3. Start MongoDB server (if using local):

   ```bash
   mongod
   ```

4. Start the backend API server (new terminal):

   ```bash
   npm run server:dev
   ```

   The API will be available at `http://localhost:3001`

5. Start the frontend development server (another terminal):
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in your browser

### Features

The app now features **hybrid data persistence**:

- **MongoDB** for persistent, centralized storage
- **localStorage** as automatic fallback when server is unavailable
- **Auto-sync** between frontend and backend

You can import schedules by:

- Dragging/dropping or selecting a PDF file in the **"Import"** modal; the browser extracts text locally.
- Pasting raw timetable text into the text area.

A helper Python script is available under `scripts/extract_pdf.py` for batch extraction outside the browser.

### Full Setup Guide

For detailed MongoDB configuration and API documentation, see [MONGODB_SETUP.md](MONGODB_SETUP.md)

# ir_controller_charter
