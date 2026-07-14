import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VITE_VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = new Date();
  const roundedMinutes = Math.round(now.getUTCMinutes() / 5) * 5;
  const overflow = roundedMinutes >= 60;
  const hours = String(overflow ? (now.getUTCHours() + 1) % 24 : now.getUTCHours()).padStart(2, '0');
  const minutes = String(overflow ? 0 : roundedMinutes).padStart(2, '0');
  const currentTime = `${hours}:${minutes}`;

  const { data: settings, error } = await supabase
    .from('user_settings')
    .select('push_subscription')
    .eq('reminder_time', currentTime)
    .not('push_subscription', 'is', null);

  if (error) return res.status(500).json({ error: error.message });

  const results = await Promise.allSettled(
    (settings || []).map((s) =>
      webpush.sendNotification(
        s.push_subscription,
        JSON.stringify({
          title: 'Routine Tracker',
          body: "Time to check off today's routines!",
        })
      )
    )
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;
  return res.json({ sent, failed, time: currentTime });
}
