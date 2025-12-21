/**
 * Migrate Data from Firebase to Supabase
 *
 * This script reads data from Firebase Firestore and writes it to Supabase.
 * It handles data transformation and provides detailed progress logging.
 *
 * Prerequisites:
 * - Run `npm run export` first to create backups
 * - Set up Supabase tables using supabase-schema.sql
 * - Configure .env with Supabase credentials
 *
 * Usage: npm run migrate
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load environment variables
config({ path: join(__dirname, '..', '.env') });

// Validate environment
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  console.error('❌ Error: Missing Supabase credentials!');
  console.error('');
  console.error('Please create a .env file with:');
  console.error('  SUPABASE_URL=https://your-project.supabase.co');
  console.error('  SUPABASE_SERVICE_KEY=your-service-role-key');
  console.error('');
  console.error('Get these from: Supabase Dashboard → Settings → API');
  process.exit(1);
}

// Check for Firebase service account
const serviceAccountPath = join(__dirname, '..', 'firebase-service-account.json');
if (!existsSync(serviceAccountPath)) {
  console.error('❌ Error: firebase-service-account.json not found!');
  process.exit(1);
}

// Initialize Firebase Admin
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
initializeApp({
  credential: cert(serviceAccount)
});

const firestore = getFirestore();

// Initialize Supabase (using service role key for admin access)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Parse date from various Firebase formats
 */
function parseFirebaseDate(dateValue) {
  if (!dateValue) return null;

  // Handle Firestore Timestamp objects
  if (dateValue._seconds !== undefined) {
    return new Date(dateValue._seconds * 1000).toISOString();
  }

  // Handle Firestore Timestamp with toDate method
  if (typeof dateValue.toDate === 'function') {
    return dateValue.toDate().toISOString();
  }

  // Handle ISO strings
  if (typeof dateValue === 'string') {
    return new Date(dateValue).toISOString();
  }

  // Handle Date objects
  if (dateValue instanceof Date) {
    return dateValue.toISOString();
  }

  // Handle milliseconds
  if (typeof dateValue === 'number') {
    return new Date(dateValue).toISOString();
  }

  console.warn('⚠️  Unknown date format:', dateValue);
  return null;
}

/**
 * Transform Firebase chore to Supabase format
 */
function transformChore(firebaseChore) {
  return {
    id: firebaseChore.id,
    name: firebaseChore.name,
    frequency_days: firebaseChore.frequency,
    assigned_to: firebaseChore.assignedTo,
    last_completed: parseFirebaseDate(firebaseChore.lastCompleted),
    completed_by: firebaseChore.completedBy || null
  };
}

/**
 * Transform Firebase completion history to Supabase format
 */
function transformCompletionHistory(firebaseRecord) {
  return {
    id: firebaseRecord.id,
    chore_id: firebaseRecord.choreId,
    chore_name: firebaseRecord.choreName,
    completed_date: parseFirebaseDate(firebaseRecord.completedDate),
    completed_by: firebaseRecord.completedBy
  };
}

/**
 * Transform Firebase change log to Supabase format
 */
function transformChangeLog(firebaseRecord) {
  return {
    id: firebaseRecord.id,
    action: firebaseRecord.action,
    chore_name: firebaseRecord.choreName,
    person: firebaseRecord.person,
    timestamp: parseFirebaseDate(firebaseRecord.timestamp),
    details: firebaseRecord.details || null
  };
}

async function migrate() {
  console.log('🚀 Starting Migration: Firebase → Supabase\n');
  console.log('━'.repeat(50));

  const stats = {
    chores: { read: 0, written: 0, errors: 0 },
    completionHistory: { read: 0, written: 0, errors: 0 },
    changeLog: { read: 0, written: 0, errors: 0 }
  };

  try {
    // ========================================
    // MIGRATE CHORES
    // ========================================
    console.log('\n📋 Migrating Chores...');

    const choresDoc = await firestore.collection('familyChores').doc('choresData').get();
    const choresData = choresDoc.exists ? (choresDoc.data().chores || []) : [];
    stats.chores.read = choresData.length;
    console.log(`   Read ${choresData.length} chores from Firebase`);

    if (choresData.length > 0) {
      const transformedChores = choresData.map(transformChore);

      // Insert in batches to avoid timeouts
      const BATCH_SIZE = 100;
      for (let i = 0; i < transformedChores.length; i += BATCH_SIZE) {
        const batch = transformedChores.slice(i, i + BATCH_SIZE);

        const { data, error } = await supabase
          .from('chores')
          .upsert(batch, { onConflict: 'id' });

        if (error) {
          console.error(`   ❌ Error inserting chores batch:`, error.message);
          stats.chores.errors += batch.length;
        } else {
          stats.chores.written += batch.length;
          console.log(`   ✅ Inserted batch ${Math.floor(i/BATCH_SIZE) + 1} (${batch.length} chores)`);
        }
      }
    }

    // ========================================
    // MIGRATE COMPLETION HISTORY
    // ========================================
    console.log('\n📜 Migrating Completion History...');

    const historyDoc = await firestore.collection('familyChores').doc('completionHistory').get();
    const historyData = historyDoc.exists ? (historyDoc.data().history || []) : [];
    stats.completionHistory.read = historyData.length;
    console.log(`   Read ${historyData.length} completion records from Firebase`);

    if (historyData.length > 0) {
      const transformedHistory = historyData.map(transformCompletionHistory);

      const BATCH_SIZE = 100;
      for (let i = 0; i < transformedHistory.length; i += BATCH_SIZE) {
        const batch = transformedHistory.slice(i, i + BATCH_SIZE);

        const { data, error } = await supabase
          .from('completion_history')
          .upsert(batch, { onConflict: 'id' });

        if (error) {
          console.error(`   ❌ Error inserting history batch:`, error.message);
          stats.completionHistory.errors += batch.length;
        } else {
          stats.completionHistory.written += batch.length;
          console.log(`   ✅ Inserted batch ${Math.floor(i/BATCH_SIZE) + 1} (${batch.length} records)`);
        }
      }
    }

    // ========================================
    // MIGRATE CHANGE LOG
    // ========================================
    console.log('\n📝 Migrating Change Log...');

    const changeLogDoc = await firestore.collection('familyChores').doc('changeLog').get();
    const changeLogData = changeLogDoc.exists ? (changeLogDoc.data().log || []) : [];
    stats.changeLog.read = changeLogData.length;
    console.log(`   Read ${changeLogData.length} change log entries from Firebase`);

    if (changeLogData.length > 0) {
      const transformedChangeLog = changeLogData.map(transformChangeLog);

      const BATCH_SIZE = 100;
      for (let i = 0; i < transformedChangeLog.length; i += BATCH_SIZE) {
        const batch = transformedChangeLog.slice(i, i + BATCH_SIZE);

        const { data, error } = await supabase
          .from('change_log')
          .upsert(batch, { onConflict: 'id' });

        if (error) {
          console.error(`   ❌ Error inserting change log batch:`, error.message);
          stats.changeLog.errors += batch.length;
        } else {
          stats.changeLog.written += batch.length;
          console.log(`   ✅ Inserted batch ${Math.floor(i/BATCH_SIZE) + 1} (${batch.length} entries)`);
        }
      }
    }

    // ========================================
    // SUMMARY
    // ========================================
    console.log('\n' + '━'.repeat(50));
    console.log('📊 MIGRATION SUMMARY\n');

    console.log('Chores:');
    console.log(`   Read:    ${stats.chores.read}`);
    console.log(`   Written: ${stats.chores.written}`);
    console.log(`   Errors:  ${stats.chores.errors}`);

    console.log('\nCompletion History:');
    console.log(`   Read:    ${stats.completionHistory.read}`);
    console.log(`   Written: ${stats.completionHistory.written}`);
    console.log(`   Errors:  ${stats.completionHistory.errors}`);

    console.log('\nChange Log:');
    console.log(`   Read:    ${stats.changeLog.read}`);
    console.log(`   Written: ${stats.changeLog.written}`);
    console.log(`   Errors:  ${stats.changeLog.errors}`);

    const totalErrors = stats.chores.errors + stats.completionHistory.errors + stats.changeLog.errors;

    if (totalErrors === 0) {
      console.log('\n✨ Migration completed successfully!');
      console.log('\nNext steps:');
      console.log('1. Run `npm run verify` to verify data integrity');
      console.log('2. Update the app to use Supabase instead of Firebase');
    } else {
      console.log(`\n⚠️  Migration completed with ${totalErrors} errors.`);
      console.log('Please review errors above and re-run if needed.');
    }

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

migrate();
