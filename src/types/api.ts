// API request/response types
export interface CreateIssueRequest {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  suggested_assignee_id: string;
}

export interface AssignIssueRequest {
  assignee_id: string;
  edited_issue?: {
    title?: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
  };
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  category: 'routine' | 'project' | 'one_time' | 'issue_resolution';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assigned_to?: string;
  due_date?: string;
  start_time?: string;
  end_time?: string;
  estimated_hours?: number;
  tags?: string[];
  // Optional task type fields (not required for basic task creation)
  task_type?: 'routine' | 'one_time' | 'project';
  recurrence_pattern?: {
    type: 'daily' | 'weekly' | 'monthly';
    time?: string; // "09:00"
    dayOfWeek?: number; // 0-6 (Sunday-Saturday)
    dayOfMonth?: number; // 1-31
  };
  project_start_date?: string;
  project_end_date?: string;
  deadline?: string;
  estimated_duration_hours?: number;
}

export interface UpdateTaskRequest {
  title?: string;
  description?: string;
  category?: 'routine' | 'project' | 'one_time' | 'issue_resolution';
  priority?: 'low' | 'medium' | 'high' | 'critical';
  status?: 'not_started' | 'in_progress' | 'completed' | 'blocked';
  progress_percentage?: number;
  assigned_to?: string;
  due_date?: string;
  start_time?: string;
  end_time?: string;
  estimated_hours?: number;
  actual_hours?: number;
  tags?: string[];
  // New task type fields
  task_type?: 'routine' | 'one_time' | 'project';
  recurrence_pattern?: {
    type: 'daily' | 'weekly' | 'monthly';
    time?: string;
    dayOfWeek?: number;
    dayOfMonth?: number;
  };
  project_start_date?: string;
  project_end_date?: string;
  deadline?: string;
  estimated_duration_hours?: number;
  completed_at?: string;
  late_completion?: boolean;
}

export interface CreateTaskNoteRequest {
  content: string;
}

export interface CreateAdminDeadlineRequest {
  title: string;
  description?: string;
  deadline_date: string;
  suggested_assignees?: string[];
}

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}
