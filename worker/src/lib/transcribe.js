import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

export async function transcribeAudio(audioPath) {
  console.log('Upload audio ke Gemini File API...');
  const uploadResult = await fileManager.uploadFile(audioPath, {
    mimeType: 'audio/mpeg',
    displayName: 'audio-transcribe'
  });

  let file = uploadResult.file;
  while (file.state === 'PROCESSING') {
    await new Promise(r => setTimeout(r, 3000));
    file = await fileManager.getFile(file.name);
  }
  if (file.state === 'FAILED') {
    throw new Error('Gemini gagal memproses file audio');
  }

  const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });

  const prompt = `Transkrip audio ini secara lengkap dalam bahasa aslinya (kalau Bahasa Indonesia, tulis Bahasa Indonesia).
Pecah jadi potongan kalimat/frasa pendek (5-15 kata), dan untuk TIAP potongan berikan timestamp mulai dan selesai dalam DETIK (angka desimal) sesuai posisi asli di audio.

Balas HANYA dalam format JSON array, tanpa markdown, tanpa penjelasan tambahan:
[
  {"start": <detik mulai, number>, "end": <detik selesai, number>, "text": "<isi kalimat>"}
]`;

  const result = await model.generateContent([
    { fileData: { fileUri: file.uri, mimeType: file.mimeType } },
    { text: prompt }
  ]);

  let text = result.response.text().trim();
  text = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '');

  const segments = JSON.parse(text);

  await fileManager.deleteFile(file.name).catch(() => {});

  return { segments };
}
