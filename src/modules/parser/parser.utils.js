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
const commonSkillsList = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'Go', 'Rust',
  'HTML', 'CSS', 'Sass', 'Tailwind', 'Bootstrap',
  'Angular', 'React', 'Vue', 'Next.js', 'Nuxt.js', 'Svelte', 'jQuery',
  'Node.js', 'Express', 'Nest.js', 'Django', 'Flask', 'Spring Boot', 'Laravel',
  'SQL', 'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Oracle', 'SQLite', 'Prisma', 'Sequelize',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Jenkins', 'Git', 'GitHub', 'GitLab', 'CI/CD',
  'UI/UX', 'Figma', 'Sketch', 'Adobe XD', 'Photoshop', 'Illustrator'
];

function isLikelySkill(text) {
  if (!text) return false;
  const t = text.trim().toLowerCase();
  return commonSkillsList.some(s => s.toLowerCase() === t || t.includes(s.toLowerCase()));
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
  const rawLines = cleanText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  // Filter out page numbering artifacts (e.g. "-- 1 of 2 --", "Page 1 of 2", "- 1 -")
  const isPageArtifact = (l) => {
    const s = l.trim();
    return (
      /^[-–—\s*#_]*page\s*\d+(\s*(?:of|\/)\s*\d+)?[-–—\s*#_]*$/i.test(s) ||
      /^[-–—\s*#_]*\d+\s*(?:of|\/)\s*\d+[-–—\s*#_]*$/i.test(s) ||
      /^[-–—\s*#_]*\d+[-–—\s*#_]*$/.test(s) ||
      /^[-–—=_]{2,}$/.test(s)
    );
  };
  const lines = rawLines.filter(l => !isPageArtifact(l));

  // Define section heading patterns with strict anchoring to avoid middle-of-sentence false triggers
  const SECTIONS = {
    SUMMARY: 'summary',
    EXPERIENCE: 'experience',
    EDUCATION: 'education',
    SKILLS: 'skills',
    PROJECTS: 'projects',
    NONE: 'none'
  };

  const patterns = {
    [SECTIONS.SUMMARY]: /^(?:(?:professional\s+|executive\s+|career\s+)?(?:summary|profile|overview)|about\s*me|(?:career\s+)?objective)$/i,
    [SECTIONS.EXPERIENCE]: /^(?:(?:work|professional|employment|career|relevant|job|industry)?\s*(?:experience|history|employment|background)s?|work\s*history|employment\s*history)$/i,
    [SECTIONS.EDUCATION]: /^(?:education(?:s)?|academic\s*(?:background|qualification|qualifications|credentials|history)|degrees?|qualifications?)$/i,
    [SECTIONS.SKILLS]: /^(?:(?:key|core|technical|relevant|professional)?\s*(?:skills|competencies|expertise|technologies|tools)|technical\s*skills|skills\s*(?:&|and)\s*(?:tools|technologies))$/i,
    [SECTIONS.PROJECTS]: /^(?:(?:personal|academic|key|recent|featured|selected)?\s*projects)$/i
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
    const cleanedLine = line.replace(/^[•\-\*\d\.\s#|]+/u, '').replace(/[:\-\.\s]+$/, '').trim();
    let headerMatched = false;
    if (cleanedLine.length > 2 && cleanedLine.length < 45) {
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
  const fullHeader = headerLines.join('\n');

  // Email regex
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = fullHeader.match(emailRegex) || cleanText.match(emailRegex) || [];
  const email = emails[0] || '';

  // Phone regex
  const phoneRegex = /(?:\+?\d{1,4}[-.\s]?)?\(?\d{2,5}\)?[-.\s]?\d{2,5}[-.\s]?\d{3,5}[-.\s]?\d{3,5}/g;
  const phones = fullHeader.match(phoneRegex) || cleanText.match(phoneRegex) || [];
  const validPhones = phones.filter(p => {
    const digits = p.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15 && !p.includes('20') && !p.includes('19');
  });
  const phone = validPhones[0] || '';

  // Full Name: Look in first 6 lines
  let fullName = '';
  let fullNameIndex = -1;
  for (let i = 0; i < Math.min(headerLines.length, 6); i++) {
    const candidate = headerLines[i].replace(/^[-–—•*\s]+|[-–—•*\s]+$/g, '').trim();
    if (
      candidate.length >= 2 &&
      candidate.length < 40 &&
      !candidate.includes('@') &&
      !/\d/.test(candidate) &&
      !/github\.com|linkedin\.com|http|www\./i.test(candidate) &&
      !/resume|cv|curriculum|vitae|profile|portfolio|page/i.test(candidate) &&
      /^[a-zA-Z\s.'-]+$/.test(candidate) &&
      candidate.split(/\s+/).length >= 1 &&
      candidate.split(/\s+/).length <= 5
    ) {
      fullName = candidate;
      fullNameIndex = i;
      break;
    }
  }

  // Job Title: Line right below full name or matching known title keywords in header
  let jobTitle = '';
  const titleKeywords = [
    'developer', 'engineer', 'manager', 'designer', 'analyst', 'consultant',
    'architect', 'lead', 'specialist', 'officer', 'writer', 'administrator',
    'intern', 'executive', 'coordinator', 'scientist', 'programmer',
    'full stack', 'frontend', 'backend', 'devops', 'qa', 'tester'
  ];

  if (fullNameIndex !== -1 && fullNameIndex + 1 < headerLines.length) {
    const nextLine = headerLines[fullNameIndex + 1].trim();
    if (
      nextLine.length > 2 &&
      nextLine.length < 60 &&
      !nextLine.includes('@') &&
      !/github\.com|linkedin\.com|http/i.test(nextLine) &&
      !/\b(19|20)\d{2}\b/.test(nextLine) &&
      !phoneRegex.test(nextLine) &&
      !nextLine.includes('|')
    ) {
      jobTitle = nextLine;
    }
  }

  if (!jobTitle) {
    for (let i = 0; i < headerLines.length; i++) {
      if (i === fullNameIndex) continue;
      const line = headerLines[i].trim();
      if (
        titleKeywords.some(kw => line.toLowerCase().includes(kw)) &&
        !line.includes('@') &&
        !/github\.com|linkedin\.com/i.test(line) &&
        !line.includes('|')
      ) {
        jobTitle = line;
        break;
      }
    }
  }

  // Location: Extract strictly from header lines; NEVER grab from body or skills
  let location = '';
  const locKeywordLine = headerLines.find(l => /location:|address:|based in:|city:/i.test(l));
  if (locKeywordLine) {
    location = locKeywordLine.replace(/location:|address:|based in:|city:/i, '').replace(/^[,\s:\-|•]+|[,\s:\-|•]+$/g, '').trim();
  }

  if (!location) {
    // Check lines with delimiters (e.g. email • phone • San Francisco, CA)
    for (const line of headerLines) {
      if (line.includes('|') || line.includes('•') || line.includes(' - ')) {
        const parts = line.split(/[|•]|(?:\s+-\s+)/).map(p => p.trim()).filter(Boolean);
        for (const part of parts) {
          if (
            !part.includes('@') &&
            !phoneRegex.test(part) &&
            !/github\.com|linkedin\.com|http/i.test(part) &&
            !isLikelySkill(part) &&
            part.length >= 3 &&
            part.length <= 40 &&
            !titleKeywords.some(kw => part.toLowerCase() === kw)
          ) {
            if (part.includes(',') || /^[A-Z][a-zA-Z\s]+$/.test(part)) {
              location = part;
              break;
            }
          }
        }
        if (location) break;
      }
    }
  }

  if (!location) {
    // Check header lines for standard City, State / Country format
    const locationRegex = /\b[A-Z][a-zA-Z\s]{1,25},\s*[A-Za-z\s]{2,20}\b/;
    for (const line of headerLines) {
      if (!line.includes('@') && !/github\.com|linkedin\.com/i.test(line)) {
        const match = line.match(locationRegex);
        if (match && !isLikelySkill(match[0])) {
          location = match[0].trim();
          break;
        }
      }
    }
  }

  // 2. SUMMARY / OBJECTIVE
  let summary = '';
  if (sectionContent[SECTIONS.SUMMARY].length > 0) {
    summary = sectionContent[SECTIONS.SUMMARY].join('\n');
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
      skill.length < 35 &&
      !/^(?:skills|languages|tools|expertise|core|technologies)$/i.test(skill)
    ) {
      if (!skills.includes(skill)) {
        skills.push(skill);
      }
    }
  }

  if (skills.length < 3) {
    const textLower = cleanText.toLowerCase();
    for (const skill of commonSkillsList) {
      const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(textLower) && !skills.map(s => s.toLowerCase()).includes(skill.toLowerCase())) {
        skills.push(skill);
      }
    }
  }

  // 4. EXPERIENCE
  const experience = [];
  const expLines = sectionContent[SECTIONS.EXPERIENCE];

  // Comprehensive Date Range Pattern:
  // Jan 2021 - Present, 01/2021 - Present, 2018 - 2020, 2020 – Current, 05/2020 to 08/2022
  const dateRangePattern = /(?:(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*|\d{1,2})[\s\/\.\-']*)?\b(19\d\d|20\d\d)\b\s*(?:[-–—~]|(?:\s+to\s+)|\s*-\s*)\s*(?:(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*|\d{1,2})[\s\/\.\-']*)?\b(19\d\d|20\d\d|Present|Current|Now|Ongoing)\b/i;

  const entryIndices = [];
  for (let i = 0; i < expLines.length; i++) {
    if (dateRangePattern.test(expLines[i])) {
      entryIndices.push(i);
    }
  }

  for (let k = 0; k < entryIndices.length; k++) {
    const dateLineIdx = entryIndices[k];
    const nextDateLineIdx = entryIndices[k + 1] || expLines.length;

    const dateLine = expLines[dateLineIdx];
    const dateMatch = dateLine.match(dateRangePattern);
    const dateRangeStr = dateMatch ? dateMatch[0] : '';

    // Split without destroying characters in 'Present', 'Oct', etc.
    const dateParts = dateRangeStr.split(/\s*(?:[-–—~]|(?:\s+to\s+))\s*/i);
    const startDate = (dateParts[0] || '').trim();
    const endDate = (dateParts[1] || '').trim();

    const lineWithoutDate = dateLine.replace(dateRangePattern, '').replace(/[()]/g, '').replace(/^[,\s:\-|•\*]+|[,\s:\-|•\*]+$/g, '').trim();

    let role = '';
    let company = '';

    if (lineWithoutDate.length > 2) {
      // Role & company are on same line as date
      const sepMatch = lineWithoutDate.match(/\s+at\s+|\s*[|\-,–—•]\s*/i);
      if (sepMatch) {
        const parts = lineWithoutDate.split(sepMatch[0]);
        role = parts[0].trim();
        company = parts[1].trim();
      } else {
        role = lineWithoutDate;
      }
    } else if (dateLineIdx > 0 && (k === 0 || dateLineIdx - 1 > entryIndices[k - 1])) {
      // Date is on line after role / company
      const prevLine = expLines[dateLineIdx - 1].replace(/^[•\-\*\s]+/, '').trim();
      const sepMatch = prevLine.match(/\s+at\s+|\s*[|\-,–—•]\s*/i);
      if (sepMatch) {
        const parts = prevLine.split(sepMatch[0]);
        role = parts[0].trim();
        company = parts[1].trim();
      } else {
        role = prevLine;
      }
    }

    // Role vs Company refinement using keywords
    if (company && titleKeywords.some(kw => company.toLowerCase().includes(kw)) && !titleKeywords.some(kw => role.toLowerCase().includes(kw))) {
      const tmp = role;
      role = company;
      company = tmp;
    }

    // Collect description lines
    const descLines = [];
    for (let j = dateLineIdx + 1; j < nextDateLineIdx; j++) {
      if (k + 1 < entryIndices.length && j === entryIndices[k + 1] - 1) {
        const nextDateLine = expLines[entryIndices[k + 1]];
        const nextWithoutDate = nextDateLine.replace(dateRangePattern, '').trim();
        if (nextWithoutDate.length <= 2) {
          break; // belongs to next job's header
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

  // If jobTitle still not found, fall back to first job role
  if (!jobTitle && experience.length > 0) {
    jobTitle = experience[0].role;
  }

  // 5. EDUCATION
  const education = [];
  const eduLines = sectionContent[SECTIONS.EDUCATION];
  const eduKeywords = ['university', 'college', 'school', 'institute', 'academy', 'polytechnic', 'campus'];
  const degreeKeywords = ['bachelor', 'master', 'phd', 'doctor', 'b.s.', 'b.a.', 'b.tech', 'm.s.', 'm.a.', 'm.tech', 'diploma', 'associate', 'degree', 'bsc', 'msc', 'bba', 'mba', 'b.e.', 'm.e.'];
  const eduYearRegex = /\b(?:19|20)\d{2}(?:\s*[-–—~to]+\s*(?:(?:19|20)\d{2}|Present|Current))?\b/i;

  let currentEdu = null;
  for (const rawLine of eduLines) {
    const line = rawLine.trim();
    if (!line) continue;

    const lowerLine = line.toLowerCase();
    const isInst = eduKeywords.some(kw => lowerLine.includes(kw));
    const isDeg = degreeKeywords.some(kw => lowerLine.includes(kw)) || /\bb\.[a-z]+|\bm\.[a-z]+/i.test(line);
    const yearMatch = line.match(eduYearRegex);

    if (!currentEdu || (isDeg && currentEdu.degree && currentEdu.institution) || (isInst && currentEdu.institution && currentEdu.degree)) {
      if (currentEdu && (currentEdu.institution || currentEdu.degree)) {
        education.push(currentEdu);
      }
      currentEdu = {
        id: (education.length + 1).toString(),
        institution: '',
        degree: '',
        year: ''
      };
    }

    if (yearMatch && !currentEdu.year) {
      currentEdu.year = yearMatch[0].trim();
    }

    const cleanWithoutYear = line.replace(eduYearRegex, '').replace(/[()]/g, '').replace(/^[,\s:\-|•\*]+|[,\s:\-|•\*]+$/g, '').trim();

    if (isInst && !currentEdu.institution) {
      currentEdu.institution = cleanWithoutYear;
    } else if (isDeg && !currentEdu.degree) {
      currentEdu.degree = cleanWithoutYear;
    } else if (!currentEdu.institution) {
      currentEdu.institution = cleanWithoutYear;
    } else if (!currentEdu.degree) {
      currentEdu.degree = cleanWithoutYear;
    }
  }

  if (currentEdu && (currentEdu.institution || currentEdu.degree)) {
    education.push(currentEdu);
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
