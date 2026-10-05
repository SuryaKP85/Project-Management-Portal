/**
 * Sprint 21A — the notification bell list.
 *
 * Notification titles and messages are untrusted: they quote names users
 * typed, such as story titles. Every value goes in through textContent or
 * setAttribute and is never parsed as markup, whatever the server sent.
 */

const ICONS = {
  risk: 'fa-shield-halved text-danger',
  leave: 'fa-umbrella-beach text-success',
  budget: 'fa-circle-exclamation text-warning',
  project: 'fa-diagram-project text-primary',
};

const textSpan = (className, text) => {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = String(text ?? '');
  return span;
};

/** Replaces the container's content with the notifications; onRead(id, item) runs when an unread one is clicked. */
export function renderNotifications(container, notifications, onRead) {
  container.replaceChildren(...notifications.map((n) => {
    const isUnread = !n.read;
    const item = document.createElement('div');
    item.className = isUnread ? 'notification-item unread' : 'notification-item';
    item.setAttribute('data-id', String(n.id ?? ''));
    item.style.cursor = 'pointer';

    const iconBox = document.createElement('div');
    iconBox.className = 'notification-icon';
    const icon = document.createElement('i');
    icon.className = `fa-solid ${Object.hasOwn(ICONS, n.type) ? ICONS[n.type] : 'fa-bell text-info'}`;
    iconBox.appendChild(icon);

    const info = document.createElement('div');
    info.className = 'notification-info';
    info.appendChild(textSpan('notification-title fw-bold', n.title));
    info.appendChild(textSpan('notification-text text-muted', n.message));
    info.appendChild(textSpan('notification-time small', new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));

    item.appendChild(iconBox);
    item.appendChild(info);
    if (isUnread && n.id) item.addEventListener('click', () => onRead(String(n.id), item));
    return item;
  }));
}
