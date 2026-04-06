import axios from 'axios';
import FormData from 'form-data';
import ffmpeg from 'fluent-ffmpeg';
import installer from '@ffmpeg-installer/ffmpeg';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { config } from '../config';
import { dbQueries } from '../memory/sqlite';

ffmpeg.setFfmpegPath(installer.path);

const GROQ_TTS_PROVIDER = "groq-tts";
const GOOGLE_TTS_PROVIDER = "google-tts";
const GROQ_TTS_VOICE = "daniel";
const GOOGLE_TTS_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

type GoogleServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  project_id?: string;
  token_uri?: string;
};

let googleTokenCache:
  | {
      accessToken: string;
      expiresAt: number;
    }
  | null = null;

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function parseGoogleTtsCredentials(): GoogleServiceAccountCredentials | null {
  const raw = config.GOOGLE_TTS_CREDENTIALS_B64
    ? Buffer.from(config.GOOGLE_TTS_CREDENTIALS_B64, "base64").toString("utf8")
    : config.GOOGLE_TTS_CREDENTIALS_JSON;

  if (!raw.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<GoogleServiceAccountCredentials>;
    if (!parsed.client_email || !parsed.private_key) {
      return null;
    }
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key,
      project_id: parsed.project_id,
      token_uri: parsed.token_uri || "https://oauth2.googleapis.com/token",
    };
  } catch (error) {
    console.error("[Audio] Failed to parse Google TTS credentials:", error);
    return null;
  }
}

function isGoogleTtsConfigured(): boolean {
  return Boolean(config.GOOGLE_TTS_PROJECT_ID && parseGoogleTtsCredentials());
}

function getGoogleTtsTextBytes(text: string): number {
  return Buffer.byteLength(text, "utf8");
}

function getSpeechCharacterCount(text: string): number {
  return Array.from(text).length;
}

function getGoogleTtsUsageSnapshot() {
  return dbQueries.getCurrentMonthSpeechUsageForProvider(GOOGLE_TTS_PROVIDER);
}

function getGoogleTtsEligibility(text: string) {
  if (!isGoogleTtsConfigured()) {
    return { allowed: false, reason: "Google TTS is not configured." };
  }

  const nextBytes = getGoogleTtsTextBytes(text);
  if (nextBytes > config.GOOGLE_TTS_MAX_BYTES_PER_REQUEST) {
    return {
      allowed: false,
      reason: `Request is ${nextBytes} bytes, above Google limit guard of ${config.GOOGLE_TTS_MAX_BYTES_PER_REQUEST}.`,
    };
  }

  const usage = getGoogleTtsUsageSnapshot();
  const nextCharacters = getSpeechCharacterCount(text);
  if (usage.totalCharacters + nextCharacters > config.GOOGLE_TTS_MONTHLY_CHAR_LIMIT) {
    return {
      allowed: false,
      reason: `Monthly Google soft cap reached (${usage.totalCharacters}/${config.GOOGLE_TTS_MONTHLY_CHAR_LIMIT} chars).`,
    };
  }

  return {
    allowed: true,
    reason: null,
    nextBytes,
    usedCharacters: usage.totalCharacters,
  };
}

async function getGoogleAccessToken(): Promise<string> {
  if (googleTokenCache && googleTokenCache.expiresAt > Date.now()) {
    return googleTokenCache.accessToken;
  }

  const credentials = parseGoogleTtsCredentials();
  if (!credentials) {
    throw new Error("Google TTS credentials are missing.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: credentials.client_email,
    scope: GOOGLE_TTS_SCOPE,
    aud: credentials.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const unsignedToken = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();
  const signature = signer.sign(credentials.private_key);
  const assertion = `${unsignedToken}.${base64UrlEncode(signature)}`;

  const tokenResponse = await axios.post(
    credentials.token_uri || "https://oauth2.googleapis.com/token",
    new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 20000,
    },
  );

  const accessToken = tokenResponse.data?.access_token as string | undefined;
  const expiresIn = Number(tokenResponse.data?.expires_in ?? 3600);

  if (!accessToken) {
    throw new Error("Google OAuth token response did not contain an access token.");
  }

  googleTokenCache = {
    accessToken,
    expiresAt: Date.now() + Math.max(expiresIn - 60, 60) * 1000,
  };

  return accessToken;
}

function extractAxiosErrorMessage(error: any): string {
  if (!error?.response?.data) {
    return error?.message || String(error);
  }

  const data = error.response.data;
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }

  if (typeof data === "string") {
    return data;
  }

  if (typeof data === "object" && data.error?.message) {
    return String(data.error.message);
  }

  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

function recordSpeechUsage(provider: string, voice: string, text: string, notes?: string) {
  dbQueries.addSpeechUsageEntry({
    provider,
    voice,
    characters: getSpeechCharacterCount(text),
    status: "success",
    notes: notes ?? null,
  });
}

export function getSpeechUsageReport(): string {
  const rows = dbQueries.getCurrentMonthSpeechUsage();
  const lines: string[] = ["🎙️ *Speech Usage This Month*"];

  if (rows.length === 0) {
    lines.push("No speech generated yet this month.");
  } else {
    for (const row of rows) {
      lines.push(`🔹 \`${row.provider}\` — ${row.totalCharacters.toLocaleString()} chars across ${row.calls} calls`);
    }
  }

  if (isGoogleTtsConfigured()) {
    const googleUsage = getGoogleTtsUsageSnapshot();
    const remaining = Math.max(config.GOOGLE_TTS_MONTHLY_CHAR_LIMIT - googleUsage.totalCharacters, 0);
    lines.push("");
    lines.push(
      `Google soft cap: ${googleUsage.totalCharacters.toLocaleString()} / ${config.GOOGLE_TTS_MONTHLY_CHAR_LIMIT.toLocaleString()} chars`,
    );
    lines.push(`Remaining before Groq fallback: ${remaining.toLocaleString()} chars`);
    lines.push(`Voice: \`${config.GOOGLE_TTS_VOICE_NAME}\``);
  } else {
    lines.push("");
    lines.push("Google TTS is not configured, so Hiro will use Groq for speech.");
  }

  return lines.join("\n");
}

// Voice transcription remains on Groq Whisper V3.
export async function processAudioToText(telegramFileUrl: string): Promise<string> {
  const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tempOgg = path.join(os.tmpdir(), `audio_${uniqueId}.ogg`);
  const tempWav = path.join(os.tmpdir(), `audio_${uniqueId}.wav`);

  try {
    console.log('[Audio] Downloading OGG from Telegram...');
    const response = await axios.get(telegramFileUrl, { responseType: 'stream' });
    const writeStream = fs.createWriteStream(tempOgg);

    await new Promise<void>((resolve, reject) => {
      response.data.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
      response.data.on('error', reject);
    });

    console.log('[Audio] Converting to 16kHz WAV for Whisper...');
    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempOgg)
        .toFormat('wav')
        .audioChannels(1)
        .audioFrequency(16000)
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(tempWav);
    });

    console.log('[Audio] Sending to Groq Whisper V3...');
    const formData = new FormData();
    formData.append('file', fs.createReadStream(tempWav), {
      filename: 'audio.wav',
      contentType: 'audio/wav',
    });
    formData.append('model', 'whisper-large-v3');
    formData.append('response_format', 'text');

    const groqRes = await axios.post('https://api.groq.com/openai/v1/audio/transcriptions', formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${config.GROQ_API_KEY}`,
      },
    });

    return typeof groqRes.data === 'string'
      ? groqRes.data.trim()
      : String(groqRes.data).trim();
  } catch (err: any) {
    console.error('[Audio] STT failed:', err.response?.data || err.message);
    throw new Error("I had trouble understanding that audio.");
  } finally {
    try { if (fs.existsSync(tempOgg)) fs.unlinkSync(tempOgg); } catch {}
    try { if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav); } catch {}
  }
}

async function generateSpeechFromGroq(text: string): Promise<Buffer> {
  const uniqueId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const tempWav = path.join(os.tmpdir(), `tts_${uniqueId}.wav`);
  const tempOgg = path.join(os.tmpdir(), `tts_${uniqueId}.ogg`);

  try {
    console.log(`[Audio] Synthesizing speech via Groq Orpheus TTS...`);
    const response = await axios.post(
      'https://api.groq.com/openai/v1/audio/speech',
      {
        model: 'canopylabs/orpheus-v1-english',
        input: text,
        voice: GROQ_TTS_VOICE,
        response_format: 'wav',
      },
      {
        headers: {
          'Authorization': `Bearer ${config.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        responseType: 'arraybuffer',
      },
    );

    fs.writeFileSync(tempWav, Buffer.from(response.data));

    await new Promise<void>((resolve, reject) => {
      ffmpeg(tempWav)
        .toFormat('ogg')
        .audioCodec('libopus')
        .on('end', () => resolve())
        .on('error', (err) => reject(err))
        .save(tempOgg);
    });

    const oggBuffer = fs.readFileSync(tempOgg);
    recordSpeechUsage(GROQ_TTS_PROVIDER, GROQ_TTS_VOICE, text, "fallback-or-primary");
    console.log('[Audio] Groq TTS complete — OGG ready for delivery.');
    return oggBuffer;
  } catch (err: any) {
    console.error('[Audio] Groq TTS failed:', extractAxiosErrorMessage(err));
    throw new Error("Voice synthesis failed.");
  } finally {
    try { if (fs.existsSync(tempWav)) fs.unlinkSync(tempWav); } catch {}
    try { if (fs.existsSync(tempOgg)) fs.unlinkSync(tempOgg); } catch {}
  }
}

async function generateSpeechFromGoogle(text: string): Promise<Buffer> {
  const eligibility = getGoogleTtsEligibility(text);
  if (!eligibility.allowed) {
    throw new Error(eligibility.reason || "Google TTS is not available.");
  }

  const accessToken = await getGoogleAccessToken();
  const response = await axios.post(
    'https://texttospeech.googleapis.com/v1/text:synthesize',
    {
      input: { text },
      voice: {
        languageCode: config.GOOGLE_TTS_LANGUAGE_CODE,
        name: config.GOOGLE_TTS_VOICE_NAME,
      },
      audioConfig: {
        audioEncoding: 'OGG_OPUS',
      },
    },
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    },
  );

  const audioContent = response.data?.audioContent as string | undefined;
  if (!audioContent) {
    throw new Error("Google TTS did not return audio content.");
  }

  const audioBuffer = Buffer.from(audioContent, 'base64');
  recordSpeechUsage(GOOGLE_TTS_PROVIDER, config.GOOGLE_TTS_VOICE_NAME, text, "primary");
  console.log('[Audio] Google TTS complete — OGG/Opus ready for delivery.');
  return audioBuffer;
}

export async function generateSpeechFromText(text: string): Promise<Buffer> {
  const cleaned = text.trim();
  if (!cleaned) {
    throw new Error("No speech text provided.");
  }

  const eligibility = getGoogleTtsEligibility(cleaned);
  if (eligibility.allowed) {
    try {
      return await generateSpeechFromGoogle(cleaned);
    } catch (error: any) {
      console.warn(`[Audio] Google TTS failed, falling back to Groq: ${extractAxiosErrorMessage(error)}`);
    }
  } else {
    console.log(`[Audio] Skipping Google TTS: ${eligibility.reason}`);
  }

  return generateSpeechFromGroq(cleaned);
}
