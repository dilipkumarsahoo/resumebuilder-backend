const { parseResumeText } = require('../parser/parser.utils');

/**
 * Clean and parse raw JSON returned by AI
 */
function cleanAndParseJSON(rawResponse) {
  if (!rawResponse) return null;
  
  let cleaned = rawResponse.trim();
  // Remove markdown codeblock syntax if present
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/i, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  
  try {
    return JSON.parse(cleaned.trim());
  } catch (err) {
    console.warn('Failed to parse AI response as JSON directly, attempting fallback extraction:', err.message);
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (innerErr) {
        console.error('Inner JSON parsing error:', innerErr);
      }
    }
    return null;
  }
}

/**
 * Format and sanitize the structured resume data ensuring all required fields are present
 */
function sanitizeParsedResume(data) {
  return {
    personal: {
      fullName: data?.personal?.fullName || data?.fullName || '',
      email: data?.personal?.email || data?.email || '',
      phone: data?.personal?.phone || data?.phone || '',
      location: data?.personal?.location || data?.location || '',
      linkedin: data?.personal?.linkedin || data?.linkedin || '',
      website: data?.personal?.website || data?.website || ''
    },
    summary: data?.summary || '',
    experience: Array.isArray(data?.experience)
      ? data.experience.map(exp => ({
          company: exp?.company || '',
          jobTitle: exp?.jobTitle || exp?.role || '',
          location: exp?.location || '',
          startDate: exp?.startDate || '',
          endDate: exp?.endDate || '',
          description: exp?.description || ''
        }))
      : [],
    education: Array.isArray(data?.education)
      ? data.education.map(edu => ({
          institution: edu?.institution || '',
          degree: edu?.degree || '',
          fieldOfStudy: edu?.fieldOfStudy || '',
          location: edu?.location || '',
          startDate: edu?.startDate || '',
          endDate: edu?.endDate || edu?.year || ''
        }))
      : [],
    skills: Array.isArray(data?.skills)
      ? data.skills.map(s => (typeof s === 'string' ? s.trim() : String(s))).filter(Boolean)
      : [],
    projects: Array.isArray(data?.projects)
      ? data.projects.map(proj => ({
          name: proj?.name || '',
          description: proj?.description || '',
          url: proj?.url || '',
          technologies: Array.isArray(proj?.technologies) ? proj.technologies : []
        }))
      : [],
    certifications: Array.isArray(data?.certifications)
      ? data.certifications.map(cert => ({
          name: cert?.name || '',
          issuer: cert?.issuer || '',
          date: cert?.date || ''
        }))
      : []
  };
}

/**
 * AI Resume Parser using Google Gemini with reliable fallback to heuristic parser
 */
async function parseResumeWithAI(rawText) {
  if (!rawText || rawText.trim().length === 0) {
    throw new Error('Empty resume text provided for parsing.');
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    try {
      let GoogleGenAI;
      try {
        const genaiModule = require('@google/genai');
        GoogleGenAI = genaiModule.GoogleGenAI;
      } catch (e) {
        console.warn('@google/genai package not found, falling back to heuristic parser');
      }

      if (GoogleGenAI) {
        const ai = new GoogleGenAI({ apiKey });
        const systemPrompt = `You are an expert AI Resume Parser.
Analyze the following resume text and extract the candidate's information into a STRICT, valid JSON object matching the exact schema below.

JSON SCHEMA:
{
  "personal": {
    "fullName": "Full Name",
    "email": "email@example.com",
    "phone": "+1234567890",
    "location": "City, Country or State",
    "linkedin": "LinkedIn profile URL or handle",
    "website": "Personal portfolio or GitHub URL"
  },
  "summary": "Professional summary or career objective",
  "experience": [
    {
      "company": "Company Name",
      "jobTitle": "Job Role / Title",
      "location": "City, Country",
      "startDate": "Month Year or Year",
      "endDate": "Month Year, Present, or Year",
      "description": "Key responsibilities, accomplishments and impact"
    }
  ],
  "education": [
    {
      "institution": "University or School Name",
      "degree": "Degree Title (e.g. Bachelor of Science)",
      "fieldOfStudy": "Major / Field of Study (e.g. Computer Science)",
      "location": "City, Country",
      "startDate": "Start Year",
      "endDate": "Graduation Year"
    }
  ],
  "skills": ["Skill 1", "Skill 2", "Skill 3"],
  "projects": [
    {
      "name": "Project Name",
      "description": "Project details and outcome",
      "url": "Project link if any",
      "technologies": ["Tech 1", "Tech 2"]
    }
  ],
  "certifications": [
    {
      "name": "Certification Name",
      "issuer": "Issuing Organization",
      "date": "Issue Date"
    }
  ]
}

CRITICAL RULES:
1. Extract ONLY information actually present in the resume text. Never hallucinate or invent missing details.
2. Use empty string "" for missing text fields.
3. Use empty array [] for missing list fields.
4. Keep dates as they appear in the resume.
5. Return ONLY valid JSON, with NO surrounding explanation or markdown formatting.`;

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `${systemPrompt}\n\nRESUME TEXT:\n${rawText}`
        });

        if (response && response.text) {
          const parsedJSON = cleanAndParseJSON(response.text);
          if (parsedJSON) {
            return sanitizeParsedResume(parsedJSON);
          }
        }
      }
    } catch (aiErr) {
      console.warn('AI Parsing failed or was throttled, falling back to heuristic parser:', aiErr.message);
    }
  }

  // Heuristic parsing fallback
  const heuristicData = parseResumeText(rawText);
  return sanitizeParsedResume({
    personal: {
      fullName: heuristicData.fullName || '',
      email: heuristicData.email || '',
      phone: heuristicData.phone || '',
      location: heuristicData.location || '',
      linkedin: '',
      website: ''
    },
    summary: heuristicData.summary || '',
    experience: (heuristicData.experience || []).map(exp => ({
      company: exp.company || '',
      jobTitle: exp.role || '',
      location: '',
      startDate: exp.startDate || '',
      endDate: exp.endDate || '',
      description: exp.description || ''
    })),
    education: (heuristicData.education || []).map(edu => ({
      institution: edu.institution || '',
      degree: edu.degree || '',
      fieldOfStudy: '',
      location: '',
      startDate: '',
      endDate: edu.year || ''
    })),
    skills: heuristicData.skills || [],
    projects: (heuristicData.projects || []).map(proj => ({
      name: proj.name || '',
      description: proj.description || '',
      url: '',
      technologies: []
    })),
    certifications: []
  });
}

module.exports = {
  parseResumeWithAI,
  sanitizeParsedResume
};
