/**
 * Users Routes
 * Admin endpoints for managing users
 */

import { Router } from 'express';
import { authenticateUser, requireAdmin, type AuthRequest } from '../middleware/auth.js';
import { supabase } from '../services/supabase.js';
import { createLogger } from '../utils/logger.js';

const router = Router();
const logger = createLogger('UsersRoutes');

/**
 * POST /api/users/create
 * Create a new user (admin only)
 */
router.post('/create', authenticateUser, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const { email, password, full_name, role = 'employee', department } = req.body;

        // Validate required fields
        if (!email || !password || !full_name) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Email, şifre ve isim zorunludur',
            });
            return;
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Geçersiz email formatı',
            });
            return;
        }

        // Validate password length
        if (password.length < 6) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Şifre en az 6 karakter olmalıdır',
            });
            return;
        }

        // Create user in Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true, // Auto-confirm email
            user_metadata: {
                full_name,
            },
        });

        if (authError) {
            logger.error('Failed to create user in auth', authError);

            // Handle specific errors
            if (authError.message.includes('already registered')) {
                res.status(409).json({
                    error: 'Conflict',
                    message: 'Bu email adresi zaten kayıtlı',
                });
                return;
            }

            res.status(500).json({
                error: 'Server Error',
                message: 'Kullanıcı oluşturulurken bir hata oluştu',
            });
            return;
        }

        // Update profile with additional info
        const { error: profileError } = await supabase
            .from('profiles')
            .update({
                full_name,
                role,
                department: department || null,
            })
            .eq('id', authData.user.id);

        if (profileError) {
            logger.warn('Failed to update profile', { error: profileError, userId: authData.user.id });
        }

        logger.info('User created successfully', {
            userId: authData.user.id,
            email,
            createdBy: req.user?.id,
        });

        res.status(201).json({
            success: true,
            message: 'Kullanıcı başarıyla oluşturuldu',
            data: {
                id: authData.user.id,
                email: authData.user.email,
                full_name,
                role,
                department,
            },
        });
    } catch (error) {
        logger.error('Error creating user', error as Error);
        res.status(500).json({
            error: 'Server Error',
            message: 'Kullanıcı oluşturulurken bir hata oluştu',
        });
    }
});

/**
 * GET /api/users
 * Get all users (admin only)
 */
router.get('/', authenticateUser, requireAdmin, async (_req: AuthRequest, res) => {
    try {
        const { data: users, error } = await supabase
            .from('profiles')
            .select('*')
            .order('full_name', { ascending: true });

        if (error) {
            throw error;
        }

        res.json({
            success: true,
            data: users,
        });
    } catch (error) {
        logger.error('Error fetching users', error as Error);
        res.status(500).json({
            error: 'Server Error',
            message: 'Kullanıcılar yüklenirken bir hata oluştu',
        });
    }
});

/**
 * DELETE /api/users/:id
 * Delete a user (admin only)
 */
router.delete('/:id', authenticateUser, requireAdmin, async (req: AuthRequest, res) => {
    try {
        const { id } = req.params;

        // Cannot delete yourself
        if (id === req.user?.id) {
            res.status(400).json({
                error: 'Bad Request',
                message: 'Kendi hesabınızı silemezsiniz',
            });
            return;
        }

        // Delete from Supabase Auth (this will cascade to profiles due to FK)
        const { error } = await supabase.auth.admin.deleteUser(id);

        if (error) {
            throw error;
        }

        logger.info('User deleted', { userId: id, deletedBy: req.user?.id });

        res.json({
            success: true,
            message: 'Kullanıcı başarıyla silindi',
        });
    } catch (error) {
        logger.error('Error deleting user', error as Error);
        res.status(500).json({
            error: 'Server Error',
            message: 'Kullanıcı silinirken bir hata oluştu',
        });
    }
});

export default router;
