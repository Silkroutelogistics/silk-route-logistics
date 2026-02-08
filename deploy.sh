#!/bin/bash
set -e

echo "=== Silk Route Logistics - Build & Deploy ==="

echo ">> Building backend..."
cd backend
npm run build
echo ">> Backend built to dist/"

echo ">> Running Prisma migrations..."
npx prisma migrate deploy
echo ">> Migrations applied"

cd ..

echo ">> Building frontend..."
cd frontend
npm run build
echo ">> Frontend built to .next/"

cd ..
echo "=== Build complete ==="
echo "Backend: run 'node backend/dist/server.js'"
echo "Frontend: run 'cd frontend && npm start'"
