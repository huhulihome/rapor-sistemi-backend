/**
 * GOOGLE APPS SCRIPT - DATA EXPORT FOR MIGRATION
 * 
 * This script exports data from the Google Sheets-based system
 * to JSON format for migration to Supabase.
 * 
 * USAGE:
 * 1. Open Google Apps Script editor
 * 2. Copy this entire file
 * 3. Run exportAllDataToJSON()
 * 4. Download the generated JSON files from Google Drive
 */

/**
 * Main export function - exports all data to JSON
 */
function exportAllDataToJSON() {
  console.log('🚀 Starting data export for migration...');
  
  try {
    // Export users from Master Sheet
    const users = exportUsers();
    console.log('✅ Exported ' + users.length + ' users');
    
    // Export tasks and issues for each user
    const tasks = [];
    const issues = [];
    
    users.forEach(user => {
      const userData = exportUserData(user.email, user.userName);
      tasks.push(...userData.tasks);
      issues.push(...userData.issues);
    });
    
    console.log('✅ Exported ' + tasks.length + ' tasks');
    console.log('✅ Exported ' + issues.length + ' issues');
    
    // Create export data object
    const exportData = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      users: users,
      tasks: tasks,
      issues: issues,
      metadata: {
        totalUsers: users.length,
        totalTasks: tasks.length,
        totalIssues: issues.length
      }
    };
    
    // Save to Google Drive as JSON
    const fileName = 'migration_export_' + new Date().toISOString().split('T')[0] + '.json';
    const file = DriveApp.createFile(fileName, JSON.stringify(exportData, null, 2), MimeType.PLAIN_TEXT);
    
    console.log('');
    console.log('🎉 EXPORT COMPLETE!');
    console.log('📁 File: ' + fileName);
    console.log('🔗 URL: ' + file.getUrl());
    console.log('');
    console.log('📊 Summary:');
    console.log('  - Users: ' + users.length);
    console.log('  - Tasks: ' + tasks.length);
    console.log('  - Issues: ' + issues.length);
    
    return {
      success: true,
      fileUrl: file.getUrl(),
      fileName: fileName,
      summary: exportData.metadata
    };
    
  } catch (error) {
    console.log('❌ Export error: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Export users from Master Sheet
 */
function exportUsers() {
  const users = [];
  
  try {
    const masterFiles = DriveApp.searchFiles('title:"📊 MASTER - Akıllı İş Takip Sistemi"');
    
    if (!masterFiles.hasNext()) {
      console.log('⚠️ Master sheet not found');
      return users;
    }
    
    const masterFile = masterFiles.next();
    const masterSheet = SpreadsheetApp.openById(masterFile.getId()).getSheetByName('📋 Yönetim Paneli');
    
    if (!masterSheet) {
      console.log('⚠️ Management panel sheet not found');
      return users;
    }
    
    const data = masterSheet.getDataRange().getValues();
    
    // Start from row 10 (index 9) - skip headers
    for (let i = 9; i < data.length; i++) {
      if (!data[i][0] || !data[i][0].includes('@')) continue; // Skip if no valid email
      
      users.push({
        email: data[i][0],
        userName: data[i][1] || data[i][0].split('@')[0],
        fileUrl: data[i][2] || '',
        createdAt: data[i][3] ? new Date(data[i][3]).toISOString() : new Date().toISOString(),
        role: 'employee', // Default role
        department: null // Will be set manually if needed
      });
    }
    
  } catch (error) {
    console.log('⚠️ Error exporting users: ' + error.message);
  }
  
  return users;
}

/**
 * Export tasks and issues for a specific user
 */
function exportUserData(userEmail, userName) {
  const tasks = [];
  const issues = [];
  
  try {
    const fileName = '📊 Akıllı İş Takip Sistemi - ' + userName;
    const files = DriveApp.searchFiles('title:"' + fileName + '"');
    
    if (!files.hasNext()) {
      console.log('⚠️ User file not found: ' + userName);
      return { tasks, issues };
    }
    
    const file = files.next();
    const spreadsheet = SpreadsheetApp.openById(file.getId());
    
    // Export routine tasks
    const routineTasks = exportSheetTasks(spreadsheet, '🔴 Rutin İşler', 'routine', userEmail);
    tasks.push(...routineTasks);
    
    // Export project tasks
    const projectTasks = exportSheetTasks(spreadsheet, '🔵 Proje İşleri', 'project', userEmail);
    tasks.push(...projectTasks);
    
    // Export one-time tasks
    const oneTimeTasks = exportSheetTasks(spreadsheet, '🟢 Tek Seferlik İşler', 'one_time', userEmail);
    tasks.push(...oneTimeTasks);
    
    // Export issues
    const userIssues = exportSheetIssues(spreadsheet, '🚨 Sorun Takibi', userEmail);
    issues.push(...userIssues);
    
  } catch (error) {
    console.log('⚠️ Error exporting data for ' + userName + ': ' + error.message);
  }
  
  return { tasks, issues };
}

/**
 * Export tasks from a specific sheet
 */
function exportSheetTasks(spreadsheet, sheetName, category, userEmail) {
  const tasks = [];
  
  try {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) return tasks;
    
    const data = sheet.getDataRange().getValues();
    
    // Start from row 4 (index 3) - skip headers
    for (let i = 3; i < data.length; i++) {
      if (!data[i][0] || !data[i][1]) continue; // Skip if no date or task name
      
      let task = {
        userEmail: userEmail,
        category: category,
        createdAt: data[i][0] ? new Date(data[i][0]).toISOString() : new Date().toISOString()
      };
      
      if (category === 'routine') {
        // Rutin İşler: Tarih, Görev Adı, Kategori, Sıklık/Tekrar, Başlangıç, Bitiş, Durum, Notlar
        task.title = data[i][1] || '';
        task.tags = data[i][2] ? [data[i][2]] : [];
        task.frequency = data[i][3] || ''; // Preserved for reference
        task.startTime = data[i][4] || '';
        task.endTime = data[i][5] || '';
        task.status = mapStatus(data[i][6]);
        task.description = (data[i][7] || '') + (task.frequency ? '\n\nSıklık: ' + task.frequency : '');
        task.priority = 'medium'; // Default
        
      } else if (category === 'project') {
        // Proje İşleri: Tarih, Proje Adı, Görev Adı, Öncelik, Proje Başlangıç, Proje Bitiş, Görev Hedef, İlerleme %, Durum, Notlar
        task.title = data[i][2] || data[i][1] || '';
        task.tags = data[i][1] ? [data[i][1]] : []; // Project name as tag
        task.priority = mapPriority(data[i][3]);
        task.projectStart = data[i][4] ? new Date(data[i][4]).toISOString() : null;
        task.projectEnd = data[i][5] ? new Date(data[i][5]).toISOString() : null;
        task.dueDate = data[i][6] ? new Date(data[i][6]).toISOString() : null;
        task.progressPercentage = parseProgress(data[i][7]);
        task.status = mapStatus(data[i][8]);
        task.description = data[i][9] || '';
        
      } else if (category === 'one_time') {
        // Tek Seferlik İşler: Tarih, Görev Adı, Kategori, Öncelik, Bitiş Tarihi, Başlangıç Saati, Bitiş Saati, Süre (dk), Durum, Tamamlanma, Notlar
        task.title = data[i][1] || '';
        task.tags = data[i][2] ? [data[i][2]] : [];
        task.priority = mapPriority(data[i][3]);
        task.dueDate = data[i][4] ? new Date(data[i][4]).toISOString() : null;
        task.startTime = data[i][5] || '';
        task.endTime = data[i][6] || '';
        task.estimatedHours = data[i][7] ? Math.round(parseInt(data[i][7]) / 60 * 10) / 10 : null; // Convert minutes to hours
        task.status = mapStatus(data[i][8]);
        task.completedAt = data[i][9] ? new Date(data[i][9]).toISOString() : null;
        task.description = data[i][10] || '';
      }
      
      tasks.push(task);
    }
    
  } catch (error) {
    console.log('⚠️ Error exporting sheet ' + sheetName + ': ' + error.message);
  }
  
  return tasks;
}

/**
 * Export issues from Sorun Takibi sheet
 */
function exportSheetIssues(spreadsheet, sheetName, userEmail) {
  const issues = [];
  
  try {
    const sheet = spreadsheet.getSheetByName(sheetName);
    if (!sheet) return issues;
    
    const data = sheet.getDataRange().getValues();
    
    // Start from row 4 (index 3) - skip headers
    for (let i = 3; i < data.length; i++) {
      if (!data[i][0] || !data[i][3]) continue; // Skip if no date or description
      
      // Sorun Takibi: Tarih, Görev/Proje, Sorun Türü, Açıklama, Öncelik, Durum, Çözüm, Çözüm Tarihi, Notlar
      const issue = {
        reportedBy: userEmail,
        suggestedAssignee: userEmail, // Default to reporter, will be updated manually if needed
        title: (data[i][1] || 'Sorun') + ' - ' + (data[i][2] || 'Genel'),
        description: data[i][3] || '',
        issueType: data[i][2] || 'Genel',
        priority: mapPriority(data[i][4]),
        status: mapIssueStatus(data[i][5]),
        resolutionNotes: data[i][6] || null,
        resolvedAt: data[i][7] ? new Date(data[i][7]).toISOString() : null,
        notes: data[i][8] || '',
        createdAt: data[i][0] ? new Date(data[i][0]).toISOString() : new Date().toISOString()
      };
      
      issues.push(issue);
    }
    
  } catch (error) {
    console.log('⚠️ Error exporting issues: ' + error.message);
  }
  
  return issues;
}

/**
 * Map Google Sheets status to Supabase status
 */
function mapStatus(sheetsStatus) {
  if (!sheetsStatus) return 'not_started';
  
  const status = sheetsStatus.toLowerCase();
  
  if (status.includes('tamamlan') || status.includes('completed')) return 'completed';
  if (status.includes('devam') || status.includes('progress')) return 'in_progress';
  if (status.includes('iptal') || status.includes('ertelendi') || status.includes('blocked')) return 'blocked';
  
  return 'not_started';
}

/**
 * Map Google Sheets priority to Supabase priority
 */
function mapPriority(sheetsPriority) {
  if (!sheetsPriority) return 'medium';
  
  const priority = sheetsPriority.toLowerCase();
  
  if (priority.includes('düşük') || priority.includes('low')) return 'low';
  if (priority.includes('yüksek') || priority.includes('high')) return 'high';
  if (priority.includes('kritik') || priority.includes('critical')) return 'critical';
  
  return 'medium';
}

/**
 * Map Google Sheets issue status to Supabase issue status
 */
function mapIssueStatus(sheetsStatus) {
  if (!sheetsStatus) return 'pending_assignment';
  
  const status = sheetsStatus.toLowerCase();
  
  if (status.includes('çözüldü') || status.includes('resolved')) return 'resolved';
  if (status.includes('atandı') || status.includes('assigned')) return 'assigned';
  if (status.includes('devam') || status.includes('progress')) return 'in_progress';
  if (status.includes('kapalı') || status.includes('closed')) return 'closed';
  
  return 'pending_assignment';
}

/**
 * Parse progress percentage from string
 */
function parseProgress(progressStr) {
  if (!progressStr) return 0;
  
  const match = progressStr.toString().match(/\d+/);
  if (match) {
    const value = parseInt(match[0]);
    return Math.min(100, Math.max(0, value));
  }
  
  return 0;
}

/**
 * Test export with a single user
 */
function testExportSingleUser() {
  const testEmail = 'seba.miletos@gmail.com';
  const testUserName = 'Emir Yiğit';
  
  console.log('🧪 Testing export for: ' + testUserName);
  
  const userData = exportUserData(testEmail, testUserName);
  
  console.log('📊 Results:');
  console.log('  - Tasks: ' + userData.tasks.length);
  console.log('  - Issues: ' + userData.issues.length);
  console.log('');
  console.log('Sample task:', JSON.stringify(userData.tasks[0], null, 2));
  console.log('');
  console.log('Sample issue:', JSON.stringify(userData.issues[0], null, 2));
  
  return userData;
}
