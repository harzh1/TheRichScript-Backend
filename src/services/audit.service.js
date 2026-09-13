/**
 * Audit logging utility for critical operations.
 * Call this within a Prisma transaction to atomically log audit entries.
 *
 * @param {object} tx - Prisma transaction client
 * @param {object} params
 * @param {string} params.userId - The user performing the action
 * @param {string} params.action - AuditAction enum value
 * @param {string} params.entityType - e.g. 'Transaction', 'Debt', 'Goal'
 * @param {string} [params.entityId] - The ID of the affected entity
 * @param {object} [params.oldValues] - Previous state (for updates/deletes)
 * @param {object} [params.newValues] - New state (for creates/updates)
 * @param {object} [params.req] - Express request object (for IP/user-agent)
 */
export const logAudit = async (tx, { userId, action, entityType, entityId, oldValues, newValues, req }) => {
    try {
        await tx.auditLog.create({
            data: {
                userId,
                action,
                entityType,
                entityId: entityId || null,
                oldValues: oldValues || null,
                newValues: newValues || null,
                ipAddress: req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null) : null,
                userAgent: req ? (req.headers['user-agent'] || null) : null
            }
        });
    } catch (error) {
        // Audit logging should never break the main operation
        console.error('[AuditLog] Failed to create audit entry:', error.message);
    }
};
