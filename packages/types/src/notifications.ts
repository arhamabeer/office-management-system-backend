/** An in-app notification for a single recipient. */
export interface NotificationDTO {
  id: string;
  type: string; // e.g. 'leave.decided', 'approval.pending', 'attendance.absent'
  title: string;
  body?: string;
  /** Frontend route to open when clicked (e.g. '/leaves'). */
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationCountDTO {
  unread: number;
}

/** Per-user notification delivery preferences (in-app is always on). */
export interface NotificationPrefsDTO {
  email: boolean;
}
