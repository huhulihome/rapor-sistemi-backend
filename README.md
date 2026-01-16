# Modern Office System - Backend

Node.js + Express + TypeScript ile geliştirilmiş modern ofis yönetim sistemi backend API.

## Teknolojiler

- **Node.js** - Runtime environment
- **Express** - Web framework
- **TypeScript** - Type safety
- **Supabase** - Database & Authentication
- **Nodemailer** - Email notifications

## Kurulum

1. Bağımlılıkları yükleyin:
```bash
npm install
```

2. Environment variables dosyasını oluşturun:
```bash
cp .env.example .env
```

3. `.env` dosyasını kendi bilgilerinizle güncelleyin:
```
PORT=3000
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_KEY=your_supabase_service_key
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_gmail_app_password
```

## Geliştirme

Development server'ı başlatın:
```bash
npm run dev
```

API http://localhost:3000 adresinde çalışacaktır.

## Build

Production build oluşturun:
```bash
npm run build
```

Production server'ı başlatın:
```bash
npm start
```

## Proje Yapısı

```
src/
├── routes/          # API route handlers
├── middleware/      # Express middleware
├── services/        # Business logic & external services
├── types/           # TypeScript type definitions
├── config/          # Configuration
├── app.ts           # Express app setup
└── index.ts         # Server entry point
```

## API Endpoints

### Health Check
- `GET /health` - Server health status

### Authentication (Coming soon)
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/logout` - User logout

### Tasks (Coming soon)
- `GET /api/tasks` - Get all tasks
- `POST /api/tasks` - Create new task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

### Issues (Coming soon)
- `GET /api/issues` - Get all issues
- `POST /api/issues` - Create new issue
- `PUT /api/issues/:id/assign` - Assign issue to user

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| PORT | Server port | No (default: 3000) |
| NODE_ENV | Environment (development/production) | No |
| SUPABASE_URL | Supabase project URL | Yes |
| SUPABASE_SERVICE_KEY | Supabase service role key | Yes |
| GMAIL_USER | Gmail account for sending emails | No |
| GMAIL_APP_PASSWORD | Gmail app password | No |
| FRONTEND_URL | Frontend application URL | No |
| CORS_ORIGIN | Allowed CORS origin | No |

## Özellikler

- ✅ Express + TypeScript
- ✅ Supabase entegrasyonu
- ✅ JWT authentication middleware
- ✅ Error handling middleware
- ✅ CORS configuration
- ✅ Environment variables
- ✅ Type-safe development
- ✅ Hot reload (tsx watch)
