import { PERMISSIONS } from "../config/permissions.config.js";

export const permissionMiddleware = (entity, action) => {
  return (req, res, next) => {
    const role = req.user?.role;

    if (!role) {
      return res.status(403).json({
        success: false,
        message: "Role missing in token"
      });
    }

    const entityPermissions = PERMISSIONS[entity];
    if (!entityPermissions) {
      return res.status(403).json({
        success: false,
        message: "Access denied"
      });
    }

    const allowedRoles = entityPermissions[action];
    if (!allowedRoles || !allowedRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions"
      });
    }

    next();
  };
};