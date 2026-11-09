import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api, type Character, type Region } from '../api/client';
import { keys } from '../api/hooks';

const REGIONS: Region[] = ['eu', 'us', 'kr', 'tw'];

export function AddCharacterForm({ onAdded }: { onAdded?: (c: Character) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [region, setRegion] = useState<Region>('eu');
  const add = useMutation({
    mutationFn: () => api.addCharacter({ name: name.trim(), surname: surname.trim(), region }),
    onSuccess: (c) => {
      setName('');
      setSurname('');
      qc.invalidateQueries({ queryKey: keys.characters });
      onAdded?.(c);
    },
  });

  return (
    <form
      className="add-character"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <input placeholder="First name" aria-label="First name" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="Surname" aria-label="Surname" value={surname} onChange={(e) => setSurname(e.target.value)} />
      <select aria-label="Region" value={region} onChange={(e) => setRegion(e.target.value as Region)}>
        {REGIONS.map((r) => (
          <option key={r} value={r}>{r.toUpperCase()}</option>
        ))}
      </select>
      <button type="submit" disabled={!name.trim() || !surname.trim() || add.isPending}>
        {add.isPending ? 'Adding…' : 'Add character'}
      </button>
      {add.error && <p className="error full">{add.error.message}</p>}
    </form>
  );
}
