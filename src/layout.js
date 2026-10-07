// Obsidian's status bar floats over the bottom-right of the window, covering
// the end of a view docked in the right sidebar. Returns how many pixels of
// the view it covers: zero when it is hidden, absent (popout windows, mobile)
// or beside the view.
export function statusBarInset(view) {
  const bar = view.ownerDocument.querySelector('.status-bar');
  if (!bar) return 0;
  const b = bar.getBoundingClientRect();
  const v = view.getBoundingClientRect();
  if (!b.width || !b.height || b.left >= v.right || b.right <= v.left || b.top >= v.bottom || b.bottom <= v.top) return 0;
  return Math.ceil(v.bottom - b.top);
}
