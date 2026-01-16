# Supabase Database Setup

Bu rehber, Modern Office System için Supabase veritabanını kurma adımlarını içerir.

## Adım 1: Supabase Projesi Oluşturma

1. [Supabase](https://supabase.com) web sitesine gidin
2. "Start your project" butonuna tıklayın
3. GitHub hesabınızla giriş yapın (ücretsiz)
4. "New Project" butonuna tıklayın
5. Proje bilgilerini girin:
   - **Name**: modern-office-system
   - **Database Password**: Güçlü bir şifre oluşturun (kaydedin!)
   - **Region**: Size en yakın bölgeyi seçin
   - **Pricing Plan**: Free tier seçin
6. "Create new project" butonuna tıklayın
7. Proje oluşturulmasını bekleyin (1-2 dakika)

## Adım 2: Database Schema Oluşturma

1. Supabase dashboard'da sol menüden **SQL Editor**'ü açın
2. "New query" butonuna tıklayın
3. `migrations/001_initial_schema.sql` dosyasının içeriğini kopyalayın
4. SQL Editor'e yapıştırın
5. "Run" butonuna tıklayın
6. ✅ Success mesajını görmelisiniz

## Adım 3: Row Level Security Kurulumu

1. SQL Editor'de yeni bir query açın
2. `migrations/002_row_level_security.sql` dosyasının içeriğini kopyalayın
3. SQL Editor'e yapıştırın
4. "Run" butonuna tıklayın
5. ✅ Success mesajını görmelisiniz

## Adım 4: API Keys ve URL'leri Alma

1. Supabase dashboard'da sol menüden **Settings** > **API**'ye gidin
2. Aşağıdaki bilgileri kopyalayın:

### Frontend için (.env):
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### Backend için (.env):
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here
```

⚠️ **ÖNEMLİ**: 
- Frontend'de **anon key** kullanın (public)
- Backend'de **service_role key** kullanın (private, asla frontend'de kullanmayın!)

## Adım 5: Authentication Ayarları

1. Sol menüden **Authentication** > **Providers**'a gidin
2. **Email** provider'ı etkinleştirin
3. **Confirm email** seçeneğini isteğe bağlı olarak kapatabilirsiniz (development için)
4. **Site URL** ayarını yapın:
   - Development: `http://localhost:5173`
   - Production: Vercel URL'iniz

## Adım 6: İlk Admin Kullanıcısı Oluşturma

### Yöntem 1: Supabase Dashboard (Önerilen)
1. Sol menüden **Authentication** > **Users**'a gidin
2. "Add user" > "Create new user" butonuna tıklayın
3. Email ve şifre girin
4. "Create user" butonuna tıklayın
5. Kullanıcı oluşturulduktan sonra, SQL Editor'de şu komutu çalıştırın:

```sql
-- Admin kullanıcısı oluşturma
INSERT INTO profiles (id, email, full_name, role, department)
VALUES (
  'user-uuid-from-auth-users',  -- Auth Users tablosundan UUID'yi kopyalayın
  'admin@example.com',
  'Admin User',
  'admin',
  'Management'
);
```

### Yöntem 2: SQL ile
```sql
-- Önce auth.users'a kullanıcı ekleyin (Supabase otomatik hash'ler)
-- Sonra profile ekleyin
INSERT INTO profiles (id, email, full_name, role, department)
SELECT 
  id,
  email,
  'Admin User',
  'admin',
  'Management'
FROM auth.users
WHERE email = 'admin@example.com';
```

## Adım 7: Database Yapısını Kontrol Etme

SQL Editor'de şu sorguları çalıştırarak kurulumu doğrulayın:

```sql
-- Tabloları listele
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';

-- RLS politikalarını kontrol et
SELECT schemaname, tablename, policyname 
FROM pg_policies 
WHERE schemaname = 'public';

-- Profilleri listele
SELECT id, email, full_name, role 
FROM profiles;
```

## Adım 8: Test Verileri (Opsiyonel)

Development ortamında test için örnek veriler eklemek isterseniz:

1. `seed.sql` dosyasını açın
2. UUID'leri gerçek kullanıcı UUID'leriyle değiştirin
3. SQL Editor'de çalıştırın

## Database Tabloları

### profiles
Kullanıcı profil bilgileri (auth.users'ın uzantısı)

### tasks
Görev yönetimi sistemi

### issues
Sorun bildirimi ve takip sistemi (Ana özellik)

### activity_log
Sistem aktivite kayıtları

## Row Level Security (RLS)

Tüm tablolarda RLS aktif. Politikalar:

- **Profiles**: Herkes görebilir, sadece kendi profilini düzenleyebilir
- **Tasks**: Atanan kişi ve admin görebilir/düzenleyebilir
- **Issues**: İlgili kişiler ve admin görebilir, sadece admin atayabilir
- **Activity Log**: Kendi loglarını görebilir, admin hepsini görebilir

## Realtime Subscriptions

Supabase otomatik olarak tüm tablolar için realtime desteği sağlar. Frontend'de kullanmak için:

```typescript
const subscription = supabase
  .channel('tasks')
  .on('postgres_changes', 
    { event: '*', schema: 'public', table: 'tasks' },
    (payload) => console.log(payload)
  )
  .subscribe();
```

## Backup ve Maintenance

Supabase Free tier otomatik olarak:
- ✅ Günlük backup alır (7 gün saklar)
- ✅ Point-in-time recovery sağlar
- ✅ SSL/TLS encryption kullanır
- ✅ Automatic updates yapar

## Troubleshooting

### "relation does not exist" hatası
- Migration'ları sırayla çalıştırdığınızdan emin olun
- SQL Editor'de hata mesajını kontrol edin

### RLS policy hatası
- Kullanıcının doğru role sahip olduğundan emin olun
- `is_admin()` fonksiyonunun çalıştığını test edin

### Connection hatası
- API keys'lerin doğru olduğundan emin olun
- Supabase projesinin aktif olduğunu kontrol edin

## Sonraki Adımlar

1. ✅ Database kurulumu tamamlandı
2. ➡️ Backend .env dosyasını güncelleyin
3. ➡️ Frontend .env dosyasını güncelleyin
4. ➡️ Backend'i başlatın: `npm run dev`
5. ➡️ Frontend'i başlatın: `npm run dev`

## Kaynaklar

- [Supabase Documentation](https://supabase.com/docs)
- [Row Level Security Guide](https://supabase.com/docs/guides/auth/row-level-security)
- [Realtime Subscriptions](https://supabase.com/docs/guides/realtime)
