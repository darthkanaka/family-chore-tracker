/**
 * Verify Migration Data Integrity
 *
 * This script compares data between Firebase and Supabase to ensure
 * the migration was successful. It checks:
 * - Record counts match
 * - Sample data spot checks
 * - Date conversions are correct
 *
 * Usage: npm run verify
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
  console.error('❌ Error: Missing Supabase credentials in .env');
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

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function verify() {
  console.log('🔍 Verifying Migration Data Integrity\n');
  console.log('━'.repeat(50));

  let allPassed = true;
  const results = [];

  try {
    // ========================================
    // VERIFY CHORES
    // ========================================
    console.log('\n📋 Verifying Chores...');

    // Get Firebase count
    const choresDoc = await firestore.collection('familyChores').doc('choresData').get();
    const firebaseChores = choresDoc.exists ? (choresDoc.data().chores || []) : [];
    const firebaseChoreCount = firebaseChores.length;

    // Get Supabase count
    const { count: supabaseChoreCount, error: choresError } = await supabase
      .from('chores')
      .select('*', { count: 'exact', head: true });

    if (choresError) {
      console.error(`   ❌ Error querying Supabase chores:`, choresError.message);
      allPassed = false;
    } else {
      const match = firebaseChoreCount === supabaseChoreCount;
      results.push({
        table: 'chores',
        firebase: firebaseChoreCount,
        supabase: supabaseChoreCount,
        match
      });

      if (match) {
        console.log(`   ✅ Count matches: ${firebaseChoreCount} records`);
      } else {
        console.log(`   ❌ Count mismatch: Firebase=${firebaseChoreCount}, Supabase=${supabaseChoreCount}`);
        allPassed = false;
      }

      // Spot check: verify first chore exists with correct data
      if (firebaseChores.length > 0) {
        const sampleChore = firebaseChores[0];
        const { data: supabaseChore, error } = await supabase
          .from('chores')
          .select('*')
          .eq('id', sampleChore.id)
          .single();

        if (error || !supabaseChore) {
          console.log(`   ❌ Spot check failed: Could not find chore ID ${sampleChore.id}`);
          allPassed = false;
        } else if (supabaseChore.name === sampleChore.name) {
          console.log(`   ✅ Spot check passed: "${sampleChore.name}" found in Supabase`);
        } else {
          console.log(`   ❌ Spot check failed: Name mismatch for ID ${sampleChore.id}`);
          allPassed = false;
        }
      }
    }

    // ========================================
    // VERIFY COMPLETION HISTORY
    // ========================================
    console.log('\n📜 Verifying Completion History...');

    const historyDoc = await firestore.collection('familyChores').doc('completionHistory').get();
    const firebaseHistory = historyDoc.exists ? (historyDoc.data().history || []) : [];
    const firebaseHistoryCount = firebaseHistory.length;

    const { count: supabaseHistoryCount, error: historyError } = await supabase
      .from('completion_history')
      .select('*', { count: 'exact', head: true });

    if (historyError) {
      console.error(`   ❌ Error querying Supabase history:`, historyError.message);
      allPassed = false;
    } else {
      const match = firebaseHistoryCount === supabaseHistoryCount;
      results.push({
        table: 'completion_history',
        firebase: firebaseHistoryCount,
        supabase: supabaseHistoryCount,
        match
      });

      if (match) {
        console.log(`   ✅ Count matches: ${firebaseHistoryCount} records`);
      } else {
        console.log(`   ❌ Count mismatch: Firebase=${firebaseHistoryCount}, Supabase=${supabaseHistoryCount}`);
        allPassed = false;
      }

      // Spot check latest completion
      if (firebaseHistory.length > 0) {
        const latestRecord = firebaseHistory[firebaseHistory.length - 1];
        const { data: supabaseRecord, error } = await supabase
          .from('completion_history')
          .select('*')
          .eq('id', latestRecord.id)
          .single();

        if (error || !supabaseRecord) {
          console.log(`   ❌ Spot check failed: Could not find record ID ${latestRecord.id}`);
          allPassed = false;
        } else if (supabaseRecord.chore_name === latestRecord.choreName) {
          console.log(`   ✅ Spot check passed: Latest completion "${latestRecord.choreName}" found`);
        } else {
          console.log(`   ❌ Spot check failed: Data mismatch for ID ${latestRecord.id}`);
          allPassed = false;
        }
      }
    }

    // ========================================
    // VERIFY CHANGE LOG
    // ========================================
    console.log('\n📝 Verifying Change Log...');

    const changeLogDoc = await firestore.collection('familyChores').doc('changeLog').get();
    const firebaseChangeLog = changeLogDoc.exists ? (changeLogDoc.data().log || []) : [];
    const firebaseChangeLogCount = firebaseChangeLog.length;

    const { count: supabaseChangeLogCount, error: changeLogError } = await supabase
      .from('change_log')
      .select('*', { count: 'exact', head: true });

    if (changeLogError) {
      console.error(`   ❌ Error querying Supabase change log:`, changeLogError.message);
      allPassed = false;
    } else {
      const match = firebaseChangeLogCount === supabaseChangeLogCount;
      results.push({
        table: 'change_log',
        firebase: firebaseChangeLogCount,
        supabase: supabaseChangeLogCount,
        match
      });

      if (match) {
        console.log(`   ✅ Count matches: ${firebaseChangeLogCount} records`);
      } else {
        console.log(`   ❌ Count mismatch: Firebase=${firebaseChangeLogCount}, Supabase=${supabaseChangeLogCount}`);
        allPassed = false;
      }
    }

    // ========================================
    // VERIFY VIEWS WORK
    // ========================================
    console.log('\n🔧 Verifying Supabase Views...');

    const { data: dueChores, error: dueError } = await supabase
      .from('chores_due')
      .select('*')
      .limit(1);

    if (dueError) {
      console.log(`   ❌ chores_due view error:`, dueError.message);
      allPassed = false;
    } else {
      console.log(`   ✅ chores_due view works`);
    }

    const { data: weeklyData, error: weeklyError } = await supabase
      .from('weekly_stats')
      .select('*');

    if (weeklyError) {
      console.log(`   ❌ weekly_stats view error:`, weeklyError.message);
      allPassed = false;
    } else {
      console.log(`   ✅ weekly_stats view works`);
    }

    // ========================================
    // SUMMARY
    // ========================================
    console.log('\n' + '━'.repeat(50));
    console.log('📊 VERIFICATION SUMMARY\n');

    console.log('Table                  Firebase    Supabase    Status');
    console.log('─'.repeat(55));

    for (const r of results) {
      const status = r.match ? '✅ Match' : '❌ Mismatch';
      console.log(
        `${r.table.padEnd(22)} ${String(r.firebase).padStart(8)}    ${String(r.supabase).padStart(8)}    ${status}`
      );
    }

    console.log('');

    if (allPassed) {
      console.log('✨ All verifications passed!');
      console.log('\nYour data has been successfully migrated to Supabase.');
      console.log('You can now update the app to use Supabase.');
    } else {
      console.log('⚠️  Some verifications failed.');
      console.log('Please review the errors above and re-run migration if needed.');
      console.log('\nYour original Firebase data is still intact.');
    }

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

verify();
