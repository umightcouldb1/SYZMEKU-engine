# SYZMEKU Server Local Run Guide

## Run locally
```bash
cd server
npm i
npm run dev
```

## Environment
If using MongoDB, create `server/.env` from `server/.env.example`.

## Dependency install commands
```bash
cd server
npm i dotenv
npm i -D nodemon
```

## Quick API test
```bash
curl -X POST http://localhost:10000/api/core/analyze -H "Content-Type: application/json" -d "{\"text\":\"test\"}"
```
