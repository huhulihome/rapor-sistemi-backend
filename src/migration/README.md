# Data Migration Tools

This directory contains scripts and tools for migrating data from the Google Sheets-based system to the Supabase PostgreSQL database.

## Migration Process

### Phase 1: Google Sheets Data Export
1. Export user data from Master Sheet
2. Export task data from individual user sheets
3. Export issue data from user sheets
4. Save as JSON files for transformation

### Phase 2: Data Transformation
1. Map Google Sheets structure to Supabase schema
2. Transform data types and formats
3. Generate UUIDs for relationships
4. Validate data integrity

### Phase 3: Supabase Import
1. Create user accounts in Supabase Auth
2. Import profiles data
3. Import tasks data
4. Import issues data
5. Verify data integrity

## Files

- `exportFromSheets.js` - Google Apps Script to export data from sheets
- `transformData.ts` - Transform exported data to match Supabase schema
- `importToSupabase.ts` - Import transformed data to Supabase
- `validateMigration.ts` - Validate migration success
- `rollback.ts` - Rollback migration if needed

## Usage

### Step 1: Export from Google Sheets
```bash
# Run the exportFromSheets.js script in Google Apps Script
# This will generate JSON files with exported data
```

### Step 2: Transform Data
```bash
npm run migration:transform
```

### Step 3: Import to Supabase
```bash
npm run migration:import
```

### Step 4: Validate
```bash
npm run migration:validate
```

## Data Mapping

### Users (Master Sheet → Supabase)
- Email → email
- Kullanıcı Adı → full_name
- Role (default: employee) → role
- Department (optional) → department

### Tasks (User Sheets → Supabase)
- Rutin İşler → category: 'routine'
- Proje İşleri → category: 'project'
- Tek Seferlik İşler → category: 'one_time'

#### Rutin İşler Mapping
- Görev Adı → title
- Kategori → tags
- Sıklık/Tekrar → description (preserved for reference)
- Durum → status (mapped: Bekliyor→not_started, Devam Ediyor→in_progress, Tamamlandı→completed)
- Notlar → description

#### Proje İşleri Mapping
- Proje Adı → tags
- Görev Adı → title
- Öncelik → priority (mapped: Düşük→low, Orta→medium, Yüksek→high, Kritik→critical)
- Görev Hedef → due_date
- İlerleme % → progress_percentage
- Durum → status
- Notlar → description

#### Tek Seferlik İşler Mapping
- Görev Adı → title
- Kategori → tags
- Öncelik → priority
- Bitiş Tarihi → due_date
- Durum → status
- Notlar → description

### Issues (Sorun Takibi → Supabase)
- Görev/Proje → title (prefix)
- Sorun Türü → tags
- Açıklama → description
- Öncelik → priority
- Durum → status (mapped: Açık→pending_assignment, Atandı→assigned, Çözüldü→resolved)
- Çözüm → resolution_notes
- Çözüm Tarihi → resolved_at

## Status Mapping

### Google Sheets → Supabase Status
- Bekliyor → not_started
- Devam Ediyor → in_progress
- Tamamlandı → completed
- İptal → blocked
- Ertelendi → blocked

### Priority Mapping
- Düşük → low
- Orta → medium
- Yüksek → high
- Kritik → critical

## Notes

- All dates are converted to ISO 8601 format
- Turkish characters are preserved
- Empty fields are handled gracefully
- Duplicate detection is performed
- Backup is created before import
