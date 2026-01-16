# Backend Test Setup Documentation

## Overview

This project uses **Vitest** for unit and integration testing of the Node.js/Express backend.

## Configuration

- **Config File**: `vitest.config.ts`
- **Setup File**: `src/test/setup.ts`
- **Test Pattern**: `**/*.test.ts`

## Running Tests

```bash
# Run tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui
```

## Writing Tests

### API Endpoint Tests

Example test file (`routes/tasks.test.ts`):

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../app';

describe('Tasks API', () => {
  beforeEach(async () => {
    // Setup test database
  });

  it('GET /api/tasks should return tasks', async () => {
    const response = await request(app)
      .get('/api/tasks')
      .set('Authorization', 'Bearer test-token');
    
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('tasks');
  });

  it('POST /api/tasks should create a task', async () => {
    const newTask = {
      title: 'Test Task',
      description: 'Test Description',
      priority: 'high'
    };

    const response = await request(app)
      .post('/api/tasks')
      .set('Authorization', 'Bearer test-token')
      .send(newTask);
    
    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
  });
});
```

### Service Layer Tests

Example test file (`services/email.test.ts`):

```typescript
import { describe, it, expect, vi } from 'vitest';
import { sendTaskAssignmentEmail } from './email';
import nodemailer from 'nodemailer';

// Mock nodemailer
vi.mock('nodemailer');

describe('Email Service', () => {
  it('should send task assignment email', async () => {
    const mockSendMail = vi.fn().mockResolvedValue({ messageId: '123' });
    vi.mocked(nodemailer.createTransport).mockReturnValue({
      sendMail: mockSendMail,
    } as any);

    await sendTaskAssignmentEmail('user@example.com', {
      id: '1',
      title: 'Test Task',
      priority: 'high'
    });

    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: expect.stringContaining('Test Task')
      })
    );
  });
});
```

### Database Tests

Example test file (`database/tasks.test.ts`):

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { supabase } from '../services/supabase';

describe('Task Database Operations', () => {
  beforeEach(async () => {
    // Setup test data
  });

  afterEach(async () => {
    // Cleanup test data
  });

  it('should create a task', async () => {
    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: 'Test Task',
        description: 'Test Description',
        assigned_to: 'user-id'
      })
      .select()
      .single();

    expect(error).toBeNull();
    expect(data).toHaveProperty('id');
    expect(data.title).toBe('Test Task');
  });
});
```

## Test Structure

```
backend/
├── src/
│   ├── test/
│   │   └── setup.ts           # Vitest setup
│   ├── routes/
│   │   └── **/*.test.ts       # Route tests
│   ├── services/
│   │   └── **/*.test.ts       # Service tests
│   └── middleware/
│       └── **/*.test.ts       # Middleware tests
└── vitest.config.ts           # Vitest configuration
```

## Testing Best Practices

### 1. Use Test Doubles

```typescript
import { vi } from 'vitest';

// Mock external services
vi.mock('../services/supabase', () => ({
  supabase: {
    from: vi.fn(),
    auth: {
      signIn: vi.fn()
    }
  }
}));
```

### 2. Test Database Isolation

```typescript
beforeEach(async () => {
  // Use test database or transactions
  await setupTestDatabase();
});

afterEach(async () => {
  // Rollback or cleanup
  await cleanupTestDatabase();
});
```

### 3. Test Authentication

```typescript
// Helper function for authenticated requests
const authenticatedRequest = (token: string) => {
  return request(app).set('Authorization', `Bearer ${token}`);
};

it('should require authentication', async () => {
  const response = await request(app).get('/api/tasks');
  expect(response.status).toBe(401);
});
```

### 4. Test Error Handling

```typescript
it('should handle database errors', async () => {
  vi.mocked(supabase.from).mockImplementation(() => {
    throw new Error('Database connection failed');
  });

  const response = await request(app).get('/api/tasks');
  expect(response.status).toBe(500);
  expect(response.body).toHaveProperty('error');
});
```

## Environment Variables

Create a `.env.test` file for test-specific configuration:

```env
NODE_ENV=test
SUPABASE_URL=https://test.supabase.co
SUPABASE_ANON_KEY=test-key
DATABASE_URL=postgresql://test:test@localhost:5432/test_db
```

Load test environment in `src/test/setup.ts`:

```typescript
import { config } from 'dotenv';
config({ path: '.env.test' });
```

## Coverage

Generate test coverage reports:

```bash
# Run tests with coverage
npm test -- --coverage

# View coverage report
open coverage/index.html
```

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
name: Backend Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
```

## Troubleshooting

### Tests Timing Out

Increase timeout in `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    testTimeout: 10000, // 10 seconds
  },
});
```

### Database Connection Issues

Ensure test database is running and accessible:

```bash
# Check PostgreSQL connection
psql -h localhost -U postgres -d test_db
```

### Mock Issues

Clear mocks between tests:

```typescript
import { vi } from 'vitest';

afterEach(() => {
  vi.clearAllMocks();
});
```

## Requirements Validation

This test setup validates:

- **Requirement 12.1**: Testing infrastructure for backend services
- **Requirement 12.2**: API endpoint testing
- **Requirement 12.4**: Performance and reliability testing
