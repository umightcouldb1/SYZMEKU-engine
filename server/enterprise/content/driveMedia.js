const crypto = require('node:crypto');
const workspace = require('./workspaceConnection');
const FILE_ID = /^[a-zA-Z0-9_-]{10,150}$/;
const { readPrivateConfig } = require('./privateConfig');
const fail = (code, statusCode = 409) => { throw Object.assign(new Error(code), { statusCode }); };
const validId = id => typeof id === 'string' && FILE_ID.test(id);
async function createMediaReader({owner, workspaceImpl = workspace, fetchImpl = fetch}) {
  const { BUSINESS_ACCOUNT, ORIGINAL_LOGO_FILE_ID } = readPrivateConfig();
  const {connection, accessToken} = await workspaceImpl.getFreshAccessToken({owner});
  if (!accessToken || String(connection?.userId) !== String(owner) || connection?.status !== 'connected' || !connection?.scopes?.includes('https://www.googleapis.com/auth/drive.file')) fail('DRIVE_DRAFT_AUTH_REQUIRED');
  if (connection?.accountEmail?.toLowerCase() !== BUSINESS_ACCOUNT) fail('GOOGLE_WORKSPACE_ACCOUNT_MISMATCH');
  const request = async (path, accept = 'application/json') => {
    const response = await fetchImpl(`https://www.googleapis.com/drive/v3/${path}`, {
      headers: {Authorization: `Bearer ${accessToken}`, Accept: accept},
      redirect: 'error', signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) fail(`GOOGLE_DRIVE_MEDIA_HTTP_${response.status}`);
    return response;
  };
  async function inspect(fileId, kind) {
    if (!validId(fileId)) fail('INVALID_GOOGLE_FILE_ID', 400);
    const metadata = await (await request(`files/${fileId}?fields=id,name,mimeType,size,sha256Checksum,webViewLink,trashed,owners(emailAddress,me),permissions(type,role,emailAddress),capabilities(canDownload)`)).json();
    if(metadata.owners?.length!==1||metadata.owners[0].me!==true||metadata.owners[0].emailAddress?.toLowerCase()!==BUSINESS_ACCOUNT||!Array.isArray(metadata.permissions)||!metadata.permissions.length||metadata.permissions.some(p=>p.type!=='user'||p.role!=='owner'||p.emailAddress?.toLowerCase()!==BUSINESS_ACCOUNT))fail('GOOGLE_DRIVE_PRIVATE_MEDIA_REQUIRED');
    if (metadata.id !== fileId || metadata.trashed || !metadata.mimeType?.startsWith(kind + '/')) fail('GOOGLE_DRIVE_MEDIA_TYPE_REQUIRED', 400);
    if (metadata.capabilities?.canDownload === false) fail('GOOGLE_DRIVE_MEDIA_READ_REQUIRED');
    const limit = kind === 'image' ? 25 * 1024 * 1024 : 256 * 1024 * 1024;
    if (!Number.isFinite(Number(metadata.size)) || Number(metadata.size) <= 0 || Number(metadata.size) > limit) fail('GOOGLE_DRIVE_MEDIA_SIZE_INVALID', 400);
    let sha256 = metadata.sha256Checksum;
    if (!/^[a-f0-9]{64}$/.test(sha256 || '')) {
      const response = await request(`files/${fileId}?alt=media`, metadata.mimeType);
      if (!response.body) fail('GOOGLE_DRIVE_MEDIA_UNAVAILABLE');
      const digest = crypto.createHash('sha256'); let bytes = 0;
      for await (const part of response.body) {
        bytes += part.length;
        if (bytes > limit) fail('GOOGLE_DRIVE_MEDIA_SIZE_INVALID', 400);
        digest.update(part);
      }
      if (bytes !== Number(metadata.size)) fail('GOOGLE_DRIVE_MEDIA_CHANGED');
      sha256 = digest.digest('hex');
    }
    return {fileId, sha256, size: Number(metadata.size), mimeType: metadata.mimeType, name: String(metadata.name || '').slice(0,200), url: `https://drive.google.com/file/d/${fileId}/view`};
  }
  // Verify the complete bounded bytes BEFORE they can leave Drive for a publisher.
  // No public URL, filesystem staging, credential forwarding or streaming unchecked bytes.
  async function readExactVideo({fileId, sha256, maxBytes = 75 * 1024 * 1024}) {
    if (!/^[a-f0-9]{64}$/.test(sha256 || '') || !Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 256 * 1024 * 1024) fail('C0_MEDIA_LIMIT_INVALID');
    const before = await inspect(fileId, 'video');
    if (before.mimeType !== 'video/mp4' || before.sha256 !== sha256) fail('C0_MEDIA_CHANGED');
    if (before.size > maxBytes) fail('C0_RELEASE_MEDIA_TOO_LARGE');
    const response = await request(`files/${fileId}?alt=media`, 'video/mp4');
    if (!response.body) fail('GOOGLE_DRIVE_MEDIA_UNAVAILABLE');
    const chunks = [], digest = crypto.createHash('sha256'); let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > maxBytes || size > before.size) fail('C0_RELEASE_MEDIA_TOO_LARGE');
      digest.update(chunk); chunks.push(Buffer.from(chunk));
    }
    if (size !== before.size || digest.digest('hex') !== sha256) fail('C0_MEDIA_CHANGED');
    const after = await inspect(fileId, 'video');
    if (after.sha256 !== sha256 || after.size !== size || after.mimeType !== before.mimeType) fail('C0_MEDIA_CHANGED');
    return {buffer: Buffer.concat(chunks, size), mimeType: 'video/mp4', sha256, size};
  }
  async function listImages() {
    const q = encodeURIComponent("trashed=false and (mimeType='image/png' or mimeType='image/jpeg' or mimeType='image/webp')");
    const result = await (await request(`files?q=${q}&pageSize=100&fields=files(id,name,mimeType,webViewLink,sha256Checksum),nextPageToken`)).json();
    return {assets: (result.files || []).filter(f=>validId(f.id)).map(f=>({fileId:f.id,name:f.name,mimeType:f.mimeType,sha256:f.sha256Checksum||null,url:`https://drive.google.com/file/d/${f.id}/view`})), partial:!!result.nextPageToken, originalLogo:await inspect(ORIGINAL_LOGO_FILE_ID,'image'),originalLogoFileId:ORIGINAL_LOGO_FILE_ID};
  }
  return {inspect, listImages, readExactVideo};
}
module.exports = {createMediaReader, validId};
