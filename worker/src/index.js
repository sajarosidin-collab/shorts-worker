import fs from 'fs';
import os from 'os';
import path from 'path';
import { supabase, updateJobStatus, getJob, insertClip, uploadFile } from './lib/supabase.js';
import { downloadVideo, extractAudio } from './lib/download.js';
import { transcribeAudio } from './lib/transcribe.js';
import { findHighlights } from './lib/analyze.js';
import { cutClip } from './lib/clip.js';

export async function processJob(jobId) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'job-'));
  console.log(`Work dir: ${workDir}`);

  try {
    const job = await getJob(jobId);
    console.log(`Mulai proses job ${jobId}: ${job.youtube_url}`);

    await updateJobStatus(jobId, 'downloading');
    const { filePath, durationSeconds, title } = await downloadVideo(job.youtube_url, workDir);
    await updateJobStatus(jobId, 'downloading', {
      video_title: title,
      video_duration_seconds: durationSeconds
    });
    console.log(`Video terdownload: ${title} (${durationSeconds}s)`);

    await updateJobStatus(jobId, 'processing');
    const audioPath = await extractAudio(filePath, workDir);
    const { segments } = await transcribeAudio(audioPath, workDir);
    console.log(`Transcript selesai: ${segments.length} segmen`);

    const highlights = await findHighlights(segments, durationSeconds, 5);
    console.log(`Highlight ditemukan: ${highlights.length} clip`);

    if (highlights.length === 0) {
      throw new Error('Tidak ada highlight yang ditemukan dari video ini');
    }

    for (let i = 0; i < highlights.length; i++) {
      const h = highlights[i];
      console.log(`Proses clip ${i + 1}/${highlights.length}: ${h.title}`);

      const clipPath = `${workDir}/clip_${i}.mp4`;
      await cutClip(filePath, clipPath, h.start, h.end);

      const videoBuffer = fs.readFileSync(clipPath);
      const videoUrl = await uploadFile(`${jobId}/clip_${i}.mp4`, videoBuffer, 'video/mp4');

      await insertClip({
        job_id: jobId,
        clip_index: i,
        start_seconds: h.start,
        end_seconds: h.end,
        title: h.title,
        caption: h.caption,
        video_url: videoUrl,
        subtitle_url: null,
        status: 'ready'
      });

      console.log(`Clip ${i + 1} selesai diupload`);
    }

    await updateJobStatus(jobId, 'done');
    console.log(`Job ${jobId} selesai!`);
  } catch (err) {
    console.error(`Job ${jobId} gagal:`, err);
    await updateJobStatus(jobId, 'failed', { error_message: err.message });
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

if (process.env.JOB_ID) {
  processJob(process.env.JOB_ID).then(() => process.exit(0));
}
