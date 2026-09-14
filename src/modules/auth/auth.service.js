const jwt = require('jsonwebtoken');
const prisma = require('../../config/db');
const { hashPassword, comparePassword } = require('../../utils/password.util');
const { generateAccessToken, generateRefreshToken } = require('../../utils/jwt.util');
const { ApiError } = require('../../middlewares/error.middleware');
const { sendPasswordResetEmail } = require('../../services/email.service');

const signup = async (email, password) => {
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new ApiError(400, 'User with this email already exists');
  }

  const hashedPassword = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
    },
    select: {
      id: true,
      email: true,
      createdAt: true,
    },
  });

  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  return { user, accessToken, refreshToken };
};

const login = async (email, password) => {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const isPasswordValid = await comparePassword(password, user.password);

  if (!isPasswordValid) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const accessToken = generateAccessToken(user.id);
  const refreshToken = generateRefreshToken(user.id);

  const { password: _, ...userWithoutPassword } = user;

  return { user: userWithoutPassword, accessToken, refreshToken };
};

const forgotPassword = async (email) => {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    throw new ApiError(404, 'No account found with this email address.');
  }

  // Token is signed with (JWT_SECRET + user.password).
  // Once the password changes, the token is automatically invalidated!
  const secret = (process.env.JWT_SECRET || 'secret') + user.password;
  const token = jwt.sign(
    { id: user.id, email: user.email, type: 'reset' },
    secret,
    { expiresIn: '1h' }
  );

  const frontendUrl = process.env.APP_FRONTEND_URL || 'http://localhost:4200';
  const resetUrl = `${frontendUrl}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;

  try {
    await sendPasswordResetEmail(user.email, resetUrl);
  } catch (error) {
    console.error('Error sending reset email:', error);
    // Even if sending throws, if dev mode or fallback is triggered, we don't necessarily crash
  }

  return {
    message: 'A password reset link has been sent to your email.',
    resetUrl: process.env.NODE_ENV === 'development' ? resetUrl : undefined,
  };
};

const resetPassword = async (token, email, newPassword) => {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (!user) {
    throw new ApiError(404, 'User not found.');
  }

  const secret = (process.env.JWT_SECRET || 'secret') + user.password;
  let decoded;
  try {
    decoded = jwt.verify(token, secret);
  } catch (err) {
    throw new ApiError(400, 'Invalid or expired password reset link. Please request a new one.');
  }

  if (decoded.id !== user.id || decoded.type !== 'reset') {
    throw new ApiError(400, 'Invalid password reset token.');
  }

  const hashedPassword = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword },
  });

  return {
    message: 'Your password has been successfully reset. You can now log in.',
  };
};

module.exports = {
  signup,
  login,
  forgotPassword,
  resetPassword,
};

