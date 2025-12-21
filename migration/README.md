# Firebase to Supabase Migration Guide

## Overview
This directory contains scripts to safely migrate your chore tracker data from Firebase Firestore to Supabase PostgreSQL.

## Prerequisites

1. **Node.js** installed (v18+)
2. **Supabase project** created at https://supabase.com
3. **Firebase service account key** (for reading data)

## Step-by-Step Migration

### Step 1: Install Dependencies
```bash
cd migration
npm install
```

### Step 2: Get Your Firebase Service Account Key
1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate new private key"
3. Save as `migration/firebase-service-account.json`
4. ⚠️ This file is gitignored - never commit it!

### Step 3: Set Up Supabase
1. Create a new Supabase project
2. Go to Settings → API to get your keys
3. Copy `.env.example` to `.env` and fill in your values

### Step 4: Create Supabase Tables
Run the SQL in `supabase-schema.sql` in your Supabase SQL Editor.

### Step 5: Export Firebase Data (Backup)
```bash
npm run export
```
This creates JSON backup files in `backups/` directory.

### Step 6: Run Migration
```bash
npm run migrate
```
This reads from Firebase and writes to Supabase.

### Step 7: Verify Migration
```bash
npm run verify
```
This compares record counts and checksums.

## File Structure
```
migration/
├── README.md              # This file
├── package.json           # Dependencies
├── .env.example           # Environment template
├── .gitignore             # Ignores secrets
├── supabase-schema.sql    # Database schema
├── scripts/
│   ├── export-firebase.js # Export to JSON backup
│   ├── migrate.js         # Main migration script
│   └── verify.js          # Verification script
└── backups/               # JSON backups (created by export)
```

## Rollback Plan
If anything goes wrong:
1. Your Firebase data is untouched (we only READ from it)
2. JSON backups are in `backups/` directory
3. You can re-run migration after fixing issues
4. Delete Supabase data and start fresh if needed
