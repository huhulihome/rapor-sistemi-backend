import { Router } from 'express';
import type { Response } from 'express';
import { supabase } from '../services/supabase.js';
import { authenticateUser, requireAdmin, type AuthRequest } from '../middleware/auth.js';
import type { CreateTaskRequest, UpdateTaskRequest, ApiResponse } from '../types/api.js';
import { queueEmail, emailTemplates } from '../services/email.js';

const router = Router();

// All routes require authentication
router.use(authenticateUser);

// GET /api/tasks - Get all tasks with filtering and sorting
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const {
      status,
      category,
      priority,
      assigned_to,
      created_by,
      sort_by = 'created_at',
      sort_order = 'desc',
      limit = '50',
      offset = '0'
    } = req.query;

    let query = supabase
      .from('tasks')
      .select('*', { count: 'exact' });

    // Apply filters based on user role
    if (req.user?.role !== 'admin') {
      // Non-admin users can only see their own tasks
      query = query.or(`assigned_to.eq.${req.user?.id},created_by.eq.${req.user?.id}`);
    }

    // Apply additional filters
    if (status) {
      query = query.eq('status', status);
    }
    if (category) {
      query = query.eq('category', category);
    }
    if (priority) {
      query = query.eq('priority', priority);
    }
    if (assigned_to) {
      query = query.eq('assigned_to', assigned_to);
    }
    if (created_by) {
      query = query.eq('created_by', created_by);
    }

    // Apply sorting
    const validSortFields = ['created_at', 'updated_at', 'due_date', 'priority', 'status', 'title'];
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

// GET /api/tasks/:id - Get single task by ID
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    let query = supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single();

    const { data, error } = await query;

    if (error) {
      res.status(404).json({
        error: 'Not found',
        message: 'Task not found',
      } as ApiResponse<null>);
      return;
    }

    // Check access permissions
    if (req.user?.role !== 'admin' &&
      data.assigned_to !== req.user?.id &&
      data.created_by !== req.user?.id) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have access to this task',
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

// POST /api/tasks - Create new task
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const taskData: CreateTaskRequest = req.body;

    // Validate required fields
    if (!taskData.title || !taskData.category || !taskData.priority) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Title, category, and priority are required',
      } as ApiResponse<null>);
      return;
    }

    // Only admins can create tasks for others
    if (taskData.assigned_to && taskData.assigned_to !== req.user?.id && req.user?.role !== 'admin') {
      res.status(403).json({
        error: 'Forbidden',
        message: 'Only admins can assign tasks to other users',
      } as ApiResponse<null>);
      return;
    }

    // Only insert fields that exist in the tasks table
    const insertData = {
      title: taskData.title,
      description: taskData.description || null,
      category: taskData.category,
      priority: taskData.priority,
      assigned_to: taskData.assigned_to || null,
      due_date: taskData.due_date || null,
      estimated_hours: taskData.estimated_hours || null,
      tags: taskData.tags || [],
      created_by: req.user?.id,
      status: 'not_started',
      progress_percentage: 0,
    };

    console.log('Task insert data:', JSON.stringify(insertData));

    const { data, error } = await supabase
      .from('tasks')
      .insert(insertData)
      .select('*')
      .single();

    if (error) {
      console.error('Task insert error:', JSON.stringify(error));
      res.status(400).json({
        error: 'Database error',
        message: error.message,
        details: error,
      } as ApiResponse<null>);
      return;
    }

    // Send email notification if task is assigned to someone
    if (data.assigned_to) {
      // Fetch assignee profile separately
      const { data: assigneeProfile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', data.assigned_to)
        .single();

      if (assigneeProfile) {
        const emailHtml = emailTemplates.taskAssignment({
          recipientName: assigneeProfile.full_name,
          taskTitle: data.title,
          taskDescription: data.description || '',
          priority: data.priority,
          category: data.category,
          dueDate: data.due_date,
          taskId: data.id,
        });

        queueEmail(
          assigneeProfile.email,
          `📋 Yeni Görev: ${data.title}`,
          emailHtml
        );
      }
    }

    res.status(201).json({
      data,
      message: 'Task created successfully',
    } as ApiResponse<typeof data>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// PUT /api/tasks/:id - Update task
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const updateData: UpdateTaskRequest = req.body;

    // Get existing task to check permissions
    const { data: existingTask, error: fetchError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingTask) {
      res.status(404).json({
        error: 'Not found',
        message: 'Task not found',
      } as ApiResponse<null>);
      return;
    }

    // Check permissions
    const canEdit = req.user?.role === 'admin' ||
      existingTask.assigned_to === req.user?.id ||
      existingTask.created_by === req.user?.id;

    if (!canEdit) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to update this task',
      } as ApiResponse<null>);
      return;
    }

    // Check if task is being reassigned
    const isReassignment = updateData.assigned_to &&
      updateData.assigned_to !== existingTask.assigned_to;

    const { data, error } = await supabase
      .from('tasks')
      .update({
        ...updateData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*, assigned_to_profile:profiles!tasks_assigned_to_fkey(id, full_name, email), created_by_profile:profiles!tasks_created_by_fkey(id, full_name, email)')
      .single();

    if (error) {
      res.status(400).json({
        error: 'Database error',
        message: error.message,
      } as ApiResponse<null>);
      return;
    }

    // Send email notification if task was reassigned
    if (isReassignment && data.assigned_to_profile) {
      const emailHtml = emailTemplates.taskAssignment({
        recipientName: data.assigned_to_profile.full_name,
        taskTitle: data.title,
        taskDescription: data.description || '',
        priority: data.priority,
        category: data.category,
        dueDate: data.due_date,
        taskId: data.id,
      });

      queueEmail(
        data.assigned_to_profile.email,
        `📋 Görev Atandı: ${data.title}`,
        emailHtml
      );
    }

    res.json({
      data,
      message: 'Task updated successfully',
    } as ApiResponse<typeof data>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// PATCH /api/tasks/:id/status - Update task status
router.patch('/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { status, progress_percentage } = req.body;

    if (!status) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Status is required',
      } as ApiResponse<null>);
      return;
    }

    const validStatuses = ['not_started', 'in_progress', 'completed', 'blocked'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Invalid status value',
      } as ApiResponse<null>);
      return;
    }

    // Get existing task to check permissions
    const { data: existingTask, error: fetchError } = await supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !existingTask) {
      res.status(404).json({
        error: 'Not found',
        message: 'Task not found',
      } as ApiResponse<null>);
      return;
    }

    // Check permissions
    const canUpdate = req.user?.role === 'admin' ||
      existingTask.assigned_to === req.user?.id;

    if (!canUpdate) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to update this task status',
      } as ApiResponse<null>);
      return;
    }

    const updatePayload: any = {
      status,
      updated_at: new Date().toISOString(),
    };

    if (progress_percentage !== undefined) {
      updatePayload.progress_percentage = Math.max(0, Math.min(100, progress_percentage));
    }

    const { data, error } = await supabase
      .from('tasks')
      .update(updatePayload)
      .eq('id', id)
      .select('*, assigned_to_profile:profiles!tasks_assigned_to_fkey(id, full_name, email), created_by_profile:profiles!tasks_created_by_fkey(id, full_name, email)')
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
      message: 'Task status updated successfully',
    } as ApiResponse<typeof data>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// DELETE /api/tasks/:id - Delete task (admin only)
router.delete('/:id', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('tasks')
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
      message: 'Task deleted successfully',
    } as ApiResponse<null>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// GET /api/tasks/completed - Get completed tasks
router.get('/completed', async (req: AuthRequest, res: Response) => {
  try {
    const { limit = '50', offset = '0' } = req.query;

    let query = supabase
      .from('tasks')
      .select('*, assigned_to_profile:profiles!tasks_assigned_to_fkey(id, full_name, email)', { count: 'exact' })
      .eq('status', 'completed')
      .order('completed_at', { ascending: false });

    // Non-admin users can only see their own completed tasks
    if (req.user?.role !== 'admin') {
      query = query.or(`assigned_to.eq.${req.user?.id},created_by.eq.${req.user?.id}`);
    }

    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);
    query = query.range(offsetNum, offsetNum + limitNum - 1);

    const { data, error, count } = await query;

    if (error) {
      res.status(400).json({ error: 'Database error', message: error.message } as ApiResponse<null>);
      return;
    }

    res.json({ data, count, limit: limitNum, offset: offsetNum });
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// GET /api/tasks/:id/notes - Get task notes
router.get('/:id/notes', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('task_notes')
      .select('*, user:profiles!task_notes_user_id_fkey(id, full_name, avatar_url)')
      .eq('task_id', id)
      .order('created_at', { ascending: true });

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

// POST /api/tasks/:id/notes - Add note to task
router.post('/:id/notes', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    if (!content) {
      res.status(400).json({ error: 'Validation error', message: 'Content is required' } as ApiResponse<null>);
      return;
    }

    const { data, error } = await supabase
      .from('task_notes')
      .insert({
        task_id: id,
        user_id: req.user?.id,
        content,
      })
      .select('*, user:profiles!task_notes_user_id_fkey(id, full_name, avatar_url)')
      .single();

    if (error) {
      res.status(400).json({ error: 'Database error', message: error.message } as ApiResponse<null>);
      return;
    }

    res.status(201).json({ data, message: 'Note added successfully' } as ApiResponse<typeof data>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

export default router;
