/**
 * USER ACCOUNT MIGRATION SCRIPT
 * 
 * Handles user account migration from Google Sheets to Supabase Auth
 * Includes password reset flow and data validation
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

interface UserCredential {
  email: string;
  tempPassword: string;
}

interface MigrationUser {
  email: string;
  full_name: string;
  role: 'admin' | 'employee';
  department?: string | null;
}

interface UserMigrationResult {
  success: boolean;
  usersCreated: number;
  usersFailed: number;
  credentials: UserCredential[];
  errors: string[];
}

/**
 * Migrate users to Supabase Auth
 */
export async function migrateUsers(users: MigrationUser[]): Promise<UserMigrationResult> {
  console.log('👥 Starting user account migration...\n');
  
  const result: UserMigrationResult = {
    success: false,
    usersCreated: 0,
    usersFailed: 0,
    credentials: [],
    errors: []
  };
  
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    for (const user of users) {
      try {
        console.log(`Creating account for: ${user.email}...`);
        
        // Generate temporary password
        const tempPassword = generateSecurePassword();
        
        // Create auth user
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: user.email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            full_name: user.full_name,
            role: user.role
          }
        });
        
        if (authError) {
          if (authError.message.includes('already exists')) {
            console.log(`⚠️  User already exists: ${user.email}`);
            result.errors.push(`User already exists: ${user.email}`);
          } else {
            console.error(`❌ Failed to create ${user.email}: ${authError.message}`);
            result.errors.push(`Failed to create ${user.email}: ${authError.message}`);
          }
          result.usersFailed++;
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
            department: user.department || null
          });
        
        if (profileError) {
          console.error(`❌ Failed to create profile for ${user.email}: ${profileError.message}`);
          result.errors.push(`Failed to create profile for ${user.email}: ${profileError.message}`);
          result.usersFailed++;
          continue;
        }
        
        result.usersCreated++;
        result.credentials.push({
          email: user.email,
          tempPassword: tempPassword
        });
        
        console.log(`✅ Created: ${user.email} (${user.role})`);
        
      } catch (error: any) {
        console.error(`❌ Exception for ${user.email}:`, error);
        result.errors.push(`Exception for ${user.email}: ${error.message}`);
        result.usersFailed++;
      }
    }
    
    result.success = result.usersFailed === 0;
    
    // Save credentials
    const credentialsFile = 'user_credentials.json';
    fs.writeFileSync(credentialsFile, JSON.stringify(result.credentials, null, 2));
    console.log(`\n🔑 Credentials saved to: ${credentialsFile}`);
    
    // Print summary
    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Users created: ${result.usersCreated}/${users.length}`);
    console.log(`   ❌ Users failed: ${result.usersFailed}/${users.length}`);
    
    if (result.errors.length > 0) {
      console.log(`\n⚠️  Errors (${result.errors.length}):`);
      result.errors.forEach(error => console.log(`   - ${error}`));
    }
    
    return result;
    
  } catch (error: any) {
    console.error('❌ Migration failed:', error);
    result.errors.push(`Fatal error: ${error.message}`);
    return result;
  }
}

/**
 * Send password reset emails to all users
 */
export async function sendPasswordResetEmails(emails: string[]): Promise<void> {
  console.log('📧 Sending password reset emails...\n');
  
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    for (const email of emails) {
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${process.env.FRONTEND_URL}/reset-password`
        });
        
        if (error) {
          console.error(`❌ Failed to send reset email to ${email}: ${error.message}`);
        } else {
          console.log(`✅ Sent reset email to: ${email}`);
        }
        
        // Rate limit: wait 1 second between emails
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error: any) {
        console.error(`❌ Exception sending email to ${email}:`, error);
      }
    }
    
    console.log('\n✅ Password reset emails sent');
    
  } catch (error: any) {
    console.error('❌ Failed to send reset emails:', error);
    throw error;
  }
}

/**
 * Validate user data before migration
 */
export function validateUserData(users: MigrationUser[]): { valid: boolean; errors: string[] } {
  console.log('🔍 Validating user data...\n');
  
  const errors: string[] = [];
  const emailSet = new Set<string>();
  
  users.forEach((user, index) => {
    // Check email format
    if (!user.email || !user.email.includes('@')) {
      errors.push(`User ${index + 1}: Invalid email format: ${user.email}`);
    }
    
    // Check for duplicate emails
    if (emailSet.has(user.email)) {
      errors.push(`User ${index + 1}: Duplicate email: ${user.email}`);
    }
    emailSet.add(user.email);
    
    // Check full name
    if (!user.full_name || user.full_name.trim().length === 0) {
      errors.push(`User ${index + 1}: Missing full name for ${user.email}`);
    }
    
    // Check role
    if (!user.role || !['admin', 'employee'].includes(user.role)) {
      errors.push(`User ${index + 1}: Invalid role for ${user.email}: ${user.role}`);
    }
  });
  
  if (errors.length > 0) {
    console.log('❌ Validation failed:\n');
    errors.forEach(error => console.log(`   - ${error}`));
    return { valid: false, errors };
  }
  
  console.log('✅ Validation passed\n');
  return { valid: true, errors: [] };
}

/**
 * Clean up user data (trim whitespace, normalize)
 */
export function cleanUserData(users: MigrationUser[]): MigrationUser[] {
  return users.map(user => ({
    email: user.email.trim().toLowerCase(),
    full_name: user.full_name.trim(),
    role: user.role,
    department: user.department ? user.department.trim() : null
  }));
}

/**
 * Generate secure temporary password
 */
function generateSecurePassword(): string {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghjkmnpqrstuvwxyz';
  const numbers = '23456789';
  const special = '!@#$%^&*';
  
  const all = uppercase + lowercase + numbers + special;
  
  let password = '';
  
  // Ensure at least one of each type
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  // Fill the rest (total 16 characters)
  for (let i = 4; i < 16; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

/**
 * Check if user already exists in Supabase
 */
export async function checkExistingUsers(emails: string[]): Promise<string[]> {
  console.log('🔍 Checking for existing users...\n');
  
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const existingEmails: string[] = [];
    
    for (const email of emails) {
      const { data } = await supabase
        .from('profiles')
        .select('email')
        .eq('email', email)
        .single();
      
      if (data) {
        existingEmails.push(email);
        console.log(`⚠️  Already exists: ${email}`);
      }
    }
    
    if (existingEmails.length > 0) {
      console.log(`\n⚠️  Found ${existingEmails.length} existing users`);
    } else {
      console.log('✅ No existing users found\n');
    }
    
    return existingEmails;
    
  } catch (error: any) {
    console.error('❌ Failed to check existing users:', error);
    return [];
  }
}

/**
 * CLI entry point
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  
  if (!command) {
    console.log('Usage:');
    console.log('  ts-node userAccountMigration.ts migrate <users-json-file>');
    console.log('  ts-node userAccountMigration.ts reset-passwords <emails-json-file>');
    console.log('  ts-node userAccountMigration.ts validate <users-json-file>');
    console.log('  ts-node userAccountMigration.ts check-existing <emails-json-file>');
    process.exit(1);
  }
  
  if (command === 'migrate') {
    if (args.length < 2) {
      console.log('Usage: ts-node userAccountMigration.ts migrate <users-json-file>');
      process.exit(1);
    }
    
    const usersFile = args[1];
    const users: MigrationUser[] = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
    
    // Validate and clean data
    const cleanedUsers = cleanUserData(users);
    const validation = validateUserData(cleanedUsers);
    
    if (!validation.valid) {
      console.error('\n❌ Validation failed. Fix errors and try again.');
      process.exit(1);
    }
    
    // Migrate users
    migrateUsers(cleanedUsers)
      .then(result => {
        process.exit(result.success ? 0 : 1);
      })
      .catch(error => {
        console.error('❌ Migration failed:', error);
        process.exit(1);
      });
      
  } else if (command === 'reset-passwords') {
    if (args.length < 2) {
      console.log('Usage: ts-node userAccountMigration.ts reset-passwords <emails-json-file>');
      process.exit(1);
    }
    
    const emailsFile = args[1];
    const emails: string[] = JSON.parse(fs.readFileSync(emailsFile, 'utf-8'));
    
    sendPasswordResetEmails(emails)
      .then(() => {
        console.log('✅ Complete');
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Failed:', error);
        process.exit(1);
      });
      
  } else if (command === 'validate') {
    if (args.length < 2) {
      console.log('Usage: ts-node userAccountMigration.ts validate <users-json-file>');
      process.exit(1);
    }
    
    const usersFile = args[1];
    const users: MigrationUser[] = JSON.parse(fs.readFileSync(usersFile, 'utf-8'));
    
    const cleanedUsers = cleanUserData(users);
    const validation = validateUserData(cleanedUsers);
    
    process.exit(validation.valid ? 0 : 1);
    
  } else if (command === 'check-existing') {
    if (args.length < 2) {
      console.log('Usage: ts-node userAccountMigration.ts check-existing <emails-json-file>');
      process.exit(1);
    }
    
    const emailsFile = args[1];
    const emails: string[] = JSON.parse(fs.readFileSync(emailsFile, 'utf-8'));
    
    checkExistingUsers(emails)
      .then(existing => {
        if (existing.length > 0) {
          console.log('\nExisting users:', existing);
        }
        process.exit(0);
      })
      .catch(error => {
        console.error('❌ Failed:', error);
        process.exit(1);
      });
      
  } else {
    console.log('Unknown command:', command);
    process.exit(1);
  }
}
