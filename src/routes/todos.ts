import { Router } from 'express';
import type { Response } from 'express';
import { supabase } from '../services/supabase.js';
import { authenticateUser, type AuthRequest } from '../middleware/auth.js';
import type { ApiResponse } from '../types/api.js';

const router = Router();

// All routes require authentication
router.use(authenticateUser);

// GET /api/todos - Get todos with optional user_id filter for admin
router.get('/', async (req: AuthRequest, res: Response) => {
    try {
        const { is_completed, limit = '50', user_id } = req.query;

        let query = supabase
            .from('todos')
            .select('*, user:profiles!todos_user_id_fkey(id, full_name, email)')
            .order('created_at', { ascending: false });

        // If user_id parameter is provided and user is admin, filter by that user
        if (user_id && req.user?.role === 'admin') {
            query = query.eq('user_id', user_id);
        }
        // If not admin, always filter by own user_id
        else if (req.user?.role !== 'admin') {
            query = query.eq('user_id', req.user?.id);
        }
        // If admin and no user_id parameter, show all todos (existing behavior)

        if (is_completed !== undefined) {
            query = query.eq('is_completed', is_completed === 'true');
        }

        query = query.limit(parseInt(limit as string, 10));

        const { data, error } = await query;

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

// POST /api/todos - Create new todo
router.post('/', async (req: AuthRequest, res: Response) => {
    try {
        const { title, description, due_date, priority } = req.body;

        if (!title) {
            res.status(400).json({
                error: 'Validation error',
                message: 'Title is required',
            } as ApiResponse<null>);
            return;
        }

        const { data, error } = await supabase
            .from('todos')
            .insert({
                title,
                description: description || null,
                due_date: due_date || null,
                priority: priority || 'medium',
                user_id: req.user?.id,
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
            message: 'Todo created successfully',
        } as ApiResponse<typeof data>);
    } catch (error) {
        res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error',
        } as ApiResponse<null>);
    }
});

// PUT /api/todos/:id - Update todo
router.put('/:id', async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { title, description, due_date, priority, is_completed } = req.body;

        // Check ownership or admin
        const { data: existing } = await supabase
            .from('todos')
            .select('user_id')
            .eq('id', id)
            .single();

        if (!existing) {
            res.status(404).json({
                error: 'Not found',
                message: 'Todo not found',
            } as ApiResponse<null>);
            return;
        }

        if (req.user?.role !== 'admin' && existing.user_id !== req.user?.id) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'You do not have permission to update this todo',
            } as ApiResponse<null>);
            return;
        }

        // Build update object with only provided fields
        const updateData: Record<string, any> = {
            updated_at: new Date().toISOString(),
        };

        if (title !== undefined) updateData.title = title;
        if (description !== undefined) updateData.description = description || null;
        if (due_date !== undefined) updateData.due_date = due_date || null;
        if (priority !== undefined) updateData.priority = priority;
        if (is_completed !== undefined) {
            updateData.is_completed = is_completed;
            updateData.completed_at = is_completed ? new Date().toISOString() : null;
        }

        const { data, error } = await supabase
            .from('todos')
            .update(updateData)
            .eq('id', id)
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
            message: 'Todo updated successfully',
        } as ApiResponse<typeof data>);
    } catch (error) {
        res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error',
        } as ApiResponse<null>);
    }
});

// DELETE /api/todos/:id - Delete todo
router.delete('/:id', async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        // Check ownership or admin
        const { data: existing } = await supabase
            .from('todos')
            .select('user_id')
            .eq('id', id)
            .single();

        if (!existing) {
            res.status(404).json({
                error: 'Not found',
                message: 'Todo not found',
            } as ApiResponse<null>);
            return;
        }

        if (req.user?.role !== 'admin' && existing.user_id !== req.user?.id) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'You do not have permission to delete this todo',
            } as ApiResponse<null>);
            return;
        }

        const { error } = await supabase
            .from('todos')
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
            message: 'Todo deleted successfully',
        } as ApiResponse<null>);
    } catch (error) {
        res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error',
        } as ApiResponse<null>);
    }
});

export default router;
