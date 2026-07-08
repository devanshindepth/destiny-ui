import { useState } from 'preact/hooks';
import { SearchInput } from '../sidebar/SearchInput.js';
import { CategoryNav } from '../sidebar/CategoryNav.js';
import { NewTokenButton } from '../sidebar/NewTokenButton.js';
import { NewTokenForm } from '../NewTokenForm.js';

export function Sidebar() {
  const [formOpen, setFormOpen] = useState(false);

  return (
    <aside class="sidebar" data-testid="sidebar">
      <NewTokenButton onClick={() => setFormOpen(true)} />
      <SearchInput />
      <CategoryNav />
      {formOpen && <NewTokenForm onClose={() => setFormOpen(false)} />}
    </aside>
  );
}
