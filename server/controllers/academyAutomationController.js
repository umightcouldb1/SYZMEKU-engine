const asyncHandler = require('express-async-handler');
const { google } = require('googleapis');

const PARTNERSHIP_CONTEXT = `T.O.I. Souljah Academy and the SYZMEKU engine are preparing a polished Samsung corporate partnership presentation. Keep language strategic, grounded, and review-ready.`;

let genAiClientPromise;

const getGeminiClient = async () => {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error('GEMINI_API_KEY is not configured.');
    error.statusCode = 503;
    throw error;
  }

  if (!genAiClientPromise) {
    genAiClientPromise = import('@google/genai').then(({ GoogleGenAI }) => new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    }));
  }

  return genAiClientPromise;
};

const extractText = (response) => {
  if (!response) return '';
  if (typeof response.text === 'function') return response.text();
  if (typeof response.text === 'string') return response.text;
  return JSON.stringify(response);
};

const generateWithGemini = async (prompt) => {
  const ai = await getGeminiClient();
  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    contents: prompt,
  });
  return extractText(response);
};

const getWorkspaceAuth = () => {
  const clientEmail = process.env.GOOGLE_WORKSPACE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_WORKSPACE_PRIVATE_KEY;
  const subject = process.env.GOOGLE_WORKSPACE_IMPERSONATED_USER;

  if (!clientEmail || !privateKey) {
    const error = new Error('Google Workspace service account credentials are not configured.');
    error.statusCode = 503;
    throw error;
  }

  return new google.auth.JWT({
    email: clientEmail,
    key: privateKey.replace(/\\n/g, '\n'),
    scopes: [
      'https://www.googleapis.com/auth/presentations',
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/gmail.compose',
    ],
    subject: subject || undefined,
  });
};

const encodeBase64Url = (value) => Buffer.from(value)
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

const createSlidesDraft = async ({ title, outline }) => {
  const auth = getWorkspaceAuth();
  const slides = google.slides({ version: 'v1', auth });
  const drive = google.drive({ version: 'v3', auth });
  const presentation = await slides.presentations.create({ requestBody: { title } });

  await drive.permissions.create({
    fileId: presentation.data.presentationId,
    requestBody: {
      type: 'user',
      role: 'writer',
      emailAddress: process.env.GOOGLE_WORKSPACE_IMPERSONATED_USER,
    },
    sendNotificationEmail: false,
  }).catch(() => undefined);

  return {
    presentationId: presentation.data.presentationId,
    title,
    outline,
    url: `https://docs.google.com/presentation/d/${presentation.data.presentationId}/edit`,
  };
};

const createGmailDraft = async ({ to, subject, body }) => {
  const auth = getWorkspaceAuth();
  const gmail = google.gmail({ version: 'v1', auth });
  const sender = process.env.GOOGLE_WORKSPACE_IMPERSONATED_USER || 'me';
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    body,
  ].join('\r\n');

  const draft = await gmail.users.drafts.create({
    userId: sender,
    requestBody: {
      message: { raw: encodeBase64Url(message) },
    },
  });

  return { draftId: draft.data.id, to, subject };
};

const getAutomationStatus = asyncHandler(async (_req, res) => {
  return res.json({
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    workspaceConfigured: Boolean(process.env.GOOGLE_WORKSPACE_CLIENT_EMAIL && process.env.GOOGLE_WORKSPACE_PRIVATE_KEY),
    impersonatedUserConfigured: Boolean(process.env.GOOGLE_WORKSPACE_IMPERSONATED_USER),
    supportedActions: ['deck_draft', 'gmail_draft'],
    sendMode: 'draft_only',
  });
});

const generatePartnershipDeck = asyncHandler(async (req, res) => {
  const audience = String(req.body?.audience || 'Samsung corporate partnership review team').trim();
  const objective = String(req.body?.objective || 'Open a strategic partnership path for T.O.I. Souljah Academy and SYZMEKU-powered learning infrastructure.').trim();
  const title = String(req.body?.title || 'T.O.I. Souljah Academy x Samsung Partnership Brief').trim();
  const createSlides = Boolean(req.body?.createSlides);

  const outline = await generateWithGemini(`${PARTNERSHIP_CONTEXT}\nAudience: ${audience}\nObjective: ${objective}\nReturn a concise 8-slide deck outline with titles and bullets. Do not invent signed agreements or existing corporate commitments.`);

  const slidesDraft = createSlides
    ? await createSlidesDraft({ title, outline })
    : null;

  return res.json({
    success: true,
    mode: createSlides ? 'google_slides_draft' : 'text_outline',
    title,
    outline,
    slidesDraft,
  });
});

const generateOutreachDraft = asyncHandler(async (req, res) => {
  const recipient = String(req.body?.recipient || '').trim();
  const recipientName = String(req.body?.recipientName || 'Samsung Partnership Team').trim();
  const createDraft = Boolean(req.body?.createDraft);

  if (createDraft && !recipient) {
    return res.status(400).json({ message: 'recipient is required to create a Gmail draft.' });
  }

  const subject = 'Partnership Brief: T.O.I. Souljah Academy x Samsung';
  const body = await generateWithGemini(`${PARTNERSHIP_CONTEXT}\nDraft a concise, professional partnership outreach email to ${recipientName}. It must ask for a conversation, avoid pressure, avoid false claims, and stay suitable for human review before sending.`);

  const gmailDraft = createDraft
    ? await createGmailDraft({ to: recipient, subject, body })
    : null;

  return res.json({
    success: true,
    mode: createDraft ? 'gmail_draft' : 'text_draft',
    subject,
    body,
    gmailDraft,
  });
});

module.exports = {
  getAutomationStatus,
  generatePartnershipDeck,
  generateOutreachDraft,
};
