import { Router } from 'express';
import type { Response } from 'express';
import { supabase } from '../services/supabase.js';
import { authenticateUser, type AuthRequest } from '../middleware/auth.js';
import type { ApiResponse } from '../types/api.js';

const router = Router();

// All routes require authentication
router.use(authenticateUser);

// GET /api/tasks/:taskId/checklist - Get checklist items for a task
router.get('/:taskId/checklist', async (req: AuthRequest, res: Response) => {
  try {
    const { taskId } = req.params;

    const { data, error } = await supabase
      .from('task_checklist_items')
      .select('*, completed_by_profile:profiles!task_checklist_items_completed_by_fkey(id, full_name)')
      .eq('task_id', taskId)
      .order('position', { ascending: true });

    if (error) {
      res.status(400).json({
        error: 'Database error',
        message: error.message,
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

// POST /api/tasks/:taskId/checklist - Add checklist item
router.post('/:taskId/checklist', async (req: AuthRequest, res: Response) => {
  try {
    const { taskId } = req.params;
    const { title, position } = req.body;

    if (!title) {
      res.status(400).json({
        error: 'Validation error',
        message: 'Title is required',
      } as ApiResponse<null>);
      return;
    }

    // Get the highest position if not provided
    let itemPosition = position;
    if (itemPosition === undefined) {
      const { data: items } = await supabase
        .from('task_checklist_items')
        .select('position')
        .eq('task_id', taskId)
        .order('position', { ascending: false })
        .limit(1);

      itemPosition = items && items.length > 0 ? items[0].position + 1 : 0;
    }

    const { data, error } = await supabase
      .from('task_checklist_items')
      .insert({
        task_id: taskId,
        title,
        position: itemPosition,
      })
      .select()
      .single();

    if (error) {
      res.status(400).json({
        error: 'Database error',
        message: error.message,
      } as ApiResponse<null>);
      return;
    }

    res.status(201).json({
      data,
      message: 'Checklist item added successfully',
    } as ApiResponse<typeof data>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// PUT /api/tasks/:taskId/checklist/:itemId - Update checklist item
router.put('/:taskId/checklist/:itemId', async (req: AuthRequest, res: Response) => {
  try {
    const { itemId } = req.params;
    const { title, is_completed, position } = req.body;

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (title !== undefined) updateData.title = title;
    if (position !== undefined) updateData.position = position;
    
    if (is_completed !== undefined) {
      updateData.is_completed = is_completed;
      if (is_completed) {
        updateData.completed_at = new Date().toISOString();
        updateData.completed_by = req.user?.id;
      } else {
        updateData.completed_at = null;
        updateData.completed_by = null;
      }
    }

    const { data, error } = await supabase
      .from('task_checklist_items')
      .update(updateData)
      .eq('id', itemId)
      .select()
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
      message: 'Checklist item updated successfully',
    } as ApiResponse<typeof data>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// DELETE /api/tasks/:taskId/checklist/:itemId - Delete checklist item
router.delete('/:taskId/checklist/:itemId', async (req: AuthRequest, res: Response) => {
  try {
    const { itemId } = req.params;

    const { error } = await supabase
      .from('task_checklist_items')
      .delete()
      .eq('id', itemId);

    if (error) {
      res.status(400).json({
        error: 'Database error',
        message: error.message,
      } as ApiResponse<null>);
      return;
    }

    res.json({
      message: 'Checklist item deleted successfully',
    } as ApiResponse<null>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

export default router;
