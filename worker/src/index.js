import fs from 'fs';
import os from 'os';
import path from 'path';
import { supabase, updateJobStatus, getJob, insertClip, uploadFile } from './lib/supabase.js';
import { downloadVideo, extractAudio } from './lib/download.js';
import { transcribeAudio } from './lib/transcribe.js';
import { findHighlights } from './lib/analyze.js';
import { buildSrt, cutClip, burnSubtitle } from './lib/clip.js';

const JOB_ID = process.env.JOB_ID;

async function run() {
  if (!JOB_ID) throw new Error('JOB_ID env var tidak diset');

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'job-'));
  console.log(`Work dir: ${workDir}`);

  try {
    const job = await getJob(JOB_ID);
    console.log(`Mulai proses job ${JOB_ID}: ${job.youtube_url}`);

    // 1. Download video
    await updateJobStatus(JOB_ID, 'downloading');
    const { filePath, durationSeconds, title } = await downloadVideo(job.youtube_url, workDir);
    await updateJobStatus(JOB_ID, 'downloading', {
      video_title: title,
      video_duration_seconds: durationSeconds
    });
    console.log(`Video terdownload: ${title} (${durationSeconds}s)`);

    // 2. Extract audio + transcribe
    await updateJobStatus(JOB_ID, 'processing');
    const audioPath = await extractAudio(filePath, workDir);
    const { segments } = await transcribeAudio(audioPath, workDir);
    console.log(`Transcript selesai: ${segments.length} segmen`);

    // 3. Cari highlight pakai Gemini
    const highlights = await findHighlights(segments, durationSeconds, 5);
    console.log(`Highlight ditemukan: ${highlights.length} clip`);

    if (highlights.length === 0) {
      throw new Error('Tidak ada highlight yang ditemukan dari video ini');
    }

    // 4. Proses tiap clip: cut -> subtitle -> burn -> upload
    for (let i = 0; i < highlights.length; i++) {
      const h = highlights[i];
      console.log(`Proses clip ${i + 1}/${highlights.length}: ${h.title}`);

      const rawClipPath = `${workDir}/clip_${i}_raw.mp4`;
      const srtPath = `${workDir}/clip_${i}.srt`;
      const finalClipPath = `${workDir}/clip_${i}_final.mp4`;

      await cutClip(filePath, rawClipPath, h.start, h.end);

      const srtContent = buildSrt(segments, h.start, h.end);
      fs.writeFileSync(srtPath, srtContent);

      await burnSubtitle(rawClipPath, srtPath, finalClipPath);

      const videoBuffer = fs.readFileSync(finalClipPath);
      const videoUrl = await uploadFile(
        `${JOB_ID}/clip_${i}.mp4`,
        videoBuffer,
        'video/mp4'
      );

      const subtitleUrl = await uploadFile(
        `${JOB_ID}/clip_${i}.srt`,
        Buffer.from(srtContent),
        'text/plain'
      );

      await insertClip({
        job_id: JOB_ID,
        clip_index: i,
        start_seconds: h.start,
        end_seconds: h.end,
        title: h.title,
        caption: h.caption,
        video_url: videoUrl,
        subtitle_url: subtitleUrl,
        status: 'ready'
      });

      console.log(`Clip ${i + 1} selesai diupload`);
    }

    await updateJobStatus(JOB_ID, 'done');
    console.log('Job selesai!');
  } catch (err) {
    console.error('Job gagal:', err);
    await updateJobStatus(JOB_ID, 'failed', { error_message: err.message });
    process.exitCode = 1;
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

run();
