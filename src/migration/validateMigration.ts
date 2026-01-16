/**
 * MIGRATION VALIDATION SCRIPT
 * 
 * Validates that migration was successful by comparing counts and data integrity
 */

import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface ValidationResult {
  success: boolean;
  checks: {
    name: string;
    passed: boolean;
    expected: number;
    actual: number;
    message: string;
  }[];
  errors: string[];
}

/**
 * Main validation function
 */
export async function validateMigration(transformedDataFile: string): Promise<ValidationResult> {
  console.log('🔍 Starting migration validation...\n');
  
  const result: ValidationResult = {
    success: true,
    checks: [],
    errors: []
  };
  
  try {
    // Validate environment variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    }
    
    // Create Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Read transformed data for comparison
    const transformedData = JSON.parse(fs.readFileSync(transformedDataFile, 'utf-8'));
    
    // Check 1: User count
    console.log('📊 Checking user count...');
    const { count: userCount, error: userCountError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });
    
    if (userCountError) {
      result.errors.push(`Failed to count users: ${userCountError.message}`);
      result.success = false;
    } else {
      const passed = userCount === transformedData.users.length;
      result.checks.push({
        name: 'User Count',
        passed,
        expected: transformedData.users.length,
        actual: userCount || 0,
        message: passed ? '✅ User count matches' : '❌ User count mismatch'
      });
      console.log(`   Expected: ${transformedData.users.length}, Actual: ${userCount}`);
      if (!passed) result.success = false;
    }
    
    // Check 2: Task count
    console.log('\n📊 Checking task count...');
    const { count: taskCount, error: taskCountError } = await supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true });
    
    if (taskCountError) {
      result.errors.push(`Failed to count tasks: ${taskCountError.message}`);
      result.success = false;
    } else {
      const passed = taskCount === transformedData.tasks.length;
      result.checks.push({
        name: 'Task Count',
        passed,
        expected: transformedData.tasks.length,
        actual: taskCount || 0,
        message: passed ? '✅ Task count matches' : '❌ Task count mismatch'
      });
      console.log(`   Expected: ${transformedData.tasks.length}, Actual: ${taskCount}`);
      if (!passed) result.success = false;
    }
    
    // Check 3: Issue count
    console.log('\n📊 Checking issue count...');
    const { count: issueCount, error: issueCountError } = await supabase
      .from('issues')
      .select('*', { count: 'exact', head: true });
    
    if (issueCountError) {
      result.errors.push(`Failed to count issues: ${issueCountError.message}`);
      result.success = false;
    } else {
      const passed = issueCount === transformedData.issues.length;
      result.checks.push({
        name: 'Issue Count',
        passed,
        expected: transformedData.issues.length,
        actual: issueCount || 0,
        message: passed ? '✅ Issue count matches' : '❌ Issue count mismatch'
      });
      console.log(`   Expected: ${transformedData.issues.length}, Actual: ${issueCount}`);
      if (!passed) result.success = false;
    }
    
    // Check 4: Admin user exists
    console.log('\n👤 Checking admin user...');
    const { data: adminUsers, error: adminError } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'admin');
    
    if (adminError) {
      result.errors.push(`Failed to check admin users: ${adminError.message}`);
      result.success = false;
    } else {
      const passed = (adminUsers?.length || 0) >= 1;
      result.checks.push({
        name: 'Admin User',
        passed,
        expected: 1,
        actual: adminUsers?.length || 0,
        message: passed ? '✅ Admin user exists' : '❌ No admin user found'
      });
      console.log(`   Admin users found: ${adminUsers?.length || 0}`);
      if (!passed) result.success = false;
    }
    
    // Check 5: Task assignments
    console.log('\n🔗 Checking task assignments...');
    const { data: unassignedTasks, error: unassignedError } = await supabase
      .from('tasks')
      .select('id')
      .is('assigned_to', null);
    
    if (unassignedError) {
      result.errors.push(`Failed to check task assignments: ${unassignedError.message}`);
      result.success = false;
    } else {
      const unassignedCount = unassignedTasks?.length || 0;
      const passed = unassignedCount === 0;
      result.checks.push({
        name: 'Task Assignments',
        passed,
        expected: 0,
        actual: unassignedCount,
        message: passed ? '✅ All tasks are assigned' : `⚠️  ${unassignedCount} tasks unassigned`
      });
      console.log(`   Unassigned tasks: ${unassignedCount}`);
      // This is a warning, not a failure
    }
    
    // Check 6: Issue reporters
    console.log('\n🔗 Checking issue reporters...');
    const { data: issuesWithoutReporter, error: reporterError } = await supabase
      .from('issues')
      .select('id')
      .is('reported_by', null);
    
    if (reporterError) {
      result.errors.push(`Failed to check issue reporters: ${reporterError.message}`);
      result.success = false;
    } else {
      const missingReporterCount = issuesWithoutReporter?.length || 0;
      const passed = missingReporterCount === 0;
      result.checks.push({
        name: 'Issue Reporters',
        passed,
        expected: 0,
        actual: missingReporterCount,
        message: passed ? '✅ All issues have reporters' : `❌ ${missingReporterCount} issues without reporters`
      });
      console.log(`   Issues without reporter: ${missingReporterCount}`);
      if (!passed) result.success = false;
    }
    
    // Check 7: Data integrity - foreign keys
    console.log('\n🔗 Checking data integrity...');
    const { data: orphanedTasks, error: orphanedError } = await supabase
      .from('tasks')
      .select('id, assigned_to')
      .not('assigned_to', 'is', null);
    
    if (orphanedError) {
      result.errors.push(`Failed to check data integrity: ${orphanedError.message}`);
      result.success = false;
    } else {
      // Check if assigned users exist
      let orphanedCount = 0;
      if (orphanedTasks) {
        for (const task of orphanedTasks) {
          const { data: user } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', task.assigned_to)
            .single();
          
          if (!user) orphanedCount++;
        }
      }
      
      const passed = orphanedCount === 0;
      result.checks.push({
        name: 'Data Integrity',
        passed,
        expected: 0,
        actual: orphanedCount,
        message: passed ? '✅ All foreign keys valid' : `❌ ${orphanedCount} orphaned references`
      });
      console.log(`   Orphaned task assignments: ${orphanedCount}`);
      if (!passed) result.success = false;
    }
    
    // Print summary
    console.log('\n' + '='.repeat(50));
    console.log('📊 VALIDATION SUMMARY');
    console.log('='.repeat(50));
    
    result.checks.forEach(check => {
      console.log(`\n${check.message}`);
      console.log(`   Expected: ${check.expected}, Actual: ${check.actual}`);
    });
    
    if (result.errors.length > 0) {
      console.log('\n❌ Errors:');
      result.errors.forEach(error => console.log(`   - ${error}`));
    }
    
    console.log('\n' + '='.repeat(50));
    if (result.success) {
      console.log('✅ VALIDATION PASSED');
    } else {
      console.log('❌ VALIDATION FAILED');
    }
    console.log('='.repeat(50) + '\n');
    
    return result;
    
  } catch (error: any) {
    console.error('❌ Validation failed:', error);
    result.errors.push(`Fatal error: ${error.message}`);
    result.success = false;
    return result;
  }
}

/**
 * CLI entry point
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: ts-node validateMigration.ts <transformed-data-file>');
    console.log('Example: ts-node validateMigration.ts transformed_data.json');
    console.log('');
    console.log('Required environment variables:');
    console.log('  - SUPABASE_URL');
    console.log('  - SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  
  const inputFile = args[0];
  
  validateMigration(inputFile)
    .then(result => {
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('\n❌ Validation failed:', error);
      process.exit(1);
    });
}
