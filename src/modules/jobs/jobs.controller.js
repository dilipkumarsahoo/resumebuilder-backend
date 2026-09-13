const jobsService = require('./jobs.service');

const getJobs = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const jobs = await jobsService.getJobsByUserId(userId);
    return res.status(200).json({
      success: true,
      data: jobs
    });
  } catch (error) {
    next(error);
  }
};

const createJob = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { position, company, status, dateSaved, dateApplied, type, resume, notes, location, salary, url } = req.body;
    
    if (!position || !company) {
      return res.status(400).json({
        success: false,
        message: 'Position and company are required'
      });
    }

    const job = await jobsService.createJob(userId, {
      position,
      company,
      status,
      dateSaved,
      dateApplied,
      type,
      resume,
      notes,
      location,
      salary,
      url
    });

    return res.status(201).json({
      success: true,
      message: 'Job added to tracker successfully',
      data: job
    });
  } catch (error) {
    next(error);
  }
};

const updateJob = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    await jobsService.updateJob(id, userId, req.body);
    const updated = await jobsService.getJobById(id, userId);

    return res.status(200).json({
      success: true,
      message: 'Job updated successfully',
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

const deleteJob = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    await jobsService.deleteJob(id, userId);

    return res.status(200).json({
      success: true,
      message: 'Job deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getJobs,
  createJob,
  updateJob,
  deleteJob
};
