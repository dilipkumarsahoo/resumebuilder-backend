const { verifyAccessToken } = require('../utils/jwt.util');
const { ApiError } = require('./error.middleware');
const prisma = require('../config/db');

const adminMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'Admin authorization token required');
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    if (!decoded || !decoded.id) {
      throw new ApiError(401, 'Invalid or expired admin access token');
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, role: true, isPro: true, createdAt: true },
    });

    if (!user) {
      throw new ApiError(401, 'User account no longer exists');
    }

    if (user.role !== 'ADMIN') {
      throw new ApiError(403, 'Access denied: Administrator privileges required');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

module.exports = adminMiddleware;
