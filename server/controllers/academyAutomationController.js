const asyncHandler = require('express-async-handler');
const { google } = require('googleapis');
const AutomationLog = require('../models/AutomationLog');

const PARTNERSHIP_CONTEXT = `T.O.I. Souljah Academy and the SYZMEKU engine are preparing a polished Samsung corporate partnership presentation. Keep language strategic, grounded, and review-ready.`;
const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/presentations',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/gmail.compose',
];

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

const getWorkspaceAuthMode = () => {
  if (process.env.GOOGLE_WORKSPACE_CLIENT_EMAIL && process.env.GOOGLE_WORKSPACE_PRIVATE_KEY) {
    return 'service_account';
  }

  if (
    (process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID)
    && process.env.GOOGLE_OAUTH_CLIENT_SECRET
    && process.env.GOOGLE_OAUTH_REFRESH_TOKEN
  ) {
    return 'oauth_refresh_token';
  }

  return 'missing';
};

const getWorkspaceAuth = () => {
  const clientEmail = process.env.GOOGLE_WORKSPACE_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_WORKSPACE_PRIVATE_KEY;
  const subject = process.env.GOOGLE_WORKSPACE_IMPERSONATED_USER;

  if (clientEmail && privateKey) {
    return new google.auth.JWT({
      email: clientEmail,
      key: privateKey.replace(/\\n/g, '\n'),
      scopes: WORKSPACE_SCOPES,
      subject: subject || undefined,
    });
  }

  const oauthClientId = process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  const oauthClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const oauthRefreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;

  if (oauthClientId && oauthClientSecret && oauthRefreshToken) {
    const oauthClient = new google.auth.OAuth2(oauthClientId, oauthClientSecret);
    oauthClient.setCredentials({ refresh_token: oauthRefreshToken });
    return oauthClient;
  }

  const error = new Error('Google Workspace credentials are not configured. Provide service-account credentials or GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, and GOOGLE_OAUTH_REFRESH_TOKEN.');
  error.statusCode = 503;
  throw error;
};

const encodeBase64Url = (value) => Buffer.from(value)
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

const sanitizeRequest = (body = {}, allowedKeys = []) => {
  return allowedKeys.reduce((safe, key) => {
    if (body[key] !== undefined) safe[key] = body[key];
    return safe;
  }, {});
};

const startAutomationLog = (req, command, request) => AutomationLog.create({
  userId: req.user._id,
  command,
  status: 'started',
  request,
});

const markAutomationSucceeded = async (log, { mode, resultSummary = '', assets = [] }) => {
  if (!log) return null;
  log.status = 'succeeded';
  log.mode = mode || '';
  log.resultSummary = resultSummary;
  log.assets = assets;
  log.completedAt = new Date();
  return log.save();
};

const markAutomationFailed = async (log, error) => {
  if (!log) return null;
  log.status = 'failed';
  log.error = {
    message: error?.message || 'Automation failed.',
    code: error?.code || error?.statusCode || '',
  };
  log.completedAt = new Date();
  return log.save().catch(() => null);
};

const summarizeText = (value = '') => String(value).replace(/\s+/g, ' ').trim().slice(0, 280);

const createSlidesDraft = async ({ title, outline }) => {
  const auth = getWorkspaceAuth();
  const slides = google.slides({ version: 'v1', auth });
  const drive = google.drive({ version: 'v3', auth });
  const presentation = await slides.presentations.create({ requestBody: { title } });

  if (process.env.GOOGLE_WORKSPACE_IMPERSONATED_USER) {
    await drive.permissions.create({
      fileId: presentation.data.presentationId,
      requestBody: {
        type: 'user',
        role: 'writer',
        emailAddress: process.env.GOOGLE_WORKSPACE_IMPERSONATED_USER,
      },
      sendNotificationEmail: false,
    }).catch(() => undefined);
  }

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

  return { draftId: draft.data.id, messageId: draft.data.message?.id || '', to, subject };
};

const getAutomationStatus = asyncHandler(async (_req, res) => {
  const workspaceAuthMode = getWorkspaceAuthMode();

  return res.json({
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    workspaceConfigured: workspaceAuthMode !== 'missing',
    workspaceAuthMode,
    serviceAccountConfigured: Boolean(process.env.GOOGLE_WORKSPACE_CLIENT_EMAIL && process.env.GOOGLE_WORKSPACE_PRIVATE_KEY),
    oauthRefreshConfigured: Boolean(
      (process.env.GOOGLE_OAUTH_CLIENT_ID || process.env.GOOGLE_CLIENT_ID)
      && process.env.GOOGLE_OAUTH_CLIENT_SECRET
      && process.env.GOOGLE_OAUTH_REFRESH_TOKEN
    ),
    impersonatedUserConfigured: Boolean(process.env.GOOGLE_WORKSPACE_IMPERSONATED_USER),
    supportedActions: ['deck_draft', 'gmail_draft'],
    sendMode: 'draft_only',
  });
});

const listAutomationLogs = asyncHandler(async (req, res) => {
  const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 25));
  const command = String(req.query?.command || '').trim();
  const status = String(req.query?.status || '').trim();
  const filter = {};

  if (command) filter.command = command;
  if (status) filter.status = status;

  const logs = await AutomationLog.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'email username name role')
    .lean();

  return res.json({ success: true, count: logs.length, logs });
});

const generatePartnershipDeck = asyncHandler(async (req, res) => {
  const request = sanitizeRequest(req.body, ['audience', 'objective', 'title', 'createSlides']);
  const log = await startAutomationLog(req, 'partnership_deck_draft', request);

  try {
    const audience = String(req.body?.audience || 'Samsung corporate partnership review team').trim();
    const objective = String(req.body?.objective || 'Open a strategic partnership path for T.O.I. Souljah Academy and SYZMEKU-powered learning infrastructure.').trim();
    const title = String(req.body?.title || 'T.O.I. Souljah Academy x Samsung Partnership Brief').trim();
    const createSlides = Boolean(req.body?.createSlides);

    const outline = await generateWithGemini(`${PARTNERSHIP_CONTEXT}\nAudience: ${audience}\nObjective: ${objective}\nReturn a concise 8-slide deck outline with titles and bullets. Do not invent signed agreements or existing corporate commitments.`);

    const slidesDraft = createSlides
      ? await createSlidesDraft({ title, outline })
      : null;

    const mode = createSlides ? 'google_slides_draft' : 'text_outline';
    const assets = slidesDraft ? [{
      provider: 'google_slides',
      assetType: 'presentation',
      assetId: slidesDraft.presentationId,
      url: slidesDraft.url,
      title: slidesDraft.title,
    }] : [{
      provider: 'gemini',
      assetType: 'text_outline',
      title,
      metadata: { audience, objective },
    }];

    await markAutomationSucceeded(log, {
      mode,
      resultSummary: summarizeText(outline),
      assets,
    });

    return res.json({
      success: true,
      automationLogId: log._id,
      mode,
      title,
      outline,
      slidesDraft,
    });
  } catch (error) {
    await markAutomationFailed(log, error);
    throw error;
  }
});

const generateOutreachDraft = asyncHandler(async (req, res) => {
  const request = sanitizeRequest(req.body, ['recipient', 'recipientName', 'createDraft']);
  const log = await startAutomationLog(req, 'partnership_outreach_draft', request);

  try {
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

    const mode = createDraft ? 'gmail_draft' : 'text_draft';
    const assets = gmailDraft ? [{
      provider: 'gmail',
      assetType: 'gmail_draft',
      assetId: gmailDraft.draftId,
      messageId: gmailDraft.messageId,
      title: subject,
      metadata: { to: recipient, recipientName },
    }] : [{
      provider: 'gemini',
      assetType: 'text_draft',
      title: subject,
      metadata: { recipientName },
    }];

    await markAutomationSucceeded(log, {
      mode,
      resultSummary: summarizeText(body),
      assets,
    });

    return res.json({
      success: true,
      automationLogId: log._id,
      mode,
      subject,
      body,
      gmailDraft,
    });
  } catch (error) {
    await markAutomationFailed(log, error);
    throw error;
  }
});

module.exports = {
  getAutomationStatus,
  listAutomationLogs,
  generatePartnershipDeck,
  generateOutreachDraft,
};
