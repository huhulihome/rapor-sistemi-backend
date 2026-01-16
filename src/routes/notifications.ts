import { Router } from 'express';
import type { Response } from 'express';
import { supabase } from '../services/supabase.js';
import { authenticateUser, requireAdmin, type AuthRequest } from '../middleware/auth.js';
import { triggerDailyDigestNow, sendDailyDigestToUser } from '../services/dailyDigest.js';
import type { ApiResponse } from '../types/api.js';

const router = Router();

// All routes require authentication
router.use(authenticateUser);

// GET /api/notifications - List user's notifications (includes broadcasts)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { limit = '20', offset = '0', unread_only = 'false' } = req.query;

    let query = supabase
      .from('notifications')
      .select('*')
      .or(`user_id.eq.${req.user?.id},user_id.is.null`) // User's own + broadcasts
      .order('created_at', { ascending: false })
      .range(parseInt(offset as string), parseInt(offset as string) + parseInt(limit as string) - 1);

    if (unread_only === 'true') {
      query = query.eq('is_read', false);
    }

    const { data, error, count } = await query;

    if (error) {
      res.status(400).json({ error: 'Database error', message: error.message } as ApiResponse<null>);
      return;
    }

    // Get unread count
    const { count: unreadCount } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .or(`user_id.eq.${req.user?.id},user_id.is.null`)
      .eq('is_read', false);

    res.json({
      data: {
        notifications: data || [],
        unreadCount: unreadCount || 0,
        total: count || 0,
      },
    } as ApiResponse<any>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// PUT /api/notifications/:id/read - Mark notification as read
router.put('/:id/read', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', id)
      .or(`user_id.eq.${req.user?.id},user_id.is.null`)
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: 'Database error', message: error.message } as ApiResponse<null>);
      return;
    }

    res.json({ data, message: 'Notification marked as read' } as ApiResponse<any>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// PUT /api/notifications/read-all - Mark all notifications as read
router.put('/read-all', async (req: AuthRequest, res: Response) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .or(`user_id.eq.${req.user?.id},user_id.is.null`)
      .eq('is_read', false);

    if (error) {
      res.status(400).json({ error: 'Database error', message: error.message } as ApiResponse<null>);
      return;
    }

    res.json({ message: 'All notifications marked as read' } as ApiResponse<null>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// POST /api/notifications/broadcast - Admin: send notification to all users
router.post('/broadcast', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { title, message, type = 'info', link } = req.body;

    if (!title) {
      res.status(400).json({ error: 'Validation error', message: 'Title is required' } as ApiResponse<null>);
      return;
    }

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: null, // NULL = broadcast to all
        title,
        message,
        type,
        link,
        is_broadcast: true,
      })
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: 'Database error', message: error.message } as ApiResponse<null>);
      return;
    }

    res.json({ data, message: 'Broadcast notification sent successfully' } as ApiResponse<any>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// POST /api/notifications - Create notification for specific user (internal/system use)
router.post('/', requireAdmin, async (req: AuthRequest, res: Response) => {
  try {
    const { user_id, title, message, type = 'info', link } = req.body;

    if (!title) {
      res.status(400).json({ error: 'Validation error', message: 'Title is required' } as ApiResponse<null>);
      return;
    }

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id,
        title,
        message,
        type,
        link,
        is_broadcast: false,
      })
      .select()
      .single();

    if (error) {
      res.status(400).json({ error: 'Database error', message: error.message } as ApiResponse<null>);
      return;
    }

    res.json({ data, message: 'Notification created successfully' } as ApiResponse<any>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// DELETE /api/notifications/:id - Delete notification
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', id)
      .eq('user_id', req.user?.id); // Users can only delete their own

    if (error) {
      res.status(400).json({ error: 'Database error', message: error.message } as ApiResponse<null>);
      return;
    }

    res.json({ message: 'Notification deleted' } as ApiResponse<null>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// GET /api/notifications/preferences - Get user's notification preferences
router.get('/preferences', async (req: AuthRequest, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('notification_preferences')
      .eq('id', req.user?.id)
      .single();

    if (error) {
      res.status(400).json({ error: 'Database error', message: error.message } as ApiResponse<null>);
      return;
    }

    res.json({
      data: data.notification_preferences || { email: true, push: true },
    } as ApiResponse<any>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// PUT /api/notifications/preferences - Update user's notification preferences
router.put('/preferences', async (req: AuthRequest, res: Response) => {
  try {
    const { email, push } = req.body;

    if (email === undefined && push === undefined) {
      res.status(400).json({
        error: 'Validation error',
        message: 'At least one preference (email or push) must be provided',
      } as ApiResponse<null>);
      return;
    }

    const preferences: any = {};
    if (email !== undefined) preferences.email = Boolean(email);
    if (push !== undefined) preferences.push = Boolean(push);

    const { data, error } = await supabase
      .from('profiles')
      .update({ notification_preferences: preferences })
      .eq('id', req.user?.id)
      .select('notification_preferences')
      .single();

    if (error) {
      res.status(400).json({ error: 'Database error', message: error.message } as ApiResponse<null>);
      return;
    }

    res.json({
      data: data.notification_preferences,
      message: 'Notification preferences updated successfully',
    } as ApiResponse<any>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// POST /api/notifications/digest/trigger - Manually trigger daily digest (admin only)
router.post('/digest/trigger', requireAdmin, async (_req: AuthRequest, res: Response) => {
  try {
    const result = await triggerDailyDigestNow();

    if (result.success) {
      res.json({ message: result.message } as ApiResponse<null>);
    } else {
      res.status(500).json({ error: 'Digest trigger failed', message: result.message } as ApiResponse<null>);
    }
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

// POST /api/notifications/digest/send-to-me - Send digest to current user
router.post('/digest/send-to-me', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ error: 'Unauthorized', message: 'User not authenticated' } as ApiResponse<null>);
      return;
    }

    await sendDailyDigestToUser(req.user.id);

    res.json({ message: 'Daily digest email queued successfully' } as ApiResponse<null>);
  } catch (error) {
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    } as ApiResponse<null>);
  }
});

export default router;
