
/**
 * Toast Notification System
 * Creates and displays non-blocking notifications.
 * @param {string} message - The message to display
 * @param {string} type - 'success', 'error', or 'info'
 * @param {number} duration - Duration in ms (default 3000)
 */
export function showToast(message, type = 'info', duration = 3000) {
    // 1. Ensure Container exists
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.classList.add('toast-container');
        document.body.appendChild(container);
    }

    // 2. Create Toast Element
    const toast = document.createElement('div');
    toast.className = `toast-notification toast-${type}`;

    // Icon based on type
    let icon = '';
    if (type === 'success') icon = '<i class="ph ph-check-circle"></i>';
    else if (type === 'error') icon = '<i class="ph ph-warning-circle"></i>';
    else icon = '<i class="ph ph-info"></i>';

    toast.innerHTML = `
        <div class="toast-content">
            ${icon}
            <span>${message}</span>
        </div>
    `;

    // 3. Append to Container
    container.appendChild(toast);

    // 4. Trigger Animation (next frame)
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // 5. Auto Remove
    setTimeout(() => {
        toast.classList.remove('show');
        toast.addEventListener('transitionend', () => {
            toast.remove();
            if (container.children.length === 0) {
                container.remove(); // Cleanup container if empty
            }
        });
    }, duration);
}
