import { supabase } from './supabase.js';
import { queueEmail, emailTemplates } from './email.js';

interface DigestData {
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
}

/**
 * Send daily digest email to a specific user
 */
export const sendDailyDigestToUser = async (userId: string): Promise<void> => {
  try {
    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, email, full_name, notification_preferences')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error(`Failed to fetch profile for user ${userId}:`, profileError);
      return;
    }

    // Check if user has email notifications enabled
    const notificationPrefs = profile.notification_preferences as { email?: boolean } | null;
    if (notificationPrefs && notificationPrefs.email === false) {
      console.log(`User ${profile.full_name} has email notifications disabled. Skipping digest.`);
      return;
    }

    // Get overdue tasks
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const { data: overdueTasks } = await supabase
      .from('tasks')
      .select('id, title, due_date, priority')
      .eq('assigned_to', userId)
      .lt('due_date', today.toISOString())
      .in('status', ['not_started', 'in_progress', 'blocked'])
      .order('due_date', { ascending: true })
      .limit(10);

    // Get today's tasks
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const { data: todayTasks } = await supabase
      .from('tasks')
      .select('id, title, priority')
      .eq('assigned_to', userId)
      .gte('due_date', today.toISOString())
      .lt('due_date', tomorrow.toISOString())
      .in('status', ['not_started', 'in_progress'])
      .order('priority', { ascending: false })
      .limit(10);

    // Get pending issues (for admins only)
    let pendingIssues: any[] = [];
    if (profile.id) {
      const { data: userProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', profile.id)
        .single();

      if (userProfile?.role === 'admin') {
        const { data: issues } = await supabase
          .from('issues')
          .select(`
            id, 
            title, 
            priority,
            reported_by_profile:profiles!issues_reported_by_fkey(full_name)
          `)
          .eq('status', 'pending_assignment')
          .order('created_at', { ascending: false })
          .limit(10);

        pendingIssues = issues?.map(issue => ({
          id: issue.id,
          title: issue.title,
          priority: issue.priority,
          reportedBy: (issue.reported_by_profile as any)?.full_name || 'Unknown',
        })) || [];
      }
    }

    // Prepare digest data
    const digestData: DigestData = {
      recipientName: profile.full_name,
      overdueTasks: overdueTasks?.map(task => ({
        id: task.id,
        title: task.title,
        dueDate: task.due_date!,
        priority: task.priority,
      })) || [],
      todayTasks: todayTasks?.map(task => ({
        id: task.id,
        title: task.title,
        priority: task.priority,
      })) || [],
      pendingIssues,
    };

    // Only send email if there's something to report
    const hasContent = digestData.overdueTasks.length > 0 || 
                      digestData.todayTasks.length > 0 || 
                      digestData.pendingIssues.length > 0;

    if (!hasContent) {
      console.log(`No digest content for user ${profile.full_name}. Skipping email.`);
      return;
    }

    // Generate and send email
    const emailHtml = emailTemplates.dailyDigest(digestData);
    
    queueEmail(
      profile.email,
      `📊 Günlük Özet - ${new Date().toLocaleDateString('tr-TR', { 
        day: 'numeric', 
        month: 'long', 
        year: 'numeric' 
      })}`,
      emailHtml
    );

    console.log(`Daily digest sent to ${profile.full_name} (${profile.email})`);
  } catch (error) {
    console.error(`Error sending daily digest to user ${userId}:`, error);
  }
};

/**
 * Send daily digest to all users
 */
export const sendDailyDigestToAll = async (): Promise<void> => {
  try {
    console.log('Starting daily digest email job...');

    // Get all active users
    const { data: users, error } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .order('full_name');

    if (error) {
      console.error('Failed to fetch users for daily digest:', error);
      return;
    }

    if (!users || users.length === 0) {
      console.log('No users found for daily digest');
      return;
    }

    console.log(`Sending daily digest to ${users.length} users...`);

    // Send digest to each user
    for (const user of users) {
      await sendDailyDigestToUser(user.id);
      
      // Add small delay between emails to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('Daily digest job completed');
  } catch (error) {
    console.error('Error in daily digest job:', error);
  }
};

/**
 * Schedule daily digest emails
 * This should be called once when the server starts
 */
export const scheduleDailyDigest = (): void => {
  // Calculate time until next 8 AM
  const now = new Date();
  const next8AM = new Date();
  next8AM.setHours(8, 0, 0, 0);
  
  // If it's already past 8 AM today, schedule for tomorrow
  if (now.getHours() >= 8) {
    next8AM.setDate(next8AM.getDate() + 1);
  }
  
  const timeUntilNext8AM = next8AM.getTime() - now.getTime();
  
  console.log(`Daily digest scheduled for ${next8AM.toLocaleString('tr-TR')}`);
  
  // Schedule first run
  setTimeout(() => {
    sendDailyDigestToAll();
    
    // Then schedule to run every 24 hours
    setInterval(() => {
      sendDailyDigestToAll();
    }, 24 * 60 * 60 * 1000); // 24 hours
  }, timeUntilNext8AM);
};

/**
 * Manual trigger for testing (can be called via API endpoint)
 */
export const triggerDailyDigestNow = async (): Promise<{ success: boolean; message: string }> => {
  try {
    await sendDailyDigestToAll();
    return {
      success: true,
      message: 'Daily digest emails queued successfully',
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};
