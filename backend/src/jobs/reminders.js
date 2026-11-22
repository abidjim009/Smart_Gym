import cron from 'node-cron';
import { pool } from '../db.js';

function isWithinQuietHours(nowHHMM, quietStart, quietEnd) {
  if (!quietStart || !quietEnd) return false;
  if (quietStart <= quietEnd) {
    return nowHHMM >= quietStart && nowHHMM <= quietEnd;
  }
  return nowHHMM >= quietStart || nowHHMM <= quietEnd;
}

export function startReminderScheduler() {
  cron.schedule('*/15 * * * *', async () => {
    try {
      const now = new Date();
      const hhmm = now.toTimeString().slice(0, 5);
      const [rows] = await pool.query(
        'SELECT r.user_id, r.reminder_time, r.quiet_start, r.quiet_end FROM reminder_settings r WHERE r.enabled = 1'
      );

      for (const row of rows) {
        if (isWithinQuietHours(hhmm, row.quiet_start, row.quiet_end)) continue;
        if (!row.reminder_time || row.reminder_time.slice(0, 5) !== hhmm) continue;

        const [alreadySent] = await pool.query(
          'SELECT id FROM notifications WHERE user_id = ? AND DATE(created_at) = CURDATE() AND title = "Daily Movement Nudge"',
          [row.user_id]
        );
        if (!alreadySent.length) {
          await pool.query(
            'INSERT INTO notifications (user_id, title, body) VALUES (?, ?, ?)',
            [row.user_id, 'Daily Movement Nudge', 'Ready for today’s session? Even 15 minutes keeps your streak alive.']
          );
        }
      }
    } catch {
      // Keep the scheduler resilient if MySQL is temporarily unavailable.
    }
  });
}
