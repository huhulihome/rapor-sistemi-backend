import { describe, it, expect } from 'vitest';
import { emailTemplates } from './email.js';

describe('Email Templates', () => {
  describe('taskAssignment template', () => {
    it('should generate valid HTML with all required fields', () => {
      const html = emailTemplates.taskAssignment({
        recipientName: 'John Doe',
        taskTitle: 'Fix bug in login',
        taskDescription: 'Users cannot login with special characters',
        priority: 'high',
        category: 'issue_resolution',
        taskId: '123-456',
      });

      expect(html).toContain('John Doe');
      expect(html).toContain('Fix bug in login');
      expect(html).toContain('Users cannot login with special characters');
      expect(html).toContain('high');
      expect(html).toContain('issue_resolution');
      expect(html).toContain('/tasks/123-456');
    });

    it('should include due date when provided', () => {
      const dueDate = '2024-12-31T23:59:59Z';
      const html = emailTemplates.taskAssignment({
        recipientName: 'Jane Smith',
        taskTitle: 'Complete report',
        taskDescription: 'Monthly report',
        priority: 'medium',
        category: 'routine',
        dueDate,
        taskId: '789',
      });

      expect(html).toContain('Bitiş Tarihi');
      // Date will be formatted in Turkish locale
      expect(html).toMatch(/\d{1,2}\s+\w+\s+\d{4}/); // Matches "31 Aralık 2024" or similar
    });

    it('should handle missing description gracefully', () => {
      const html = emailTemplates.taskAssignment({
        recipientName: 'Bob Wilson',
        taskTitle: 'Review code',
        taskDescription: '',
        priority: 'low',
        category: 'project',
        taskId: 'abc-123',
      });

      expect(html).toContain('Bob Wilson');
      expect(html).toContain('Review code');
      expect(html).toContain('Açıklama bulunmuyor');
    });
  });

  describe('issueToTask template', () => {
    it('should generate valid HTML with all required fields', () => {
      const html = emailTemplates.issueToTask({
        recipientName: 'Alice Johnson',
        issueTitle: 'Network connectivity problem',
        issueDescription: 'Cannot access shared drive',
        priority: 'critical',
        reportedBy: 'Bob Smith',
        taskId: 'issue-123',
      });

      expect(html).toContain('Alice Johnson');
      expect(html).toContain('Network connectivity problem');
      expect(html).toContain('Cannot access shared drive');
      expect(html).toContain('critical');
      expect(html).toContain('Bob Smith');
      expect(html).toContain('/tasks/issue-123');
    });
  });

  describe('dailyDigest template', () => {
    it('should show overdue tasks section when present', () => {
      const html = emailTemplates.dailyDigest({
        recipientName: 'Manager User',
        overdueTasks: [
          {
            id: '1',
            title: 'Overdue task 1',
            dueDate: '2024-01-01T00:00:00Z',
            priority: 'high',
          },
        ],
        pendingIssues: [],
        todayTasks: [],
      });

      expect(html).toContain('Manager User');
      expect(html).toContain('Gecikmiş Görevler');
      expect(html).toContain('Overdue task 1');
    });

    it('should show today tasks section when present', () => {
      const html = emailTemplates.dailyDigest({
        recipientName: 'Employee User',
        overdueTasks: [],
        pendingIssues: [],
        todayTasks: [
          {
            id: '2',
            title: 'Today task 1',
            priority: 'medium',
          },
        ],
      });

      expect(html).toContain('Bugün Yapılacaklar');
      expect(html).toContain('Today task 1');
    });

    it('should show pending issues section for admins', () => {
      const html = emailTemplates.dailyDigest({
        recipientName: 'Admin User',
        overdueTasks: [],
        pendingIssues: [
          {
            id: '3',
            title: 'Pending issue 1',
            priority: 'high',
            reportedBy: 'John Doe',
          },
        ],
        todayTasks: [],
      });

      expect(html).toContain('Bekleyen Sorunlar');
      expect(html).toContain('Pending issue 1');
      expect(html).toContain('John Doe');
    });

    it('should show success message when no tasks or issues', () => {
      const html = emailTemplates.dailyDigest({
        recipientName: 'Happy User',
        overdueTasks: [],
        pendingIssues: [],
        todayTasks: [],
      });

      expect(html).toContain('Harika!');
      expect(html).toContain('bekleyen göreviniz veya sorun bulunmuyor');
    });
  });

  describe('baseTemplate', () => {
    it('should wrap content with proper HTML structure', () => {
      const content = '<p>Test content</p>';
      const html = emailTemplates.baseTemplate(content);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html>');
      expect(html).toContain('Modern Office System');
      expect(html).toContain(content);
      expect(html).toContain('</html>');
    });

    it('should include current year in footer', () => {
      const html = emailTemplates.baseTemplate('<p>Test</p>');
      const currentYear = new Date().getFullYear();
      
      expect(html).toContain(currentYear.toString());
    });
  });
});
