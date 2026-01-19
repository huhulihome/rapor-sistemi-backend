import { Router } from 'express';
import type { Response } from 'express';
import { supabase } from '../services/supabase.js';
import { authenticateUser, requireAdmin, type AuthRequest } from '../middleware/auth.js';
import type { CreateIssueRequest, AssignIssueRequest, ApiResponse } from '../types/api.js';
import { queueEmail, emailTemplates } from '../services/email.js';

const router = Router();

// All routes require authentication
router.use(authenticateUser);

// GET /api/issues - Get all issues with filtering
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const {
      status,
      priority,
      reported_by,
      assigned_to,
      suggested_assignee_id,
      sort_by = 'created_at',
      sort_order = 'desc',
      limit = '50',
      offset = '0'
    } = req.query;

    let query = supabase
      .from('issues')
      .select('*', { count: 'exact' });

    // Apply filters based on user role
    if (req.user?.role !== 'admin') {
      // Non-admin users can only see issues they're involved with
      query = query.or(`reported_by.eq.${req.user?.id},suggested_assignee_id.eq.${req.user?.id},assigned_to.eq.${req.user?.id}`);
    }

    // Apply additional filters
    if (status) {
      query = query.eq('status', status);
    }
    if (priority) {
      query = query.eq('priority', priority);
    }
    if (reported_by) {
      query = query.eq('reported_by', reported_by);
    }
    if (assigned_to) {
      query = query.eq('assigned_to', assigned_to);
    }
    if (suggested_assignee_id) {
      query = query.eq('suggested_assignee_id', suggested_assignee_id);
    }

    // Apply sorting
    const validSortFields = ['created_at', 'updated_at', 'priority', 'status', 'title'];
    const sortField = validSortFields.includes(sort_by as string) ? sort_by as string : 'created_at';
    const sortDirection = sort_order === 'asc' ? true : false;

    query = query.order(sortField, { ascending: sortDirection });

    // Apply pagination
    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);
    query = query.range(offsetNum, offsetNum + limitNum - 1);

    const { data, error, count } = await query;

    if (error) {
      res.status(400).json({
        error: 'Database error',
        message: error.message,
      } as ApiResponse<null>);
      return;
    }

    res.json({
      data,
      count,
      limit: limitNum,
      offset: offsetNum,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// GET /api/issues/:id - Get single issue by ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('issues')
      .select(`
        *,
        reported_by_profile:profiles!issues_reported_by_fkey(id, full_name, email, avatar_url),
        suggested_assignee_profile:profiles!issues_suggested_assignee_id_fkey(id, full_name, email, avatar_url),
        assigned_to_profile:profiles!issues_assigned_to_fkey(id, full_name, email, avatar_url)
      `)
      .eq('id', id)
      .single();

    if (error) {
      res.status(404).json({
        error: 'Not found',
        message: 'Issue not found',
      } as ApiResponse<null>);
      return;
    }

    // Check access permissions
    if (req.user?.role !== 'admin' &&
      data.reported_by !== req.user?.id &&
      data.suggested_assignee_id !== req.user?.id &&
      data.assigned_to !== req.user?.id) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to this issue',
      } as ApiResponse<null>);
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

// POST /api/issues - Create new issue
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const issueData: CreateIssueRequest = req.body;

    // Validate required fields
    if (!issueData.title || !issueData.description || !issueData.priority || !issueData.suggested_assignee_id) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Title, description, priority, and suggested assignee are required',
      } as ApiResponse<null>);
      return;
    }

    // Validate priority
    const validPriorities = ['low', 'medium', 'high', 'critical'];
    if (!validPriorities.includes(issueData.priority)) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Invalid priority value',
      } as ApiResponse<null>);
      return;
    }

    // Verify suggested assignee exists
    const { data: suggestedUser, error: userError } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', issueData.suggested_assignee_id)
      .single();

    if (userError || !suggestedUser) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Suggested assignee does not exist',
      } as ApiResponse<null>);
      return;
    }

    const { data, error } = await supabase
      .from('issues')
      .insert({
        title: issueData.title,
        description: issueData.description,
        priority: issueData.priority,
        suggested_assignee_id: issueData.suggested_assignee_id,
        reported_by: req.user?.id,
        status: 'pending_assignment',
      })
      .select(`
        *,
        reported_by_profile:profiles!issues_reported_by_fkey(id, full_name, email, avatar_url),
        suggested_assignee_profile:profiles!issues_suggested_assignee_id_fkey(id, full_name, email, avatar_url)
      `)
      .single();

    if (error) {
      res.status(400).json({
        error: 'Database error',
        message: error.message,
      } as ApiResponse<null>);
      return;
    }

    // Log activity
    await supabase
      .from('activity_log')
      .insert({
        user_id: req.user?.id,
        action: 'issue_created',
        entity_type: 'issue',
        entity_id: data.id,
        details: {
          title: data.title,
          priority: data.priority,
          suggested_assignee_id: data.suggested_assignee_id,
        },
      });

    res.status(201).json({
      data,
      message: 'Issue created successfully',
    } as ApiResponse<typeof data>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// PUT /api/issues/:id/assign - Admin assigns issue and creates task
router.put('/:id/assign', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const assignData: AssignIssueRequest = req.body;

    if (!assignData.assignee_id) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Assignee ID is required',
      } as ApiResponse<null>);
      return;
    }

    // Get existing issue
    const { data: existingIssue, error: fetchError } = await supabase
      .from('issues')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingIssue) {
      res.status(404).json({
        error: 'Not found',
        message: 'Issue not found',
      } as ApiResponse<null>);
      return;
    }

    // Check if issue is already assigned
    if (existingIssue.status !== 'pending_assignment') {
      res.status(400).json({
        error: 'Invalid operation',
        message: 'Issue has already been assigned',
      } as ApiResponse<null>);
      return;
    }

    // Verify assignee exists
    const { data: assignee, error: assigneeError } = await supabase
      .from('profiles')
      .select('id, email, full_name')
      .eq('id', assignData.assignee_id)
      .single();

    if (assigneeError || !assignee) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Assignee does not exist',
      } as ApiResponse<null>);
      return;
    }

    // Update issue if edited
    let issueTitle = existingIssue.title;
    let issueDescription = existingIssue.description;
    let issuePriority = existingIssue.priority;

    if (assignData.edited_issue) {
      const updatePayload: any = {};

      if (assignData.edited_issue.title) {
        updatePayload.title = assignData.edited_issue.title;
        issueTitle = assignData.edited_issue.title;
      }
      if (assignData.edited_issue.description) {
        updatePayload.description = assignData.edited_issue.description;
        issueDescription = assignData.edited_issue.description;
      }
      if (assignData.edited_issue.priority) {
        updatePayload.priority = assignData.edited_issue.priority;
        issuePriority = assignData.edited_issue.priority;
      }

      if (Object.keys(updatePayload).length > 0) {
        await supabase
          .from('issues')
          .update(updatePayload)
          .eq('id', id);
      }
    }

    // Create task from issue
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .insert({
        title: issueTitle,
        description: issueDescription,
        category: 'issue_resolution',
        priority: issuePriority,
        assigned_to: assignData.assignee_id,
        created_by: req.user?.id,
        related_issue_id: id,
        status: 'not_started',
        progress_percentage: 0,
      })
      .select('*, assigned_to_profile:profiles!tasks_assigned_to_fkey(id, full_name, email), created_by_profile:profiles!tasks_created_by_fkey(id, full_name, email)')
      .single();

    if (taskError) {
      res.status(400).json({
        error: 'Database error',
        message: `Failed to create task: ${taskError.message}`,
      } as ApiResponse<null>);
      return;
    }

    // Update issue status
    const { data: updatedIssue, error: updateError } = await supabase
      .from('issues')
      .update({
        status: 'assigned',
        assigned_to: assignData.assignee_id,
        assigned_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(`
        *,
        reported_by_profile:profiles!issues_reported_by_fkey(id, full_name, email, avatar_url),
        suggested_assignee_profile:profiles!issues_suggested_assignee_id_fkey(id, full_name, email, avatar_url),
        assigned_to_profile:profiles!issues_assigned_to_fkey(id, full_name, email, avatar_url)
      `)
      .single();

    if (updateError) {
      res.status(400).json({
        error: 'Database error',
        message: updateError.message,
      } as ApiResponse<null>);
      return;
    }

    // Log activity
    await supabase
      .from('activity_log')
      .insert({
        user_id: req.user?.id,
        action: 'issue_assigned',
        entity_type: 'issue',
        entity_id: id,
        details: {
          assigned_to: assignData.assignee_id,
          task_id: task.id,
        },
      });

    // Get reporter info for email
    const { data: reporter } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', existingIssue.reported_by)
      .single();

    // Send email notification to assignee
    const emailHtml = emailTemplates.issueToTask({
      recipientName: assignee.full_name,
      issueTitle: issueTitle,
      issueDescription: issueDescription,
      priority: issuePriority,
      reportedBy: reporter?.full_name || 'Unknown',
      taskId: task.id,
    });

    queueEmail(
      assignee.email,
      `🔧 Yeni Sorun Görevi: ${issueTitle}`,
      emailHtml
    );

    res.json({
      data: {
        issue: updatedIssue,
        task: task,
      },
      message: 'Issue successfully assigned and task created',
    } as ApiResponse<{ issue: typeof updatedIssue; task: typeof task }>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// PUT /api/issues/:id - Update issue (admin only)
router.put('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { title, description, priority, status, resolution_notes } = req.body;

    // Get existing issue
    const { data: existingIssue, error: fetchError } = await supabase
      .from('issues')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingIssue) {
      res.status(404).json({
        error: 'Not found',
        message: 'Issue not found',
      } as ApiResponse<null>);
      return;
    }

    const updatePayload: any = {};

    if (title !== undefined) updatePayload.title = title;
    if (description !== undefined) updatePayload.description = description;
    if (priority !== undefined) updatePayload.priority = priority;
    if (status !== undefined) {
      updatePayload.status = status;
      if (status === 'resolved' && !existingIssue.resolved_at) {
        updatePayload.resolved_at = new Date().toISOString();
      }
    }
    if (resolution_notes !== undefined) updatePayload.resolution_notes = resolution_notes;

    const { data, error } = await supabase
      .from('issues')
      .update(updatePayload)
      .eq('id', id)
      .select(`
        *,
        reported_by_profile:profiles!issues_reported_by_fkey(id, full_name, email, avatar_url),
        suggested_assignee_profile:profiles!issues_suggested_assignee_id_fkey(id, full_name, email, avatar_url),
        assigned_to_profile:profiles!issues_assigned_to_fkey(id, full_name, email, avatar_url)
      `)
      .single();

    if (error) {
      res.status(400).json({
        error: 'Database error',
        message: error.message,
      } as ApiResponse<null>);
      return;
    }

    res.json({
      data,
      message: 'Issue updated successfully',
    } as ApiResponse<typeof data>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// DELETE /api/issues/:id - Delete issue (admin only)
router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('issues')
      .delete()
      .eq('id', id);

    if (error) {
      res.status(400).json({
        error: 'Database error',
        message: error.message,
      } as ApiResponse<null>);
      return;
    }

    res.json({
      message: 'Issue deleted successfully',
    } as ApiResponse<null>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

export default router;
