const prisma = require('../../config/db');
const { hashPassword, comparePassword } = require('../../utils/password.util');
const { generateAccessToken, generateRefreshToken } = require('../../utils/jwt.util');
const { ApiError } = require('../../middlewares/error.middleware');
const contactService = require('../contact/contact.service');

// Auto-seed default admin credentials if not present
const seedAdminIfNotExist = async () => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@glowcv.ai';
    const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@12345';

    const existingAdmin = await prisma.user.findUnique({
      where: { email: adminEmail },
    });

    if (!existingAdmin) {
      const hashedPassword = await hashPassword(adminPassword);
      await prisma.user.create({
        data: {
          email: adminEmail,
          password: hashedPassword,
          role: 'ADMIN',
          isPro: true,
        },
      });
      console.log(`[Admin Seed] Default admin account created: ${adminEmail}`);
    } else if (existingAdmin.role !== 'ADMIN') {
      await prisma.user.update({
        where: { email: adminEmail },
        data: { role: 'ADMIN', isPro: true },
      });
      console.log(`[Admin Seed] Updated existing account to ADMIN: ${adminEmail}`);
    }
  } catch (error) {
    console.error('[Admin Seed Error]:', error.message);
  }
};

const adminLogin = async (email, password) => {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new ApiError(401, 'Invalid admin email or password');
  }

  if (user.role !== 'ADMIN') {
    throw new ApiError(403, 'Access denied: Account does not have administrator privileges');
  }

  const isPasswordValid = await comparePassword(password, user.password);
  if (!isPasswordValid) {
    throw new ApiError(401, 'Invalid admin email or password');
  }

  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  const { password: _, ...userWithoutPassword } = user;

  return {
    admin: userWithoutPassword,
    accessToken,
    refreshToken,
  };
};

const getDashboardStats = async () => {
  const [
    totalUsers,
    proUsers,
    totalPayments,
    successfulPayments,
    recentUsers,
    recentPayments,
    totalContacts,
    unreadContacts,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isPro: true } }),
    prisma.payment.count(),
    prisma.payment.findMany({ where: { status: 'SUCCESS' } }),
    prisma.user.findMany({
      take: 6,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        isPro: true,
        createdAt: true,
      },
    }),
    prisma.payment.findMany({
      take: 6,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { email: true } },
      },
    }),
    prisma.contactMessage.count(),
    prisma.contactMessage.count({ where: { status: 'UNREAD' } }),
  ]);

  // Calculate total revenue in INR (from paise)
  const totalRevenuePaise = successfulPayments.reduce((acc, p) => acc + (p.amount || 0), 0);
  const totalRevenueInr = Math.round(totalRevenuePaise / 100);

  const conversionRate = totalUsers > 0 ? ((proUsers / totalUsers) * 100).toFixed(1) : '0';

  return {
    totalUsers,
    proUsers,
    freeUsers: Math.max(0, totalUsers - proUsers),
    totalPayments,
    successfulPaymentsCount: successfulPayments.length,
    totalRevenueInr,
    conversionRate: `${conversionRate}%`,
    recentUsers,
    recentPayments,
    totalContacts,
    unreadContacts,
  };
};

const getUsers = async ({ search = '', isPro, role, page = 1, limit = 20 }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const take = Number(limit);

  const where = {};

  if (search) {
    where.email = { contains: search };
  }

  if (isPro !== undefined && isPro !== '') {
    where.isPro = isPro === 'true' || isPro === true;
  }

  if (role) {
    where.role = role;
  }

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        role: true,
        isPro: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: { payments: true },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    users,
    pagination: {
      total,
      page: Number(page),
      limit: take,
      totalPages: Math.ceil(total / take),
    },
  };
};

const toggleUserPro = async (userId) => {
  const id = Number(userId);
  const user = await prisma.user.findUnique({ where: { id } });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  const updatedUser = await prisma.user.update({
    where: { id },
    data: { isPro: !user.isPro },
    select: {
      id: true,
      email: true,
      role: true,
      isPro: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return updatedUser;
};

const deleteUser = async (userId) => {
  const id = Number(userId);
  const user = await prisma.user.findUnique({ where: { id } });

  if (!user) {
    throw new ApiError(404, 'User not found');
  }

  // Delete associated payments first
  await prisma.payment.deleteMany({ where: { userId: id } });

  // Delete user
  await prisma.user.delete({ where: { id } });

  return { message: 'User and associated data deleted successfully', userId: id };
};

const getPayments = async ({ status = '', page = 1, limit = 20 }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const take = Number(limit);

  const where = {};
  if (status && status !== 'ALL') {
    where.status = status;
  }

  const [payments, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, email: true, role: true, isPro: true },
        },
      },
    }),
    prisma.payment.count({ where }),
  ]);

  return {
    payments,
    pagination: {
      total,
      page: Number(page),
      limit: take,
      totalPages: Math.ceil(total / take),
    },
  };
};

module.exports = {
  seedAdminIfNotExist,
  adminLogin,
  getDashboardStats,
  getUsers,
  toggleUserPro,
  deleteUser,
  getPayments,
  getContactMessages: contactService.getContactMessages,
  updateMessageStatus: contactService.updateMessageStatus,
  deleteContactMessage: contactService.deleteContactMessage,
};
