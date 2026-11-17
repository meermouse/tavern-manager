import type { Db } from '../db.js';
import type { ImageGenerator } from './generator.js';
import type { ImageReference } from './scene.js';

/**
 * A picture still pending or generating after this long has been lost (the background function died or was never
 * started), and counts as failed so an admin can retry it. Netlify background functions stop after 15 minutes.
 */
export const IMAGE_JOB_TIMEOUT_MINUTES = 20;

/** SQL for a generated image's status (on `gi`), treating lost jobs as failed. */
export const IMAGE_STATUS_SQL = `case
  when gi.status in ('pending', 'generating')
    and coalesce(gi.started_at, gi.created_at) < now() - interval '${IMAGE_JOB_TIMEOUT_MINUTES} minutes'
  then 'failed' else gi.status end`;

export const IMAGE_ERROR_SQL = `case
  when gi.status in ('pending', 'generating')
    and coalesce(gi.started_at, gi.created_at) < now() - interval '${IMAGE_JOB_TIMEOUT_MINUTES} minutes'
  then 'The painting took too long and was abandoned' else gi.error end`;

/**
 * Paint a pending picture: claim it (so a duplicate invocation does nothing), call the image API and save the result
 * or the error. Never throws.
 */
export async function runImageJob(db: Db, images: ImageGenerator | null, imageId: string): Promise<void> {
  const [job] = await db.query<{ id: string; prompt: string; references: ImageReference[] | string }>(
    `update generated_images set status = 'generating', started_at = now(), attempts = attempts + 1, error = null
     where id = $1 and status = 'pending' returning id, prompt, "references"`,
    [imageId],
  );
  if (!job) return;
  try {
    if (!images) throw new Error('Image generation is not set up on the server');
    const references = typeof job.references === 'string' ? JSON.parse(job.references) : job.references;
    const out = await images.generate({ prompt: job.prompt, references });
    await db.query(
      `update generated_images set status = 'ready', image = $2, content_type = $3, finished_at = now()
       where id = $1`,
      [job.id, out.data, out.contentType],
    );
    // Members see the post from now on, so date it from when the picture was finished.
    await db.query(
      'update feed_events set created_at = now() where id = (select event_id from generated_images where id = $1)',
      [job.id],
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Image ${job.id} failed:`, message);
    await db
      .query(`update generated_images set status = 'failed', error = $2, finished_at = now() where id = $1`, [
        job.id,
        message.slice(0, 300),
      ])
      .catch((e) => console.error('Could not record the image failure', e));
  }
}
