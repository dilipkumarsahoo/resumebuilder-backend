const prisma = require('../../config/db');

const getJobsByUserId = async (userId) => {
  return await prisma.job.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });
};

const getJobById = async (id, userId) => {
  return await prisma.job.findFirst({
    where: { id: parseInt(id), userId }
  });
};

const createJob = async (userId, data) => {
  return await prisma.job.create({
    data: {
      userId,
      position: data.position,
      company: data.company,
      status: data.status || 'Bookmarked',
      dateSaved: data.dateSaved || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      dateApplied: data.status === 'Applied' ? (data.dateApplied || new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })) : data.dateApplied,
      type: data.type || 'Full-time',
      resume: data.resume || "Monica's Resume",
      notes: data.notes || '',
      location: data.location || '',
      salary: data.salary || '',
      url: data.url || ''
    }
  });
};

const updateJob = async (id, userId, data) => {
  return await prisma.job.updateMany({
    where: { id: parseInt(id), userId },
    data: {
      ...(data.position !== undefined && { position: data.position }),
      ...(data.company !== undefined && { company: data.company }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.dateSaved !== undefined && { dateSaved: data.dateSaved }),
      ...(data.dateApplied !== undefined && { dateApplied: data.dateApplied }),
      ...(data.type !== undefined && { type: data.type }),
      ...(data.resume !== undefined && { resume: data.resume }),
      ...(data.notes !== undefined && { notes: data.notes }),
      ...(data.location !== undefined && { location: data.location }),
      ...(data.salary !== undefined && { salary: data.salary }),
      ...(data.url !== undefined && { url: data.url })
    }
  });
};

const deleteJob = async (id, userId) => {
  return await prisma.job.deleteMany({
    where: { id: parseInt(id), userId }
  });
};

module.exports = {
  getJobsByUserId,
  getJobById,
  createJob,
  updateJob,
  deleteJob
};
