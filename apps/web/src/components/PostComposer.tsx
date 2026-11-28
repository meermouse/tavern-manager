import { useId, useRef, useState } from 'react';
import type { Me, TavernCharacter } from '../api/client';
import { useCreatePost } from '../api/hooks';
import { MAX_POST_IMAGES, prepareImage } from '../postImages';
import { CharacterAvatar } from './CharacterAvatar';

/** The longest a post may be (matches the API's MAX_POST_TEXT). */
export const MAX_POST_TEXT = 2000;

const IRL = '';

/** Remember who you last posted as in each tavern (a convenience: it's fine if storage isn't there). */
function savedPostAs(tavernId: string): string {
  try {
    return localStorage.getItem(`post-as:${tavernId}`) ?? IRL;
  } catch {
    return IRL;
  }
}

function savePostAs(tavernId: string, value: string) {
  try {
    localStorage.setItem(`post-as:${tavernId}`, value);
  } catch {
    // Not remembered; no harm done.
  }
}

/**
 * Write a post for the tavern's feed: some text and/or pictures, posted as yourself or as one of your characters
 * in this tavern.
 */
export function PostComposer({
  tavernId,
  viewer,
  characters,
}: {
  tavernId: string;
  viewer: Me;
  /** Your characters in this tavern, any of which you can post as. */
  characters: TavernCharacter[];
}) {
  const create = useCreatePost(tavernId);
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [chosen, setChosen] = useState(() => savedPostAs(tavernId));
  const fileInput = useRef<HTMLInputElement>(null);
  const textId = useId();
  const asId = useId();

  // A character that has since left the tavern falls back to posting as you.
  const postAs = characters.some((c) => c.id === chosen) ? chosen : IRL;
  const asCharacter = characters.find((c) => c.id === postAs);
  const trimmed = text.trim();
  const tooLong = trimmed.length > MAX_POST_TEXT;
  const canPost = (trimmed.length > 0 || images.length > 0) && !tooLong && !preparing && !create.isPending;

  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    setImageError(null);
    const room = MAX_POST_IMAGES - images.length;
    const picked = [...files].slice(0, room);
    if (files.length > room) setImageError(`A post can have at most ${MAX_POST_IMAGES} pictures`);
    setPreparing(true);
    try {
      const ready: string[] = [];
      for (const file of picked) {
        try {
          ready.push(await prepareImage(file));
        } catch (err) {
          setImageError(err instanceof Error ? err.message : 'Could not add that picture');
        }
      }
      setImages((prev) => [...prev, ...ready].slice(0, MAX_POST_IMAGES));
    } finally {
      setPreparing(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function submit() {
    if (!canPost) return;
    create.mutate(
      { text: trimmed, images, characterId: asCharacter?.id ?? null },
      {
        onSuccess: () => {
          setText('');
          setImages([]);
          setImageError(null);
        },
      },
    );
  }

  return (
    <form
      className="card post-composer"
      aria-label="Write a post"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="post-composer-head">
        {asCharacter ? (
          <CharacterAvatar character={asCharacter} size="sm" />
        ) : (
          <span className="char-avatar char-avatar-sm char-avatar-initial" aria-hidden="true">
            {viewer.displayName.charAt(0).toUpperCase()}
          </span>
        )}
        <label htmlFor={asId} className="small-text muted">
          Post as
        </label>
        <select
          id={asId}
          value={postAs}
          onChange={(e) => {
            setChosen(e.target.value);
            savePostAs(tavernId, e.target.value);
          }}
          disabled={create.isPending}
        >
          <option value={IRL}>{viewer.displayName} (you)</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.surname}
              {c.level != null ? ` · level ${c.level}` : ''}
            </option>
          ))}
        </select>
      </div>
      <label htmlFor={textId} className="visually-hidden">
        What's happening?
      </label>
      <textarea
        id={textId}
        value={text}
        rows={3}
        placeholder={asCharacter ? `What's ${asCharacter.name} up to?` : "What's happening in the tavern?"}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        onPaste={(e) => {
          // Pasting a screenshot adds it as a picture.
          const files = e.clipboardData.files;
          if (files.length && [...files].some((f) => f.type.startsWith('image/'))) {
            e.preventDefault();
            void addFiles(files);
          }
        }}
        disabled={create.isPending}
      />
      {images.length > 0 && (
        <ul className="post-composer-images">
          {images.map((src, i) => (
            <li key={i}>
              <img src={src} alt={`Picture ${i + 1}`} />
              <button
                type="button"
                className="post-composer-remove"
                aria-label={`Remove picture ${i + 1}`}
                title="Remove"
                onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                disabled={create.isPending}
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {(imageError || create.error) && <p className="error small-text">{imageError ?? create.error?.message}</p>}
      <div className="post-composer-actions">
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          hidden
          onChange={(e) => void addFiles(e.target.files)}
        />
        <button
          type="button"
          className="ghost small"
          onClick={() => fileInput.current?.click()}
          disabled={images.length >= MAX_POST_IMAGES || preparing || create.isPending}
          title={images.length >= MAX_POST_IMAGES ? `At most ${MAX_POST_IMAGES} pictures` : 'Add pictures'}
        >
          <span aria-hidden="true">🖼️</span> {preparing ? 'Adding…' : 'Add pictures'}
        </button>
        <span className={`small-text ${tooLong ? 'error' : 'muted'} post-composer-count`}>
          {trimmed.length > MAX_POST_TEXT - 200 ? `${trimmed.length} / ${MAX_POST_TEXT}` : ''}
        </span>
        <button type="submit" className="small" disabled={!canPost}>
          {create.isPending ? 'Posting…' : 'Post'}
        </button>
      </div>
    </form>
  );
}
