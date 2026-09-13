import prisma from '../config/db.js';

// GET /notifications - list notifications with pagination
export const getNotifications = async (req, res) => {
    try {
        const { page = 1, limit = 20, unreadOnly } = req.query;
        const parsedPage = Math.max(1, parseInt(page) || 1);
        const parsedLimit = Math.min(100, Math.max(1, parseInt(limit) || 20));
        const skip = (parsedPage - 1) * parsedLimit;

        const filters = { userId: req.user.userId };
        if (unreadOnly === 'true') filters.isRead = false;

        const [notifications, total, unreadCount] = await Promise.all([
            prisma.notification.findMany({
                where: filters,
                orderBy: { createdAt: 'desc' },
                skip,
                take: parsedLimit
            }),
            prisma.notification.count({ where: filters }),
            prisma.notification.count({
                where: { userId: req.user.userId, isRead: false }
            })
        ]);

        res.status(200).json({
            success: true,
            data: notifications,
            meta: {
                total,
                unreadCount,
                page: parsedPage,
                limit: parsedLimit,
                totalPages: Math.ceil(total / parsedLimit)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// PUT /notifications/:id/read - mark one as read
export const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const notification = await prisma.notification.updateMany({
            where: { id, userId: req.user.userId },
            data: { isRead: true }
        });

        if (notification.count === 0) {
            return res.status(404).json({ success: false, error: 'Notification not found' });
        }

        res.status(200).json({ success: true, message: 'Notification marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// PUT /notifications/read-all - mark all as read
export const markAllAsRead = async (req, res) => {
    try {
        await prisma.notification.updateMany({
            where: { userId: req.user.userId, isRead: false },
            data: { isRead: true }
        });
        res.status(200).json({ success: true, message: 'All notifications marked as read' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

// DELETE /notifications/:id - delete one notification
export const deleteNotification = async (req, res) => {
    try {
        const { id } = req.params;
        const deleted = await prisma.notification.deleteMany({
            where: { id, userId: req.user.userId }
        });

        if (deleted.count === 0) {
            return res.status(404).json({ success: false, error: 'Notification not found' });
        }

        res.status(200).json({ success: true, message: 'Notification deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};
