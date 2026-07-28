import ws from 'ws';
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

export const supabase = createClient(
  process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
      { realtime: { transport: ws } }
      );

export async function updateJobStatus(jobId, status, extra = {}) {
  const { error } = await supabase
    .from('jobs')
    .update({ status, ...extra })
    .eq('id', jobId);
  if (error) throw new Error(`updateJobStatus: ${error.message}`);
}

export async function getJob(jobId) {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .single();
  if (error) throw new Error(`getJob: ${error.message}`);
  return data;
}

export async function insertClip(clip) {
  const { error } = await supabase.from('clips').insert(clip);
  if (error) throw new Error(`insertClip: ${error.message}`);
}

export async function uploadFile(path, buffer, contentType) {
  const { error } = await supabase.storage
    .from('clips')
    .upload(path, buffer, { contentType, upsert: true });
  if (error) throw new Error(`uploadFile: ${error.message}`);
  const { data } = supabase.storage.from('clips').getPublicUrl(path);
  return data.publicUrl;
}
