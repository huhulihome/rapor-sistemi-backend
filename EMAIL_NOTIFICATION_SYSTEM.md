# Email Notification System

## Overview

The Modern Office System includes a comprehensive email notification system that sends automated emails for task assignments, issue resolutions, and daily digests. The system uses Gmail SMTP via Nodemailer with built-in retry logic and queue management.

## Features

### 1. Email Service Setup ✅
- **Gmail SMTP Integration**: Uses Nodemailer with Gmail SMTP
- **Queue System**: Automatic email queuing with retry logic (max 3 retries)
- **Template System**: Beautiful, responsive HTML email templates
- **Error Handling**: Graceful failure handling with logging

### 2. Task Assignment Emails ✅
- **New Task Assignment**: Sent when a task is created and assigned
- **Task Reassignment**: Sent when a task is reassigned to a different user
- **Direct Links**: Includes clickable links to view tasks in the app
- **Rich Content**: Shows task title, description, priority, category, and due date

### 3. Issue to Task Conversion Emails ✅
- **Issue Assignment**: Sent when admin converts an issue to a task
- **Reporter Information**: Shows who reported the issue
- **Priority Indication**: Visual priority badges (low, medium, high, critical)
- **Action Links**: Direct link to the created task

### 4. Daily Digest Emails ✅
- **Scheduled Delivery**: Automatically sent every day at 8:00 AM
- **Overdue Tasks**: Lists tasks past their due date
- **Today's Tasks**: Shows tasks due today
- **Pending Issues**: For admins, shows unassigned issues
- **Smart Content**: Only sends if there's content to report
- **User Preferences**: Respects user notification settings

## Configuration

### Environment Variables

Add these to your `.env` file:

```env
# Email Configuration
GMAIL_USER=your_email@gmail.com
GMAIL_APP_PASSWORD=your_gmail_app_password

# Frontend URL (for email links)
FRONTEND_URL=http://localhost:5173
```

### Gmail App Password Setup

1. Go to your Google Account settings
2. Navigate to Security → 2-Step Verification
3. Scroll down to "App passwords"
4. Generate a new app password for "Mail"
5. Copy the 16-character password to `GMAIL_APP_PASSWORD`

## API Endpoints

### Notification Preferences

#### Get User Preferences
```http
GET /api/notifications/preferences
Authorization: Bearer <token>
```

Response:
```json
{
  "data": {
    "email": true,
    "push": true
  }
}
```

#### Update User Preferences
```http
PUT /api/notifications/preferences
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": true,
  "push": false
}
```

### Daily Digest Management

#### Trigger Daily Digest (Admin Only)
```http
POST /api/notifications/digest/trigger
Authorization: Bearer <admin-token>
```

Manually triggers daily digest for all users.

#### Send Digest to Current User
```http
POST /api/notifications/digest/send-to-me
Authorization: Bearer <token>
```

Sends a daily digest email to the authenticated user immediately.

## Email Templates

### 1. Task Assignment Template

**Subject**: `📋 Yeni Görev: [Task Title]`

**Content**:
- Recipient name
- Task title and description
- Priority badge (color-coded)
- Category
- Due date (if set)
- Direct link to task

### 2. Issue to Task Template

**Subject**: `🔧 Yeni Sorun Görevi: [Issue Title]`

**Content**:
- Recipient name
- Issue title and description
- Priority badge
- Reporter name
- Direct link to task

### 3. Daily Digest Template

**Subject**: `📊 Günlük Özet - [Date]`

**Content**:
- Overdue tasks section (if any)
- Today's tasks section (if any)
- Pending issues section (admin only, if any)
- Success message if no pending items
- Direct link to tasks page

## Architecture

### Email Queue System

```typescript
interface EmailJob {
  to: string;
  subject: string;
  html: string;
  retries: number;
  maxRetries: number;
}
```

- **Queue Processing**: FIFO (First In, First Out)
- **Retry Logic**: Up to 3 attempts with 5-second delays
- **Error Handling**: Failed emails are logged and removed after max retries

### Daily Digest Scheduler

```typescript
scheduleDailyDigest()
```

- Calculates time until next 8:00 AM
- Schedules first run
- Sets up recurring 24-hour interval
- Runs automatically on server startup

## Usage Examples

### Sending Task Assignment Email

```typescript
import { queueEmail, emailTemplates } from './services/email.js';

// When creating a task
const emailHtml = emailTemplates.taskAssignment({
  recipientName: assignee.full_name,
  taskTitle: task.title,
  taskDescription: task.description,
  priority: task.priority,
  category: task.category,
  dueDate: task.due_date,
  taskId: task.id,
});

queueEmail(
  assignee.email,
  `📋 Yeni Görev: ${task.title}`,
  emailHtml
);
```

### Sending Issue to Task Email

```typescript
const emailHtml = emailTemplates.issueToTask({
  recipientName: assignee.full_name,
  issueTitle: issue.title,
  issueDescription: issue.description,
  priority: issue.priority,
  reportedBy: reporter.full_name,
  taskId: task.id,
});

queueEmail(
  assignee.email,
  `🔧 Yeni Sorun Görevi: ${issue.title}`,
  emailHtml
);
```

### Manual Daily Digest

```typescript
import { sendDailyDigestToUser } from './services/dailyDigest.js';

// Send to specific user
await sendDailyDigestToUser(userId);
```

## Testing

### Run Email Template Tests

```bash
npm test
```

Tests cover:
- Template generation with all fields
- Missing optional fields handling
- Date formatting
- HTML structure validation
- Content inclusion verification

### Manual Testing

1. **Test Task Assignment Email**:
   - Create a new task via API
   - Assign it to a user
   - Check the user's email inbox

2. **Test Daily Digest**:
   ```bash
   curl -X POST http://localhost:3000/api/notifications/digest/send-to-me \
     -H "Authorization: Bearer YOUR_TOKEN"
   ```

3. **Test Email Configuration**:
   - Server logs will show: `✉️ Email service configured and ready`
   - Or: `⚠️ Email service not configured`

## Troubleshooting

### Emails Not Sending

1. **Check Gmail App Password**:
   - Verify `GMAIL_APP_PASSWORD` is correct
   - Ensure 2-Step Verification is enabled on Google Account

2. **Check Server Logs**:
   ```
   Failed to send email to user@example.com: [error details]
   ```

3. **Verify Email Configuration**:
   - Server startup should show email service status
   - Check `.env` file has correct values

### Daily Digest Not Scheduled

1. **Check Server Logs**:
   ```
   📅 Daily digest emails scheduled
   Daily digest scheduled for [date/time]
   ```

2. **Verify Email Service**:
   - Daily digest only schedules if email service is configured

### User Not Receiving Emails

1. **Check Notification Preferences**:
   ```bash
   GET /api/notifications/preferences
   ```

2. **Check Spam Folder**:
   - Gmail might filter automated emails

3. **Verify User Email**:
   - Ensure user profile has valid email address

## Performance Considerations

- **Queue Processing**: Emails are sent asynchronously
- **Rate Limiting**: 1-second delay between digest emails
- **Retry Logic**: Failed emails retry up to 3 times
- **Memory Usage**: Queue is in-memory (consider Redis for production)

## Future Enhancements

- [ ] Redis-based queue for distributed systems
- [ ] Email templates in multiple languages
- [ ] Email analytics and tracking
- [ ] Customizable digest schedule per user
- [ ] Email preview in UI before sending
- [ ] Batch email sending optimization

## Security

- **App Passwords**: Uses Gmail app passwords (not account password)
- **Environment Variables**: Sensitive data in `.env` (not committed)
- **HTTPS**: All email links use HTTPS in production
- **User Preferences**: Users can opt-out of email notifications

## Compliance

- **Unsubscribe**: Users can disable email notifications in preferences
- **Privacy**: No email tracking or analytics
- **Data Protection**: Email addresses stored securely in database
- **Automated Notice**: All emails include "automated message" disclaimer

---

**Implementation Status**: ✅ Complete

All sub-tasks completed:
- ✅ 6.1 Email Service Setup
- ✅ 6.2 Task Assignment Emails  
- ✅ 6.3 Daily Digest Emails

**Requirements Validated**:
- ✅ 10.1: Task and issue assignment notifications
- ✅ 10.2: Daily digest emails
- ✅ 10.3: Configurable notification preferences
- ✅ 10.4: Nodemailer with Gmail SMTP
- ✅ 10.5: Direct links in emails
