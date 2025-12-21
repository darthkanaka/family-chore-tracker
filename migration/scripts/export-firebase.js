/**
 * Export Firebase Data to JSON Backups
 *
 * This script reads all data from Firebase Firestore and saves it
 * to local JSON files as a backup before migration.
 *
 * Usage: npm run export
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = join(__dirname, '..', 'backups');

// Check for service account file
const serviceAccountPath = join(__dirname, '..', 'firebase-service-account.json');
if (!existsSync(serviceAccountPath)) {
  console.error('❌ Error: firebase-service-account.json not found!');
  console.error('');
  console.error('To get this file:');
  console.error('1. Go to Firebase Console → Project Settings → Service Accounts');
  console.error('2. Click "Generate new private key"');
  console.error('3. Save as: migration/firebase-service-account.json');
  process.exit(1);
}

// Initialize Firebase Admin
const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();

async function exportData() {
  console.log('🔥 Starting Firebase Export...\n');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const results = {};

  try {
    // Export chores data
    console.log('📋 Exporting chores...');
    const choresDoc = await db.collection('familyChores').doc('choresData').get();
    if (choresDoc.exists) {
      const choresData = choresDoc.data();
      results.chores = choresData.chores || [];
      console.log(`   Found ${results.chores.length} chores`);
    } else {
      results.chores = [];
      console.log('   No chores document found');
    }

    // Export completion history
    console.log('📜 Exporting completion history...');
    const historyDoc = await db.collection('familyChores').doc('completionHistory').get();
    if (historyDoc.exists) {
      const historyData = historyDoc.data();
      results.completionHistory = historyData.history || [];
      console.log(`   Found ${results.completionHistory.length} completion records`);
    } else {
      results.completionHistory = [];
      console.log('   No completion history document found');
    }

    // Export change log
    console.log('📝 Exporting change log...');
    const changeLogDoc = await db.collection('familyChores').doc('changeLog').get();
    if (changeLogDoc.exists) {
      const changeLogData = changeLogDoc.data();
      results.changeLog = changeLogData.log || [];
      console.log(`   Found ${results.changeLog.length} change log entries`);
    } else {
      results.changeLog = [];
      console.log('   No change log document found');
    }

    // Save individual backups
    console.log('\n💾 Saving backup files...');

    const choresFile = join(BACKUP_DIR, `chores-${timestamp}.json`);
    writeFileSync(choresFile, JSON.stringify(results.chores, null, 2));
    console.log(`   ✅ ${choresFile}`);

    const historyFile = join(BACKUP_DIR, `completion-history-${timestamp}.json`);
    writeFileSync(historyFile, JSON.stringify(results.completionHistory, null, 2));
    console.log(`   ✅ ${historyFile}`);

    const changeLogFile = join(BACKUP_DIR, `change-log-${timestamp}.json`);
    writeFileSync(changeLogFile, JSON.stringify(results.changeLog, null, 2));
    console.log(`   ✅ ${changeLogFile}`);

    // Save combined backup
    const combinedFile = join(BACKUP_DIR, `full-backup-${timestamp}.json`);
    writeFileSync(combinedFile, JSON.stringify(results, null, 2));
    console.log(`   ✅ ${combinedFile}`);

    // Also save a "latest" version for easy access
    const latestFile = join(BACKUP_DIR, 'latest-backup.json');
    writeFileSync(latestFile, JSON.stringify(results, null, 2));
    console.log(`   ✅ ${latestFile}`);

    console.log('\n✨ Export complete!\n');
    console.log('Summary:');
    console.log(`   Chores: ${results.chores.length}`);
    console.log(`   Completion History: ${results.completionHistory.length}`);
    console.log(`   Change Log: ${results.changeLog.length}`);
    console.log(`\nBackup saved to: ${BACKUP_DIR}`);

    return results;

  } catch (error) {
    console.error('❌ Export failed:', error.message);
    process.exit(1);
  }
}

exportData();
