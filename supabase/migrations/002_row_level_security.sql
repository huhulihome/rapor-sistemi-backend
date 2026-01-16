-- Modern Office System - Row Level Security Policies
-- This migration sets up RLS policies for data access control

-- =====================================================
-- ENABLE ROW LEVEL SECURITY
-- =====================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE issues ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PROFILES POLICIES
-- =====================================================
-- Users can view all profiles (needed for dropdowns, assignments, etc.)
CREATE POLICY "Users can view all profiles"
  ON profiles
  FOR SELECT
  USING (true);

-- Users can update only their own profile
CREATE POLICY "Users can update own profile"
  ON profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- Users can insert their own profile (during registration)
CREATE POLICY "Users can insert own profile"
  ON profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- =====================================================
-- TASKS POLICIES
-- =====================================================
-- Users can view tasks they're assigned to, created, or if they're admin
CREATE POLICY "Users can view relevant tasks"
  ON tasks
  FOR SELECT
  USING (
    assigned_to = auth.uid() OR 
    created_by = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Users can create tasks if they're admin
CREATE POLICY "Admins can create tasks"
  ON tasks
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Users can update tasks they're assigned to or if they're admin
CREATE POLICY "Users can update assigned tasks"
  ON tasks
  FOR UPDATE
  USING (
    assigned_to = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can delete tasks
CREATE POLICY "Admins can delete tasks"
  ON tasks
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================
-- ISSUES POLICIES
-- =====================================================
-- Users can view issues they created, are suggested for, assigned to, or if they're admin
CREATE POLICY "Users can view relevant issues"
  ON issues
  FOR SELECT
  USING (
    reported_by = auth.uid() OR 
    suggested_assignee_id = auth.uid() OR
    assigned_to = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- All authenticated users can create issues
CREATE POLICY "Users can create issues"
  ON issues
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL AND
    reported_by = auth.uid()
  );

-- Only admins can update issues (for assignment and editing)
CREATE POLICY "Admins can update issues"
  ON issues
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can delete issues
CREATE POLICY "Admins can delete issues"
  ON issues
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================
-- ACTIVITY LOG POLICIES
-- =====================================================
-- Users can view their own activity logs, admins can view all
CREATE POLICY "Users can view relevant activity logs"
  ON activity_log
  FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- System can insert activity logs (service role)
CREATE POLICY "System can insert activity logs"
  ON activity_log
  FOR INSERT
  WITH CHECK (true);

-- Only admins can delete activity logs
CREATE POLICY "Admins can delete activity logs"
  ON activity_log
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- =====================================================
-- HELPER FUNCTIONS FOR RLS
-- =====================================================
-- Function to check if current user is admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles 
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can access task
CREATE OR REPLACE FUNCTION can_access_task(task_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM tasks 
    WHERE id = task_id AND (
      assigned_to = auth.uid() OR 
      created_by = auth.uid() OR
      is_admin()
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user can access issue
CREATE OR REPLACE FUNCTION can_access_issue(issue_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM issues 
    WHERE id = issue_id AND (
      reported_by = auth.uid() OR 
      suggested_assignee_id = auth.uid() OR
      assigned_to = auth.uid() OR
      is_admin()
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON POLICY "Users can view all profiles" ON profiles IS 
  'All authenticated users can view profiles for dropdowns and assignments';

COMMENT ON POLICY "Users can view relevant tasks" ON tasks IS 
  'Users can only see tasks they are involved with or all tasks if admin';

COMMENT ON POLICY "Users can view relevant issues" ON issues IS 
  'Users can see issues they reported, are suggested for, assigned to, or all if admin';

COMMENT ON FUNCTION is_admin() IS 
  'Helper function to check if current user has admin role';

COMMENT ON FUNCTION can_access_task(UUID) IS 
  'Helper function to check if user has access to specific task';

COMMENT ON FUNCTION can_access_issue(UUID) IS 
  'Helper function to check if user has access to specific issue';
