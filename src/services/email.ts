import nodemailer from 'nodemailer';
import { config } from '../config/index.js';

// Email transporter configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: config.email.user,
    pass: config.email.password,
  },
});

// Email queue for retry logic
interface EmailJob {
  to: string;
  subject: string;
  html: string;
  retries: number;
  maxRetries: number;
}

const emailQueue: EmailJob[] = [];
const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds

// Process email queue
const processEmailQueue = async () => {
  if (emailQueue.length === 0) return;

  const job = emailQueue[0];
  
  try {
    await sendEmailDirect(job.to, job.subject, job.html);
    emailQueue.shift(); // Remove successful job
    console.log(`Email sent successfully to ${job.to}`);
  } catch (error) {
    console.error(`Failed to send email to ${job.to}:`, error);
    
    if (job.retries < job.maxRetries) {
      job.retries++;
      console.log(`Retrying email to ${job.to} (attempt ${job.retries}/${job.maxRetries})`);
      
      // Move to end of queue for retry
      emailQueue.shift();
      emailQueue.push(job);
    } else {
      console.error(`Max retries reached for email to ${job.to}. Removing from queue.`);
      emailQueue.shift();
    }
  }
  
  // Process next job after delay
  if (emailQueue.length > 0) {
    setTimeout(processEmailQueue, RETRY_DELAY);
  }
};

// Direct email sending (internal use)
const sendEmailDirect = async (to: string, subject: string, html: string): Promise<void> => {
  if (!config.email.user || !config.email.password) {
    console.warn('Email service not configured. Skipping email send.');
    return;
  }

  const mailOptions = {
    from: config.email.user,
    to,
    subject,
    html,
  };

  await transporter.sendMail(mailOptions);
};

// Public API: Queue email with retry logic
export const queueEmail = (to: string, subject: string, html: string): void => {
  const job: EmailJob = {
    to,
    subject,
    html,
    retries: 0,
    maxRetries: MAX_RETRIES,
  };

  emailQueue.push(job);
  
  // Start processing if this is the first job
  if (emailQueue.length === 1) {
    processEmailQueue();
  }
};

// Email template helpers
export const emailTemplates = {
  // Base template wrapper
  baseTemplate: (content: string): string => `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
          color: white;
          padding: 30px 20px;
          border-radius: 8px 8px 0 0;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 24px;
        }
        .content {
          background: #ffffff;
          padding: 30px 20px;
          border: 1px solid #e5e7eb;
          border-top: none;
        }
        .card {
          background: #f9fafb;
          padding: 20px;
          border-radius: 8px;
          margin: 20px 0;
          border-left: 4px solid #2563eb;
        }
        .card h3 {
          margin: 0 0 10px 0;
          color: #1f2937;
        }
        .card p {
          margin: 5px 0;
          color: #4b5563;
        }
        .button {
          display: inline-block;
          background: #2563eb;
          color: white !important;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 6px;
          margin: 20px 0;
          font-weight: 500;
        }
        .button:hover {
          background: #1d4ed8;
        }
        .footer {
          background: #f9fafb;
          padding: 20px;
          border-radius: 0 0 8px 8px;
          text-align: center;
          font-size: 12px;
          color: #6b7280;
          border: 1px solid #e5e7eb;
          border-top: none;
        }
        .priority-badge {
          display: inline-block;
          padding: 4px 12px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
        }
        .priority-low { background: #dbeafe; color: #1e40af; }
        .priority-medium { background: #fef3c7; color: #92400e; }
        .priority-high { background: #fed7aa; color: #9a3412; }
        .priority-critical { background: #fecaca; color: #991b1b; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🏢 Modern Office System</h1>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p>Bu otomatik bir bildirimdir. Lütfen bu e-postayı yanıtlamayın.</p>
        <p>&copy; ${new Date().getFullYear()} Modern Office System. Tüm hakları saklıdır.</p>
      </div>
    </body>
    </html>
  `,

  // Task assignment email template
  taskAssignment: (data: {
    recipientName: string;
    taskTitle: string;
    taskDescription: string;
    priority: string;
    category: string;
    dueDate?: string;
    taskId: string;
  }): string => {
    const priorityClass = `priority-${data.priority}`;
    const dueDateText = data.dueDate 
      ? `<p><strong>Bitiş Tarihi:</strong> ${new Date(data.dueDate).toLocaleDateString('tr-TR', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric' 
        })}</p>`
      : '';

    const content = `
      <h2>Merhaba ${data.recipientName},</h2>
      <p>Size yeni bir görev atandı:</p>
      
      <div class="card">
        <h3>${data.taskTitle}</h3>
        <p><span class="priority-badge ${priorityClass}">${data.priority}</span></p>
        <p><strong>Kategori:</strong> ${data.category}</p>
        ${dueDateText}
        <p style="margin-top: 15px;"><strong>Açıklama:</strong></p>
        <p>${data.taskDescription || 'Açıklama bulunmuyor.'}</p>
      </div>
      
      <a href="${config.frontend.url}/tasks/${data.taskId}" class="button">
        Görevi Görüntüle
      </a>
      
      <p style="margin-top: 20px; color: #6b7280;">
        Görevinizi tamamladığınızda lütfen durumunu güncelleyin.
      </p>
    `;

    return emailTemplates.baseTemplate(content);
  },

  // Issue to task conversion email template
  issueToTask: (data: {
    recipientName: string;
    issueTitle: string;
    issueDescription: string;
    priority: string;
    reportedBy: string;
    taskId: string;
  }): string => {
    const priorityClass = `priority-${data.priority}`;

    const content = `
      <h2>Merhaba ${data.recipientName},</h2>
      <p>Bildirilen bir sorun size görev olarak atandı:</p>
      
      <div class="card">
        <h3>🔧 ${data.issueTitle}</h3>
        <p><span class="priority-badge ${priorityClass}">${data.priority}</span></p>
        <p><strong>Bildiren:</strong> ${data.reportedBy}</p>
        <p style="margin-top: 15px;"><strong>Sorun Detayı:</strong></p>
        <p>${data.issueDescription}</p>
      </div>
      
      <a href="${config.frontend.url}/tasks/${data.taskId}" class="button">
        Görevi Görüntüle ve Çözüme Başla
      </a>
      
      <p style="margin-top: 20px; color: #6b7280;">
        Bu sorun çözüm gerektiriyor. Lütfen en kısa sürede ilgilenin.
      </p>
    `;

    return emailTemplates.baseTemplate(content);
  },

  // Daily digest email template
  dailyDigest: (data: {
    recipientName: string;
    overdueTasks: Array<{
      id: string;
      title: string;
      dueDate: string;
      priority: string;
    }>;
    pendingIssues: Array<{
      id: string;
      title: string;
      priority: string;
      reportedBy: string;
    }>;
    todayTasks: Array<{
      id: string;
      title: string;
      priority: string;
    }>;
  }): string => {
    const overdueSection = data.overdueTasks.length > 0 ? `
      <div class="card" style="border-left-color: #dc2626;">
        <h3>⚠️ Gecikmiş Görevler (${data.overdueTasks.length})</h3>
        ${data.overdueTasks.map(task => `
          <div style="margin: 10px 0; padding: 10px; background: white; border-radius: 4px;">
            <p style="margin: 0;"><strong>${task.title}</strong></p>
            <p style="margin: 5px 0; font-size: 14px; color: #6b7280;">
              <span class="priority-badge priority-${task.priority}">${task.priority}</span>
              Bitiş: ${new Date(task.dueDate).toLocaleDateString('tr-TR')}
            </p>
          </div>
        `).join('')}
      </div>
    ` : '';

    const todaySection = data.todayTasks.length > 0 ? `
      <div class="card">
        <h3>📅 Bugün Yapılacaklar (${data.todayTasks.length})</h3>
        ${data.todayTasks.map(task => `
          <div style="margin: 10px 0; padding: 10px; background: white; border-radius: 4px;">
            <p style="margin: 0;"><strong>${task.title}</strong></p>
            <p style="margin: 5px 0; font-size: 14px;">
              <span class="priority-badge priority-${task.priority}">${task.priority}</span>
            </p>
          </div>
        `).join('')}
      </div>
    ` : '';

    const pendingSection = data.pendingIssues.length > 0 ? `
      <div class="card" style="border-left-color: #f59e0b;">
        <h3>🔔 Bekleyen Sorunlar (${data.pendingIssues.length})</h3>
        ${data.pendingIssues.map(issue => `
          <div style="margin: 10px 0; padding: 10px; background: white; border-radius: 4px;">
            <p style="margin: 0;"><strong>${issue.title}</strong></p>
            <p style="margin: 5px 0; font-size: 14px; color: #6b7280;">
              <span class="priority-badge priority-${issue.priority}">${issue.priority}</span>
              Bildiren: ${issue.reportedBy}
            </p>
          </div>
        `).join('')}
      </div>
    ` : '';

    const content = `
      <h2>Günaydın ${data.recipientName},</h2>
      <p>İşte bugünün özeti:</p>
      
      ${overdueSection}
      ${todaySection}
      ${pendingSection}
      
      ${!overdueSection && !todaySection && !pendingSection ? `
        <div class="card">
          <h3>✅ Harika!</h3>
          <p>Şu anda bekleyen göreviniz veya sorun bulunmuyor.</p>
        </div>
      ` : ''}
      
      <a href="${config.frontend.url}/tasks" class="button">
        Tüm Görevleri Görüntüle
      </a>
      
      <p style="margin-top: 20px; color: #6b7280;">
        Verimli bir gün geçirmeniz dileğiyle!
      </p>
    `;

    return emailTemplates.baseTemplate(content);
  },
};

// Verify email configuration
export const verifyEmailConfig = async (): Promise<boolean> => {
  if (!config.email.user || !config.email.password) {
    console.warn('Email service not configured');
    return false;
  }

  try {
    await transporter.verify();
    console.log('Email service is ready');
    return true;
  } catch (error) {
    console.error('Email service verification failed:', error);
    return false;
  }
};
