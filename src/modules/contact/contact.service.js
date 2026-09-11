const prisma = require('../../config/db');
const { ApiError } = require('../../middlewares/error.middleware');

const createContactMessage = async ({ name, email, subject, message }) => {
  if (!name || !email || !message) {
    throw new ApiError(400, 'Name, email, and message are required fields.');
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ApiError(400, 'Please provide a valid email address.');
  }

  const contact = await prisma.contactMessage.create({
    data: {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: subject ? subject.trim() : 'General Inquiry',
      message: message.trim(),
      status: 'UNREAD',
    },
  });

  return contact;
};

const getContactMessages = async ({ status, page = 1, limit = 15 }) => {
  const skip = (Number(page) - 1) * Number(limit);
  const take = Number(limit);

  const where = {};
  if (status && status !== 'ALL') {
    where.status = status;
  }

  const [messages, total] = await Promise.all([
    prisma.contactMessage.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.contactMessage.count({ where }),
  ]);

  return {
    messages,
    pagination: {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / take) || 1,
    },
  };
};

const updateMessageStatus = async (id, status) => {
  const messageId = parseInt(id, 10);
  const existing = await prisma.contactMessage.findUnique({
    where: { id: messageId },
  });

  if (!existing) {
    throw new ApiError(404, 'Contact message not found.');
  }

  const updated = await prisma.contactMessage.update({
    where: { id: messageId },
    data: { status },
  });

  return updated;
};

const deleteContactMessage = async (id) => {
  const messageId = parseInt(id, 10);
  const existing = await prisma.contactMessage.findUnique({
    where: { id: messageId },
  });

  if (!existing) {
    throw new ApiError(404, 'Contact message not found.');
  }

  await prisma.contactMessage.delete({
    where: { id: messageId },
  });

  return { success: true };
};

module.exports = {
  createContactMessage,
  getContactMessages,
  updateMessageStatus,
  deleteContactMessage,
};
