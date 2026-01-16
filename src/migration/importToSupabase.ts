/**
 * SUPABASE IMPORT SCRIPT
 * 
 * Imports transformed data into Supabase database
 */

import * as fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface TransformedUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  department: string | null;
  created_at: string;
  tempPassword: string;
}

interface TransformedTask {
  id: string;
  title: string;
  description: string | null;
  category: string;
  priority: string;
  status: string;
  progress_percentage: number;
  assigned_to: string;
  created_by: string;
  due_date: string | null;
  estimated_hours: number | null;
  tags: string[];
  created_at: string;
}

interface TransformedIssue {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  reported_by: string;
  suggested_assignee_id: string;
  assigned_to: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  created_at: string;
}

interface TransformedData {
  users: TransformedUser[];
  tasks: TransformedTask[];
  issues: TransformedIssue[];
  userEmailToIdMap: Record<string, string>;
  adminUserId: string;
}

interface ImportResult {
  success: boolean;
  usersCreated: number;
  tasksCreated: number;
  issuesCreated: number;
  errors: string[];
  userCredentials: Array<{ email: string; tempPassword: string }>;
}

/**
 * Main import function
 */
export async function importToSupabase(inputFilePath: string): Promise<ImportResult> {
  console.log('📥 Starting Supabase import...');
  
  const result: ImportResult = {
    success: false,
    usersCreated: 0,
    tasksCreated: 0,
    issuesCreated: 0,
    errors: [],
    userCredentials: []
  };
  
  try {
    // Validate environment variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    }
    
    // Create Supabase client with service role key (bypasses RLS)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Read transformed data
    const transformedData: TransformedData = JSON.parse(fs.readFileSync(inputFilePath, 'utf-8'));
    console.log('✅ Loaded transformed data');
    
    // Import users
    console.log('\n👥 Importing users...');
    for (const user of transformedData.users) {
      try {
        // Create auth user
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: user.email,
          password: user.tempPassword,
          email_confirm: true,
          user_metadata: {
            full_name: user.full_name
          }
        });
        
        if (authError) {
          result.errors.push(`Failed to create auth user ${user.email}: ${authError.message}`);
          console.error(`❌ ${user.email}: ${authError.message}`);
          continue;
        }
        
        // Create profile
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            id: authData.user.id,
            email: user.email,
            full_name: user.full_name,
            role: user.role,
            department: user.department,
            created_at: user.created_at
          });
        
        if (profileError) {
          result.errors.push(`Failed to create profile for ${user.email}: ${profileError.message}`);
          console.error(`❌ Profile for ${user.email}: ${profileError.message}`);
          continue;
        }
        
        result.usersCreated++;
        result.userCredentials.push({
          email: user.email,
          tempPassword: user.tempPassword
        });
        
        console.log(`✅ Created user: ${user.email} (${user.role})`);
        
      } catch (error: any) {
        result.errors.push(`Exception creating user ${user.email}: ${error.message}`);
        console.error(`❌ Exception for ${user.email}:`, error);
      }
    }
    
    // Import tasks
    console.log('\n📋 Importing tasks...');
    const taskBatchSize = 100;
    for (let i = 0; i < transformedData.tasks.length; i += taskBatchSize) {
      const batch = transformedData.tasks.slice(i, i + taskBatchSize);
      
      const { data, error } = await supabase
        .from('tasks')
        .insert(batch.map(task => ({
          id: task.id,
          title: task.title,
          description: task.description,
          category: task.category,
          priority: task.priority,
          status: task.status,
          progress_percentage: task.progress_percentage,
          assigned_to: task.assigned_to,
          created_by: task.created_by,
          due_date: task.due_date,
          estimated_hours: task.estimated_hours,
          tags: task.tags,
          created_at: task.created_at
        })));
      
      if (error) {
        result.errors.push(`Failed to import task batch ${i}-${i + batch.length}: ${error.message}`);
        console.error(`❌ Task batch ${i}-${i + batch.length}:`, error);
      } else {
        result.tasksCreated += batch.length;
        console.log(`✅ Imported ${batch.length} tasks (${i + batch.length}/${transformedData.tasks.length})`);
      }
    }
    
    // Import issues
    console.log('\n🚨 Importing issues...');
    const issueBatchSize = 100;
    for (let i = 0; i < transformedData.issues.length; i += issueBatchSize) {
      const batch = transformedData.issues.slice(i, i + issueBatchSize);
      
      const { data, error } = await supabase
        .from('issues')
        .insert(batch.map(issue => ({
          id: issue.id,
          title: issue.title,
          description: issue.description,
          priority: issue.priority,
          status: issue.status,
          reported_by: issue.reported_by,
          suggested_assignee_id: issue.suggested_assignee_id,
          assigned_to: issue.assigned_to,
          resolution_notes: issue.resolution_notes,
          resolved_at: issue.resolved_at,
          created_at: issue.created_at
        })));
      
      if (error) {
        result.errors.push(`Failed to import issue batch ${i}-${i + batch.length}: ${error.message}`);
        console.error(`❌ Issue batch ${i}-${i + batch.length}:`, error);
      } else {
        result.issuesCreated += batch.length;
        console.log(`✅ Imported ${batch.length} issues (${i + batch.length}/${transformedData.issues.length})`);
      }
    }
    
    result.success = result.errors.length === 0;
    
    // Save credentials to file
    const credentialsFile = 'user_credentials.json';
    fs.writeFileSync(credentialsFile, JSON.stringify(result.userCredentials, null, 2));
    console.log(`\n🔑 User credentials saved to: ${credentialsFile}`);
    
    // Print summary
    console.log('\n📊 Import Summary:');
    console.log(`   ✅ Users created: ${result.usersCreated}/${transformedData.users.length}`);
    console.log(`   ✅ Tasks created: ${result.tasksCreated}/${transformedData.tasks.length}`);
    console.log(`   ✅ Issues created: ${result.issuesCreated}/${transformedData.issues.length}`);
    
    if (result.errors.length > 0) {
      console.log(`   ⚠️  Errors: ${result.errors.length}`);
      console.log('\n❌ Errors:');
      result.errors.forEach(error => console.log(`   - ${error}`));
    }
    
    return result;
    
  } catch (error: any) {
    console.error('❌ Import failed:', error);
    result.errors.push(`Fatal error: ${error.message}`);
    return result;
  }
}

/**
 * CLI entry point
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.log('Usage: ts-node importToSupabase.ts <transformed-data-file>');
    console.log('Example: ts-node importToSupabase.ts transformed_data.json');
    console.log('');
    console.log('Required environment variables:');
    console.log('  - SUPABASE_URL');
    console.log('  - SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  
  const inputFile = args[0];
  
  importToSupabase(inputFile)
    .then(result => {
      if (result.success) {
        console.log('\n✅ Import complete!');
        console.log('\n⚠️  IMPORTANT: Send user credentials to users securely');
        console.log('   Credentials file: user_credentials.json');
        process.exit(0);
      } else {
        console.log('\n⚠️  Import completed with errors');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('\n❌ Import failed:', error);
      process.exit(1);
    });
}
