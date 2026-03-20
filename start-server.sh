#!/bin/bash
# Backend startup script for Indian Railways Controller

echo "Starting MongoDB Backend Server..."
echo "===================================="
echo ""

# Check if MongoDB is running
echo "Checking MongoDB connection..."
if ! command -v mongod &> /dev/null; then
    echo "⚠  MongoDB is not installed or not in PATH"
    echo "Install MongoDB from: https://www.mongodb.com/try/download/community"
    echo ""
    exit 1
fi

# Start the backend server
echo "Starting server..."
npm run server:dev
