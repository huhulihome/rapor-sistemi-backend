import { Router } from 'express';
import type { Response } from 'express';
import { supabase } from '../services/supabase.js';
import { authenticateUser, requireAdmin, type AuthRequest } from '../middleware/auth.js';
import { cacheMiddleware } from '../middleware/cache.js';
import type { ApiResponse } from '../types/api.js';

const router = Router();

// All routes require authentication
router.use(authenticateUser);

// GET /api/analytics/dashboard - Get dashboard metrics (cached for 5 minutes)
router.get('/dashboard', cacheMiddleware(5 * 60 * 1000), async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const isAdmin = req.user?.role === 'admin';

    // Build base queries based on user role
    let tasksQuery = supabase.from('tasks').select('*', { count: 'exact', head: false });
    let issuesQuery = supabase.from('issues').select('*', { count: 'exact', head: false });

    // Non-admin users only see their own data
    if (!isAdmin) {
      tasksQuery = tasksQuery.or(`assigned_to.eq.${userId},created_by.eq.${userId}`);
      issuesQuery = issuesQuery.or(`reported_by.eq.${userId},suggested_assignee_id.eq.${userId},assigned_to.eq.${userId}`);
    }

    // Get total tasks
    const { count: totalTasks } = await tasksQuery;

    // Get completed tasks
    const { count: completedTasks } = await tasksQuery.eq('status', 'completed');

    // Get in-progress tasks
    const { count: inProgressTasks } = await tasksQuery.eq('status', 'in_progress');

    // Get pending issues
    const { count: pendingIssues } = await issuesQuery.eq('status', 'pending_assignment');

    // Get overdue tasks
    const now = new Date().toISOString();
    const { count: overdueTasks } = await tasksQuery
      .lt('due_date', now)
      .neq('status', 'completed');

    // Get task completion rate
    const completionRate = totalTasks && totalTasks > 0
      ? Math.round((completedTasks || 0) / totalTasks * 100)
      : 0;

    // Get tasks by priority
    const { data: tasksByPriority } = await tasksQuery;
    const priorityBreakdown = {
      low: tasksByPriority?.filter(t => t.priority === 'low').length || 0,
      medium: tasksByPriority?.filter(t => t.priority === 'medium').length || 0,
      high: tasksByPriority?.filter(t => t.priority === 'high').length || 0,
      critical: tasksByPriority?.filter(t => t.priority === 'critical').length || 0,
    };

    // Get tasks by status
    const statusBreakdown = {
      not_started: tasksByPriority?.filter(t => t.status === 'not_started').length || 0,
      in_progress: inProgressTasks || 0,
      completed: completedTasks || 0,
      blocked: tasksByPriority?.filter(t => t.status === 'blocked').length || 0,
    };

    // Get issues by priority
    const { data: issuesByPriority } = await issuesQuery;
    const issuePriorityBreakdown = {
      low: issuesByPriority?.filter(i => i.priority === 'low').length || 0,
      medium: issuesByPriority?.filter(i => i.priority === 'medium').length || 0,
      high: issuesByPriority?.filter(i => i.priority === 'high').length || 0,
      critical: issuesByPriority?.filter(i => i.priority === 'critical').length || 0,
    };

    // Get issues by status
    const issueStatusBreakdown = {
      pending_assignment: pendingIssues || 0,
      assigned: issuesByPriority?.filter(i => i.status === 'assigned').length || 0,
      in_progress: issuesByPriority?.filter(i => i.status === 'in_progress').length || 0,
      resolved: issuesByPriority?.filter(i => i.status === 'resolved').length || 0,
      closed: issuesByPriority?.filter(i => i.status === 'closed').length || 0,
    };

    const metrics = {
      tasks: {
        total: totalTasks || 0,
        completed: completedTasks || 0,
        inProgress: inProgressTasks || 0,
        overdue: overdueTasks || 0,
        completionRate,
        byPriority: priorityBreakdown,
        byStatus: statusBreakdown,
      },
      issues: {
        total: issuesByPriority?.length || 0,
        pending: pendingIssues || 0,
        byPriority: issuePriorityBreakdown,
        byStatus: issueStatusBreakdown,
      },
    };

    res.json({
      data: metrics,
    } as ApiResponse<typeof metrics>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// GET /api/analytics/task-completion-trend - Get task completion trend over time (cached for 5 minutes)
router.get('/task-completion-trend', cacheMiddleware(5 * 60 * 1000), async (req: AuthRequest, res: Response) => {
  try {
    const { days = '30' } = req.query;
    const daysNum = parseInt(days as string, 10);
    const userId = req.user?.id;
    const isAdmin = req.user?.role === 'admin';

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    // Build query based on user role
    let query = supabase
      .from('tasks')
      .select('created_at, updated_at, status')
      .gte('created_at', startDate.toISOString())
      .lte('created_at', endDate.toISOString());

    if (!isAdmin) {
      query = query.or(`assigned_to.eq.${userId},created_by.eq.${userId}`);
    }

    const { data: tasks, error } = await query;

    if (error) {
      res.status(400).json({
        error: 'Database error',
        message: error.message,
      } as ApiResponse<null>);
      return;
    }

    // Group tasks by date
    const trendData: { date: string; created: number; completed: number }[] = [];

    for (let i = 0; i < daysNum; i++) {
      const date = new Date(startDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];

      const created = tasks?.filter(t => {
        const taskDate = new Date(t.created_at).toISOString().split('T')[0];
        return taskDate === dateStr;
      }).length || 0;

      const completed = tasks?.filter(t => {
        if (t.status !== 'completed' || !t.updated_at) return false;
        const completedDate = new Date(t.updated_at).toISOString().split('T')[0];
        return completedDate === dateStr;
      }).length || 0;

      trendData.push({ date: dateStr, created, completed });
    }

    res.json({
      data: trendData,
    } as ApiResponse<typeof trendData>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// GET /api/analytics/user-workload - Get user workload distribution (admin only, cached for 3 minutes)
router.get('/user-workload', requireAdmin, cacheMiddleware(3 * 60 * 1000), async (_req: AuthRequest, res: Response) => {
  try {
    // Get all users
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id, full_name, email');

    if (usersError) {
      res.status(400).json({
        error: 'Database error',
        message: usersError.message,
      } as ApiResponse<null>);
      return;
    }

    // Get task counts for each user
    const workloadData = await Promise.all(
      (users || []).map(async (user) => {
        const { count: totalTasks } = await supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_to', user.id);

        const { count: completedTasks } = await supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_to', user.id)
          .eq('status', 'completed');

        const { count: inProgressTasks } = await supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_to', user.id)
          .eq('status', 'in_progress');

        return {
          userId: user.id,
          userName: user.full_name,
          email: user.email,
          totalTasks: totalTasks || 0,
          completedTasks: completedTasks || 0,
          inProgressTasks: inProgressTasks || 0,
          completionRate: totalTasks && totalTasks > 0
            ? Math.round((completedTasks || 0) / totalTasks * 100)
            : 0,
        };
      })
    );

    res.json({
      data: workloadData,
    } as ApiResponse<typeof workloadData>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// GET /api/analytics/issue-resolution-metrics - Get issue resolution metrics
router.get('/issue-resolution-metrics', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const isAdmin = req.user?.role === 'admin';

    // Build query based on user role
    let query = supabase.from('issues').select('*');

    if (!isAdmin) {
      query = query.or(`reported_by.eq.${userId},suggested_assignee_id.eq.${userId},assigned_to.eq.${userId}`);
    }

    const { data: issues, error } = await query;

    if (error) {
      res.status(400).json({
        error: 'Database error',
        message: error.message,
      } as ApiResponse<null>);
      return;
    }

    // Calculate resolution metrics
    const totalIssues = issues?.length || 0;
    const resolvedIssues = issues?.filter(i => i.status === 'resolved' || i.status === 'closed').length || 0;
    const pendingIssues = issues?.filter(i => i.status === 'pending_assignment').length || 0;
    const assignedIssues = issues?.filter(i => i.status === 'assigned' || i.status === 'in_progress').length || 0;

    // Calculate average resolution time for resolved issues
    const resolvedWithTimes = issues?.filter(i =>
      (i.status === 'resolved' || i.status === 'closed') &&
      i.resolved_at &&
      i.created_at
    ) || [];

    let avgResolutionTimeHours = 0;
    if (resolvedWithTimes.length > 0) {
      const totalResolutionTime = resolvedWithTimes.reduce((sum, issue) => {
        const created = new Date(issue.created_at).getTime();
        const resolved = new Date(issue.resolved_at!).getTime();
        return sum + (resolved - created);
      }, 0);
      avgResolutionTimeHours = Math.round(totalResolutionTime / resolvedWithTimes.length / (1000 * 60 * 60));
    }

    const metrics = {
      total: totalIssues,
      resolved: resolvedIssues,
      pending: pendingIssues,
      assigned: assignedIssues,
      resolutionRate: totalIssues > 0 ? Math.round((resolvedIssues / totalIssues) * 100) : 0,
      avgResolutionTimeHours,
    };

    res.json({
      data: metrics,
    } as ApiResponse<typeof metrics>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// GET /api/analytics/employees-summary - Get employees summary with scores (admin only)
router.get('/employees-summary', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    // Get all employees
    const { data: users, error: usersError } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, job_description, score, weekly_hours, avatar_url');

    if (usersError) {
      res.status(400).json({ error: 'Database error', message: usersError.message } as ApiResponse<null>);
      return;
    }

    // Get task data for each user
    const employeeSummary = await Promise.all(
      (users || []).map(async (user) => {
        // Active tasks
        const { count: activeTasks } = await supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_to', user.id)
          .neq('status', 'completed');

        // Completed this week
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const { count: completedThisWeek } = await supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_to', user.id)
          .eq('status', 'completed')
          .gte('completed_at', weekStart.toISOString());

        // Late tasks
        const { count: lateTasks } = await supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_to', user.id)
          .eq('late_completion', true);

        // Overdue tasks
        const now = new Date().toISOString();
        const { count: overdueTasks } = await supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_to', user.id)
          .lt('deadline', now)
          .neq('status', 'completed');

        return {
          ...user,
          activeTasks: activeTasks || 0,
          completedThisWeek: completedThisWeek || 0,
          lateTasks: lateTasks || 0,
          overdueTasks: overdueTasks || 0,
        };
      })
    );

    res.json({ data: employeeSummary } as ApiResponse<typeof employeeSummary>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// GET /api/analytics/recommendations - Get AI recommendations (admin only)
router.get('/recommendations', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    // Get all users with their workload
    const { data: users } = await supabase
      .from('profiles')
      .select('id, full_name, job_description, score');

    const recommendations: Array<{
      type: 'workload' | 'performance' | 'suggestion';
      severity: 'info' | 'warning' | 'critical';
      title: string;
      description: string;
      affectedUsers?: string[];
    }> = [];

    // Analyze workload for each user
    const workloadData = await Promise.all(
      (users || []).map(async (user) => {
        const { count: activeTasks } = await supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_to', user.id)
          .neq('status', 'completed');

        const { count: overdueTasks } = await supabase
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_to', user.id)
          .lt('deadline', new Date().toISOString())
          .neq('status', 'completed');

        return {
          ...user,
          activeTasks: activeTasks || 0,
          overdueTasks: overdueTasks || 0,
        };
      })
    );

    // Find overloaded users (more than 10 active tasks)
    const overloadedUsers = workloadData.filter(u => u.activeTasks > 10);
    if (overloadedUsers.length > 0) {
      recommendations.push({
        type: 'workload',
        severity: 'warning',
        title: 'Aşırı İş Yükü Tespit Edildi',
        description: `${overloadedUsers.length} çalışanın 10'dan fazla aktif görevi var. İş dağılımını dengelemeyi düşünün.`,
        affectedUsers: overloadedUsers.map(u => u.full_name),
      });
    }

    // Find underutilized users (less than 2 active tasks)
    const underutilizedUsers = workloadData.filter(u => u.activeTasks < 2);
    if (underutilizedUsers.length > 0) {
      recommendations.push({
        type: 'workload',
        severity: 'info',
        title: 'Düşük İş Yükü',
        description: `${underutilizedUsers.length} çalışanın 2'den az aktif görevi var. Bu kişilere yeni görevler atanabilir.`,
        affectedUsers: underutilizedUsers.map(u => u.full_name),
      });
    }

    // Find users with overdue tasks
    const usersWithOverdue = workloadData.filter(u => u.overdueTasks > 0);
    if (usersWithOverdue.length > 0) {
      recommendations.push({
        type: 'performance',
        severity: 'critical',
        title: 'Geciken Görevler',
        description: `${usersWithOverdue.length} çalışanın geciken görevleri var. Acil müdahale gerekebilir.`,
        affectedUsers: usersWithOverdue.map(u => `${u.full_name} (${u.overdueTasks} geciken)`),
      });
    }

    // Find low score users
    const lowScoreUsers = workloadData.filter(u => (u.score || 100) < 70);
    if (lowScoreUsers.length > 0) {
      recommendations.push({
        type: 'performance',
        severity: 'warning',
        title: 'Düşük Performans Puanı',
        description: `${lowScoreUsers.length} çalışanın performans puanı 70'in altında.`,
        affectedUsers: lowScoreUsers.map(u => u.full_name),
      });
    }

    res.json({ data: recommendations } as ApiResponse<typeof recommendations>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// GET /api/analytics/late-tasks - Get all late tasks (admin only)
router.get('/late-tasks', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('tasks')
      .select('*, assigned_to_profile:profiles!tasks_assigned_to_fkey(id, full_name, email)')
      .lt('deadline', now)
      .neq('status', 'completed')
      .order('deadline', { ascending: true });

    if (error) {
      res.status(400).json({ error: 'Database error', message: error.message } as ApiResponse<null>);
      return;
    }

    res.json({ data } as ApiResponse<typeof data>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

export default router;
