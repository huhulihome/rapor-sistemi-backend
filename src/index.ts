import app from './app.js';
import { config } from './config/index.js';
import { verifyEmailConfig } from './services/email.js';
import { scheduleDailyDigest } from './services/dailyDigest.js';

const PORT = config.port;

app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${config.nodeEnv}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  
  // Verify email service configuration
  const emailReady = await verifyEmailConfig();
  if (emailReady) {
    console.log('✉️  Email service configured and ready');
    
    // Schedule daily digest emails
    scheduleDailyDigest();
    console.log('📅 Daily digest emails scheduled');
  } else {
    console.warn('⚠️  Email service not configured - notifications will be skipped');
  }
});
