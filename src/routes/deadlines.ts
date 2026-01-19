import { Router } from 'express';
import type { Response } from 'express';
import { supabase } from '../services/supabase.js';
import { authenticateUser, requireAdmin, type AuthRequest } from '../middleware/auth.js';
import type { ApiResponse } from '../types/api.js';

const router = Router();

// All routes require authentication
router.use(authenticateUser);

// GET /api/deadlines - Get all deadlines
router.get('/', async (req: AuthRequest, res: Response) => {
    try {
        const { from_date, to_date, is_completed, limit = '50' } = req.query;

        let query = supabase
            .from('deadlines')
            .select('*')
            .order('deadline_date', { ascending: true });

        // Admin sees all, others see only their own
        if (req.user?.role !== 'admin') {
            query = query.eq('created_by', req.user?.id);
        }

        if (from_date) {
            query = query.gte('deadline_date', from_date);
        }
        if (to_date) {
            query = query.lte('deadline_date', to_date);
        }
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

// POST /api/deadlines - Create new deadline
router.post('/', async (req: AuthRequest, res: Response) => {
    try {
        const { title, description, deadline_date, reminder_date, priority, category } = req.body;

        if (!title || !deadline_date) {
            res.status(400).json({
                error: 'Validation error',
                message: 'Title and deadline_date are required',
            } as ApiResponse<null>);
            return;
        }

        const { data, error } = await supabase
            .from('deadlines')
            .insert({
                title,
                description,
                deadline_date,
                reminder_date,
                priority: priority || 'medium',
                category,
                created_by: req.user?.id,
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
            message: 'Deadline created successfully',
        } as ApiResponse<typeof data>);
    } catch (error) {
        res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error',
        } as ApiResponse<null>);
    }
});

// PUT /api/deadlines/:id - Update deadline
router.put('/:id', async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Check ownership or admin
        const { data: existing } = await supabase
            .from('deadlines')
            .select('created_by')
            .eq('id', id)
            .single();

        if (!existing) {
            res.status(404).json({
                error: 'Not found',
                message: 'Deadline not found',
            } as ApiResponse<null>);
            return;
        }

        if (req.user?.role !== 'admin' && existing.created_by !== req.user?.id) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'You do not have permission to update this deadline',
            } as ApiResponse<null>);
            return;
        }

        const { data, error } = await supabase
            .from('deadlines')
            .update({
                ...updateData,
                updated_at: new Date().toISOString(),
            })
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
            message: 'Deadline updated successfully',
        } as ApiResponse<typeof data>);
    } catch (error) {
        res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error',
        } as ApiResponse<null>);
    }
});

// DELETE /api/deadlines/:id - Delete deadline
router.delete('/:id', async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;

        // Check ownership or admin
        const { data: existing } = await supabase
            .from('deadlines')
            .select('created_by')
            .eq('id', id)
            .single();

        if (!existing) {
            res.status(404).json({
                error: 'Not found',
                message: 'Deadline not found',
            } as ApiResponse<null>);
            return;
        }

        if (req.user?.role !== 'admin' && existing.created_by !== req.user?.id) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'You do not have permission to delete this deadline',
            } as ApiResponse<null>);
            return;
        }

        const { error } = await supabase
            .from('deadlines')
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
            message: 'Deadline deleted successfully',
        } as ApiResponse<null>);
    } catch (error) {
        res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error',
        } as ApiResponse<null>);
    }
});

// POST /api/deadlines/import - Import deadlines from CSV
router.post('/import', async (req: AuthRequest, res: Response) => {
    try {
        const { deadlines } = req.body;

        if (!Array.isArray(deadlines) || deadlines.length === 0) {
            res.status(400).json({
                error: 'Validation error',
                message: 'Deadlines array is required',
            } as ApiResponse<null>);
            return;
        }

        // Validate and prepare data
        const preparedData = deadlines.map((d: any) => ({
            title: d.title,
            description: d.description || null,
            deadline_date: d.deadline_date,
            reminder_date: d.reminder_date || null,
            priority: d.priority || 'medium',
            category: d.category || null,
            created_by: req.user?.id,
        }));

        const { data, error } = await supabase
            .from('deadlines')
            .insert(preparedData)
            .select();

        if (error) {
            res.status(400).json({
                error: 'Database error',
                message: error.message,
            } as ApiResponse<null>);
            return;
        }

        res.status(201).json({
            data,
            message: `${data.length} deadlines imported successfully`,
        } as ApiResponse<typeof data>);
    } catch (error) {
        res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error',
        } as ApiResponse<null>);
    }
});

// GET /api/deadlines/export - Export deadlines as CSV format
router.get('/export', async (req: AuthRequest, res: Response) => {
    try {
        let query = supabase
            .from('deadlines')
            .select('*')
            .order('deadline_date', { ascending: true });

        // Admin exports all, others export only their own
        if (req.user?.role !== 'admin') {
            query = query.eq('created_by', req.user?.id);
        }

        const { data, error } = await query;

        if (error) {
            res.status(400).json({
                error: 'Database error',
                message: error.message,
            } as ApiResponse<null>);
            return;
        }

        // Convert to CSV format
        const csvData = data.map(d => ({
            deadline_date: d.deadline_date,
            reminder_date: d.reminder_date || '',
            title: d.title,
            description: d.description || '',
            priority: d.priority,
            category: d.category || '',
        }));

        res.json({
            data: csvData,
            message: 'Export successful',
        });
    } catch (error) {
        res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error',
        } as ApiResponse<null>);
    }
});

export default router;
