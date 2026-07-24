const { PDFParse } = require('pdf-parse');
const mammoth = require('mammoth');

/**
 * Extracts printable ASCII/Unicode characters from raw .doc binary buffer as a fallback.
 */
function extractTextFromDoc(buffer) {
  // Convert buffer to string and filter printable characters plus standard spacing
  const rawStr = buffer.toString('utf8');
  let cleanStr = '';
  for (let i = 0; i < rawStr.length; i++) {
    const charCode = rawStr.charCodeAt(i);
    // Allow standard ASCII, tabs, newlines, and some Latin-1 Supplement characters
    if (
      (charCode >= 32 && charCode <= 126) ||
      charCode === 9 || // Tab
      charCode === 10 || // LF
      charCode === 13 || // CR
      (charCode >= 192 && charCode <= 255) // Extended accented chars
    ) {
      cleanStr += rawStr.charAt(i);
    } else {
      cleanStr += ' ';
    }
  }
  // Collapse whitespace and return
  return cleanStr.replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
}

/**
 * Extracts text from file buffer based on mimetype.
 */
async function extractTextFromBuffer(buffer, mimetype, originalname) {
  const extension = originalname ? originalname.split('.').pop().toLowerCase() : '';

  if (mimetype === 'application/pdf' || extension === 'pdf') {
    const pdfParser = new PDFParse({ data: buffer });
    const parsedPdf = await pdfParser.getText();
    return parsedPdf.text || '';
  } else if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    extension === 'docx'
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  } else if (mimetype === 'application/msword' || extension === 'doc') {
    return extractTextFromDoc(buffer);
  } else {
    // Treat as plain text as fallback
    return buffer.toString('utf8');
  }
}

/**
 * Parses raw text extracted from a resume into structured CVData JSON without AI.
 */
function parseResumeText(text) {
  if (!text) {
    return {
      fullName: '',
      jobTitle: '',
      summary: '',
      email: '',
      phone: '',
      location: '',
      skills: [],
      experience: [],
      education: [],
      projects: []
    };
  }

  // Normalize newlines and clean up carriage returns
  const cleanText = text.replace(/\r/g, '');
  const lines = cleanText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  // Define section heading patterns
  const SECTIONS = {
    SUMMARY: 'summary',
    EXPERIENCE: 'experience',
    EDUCATION: 'education',
    SKILLS: 'skills',
    PROJECTS: 'projects',
    NONE: 'none'
  };

  const patterns = {
    [SECTIONS.SUMMARY]: /^(?:professional\s+)?summary|profile|about\s*me|objective|career\s*objective$/i,
    [SECTIONS.EXPERIENCE]: /^(?:work|professional|employment)?\s*experience(?:s)?|work\s*history|employment\s*history$/i,
    [SECTIONS.EDUCATION]: /^education(?:s)?|academic\s*(?:background|qualification|credentials|history)$/i,
    [SECTIONS.SKILLS]: /^skills|key\s*skills|core\s*(?:competencies|skills)|expertise|technologies|technical\s*skills$/i,
    [SECTIONS.PROJECTS]: /^projects|personal\s*projects|academic\s*projects|key\s*projects$/i
  };

  // Group lines by sections
  const sectionContent = {
    [SECTIONS.NONE]: [],
    [SECTIONS.SUMMARY]: [],
    [SECTIONS.EXPERIENCE]: [],
    [SECTIONS.EDUCATION]: [],
    [SECTIONS.SKILLS]: [],
    [SECTIONS.PROJECTS]: []
  };

  let currentSection = SECTIONS.NONE;

  for (const line of lines) {
    // Strip trailing colons, dashes or dots to match heading keywords
    const cleanedLine = line.replace(/[:\-\.\s]+$/, '').trim();
    
    // Check if the line is a section header (usually short, e.g. < 40 characters)
    let headerMatched = false;
    if (cleanedLine.length > 2 && cleanedLine.length < 40) {
      for (const [section, regex] of Object.entries(patterns)) {
        if (regex.test(cleanedLine)) {
          currentSection = section;
          headerMatched = true;
          break;
        }
      }
    }

    if (!headerMatched) {
      sectionContent[currentSection].push(line);
    }
  }

  // 1. EXTRACT PERSONAL DETAILS
  const headerLines = sectionContent[SECTIONS.NONE];
  const fullText = lines.join('\n');

  // Email regex (standard RFC 5322)
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = fullText.match(emailRegex) || [];
  const email = emails[0] || '';

  // Phone regex (captures international & domestic formats, with optional country code, spaces, dashes, parentheses)
  const phoneRegex = /(?:\+?\d{1,4}[-.\s]?)?\(?\d{2,5}\)?[-.\s]?\d{2,5}[-.\s]?\d{3,5}[-.\s]?\d{3,5}/g;
  const phones = fullText.match(phoneRegex) || [];
  // Filter phone matches that look valid (at least 7 digits, not years like 2014-2018)
  const validPhones = phones.filter(p => {
    const digits = p.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15 && !p.includes('-'); // avoid ranges
  });
  const phone = validPhones[0] || (phones[0] ? phones[0].trim() : '');

  // Location search: Look for City, State / City, Country pattern
  let location = '';
  const locationRegex = /[A-Z][a-zA-Z\s]{1,25},\s*[A-Z]{2,3}(?:\s+\d{5})?\b/;
  const locationMatch = fullText.match(locationRegex);
  if (locationMatch) {
    location = locationMatch[0].trim();
  } else {
    // Fallback: look in header lines for keywords like "Location:" or "Address:"
    const locKeywordLine = headerLines.find(l => /location:|address:|lives in/i.test(l));
    if (locKeywordLine) {
      location = locKeywordLine.replace(/location:|address:|lives in/i, '').replace(/^[,\s:\-|•]+|[,\s:\-|•]+$/g, '').trim();
    } else {
      // Fallback 2: Check lines in header for something containing a comma (usually City, ST or City, Country)
      const commaLine = headerLines.find(l => l.includes(',') && !l.includes('@') && !/\d{4,}/.test(l));
      if (commaLine) {
        location = commaLine.trim();
      }
    }
  }

  // Full Name: Usually the first non-empty line of the resume that doesn't contain contact details
  let fullName = '';
  for (let i = 0; i < Math.min(headerLines.length, 5); i++) {
    const line = headerLines[i];
    if (
      line.length > 2 &&
      line.length < 35 &&
      !line.includes('@') &&
      !/github\.com|linkedin\.com/i.test(line) &&
      !/resume|cv|curriculum|vitae/i.test(line) &&
      !/^\+?\d/ .test(line) && // doesn't start with a number
      line.split(/\s+/).length >= 2 // has at least 2 words
    ) {
      fullName = line;
      break;
    }
  }
  // If still empty, grab first line
  if (!fullName && headerLines[0]) {
    fullName = headerLines[0];
  }

  // Job Title: Line right below full name, or check header lines for job keyword indicators
  let jobTitle = '';
  if (fullName) {
    const nameIdx = headerLines.indexOf(fullName);
    if (nameIdx !== -1 && nameIdx + 1 < headerLines.length) {
      const nextLine = headerLines[nameIdx + 1];
      if (
        nextLine.length > 2 &&
        nextLine.length < 50 &&
        !nextLine.includes('@') &&
        !/github\.com|linkedin\.com/i.test(nextLine) &&
        !/\b\d{4}\b/.test(nextLine)
      ) {
        jobTitle = nextLine;
      }
    }
  }
  
  if (!jobTitle) {
    const titleKeywords = ['developer', 'engineer', 'manager', 'designer', 'analyst', 'consultant', 'architect', 'lead', 'specialist', 'officer', 'writer', 'administrator', 'intern', 'executive', 'coordinator'];
    for (const line of headerLines) {
      if (line === fullName) continue;
      if (titleKeywords.some(kw => line.toLowerCase().includes(kw)) && !line.includes('@') && !/github\.com|linkedin\.com/i.test(line)) {
        jobTitle = line;
        break;
      }
    }
  }

  // 2. SUMMARY / OBJECTIVE
  let summary = '';
  if (sectionContent[SECTIONS.SUMMARY].length > 0) {
    summary = sectionContent[SECTIONS.SUMMARY].join('\n');
  } else {
    // If no summary section, look for lines between jobTitle and the first section header
    const summaryLines = [];
    let record = false;
    for (const line of headerLines) {
      if (line === jobTitle) {
        record = true;
        continue;
      }
      if (record) {
        if (line.includes('@') || line.match(phoneRegex) || line === location) {
          continue; // skip contact lines
        }
        summaryLines.push(line);
      }
    }
    if (summaryLines.length > 0) {
      summary = summaryLines.join(' ');
    }
  }

  // 3. SKILLS
  let skills = [];
  const skillsText = sectionContent[SECTIONS.SKILLS].join('\n');
  const separators = /[,;|\t•\n\-\*]/;
  const rawSkills = skillsText.split(separators);
  
  for (let skill of rawSkills) {
    skill = skill.trim();
    if (
      skill &&
      skill.length > 1 &&
      skill.length < 30 &&
      !/skills|languages|tools|expertise|core/i.test(skill)
    ) {
      if (!skills.includes(skill)) {
        skills.push(skill);
      }
    }
  }

  // List of highly common tech/business skills to cross-reference (fallback if section text parsing misses some)
  const commonSkills = [
    'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'Go', 'Rust',
    'HTML', 'CSS', 'Sass', 'Tailwind', 'Bootstrap',
    'Angular', 'React', 'Vue', 'Next.js', 'Nuxt.js', 'Svelte', 'jQuery',
    'Node.js', 'Express', 'Nest.js', 'Django', 'Flask', 'Spring Boot', 'Laravel',
    'SQL', 'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Oracle', 'SQLite', 'Prisma', 'Sequelize',
    'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Jenkins', 'Git', 'GitHub', 'GitLab', 'CI/CD',
    'UI/UX', 'Figma', 'Sketch', 'Adobe XD', 'Photoshop', 'Illustrator',
    'Agile', 'Scrum', 'Project Management', 'Machine Learning', 'Data Science', 'Artificial Intelligence',
    'Communication', 'Leadership', 'Problem Solving', 'Teamwork', 'Time Management'
  ];

  if (skills.length < 3) {
    const textLower = fullText.toLowerCase();
    for (const skill of commonSkills) {
      const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(textLower) && !skills.map(s => s.toLowerCase()).includes(skill.toLowerCase())) {
        skills.push(skill);
      }
    }
  }

  // 4. EXPERIENCE
  const experience = [];
  const expLines = sectionContent[SECTIONS.EXPERIENCE];
  
  // Regex to match date range patterns (e.g. Jan 2021 - Present, 2018 - 2020)
  const dateRangeRegex = /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December|\d{1,2})?\s*\d{4}\s*[-–—to\s]+\s*(?:Present|Current|Now|\d{1,2}?\s*\d{4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|January|February|March|April|May|June|July|August|September|October|November|December)\s*\d{4})/i;

  const jobHeaderIndices = [];
  for (let i = 0; i < expLines.length; i++) {
    if (dateRangeRegex.test(expLines[i])) {
      jobHeaderIndices.push(i);
    }
  }

  for (let k = 0; k < jobHeaderIndices.length; k++) {
    const idx = jobHeaderIndices[k];
    const nextIdx = jobHeaderIndices[k + 1] || expLines.length;
    
    const line = expLines[idx];
    const dateMatch = line.match(dateRangeRegex);
    const dateRange = dateMatch[0];
    
    let headerText = line.replace(dateRange, '').replace(/^[,\s:\-|•\*]+|[,\s:\-|•\*]+$/g, '').trim();
    
    // Check if the previous line should be part of the header (company on one line, role + date on next)
    let prevLine = '';
    if (idx > 0 && (k === 0 || idx - 1 > jobHeaderIndices[k - 1])) {
      prevLine = expLines[idx - 1];
    }
    
    let company = '';
    let role = '';
    
    if (prevLine && prevLine.length < 50 && !prevLine.startsWith('•') && !prevLine.startsWith('-')) {
      role = prevLine;
      company = headerText;
      
      const roleKeywords = ['developer', 'engineer', 'manager', 'designer', 'analyst', 'lead', 'consultant', 'specialist', 'architect', 'officer'];
      if (roleKeywords.some(kw => company.toLowerCase().includes(kw)) && !roleKeywords.some(kw => role.toLowerCase().includes(kw))) {
        const temp = role;
        role = company;
        company = temp;
      }
    } else {
      const sepMatch = headerText.match(/\s+at\s+|\s*[|\-,–—•]\s*/i);
      if (sepMatch) {
        const parts = headerText.split(sepMatch[0]);
        role = parts[0].trim();
        company = parts[1].trim();
      } else {
        role = headerText;
      }
    }
    
    const dates = dateRange.split(/[-–—to]+/i).map(d => d.trim());
    const startDate = dates[0] || '';
    const endDate = dates[1] || '';
    
    // Extract description lines
    const descLines = [];
    for (let j = idx + 1; j < nextIdx; j++) {
      // If next job header uses j as its prevLine, we stop before it
      if (k + 1 < jobHeaderIndices.length && j === jobHeaderIndices[k + 1] - 1) {
        const nextHeaderLine = expLines[jobHeaderIndices[k + 1]];
        // check if nextHeaderLine has a valid prevLine
        if (j > idx && expLines[j].length < 50 && !expLines[j].startsWith('•') && !expLines[j].startsWith('-')) {
          break;
        }
      }
      descLines.push(expLines[j]);
    }
    
    experience.push({
      id: (k + 1).toString(),
      company: company || 'Company Name',
      role: role || 'Job Role',
      startDate,
      endDate,
      description: descLines.join('\n')
    });
  }

  // 5. EDUCATION
  const education = [];
  const eduLines = sectionContent[SECTIONS.EDUCATION];
  
  const eduKeywords = ['university', 'college', 'school', 'institute', 'academy', 'polytechnic'];
  const degreeKeywords = ['bachelor', 'master', 'phd', 'doctor', 'b.s.', 'b.a.', 'b.tech', 'm.s.', 'm.a.', 'm.tech', 'diploma', 'associate', 'degree', 'bsc', 'msc', 'bba', 'mba'];
  
  const eduHeaderIndices = [];
  for (let i = 0; i < eduLines.length; i++) {
    const line = eduLines[i].toLowerCase();
    const hasInst = eduKeywords.some(kw => line.includes(kw));
    const hasDeg = degreeKeywords.some(kw => line.includes(kw)) || /b\.[a-z]+|m\.[a-z]+/i.test(line);
    if (hasInst || hasDeg) {
      eduHeaderIndices.push(i);
    }
  }

  // If no education keywords, look for lines with 4-digit years as headers
  if (eduHeaderIndices.length === 0) {
    for (let i = 0; i < eduLines.length; i++) {
      if (/\b\d{4}\b/.test(eduLines[i])) {
        eduHeaderIndices.push(i);
      }
    }
  }

  for (let k = 0; k < eduHeaderIndices.length; k++) {
    const idx = eduHeaderIndices[k];
    const nextIdx = eduHeaderIndices[k + 1] || eduLines.length;
    
    const linesBlock = eduLines.slice(idx, nextIdx);
    
    let institution = '';
    let degree = '';
    let year = '';
    
    const yearRegex = /\b\d{4}\s*(?:[-–—to\s]+\s*\d{4})?\b/i;
    
    for (const line of linesBlock) {
      const yearMatch = line.match(yearRegex);
      if (yearMatch && !year) {
        year = yearMatch[0];
      }
      
      const lowerLine = line.toLowerCase();
      const isInst = eduKeywords.some(kw => lowerLine.includes(kw));
      const isDeg = degreeKeywords.some(kw => lowerLine.includes(kw)) || /b\.[a-z]+|m\.[a-z]+/i.test(line);
      
      if (isInst) {
        institution = line.replace(yearRegex, '').replace(/^[,\s:\-|•\*]+|[,\s:\-|•\*]+$/g, '').trim();
      } else if (isDeg && !degree) {
        degree = line.replace(yearRegex, '').replace(/^[,\s:\-|•\*]+|[,\s:\-|•\*]+$/g, '').trim();
      }
    }
    
    if (!institution && linesBlock[0]) {
      institution = linesBlock[0].replace(yearRegex, '').replace(/^[,\s:\-|•\*]+|[,\s:\-|•\*]+$/g, '').trim();
    }
    if (!degree && linesBlock[1]) {
      degree = linesBlock[1].replace(yearRegex, '').replace(/^[,\s:\-|•\*]+|[,\s:\-|•\*]+$/g, '').trim();
    } else if (!degree) {
      degree = 'Degree';
    }
    
    education.push({
      id: (k + 1).toString(),
      institution: institution || 'Institution',
      degree: degree,
      year: year || ''
    });
  }

  // 6. PROJECTS
  const projects = [];
  const projLines = sectionContent[SECTIONS.PROJECTS];
  let currentProject = null;
  let projCount = 0;

  for (let i = 0; i < projLines.length; i++) {
    const line = projLines[i];
    const isBullet = line.startsWith('•') || line.startsWith('-') || line.startsWith('*');
    const cleanLine = line.replace(/^[•\-\*\s]+/, '').trim();
    
    if (!isBullet && cleanLine.length > 2 && cleanLine.length < 50 && !cleanLine.includes('.') && i + 1 < projLines.length) {
      if (currentProject) {
        projects.push(currentProject);
      }
      projCount++;
      currentProject = {
        id: projCount.toString(),
        name: cleanLine,
        description: ''
      };
    } else if (currentProject) {
      const bulletContent = line.replace(/^[•\-\*\s]+/, '').trim();
      if (currentProject.description) {
        currentProject.description += '\n' + bulletContent;
      } else {
        currentProject.description = bulletContent;
      }
    } else {
      projCount++;
      currentProject = {
        id: projCount.toString(),
        name: cleanLine.substring(0, Math.min(30, cleanLine.length)) + (cleanLine.length > 30 ? '...' : ''),
        description: cleanLine
      };
    }
  }
  if (currentProject) {
    projects.push(currentProject);
  }

  return {
    fullName: fullName || 'Full Name',
    jobTitle: jobTitle || 'Job Title',
    summary: summary || 'Professional Summary',
    email: email || 'Email Address',
    phone: phone || 'Phone Number',
    location: location || 'Location',
    skills: skills.length > 0 ? skills : ['HTML', 'CSS', 'JavaScript'],
    experience: experience.length > 0 ? experience : [],
    education: education.length > 0 ? education : [],
    projects: projects.length > 0 ? projects : []
  };
}

module.exports = {
  extractTextFromBuffer,
  parseResumeText
};
