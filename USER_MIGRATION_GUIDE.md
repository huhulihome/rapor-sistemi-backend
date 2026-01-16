# User Account Migration Guide

Complete guide for migrating user accounts from Google Sheets to Supabase Auth with password reset flow.

## Overview

This guide covers:
1. Extracting user data from Google Sheets
2. Validating and cleaning user data
3. Creating Supabase Auth accounts
4. Generating temporary passwords
5. Password reset flow
6. User onboarding

## Prerequisites

- Supabase project with Auth enabled
- Service role key from Supabase
- SMTP configured for password reset emails
- Frontend URL configured

## Step 1: Extract User Data

### From Google Sheets Export

If you've already run the full data export:

```bash
# Extract just the users from the export
node -e "const data = require('./migration_export.json'); console.log(JSON.stringify(data.users, null, 2))" > users.json
```

### Manual User List

Create a `users.json` file:

```json
[
  {
    "email": "admin@company.com",
    "full_name": "Admin User",
    "role": "admin",
    "department": "Management"
  },
  {
    "email": "employee1@company.com",
    "full_name": "Employee One",
    "role": "employee",
    "department": "Sales"
  }
]
```

## Step 2: Validate User Data

Before migration, validate the user data:

```bash
npm run migration:user-validate users.json
```

This checks:
- ✅ Valid email format
- ✅ No duplicate emails
- ✅ Full name present
- ✅ Valid role (admin/employee)

**Fix any validation errors before proceeding!**

## Step 3: Check for Existing Users

Check if any users already exist in Supabase:

```bash
# Create emails list
node -e "const users = require('./users.json'); console.log(JSON.stringify(users.map(u => u.email), null, 2))" > emails.json

# Check existing
npm run migration:user-check emails.json
```

If users exist:
- **Option A:** Skip them during migration
- **Option B:** Delete and recreate (⚠️ loses data)
- **Option C:** Update existing profiles only

## Step 4: Migrate User Accounts

Run the migration:

```bash
npm run migration:user-migrate users.json
```

This will:
1. Create Supabase Auth accounts
2. Generate secure temporary passwords
3. Create user profiles
4. Save credentials to `user_credentials.json`

**⚠️ IMPORTANT:** Save `user_credentials.json` securely! This contains temporary passwords.

### Migration Output

```
👥 Starting user account migration...

Creating account for: admin@company.com...
✅ Created: admin@company.com (admin)

Creating account for: employee1@company.com...
✅ Created: employee1@company.com (employee)

🔑 Credentials saved to: user_credentials.json

📊 Migration Summary:
   ✅ Users created: 2/2
   ❌ Users failed: 0/2
```

## Step 5: Distribute Credentials

### Option A: Email Credentials (Recommended)

Send credentials via encrypted email or secure messaging:

**Email Template:**
```
Subject: Your New Office System Account

Hello [Name],

Your account has been created in the Modern Office System.

Login URL: https://your-app.vercel.app/login
Email: [email]
Temporary Password: [temp_password]

IMPORTANT: 
1. Log in using the credentials above
2. Change your password immediately
3. Do not share these credentials

If you have any issues, contact IT support.

Best regards,
IT Team
```

### Option B: Password Reset Flow (More Secure)

Instead of sending temporary passwords, trigger password reset:

```bash
npm run migration:user-reset-passwords emails.json
```

This sends password reset emails to all users. Users will:
1. Receive reset email
2. Click link to set their own password
3. Log in with new password

**Advantages:**
- More secure (no password transmission)
- Users choose their own password
- Automatic email delivery

**Disadvantages:**
- Requires SMTP configuration
- Users must check email
- May end up in spam

## Step 6: User Onboarding

### First Login Instructions

Provide users with:

1. **Login URL:** `https://your-app.vercel.app/login`
2. **Email:** Their work email
3. **Password:** Temporary password OR reset link
4. **Instructions:**
   - Log in with provided credentials
   - Change password immediately
   - Update profile information
   - Set notification preferences

### Password Change Flow

Users should change password on first login:

1. Log in with temporary password
2. Navigate to Profile page
3. Click "Change Password"
4. Enter new password (min 8 characters)
5. Confirm new password
6. Save changes

### Profile Setup

Users should complete their profile:

- ✅ Full name (verify correct)
- ✅ Department (if applicable)
- ✅ Avatar (optional)
- ✅ Notification preferences
- ✅ Email notifications
- ✅ Push notifications

## Troubleshooting

### User Can't Log In

**Problem:** "Invalid login credentials"

**Solutions:**
1. Verify email is correct (case-sensitive)
2. Check if password was copied correctly (no extra spaces)
3. Try password reset flow
4. Check if user account was created successfully
5. Verify email is confirmed in Supabase dashboard

### Password Reset Email Not Received

**Problem:** User didn't receive reset email

**Solutions:**
1. Check spam/junk folder
2. Verify SMTP configuration
3. Check Supabase Auth email templates
4. Verify email address is correct
5. Resend reset email

### User Already Exists Error

**Problem:** "User already exists" during migration

**Solutions:**
1. Check if user was created in previous migration attempt
2. Use check-existing command to identify duplicates
3. Skip existing users or delete and recreate
4. Update profile data only (don't recreate auth user)

### Profile Not Created

**Problem:** User can log in but has no profile

**Solutions:**
1. Check migration logs for profile creation errors
2. Manually create profile in Supabase dashboard
3. Re-run migration for specific user
4. Check RLS policies on profiles table

## Security Best Practices

### Temporary Passwords

- ✅ Use strong, random passwords (16+ characters)
- ✅ Include uppercase, lowercase, numbers, special chars
- ✅ Never reuse passwords
- ✅ Store credentials securely
- ✅ Delete credentials file after distribution
- ✅ Force password change on first login

### Credential Distribution

- ✅ Use encrypted email or secure messaging
- ✅ Never send via plain text email
- ✅ Never post in public channels
- ✅ Verify recipient before sending
- ✅ Use password reset flow when possible
- ✅ Set expiration on temporary passwords

### Post-Migration

- ✅ Delete `user_credentials.json` after distribution
- ✅ Monitor for failed login attempts
- ✅ Verify all users can log in
- ✅ Enable 2FA for admin accounts
- ✅ Review RLS policies
- ✅ Audit user permissions

## Advanced Scenarios

### Bulk User Import

For large user lists (100+ users):

```bash
# Split into batches
split -l 50 users.json users_batch_

# Migrate each batch
for file in users_batch_*; do
  npm run migration:user-migrate $file
  sleep 5  # Rate limiting
done
```

### Selective Migration

Migrate only specific users:

```bash
# Create filtered list
node -e "const users = require('./users.json'); const filtered = users.filter(u => u.department === 'Sales'); console.log(JSON.stringify(filtered, null, 2))" > sales_users.json

# Migrate filtered list
npm run migration:user-migrate sales_users.json
```

### Update Existing Users

Update profiles without recreating auth accounts:

```typescript
// Custom script
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(url, key);

for (const user of users) {
  await supabase
    .from('profiles')
    .update({
      full_name: user.full_name,
      department: user.department
    })
    .eq('email', user.email);
}
```

## Rollback

If migration fails and you need to remove users:

```bash
# ⚠️ WARNING: This deletes all user data!
npm run migration:user-rollback emails.json
```

This will:
- Delete auth users
- Delete profiles
- Delete all user data

**Only use if you need to completely restart!**

## Verification Checklist

After migration:

- [ ] All users created successfully
- [ ] Credentials saved securely
- [ ] Credentials distributed to users
- [ ] Users can log in
- [ ] Profiles are complete
- [ ] Roles are correct
- [ ] Departments are assigned
- [ ] Email notifications work
- [ ] Password reset works
- [ ] Users can change passwords
- [ ] RLS policies work correctly
- [ ] Admin users have admin access
- [ ] Employee users have limited access

## Support

### Common Questions

**Q: How long are temporary passwords valid?**
A: Temporary passwords don't expire, but users should change them immediately.

**Q: Can users use the same password as before?**
A: Yes, but it's not recommended. Encourage new passwords.

**Q: What if a user forgets their new password?**
A: Use the password reset flow to send a reset email.

**Q: Can I migrate users in batches?**
A: Yes, split the users.json file and migrate in batches.

**Q: What happens to existing tasks/issues?**
A: They're linked by email, then updated to use user IDs after migration.

## Timeline

- User data extraction: 10 minutes
- Data validation: 5 minutes
- Migration execution: 5-15 minutes (depending on user count)
- Credential distribution: 1-2 hours
- User onboarding: 1-3 days

**Total technical time:** ~30 minutes
**Total project time:** 2-4 days (including user coordination)

## Next Steps

After user migration:

1. ✅ Migrate tasks and issues (link to user IDs)
2. ✅ Test user access and permissions
3. ✅ Train users on new system
4. ✅ Monitor for issues
5. ✅ Collect user feedback
6. ✅ Archive old system
