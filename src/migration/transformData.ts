/**
 * DATA TRANSFORMATION SCRIPT
 * 
 * Transforms exported Google Sheets data to match Supabase schema
 */

import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

interface ExportedUser {
  email: string;
  userName: string;
  fileUrl: string;
  createdAt: string;
  role: string;
  department: string | null;
}

interface ExportedTask {
  userEmail: string;
  category: 'routine' | 'project' | 'one_time';
  title: string;
  description?: string;
  tags?: string[];
  priority?: string;
  status?: string;
  dueDate?: string | null;
  progressPercentage?: number;
  estimatedHours?: number | null;
  frequency?: string;
  startTime?: string;
  endTime?: string;
  projectStart?: string | null;
  projectEnd?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

interface ExportedIssue {
  reportedBy: string;
  suggestedAssignee: string;
  title: string;
  description: string;
  issueType: string;
  priority: string;
  status: string;
  resolutionNotes?: string | null;
  resolvedAt?: string | null;
  notes?: string;
  createdAt: string;
}

interface ExportData {
  exportDate: string;
  version: string;
  users: ExportedUser[];
  tasks: ExportedTask[];
  issues: ExportedIssue[];
  metadata: {
    totalUsers: number;
    totalTasks: number;
    totalIssues: number;
  };
}

interface TransformedUser {
  id: string;
  email: string;
  full_name: string;
  role: string;
  department: string | null;
  created_at: string;
  tempPassword: string; // For initial account creation
}

interface TransformedTask {
  id: string;
  title: string;
  description: string | null;
  category: 'routine' | 'project' | 'one_time' | 'issue_resolution';
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'not_started' | 'in_progress' | 'completed' | 'blocked';
  progress_percentage: number;
  assigned_to: string; // UUID
  created_by: string; // UUID (admin)
  due_date: string | null;
  estimated_hours: number | null;
  tags: string[];
  created_at: string;
}

interface TransformedIssue {
  id: string;
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending_assignment' | 'assigned' | 'in_progress' | 'resolved' | 'closed';
  reported_by: string; // UUID
  suggested_assignee_id: string; // UUID
  assigned_to: string | null; // UUID
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

/**
 * Main transformation function
 */
export async function transformExportedData(inputFilePath: string, outputFilePath: string): Promise<void> {
  console.log('🔄 Starting data transformation...');
  
  try {
    // Read exported data
    const exportData: ExportData = JSON.parse(fs.readFileSync(inputFilePath, 'utf-8'));
    console.log('✅ Loaded export data');
    console.log(`   - Users: ${exportData.users.length}`);
    console.log(`   - Tasks: ${exportData.tasks.length}`);
    console.log(`   - Issues: ${exportData.issues.length}`);
    
    // Transform data
    const transformed = transformData(exportData);
    
    // Save transformed data
    fs.writeFileSync(outputFilePath, JSON.stringify(transformed, null, 2));
    console.log('✅ Saved transformed data to:', outputFilePath);
    console.log('');
    console.log('📊 Transformation Summary:');
    console.log(`   - Users: ${transformed.users.length}`);
    console.log(`   - Tasks: ${transformed.tasks.length}`);
    console.log(`   - Issues: ${transformed.issues.length}`);
    console.log('');
    console.log('🔑 Admin User ID:', transformed.adminUserId);
    
  } catch (error) {
    console.error('❌ Transformation error:', error);
    throw error;
  }
}

/**
 * Transform exported data to Supabase format
 */
function transformData(exportData: ExportData): TransformedData {
  // Create user ID mapping
  const userEmailToIdMap: Record<string, string> = {};
  const adminUserId = uuidv4(); // First user will be admin
  
  // Transform users
  const users: TransformedUser[] = exportData.users.map((user, index) => {
    const userId = index === 0 ? adminUserId : uuidv4();
    userEmailToIdMap[user.email] = userId;
    
    return {
      id: userId,
      email: user.email,
      full_name: user.userName,
      role: index === 0 ? 'admin' : 'employee', // First user is admin
      department: user.department,
      created_at: user.createdAt,
      tempPassword: generateTempPassword()
    };
  });
  
  // Transform tasks
  const tasks: TransformedTask[] = exportData.tasks.map(task => {
    const assignedUserId = userEmailToIdMap[task.userEmail];
    
    if (!assignedUserId) {
      console.warn(`⚠️ User not found for task: ${task.userEmail}`);
    }
    
    return {
      id: uuidv4(),
      title: task.title,
      description: buildTaskDescription(task),
      category: task.category,
      priority: (task.priority || 'medium') as any,
      status: (task.status || 'not_started') as any,
      progress_percentage: task.progressPercentage || 0,
      assigned_to: assignedUserId || adminUserId,
      created_by: adminUserId,
      due_date: task.dueDate || null,
      estimated_hours: task.estimatedHours || null,
      tags: task.tags || [],
      created_at: task.createdAt
    };
  });
  
  // Transform issues
  const issues: TransformedIssue[] = exportData.issues.map(issue => {
    const reportedById = userEmailToIdMap[issue.reportedBy];
    const suggestedAssigneeId = userEmailToIdMap[issue.suggestedAssignee];
    
    if (!reportedById) {
      console.warn(`⚠️ Reporter not found for issue: ${issue.reportedBy}`);
    }
    
    return {
      id: uuidv4(),
      title: issue.title,
      description: buildIssueDescription(issue),
      priority: issue.priority as any,
      status: issue.status as any,
      reported_by: reportedById || adminUserId,
      suggested_assignee_id: suggestedAssigneeId || adminUserId,
      assigned_to: issue.status === 'assigned' || issue.status === 'in_progress' || issue.status === 'resolved' 
        ? (suggestedAssigneeId || adminUserId) 
        : null,
      resolution_notes: issue.resolutionNotes || null,
      resolved_at: issue.resolvedAt || null,
      created_at: issue.createdAt
    };
  });
  
  return {
    users,
    tasks,
    issues,
    userEmailToIdMap,
    adminUserId
  };
}

/**
 * Build comprehensive task description from exported data
 */
function buildTaskDescription(task: ExportedTask): string {
  let description = task.description || '';
  
  // Add frequency info for routine tasks
  if (task.category === 'routine' && task.frequency) {
    description += `\n\n**Sıklık:** ${task.frequency}`;
  }
  
  // Add time info
  if (task.startTime || task.endTime) {
    description += `\n\n**Zaman:** ${task.startTime || ''} - ${task.endTime || ''}`;
  }
  
  // Add project dates for project tasks
  if (task.category === 'project') {
    if (task.projectStart) {
      description += `\n\n**Proje Başlangıç:** ${new Date(task.projectStart).toLocaleDateString('tr-TR')}`;
    }
    if (task.projectEnd) {
      description += `\n\n**Proje Bitiş:** ${new Date(task.projectEnd).toLocaleDateString('tr-TR')}`;
    }
  }
  
  // Add completion info
  if (task.completedAt) {
    description += `\n\n**Tamamlanma Tarihi:** ${new Date(task.completedAt).toLocaleDateString('tr-TR')}`;
  }
  
  return description.trim();
}

/**
 * Build comprehensive issue description from exported data
 */
function buildIssueDescription(issue: ExportedIssue): string {
  let description = issue.description;
  
  if (issue.issueType) {
    description = `**Sorun Türü:** ${issue.issueType}\n\n${description}`;
  }
  
  if (issue.notes) {
    description += `\n\n**Notlar:** ${issue.notes}`;
  }
  
  return description;
}

/**
 * Generate temporary password for user account creation
 */
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * CLI entry point
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: ts-node transformData.ts <input-file> <output-file>');
    console.log('Example: ts-node transformData.ts migration_export_2026-01-14.json transformed_data.json');
    process.exit(1);
  }
  
  const inputFile = args[0];
  const outputFile = args[1];
  
  transformExportedData(inputFile, outputFile)
    .then(() => {
      console.log('✅ Transformation complete!');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Transformation failed:', error);
      process.exit(1);
    });
}
