# Data Migration Guide

Complete guide for migrating data from Google Sheets to Supabase PostgreSQL database.

## Prerequisites

- Node.js 18+ installed
- Access to Google Sheets with existing data
- Supabase project created
- Supabase service role key (from project settings)

## Migration Steps

### Step 1: Export Data from Google Sheets

1. Open Google Apps Script editor for your Google Sheets project
2. Copy the contents of `backend/src/migration/exportFromSheets.js`
3. Paste into a new script file in Google Apps Script
4. Run the function `exportAllDataToJSON()`
5. Download the generated JSON file from your Google Drive
6. Save it as `migration_export.json` in the `backend/src/migration/` directory

**Test Export (Optional):**
```javascript
// In Google Apps Script, run this to test with a single user
testExportSingleUser()
```

### Step 2: Transform Data

Transform the exported data to match Supabase schema:

```bash
cd backend
npm run migration:transform migration_export.json transformed_data.json
```

This will:
- Map Google Sheets structure to Supabase schema
- Generate UUIDs for all entities
- Transform status and priority values
- Create user ID mappings
- Generate temporary passwords for users

Output: `transformed_data.json`

### Step 3: Prepare Supabase

1. Ensure your Supabase project is set up
2. Run database migrations:
```bash
# If using Supabase CLI
supabase db push

# Or apply migrations manually through Supabase dashboard
```

3. Set environment variables:
```bash
# Create .env file in backend directory
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**⚠️ Important:** Use the SERVICE ROLE KEY, not the anon key. The service role key bypasses Row Level Security (RLS) which is necessary for migration.

### Step 4: Import to Supabase

Import the transformed data:

```bash
npm run migration:import transformed_data.json
```

This will:
- Create user accounts in Supabase Auth
- Create user profiles
- Import all tasks
- Import all issues
- Generate `user_credentials.json` with temporary passwords

**⚠️ Important:** The import process will create user accounts with temporary passwords. Save the `user_credentials.json` file securely!

### Step 5: Validate Migration

Verify the migration was successful:

```bash
npm run migration:validate transformed_data.json
```

This checks:
- User count matches
- Task count matches
- Issue count matches
- Admin user exists
- All tasks are assigned
- All issues have reporters
- Foreign key integrity

### Step 6: User Account Setup

After successful migration, users need to:

1. Receive their temporary credentials (from `user_credentials.json`)
2. Log in to the system
3. Change their password immediately

**Send credentials securely:**
- Use encrypted email
- Or use a password manager
- Or send via secure messaging

**Example email template:**
```
Subject: Your New Office System Account

Hello [Name],

Your account has been created in the new Modern Office System.

Email: [email]
Temporary Password: [temp_password]

Please log in and change your password immediately:
https://your-app.vercel.app/login

Best regards,
IT Team
```

## Data Mapping Reference

### Users
| Google Sheets | Supabase |
|--------------|----------|
| Email | email |
| Kullanıcı Adı | full_name |
| - | role (admin/employee) |
| - | department |

### Tasks - Rutin İşler (Routine Tasks)
| Google Sheets | Supabase |
|--------------|----------|
| Görev Adı | title |
| Kategori | tags[] |
| Sıklık/Tekrar | description (preserved) |
| Durum | status |
| Notlar | description |
| - | category: 'routine' |

### Tasks - Proje İşleri (Project Tasks)
| Google Sheets | Supabase |
|--------------|----------|
| Proje Adı | tags[] |
| Görev Adı | title |
| Öncelik | priority |
| Görev Hedef | due_date |
| İlerleme % | progress_percentage |
| Durum | status |
| Notlar | description |
| - | category: 'project' |

### Tasks - Tek Seferlik İşler (One-time Tasks)
| Google Sheets | Supabase |
|--------------|----------|
| Görev Adı | title |
| Kategori | tags[] |
| Öncelik | priority |
| Bitiş Tarihi | due_date |
| Süre (dk) | estimated_hours (converted) |
| Durum | status |
| Notlar | description |
| - | category: 'one_time' |

### Issues - Sorun Takibi
| Google Sheets | Supabase |
|--------------|----------|
| Görev/Proje | title (prefix) |
| Sorun Türü | tags[] |
| Açıklama | description |
| Öncelik | priority |
| Durum | status |
| Çözüm | resolution_notes |
| Çözüm Tarihi | resolved_at |

## Status Mapping

### Task Status
- `Bekliyor` → `not_started`
- `Devam Ediyor` → `in_progress`
- `Tamamlandı` → `completed`
- `İptal` → `blocked`
- `Ertelendi` → `blocked`

### Issue Status
- `Açık` → `pending_assignment`
- `Atandı` → `assigned`
- `Devam Ediyor` → `in_progress`
- `Çözüldü` → `resolved`
- `Kapalı` → `closed`

### Priority
- `Düşük` → `low`
- `Orta` → `medium`
- `Yüksek` → `high`
- `Kritik` → `critical`

## Troubleshooting

### Export Issues

**Problem:** "Master sheet not found"
- **Solution:** Ensure the master sheet is named exactly "📊 MASTER - Akıllı İş Takip Sistemi"

**Problem:** "User file not found"
- **Solution:** Check that user files follow the naming pattern "📊 Akıllı İş Takip Sistemi - [UserName]"

### Transform Issues

**Problem:** "Cannot read property of undefined"
- **Solution:** Check that the export JSON file is valid and complete

**Problem:** "User not found for task"
- **Solution:** Ensure all users are exported before their tasks

### Import Issues

**Problem:** "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
- **Solution:** Create `.env` file with correct environment variables

**Problem:** "Failed to create auth user: User already exists"
- **Solution:** User already exists in Supabase. Either skip or delete existing users first

**Problem:** "Row Level Security policy violation"
- **Solution:** Ensure you're using the SERVICE ROLE KEY, not the anon key

### Validation Issues

**Problem:** "User count mismatch"
- **Solution:** Check import logs for failed user creations. Re-run import for missing users

**Problem:** "Orphaned task assignments"
- **Solution:** Some tasks reference users that don't exist. Check user import logs

## Rollback

If migration fails and you need to start over:

```bash
# Delete all migrated data (⚠️ DESTRUCTIVE)
npm run migration:rollback
```

This will:
- Delete all tasks
- Delete all issues
- Delete all profiles
- Delete all auth users

**⚠️ Warning:** This is irreversible! Only use if you need to completely restart the migration.

## Post-Migration Tasks

1. ✅ Verify all users can log in
2. ✅ Check that tasks are visible to correct users
3. ✅ Verify issues are properly assigned
4. ✅ Test real-time updates
5. ✅ Test email notifications
6. ✅ Update any hardcoded references to old system
7. ✅ Archive or delete Google Sheets (after confirming migration success)

## Support

If you encounter issues:

1. Check the logs in console output
2. Review the `user_credentials.json` file
3. Run validation script to identify specific problems
4. Check Supabase dashboard for data
5. Review RLS policies if users can't see their data

## Migration Checklist

- [ ] Export data from Google Sheets
- [ ] Transform data to Supabase format
- [ ] Set up Supabase environment variables
- [ ] Run database migrations
- [ ] Import data to Supabase
- [ ] Validate migration success
- [ ] Save user credentials securely
- [ ] Send credentials to users
- [ ] Verify users can log in
- [ ] Test core functionality
- [ ] Archive old Google Sheets
- [ ] Update documentation
- [ ] Train users on new system

## Estimated Timeline

- Export: 5-10 minutes
- Transform: 1-2 minutes
- Import: 5-15 minutes (depending on data size)
- Validation: 2-5 minutes
- User setup: 1-2 days (coordinating with users)

**Total technical time:** ~30 minutes
**Total project time:** 2-3 days (including user coordination)
