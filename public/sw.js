self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Routine Tracker', {
      body: data.body ?? "Time to check off today's routines!",
      icon: '/vite.svg',
      badge: '/vite.svg',
      tag: 'routine-reminder',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
