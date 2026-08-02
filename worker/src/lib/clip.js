import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execFileAsync = promisify(execFile);

export async function detectFaceCrop(sourcePath, start, end) {
  try {
    const { stdout } = await execFileAsync('python3', [
      'detect_face.py', sourcePath, String(start), String(end)
    ], { maxBuffer: 1024 * 1024 * 10 });
    return JSON.parse(stdout.trim());
  } catch (err) {
    console.log('Face detection gagal, fallback ke center crop:', err.message);
    return null;
  }
}

export async function cutClip(sourcePath, outputPath, start, end, faceData) {
  const duration = end - start;
  let cropFilter = 'crop=ih*9/16:ih';

  if (faceData && faceData.faces_found > 0) {
    const cropWidth = Math.round(faceData.height * 9 / 16);
    let cropX = Math.round(faceData.face_center_x - cropWidth / 2);
    cropX = Math.max(0, Math.min(cropX, faceData.width - cropWidth));
    cropFilter = `crop=${cropWidth}:ih:${cropX}:0`;
    console.log(`Face crop: center_x=${Math.round(faceData.face_center_x)}, cropX=${cropX}`);
  }

  await execFileAsync('ffmpeg', [
    '-i', sourcePath,
    '-ss', String(start),
    '-t', String(duration),
    '-vf', `${cropFilter},scale=1080:1920`,
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', '23',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-y', outputPath
  ], { maxBuffer: 1024 * 1024 * 50 });

  if (!fs.existsSync(outputPath)) {
    throw new Error(`cutClip gagal: ${outputPath} tidak terbentuk`);
  }
}
