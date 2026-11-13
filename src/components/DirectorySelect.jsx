import { useRef, useState } from 'react';
import { sortDirectoryOptions } from '../lib/directoryOptions';

function DirectoryCombobox({ id, label, options, value, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);
  const matches = options.filter((option) => option.toLowerCase().includes(filter.toLowerCase()));
  const listId = `${id}-options`;
  const choose = (option) => {
    onChange({ target: { value: option } });
    inputRef.current?.focus();
    setOpen(false);
    setFilter('');
    setActiveIndex(-1);
  };
  return <div className="directory-combobox" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <input ref={inputRef} id={id} type="text" role="combobox" autoComplete="off"
      aria-autocomplete="list" aria-expanded={open} aria-controls={listId}
      aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
      onFocus={() => { setFilter(''); setOpen(true); setActiveIndex(-1); }}
      onClick={() => { if (!open) { setFilter(''); setOpen(true); setActiveIndex(-1); } }}
      value={value ?? ''} placeholder={placeholder || `Select or type ${label.toLowerCase()}`}
      onChange={(event) => { onChange(event); setFilter(event.target.value); setOpen(true); setActiveIndex(-1); }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); }
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          if (!open) { setFilter(''); setOpen(true); setActiveIndex(event.key === 'ArrowDown' ? 0 : options.length - 1); }
          else setActiveIndex((index) => Math.max(0, Math.min(matches.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
        }
        if (event.key === 'Enter' && open && matches[activeIndex]) { event.preventDefault(); choose(matches[activeIndex]); }
      }} />
    <button type="button" className="directory-combobox-toggle" aria-label={`Show ${label.toLowerCase()} options`} aria-expanded={open} aria-controls={listId}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => { setFilter(''); setActiveIndex(-1); setOpen(!open); inputRef.current?.focus(); }}>▾</button>
    {open && <div id={listId} role="listbox" aria-label={`${label} options`} className="directory-combobox-options">
      {matches.map((option, index) => <button type="button" role="option" tabIndex={-1} key={option} id={`${listId}-${index}`}
        aria-selected={option === value} className={index === activeIndex ? 'active' : ''}
        onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>{option}</button>)}
      {!matches.length && <span className="directory-combobox-empty">No matching directory entries. You can type a custom value.</span>}
    </div>}
  </div>;
}

export default function DirectorySelect({ id, label, options = [], value, onChange, placeholder, preserveCurrentValue = false, allowCustom = false, labelAction }) {
  options = sortDirectoryOptions(preserveCurrentValue && value && !options.includes(value) ? [...options, value] : options);
  return (
    <div className="field">
      {labelAction ? <div className="asset-category-label"><label htmlFor={id}>{label}</label>{labelAction}</div> : <label htmlFor={id}>{label}</label>}
      {allowCustom ? <DirectoryCombobox id={id} label={label} options={options} value={value} onChange={onChange} placeholder={placeholder} /> : <select id={id} value={value} onChange={onChange}>
        <option value="">{placeholder || `Select ${label.toLowerCase()}`}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>}
    </div>
  );
}
