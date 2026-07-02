// Simple client-side crop tool.
// Loads an already-uploaded image, lets the admin click-and-drag a rectangle,
// then hands the cropped blob back as a File for re-upload.
async function openCropTool(imageUrl, onApply) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  try {
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Could not load image'));
      img.src = imageUrl;
    });
  } catch (err) {
    alert(err.message);
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'crop-overlay';
  overlay.innerHTML = `
    <div class="crop-modal">
      <div class="crop-header">
        <h2>Crop photo</h2>
        <button class="crop-close" type="button" aria-label="Close">×</button>
      </div>
      <p class="crop-hint">Click and drag on the image to select the area to keep. Drag again to redraw.</p>
      <div class="crop-canvas-wrap">
        <img class="crop-img" alt=""/>
        <div class="crop-selection"></div>
      </div>
      <div class="crop-actions">
        <button type="button" class="btn btn-ghost" data-action="reset">Reset</button>
        <button type="button" class="btn btn-ghost" data-action="cancel">Cancel</button>
        <button type="button" class="btn" data-action="apply">Apply Crop</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const cropImg = overlay.querySelector('.crop-img');
  cropImg.src = imageUrl;
  const sel = overlay.querySelector('.crop-selection');

  let selection = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
  let drag = null;

  function renderSelection() {
    const rect = cropImg.getBoundingClientRect();
    if (!rect.width) { sel.style.display = 'none'; return; }
    const scaleX = rect.width / img.naturalWidth;
    const scaleY = rect.height / img.naturalHeight;
    sel.style.display = 'block';
    sel.style.left = (selection.x * scaleX) + 'px';
    sel.style.top = (selection.y * scaleY) + 'px';
    sel.style.width = (selection.w * scaleX) + 'px';
    sel.style.height = (selection.h * scaleY) + 'px';
  }

  function pointerFromEvent(e) {
    const rect = cropImg.getBoundingClientRect();
    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;
    const x = Math.max(0, Math.min(img.naturalWidth, (e.clientX - rect.left) * scaleX));
    const y = Math.max(0, Math.min(img.naturalHeight, (e.clientY - rect.top) * scaleY));
    return { x, y };
  }

  cropImg.addEventListener('mousedown', e => {
    e.preventDefault();
    const p = pointerFromEvent(e);
    drag = { start: p };
    selection = { x: p.x, y: p.y, w: 0, h: 0 };
    renderSelection();
  });
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  function onMove(e) {
    if (!drag) return;
    const p = pointerFromEvent(e);
    selection = {
      x: Math.min(drag.start.x, p.x),
      y: Math.min(drag.start.y, p.y),
      w: Math.abs(p.x - drag.start.x),
      h: Math.abs(p.y - drag.start.y),
    };
    renderSelection();
  }
  function onUp() { drag = null; }

  window.addEventListener('resize', renderSelection);
  // Give layout a tick to settle before drawing the initial selection
  requestAnimationFrame(renderSelection);

  function close() {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('resize', renderSelection);
    overlay.remove();
  }

  overlay.querySelector('.crop-close').addEventListener('click', close);
  overlay.querySelector('[data-action="cancel"]').addEventListener('click', close);
  overlay.querySelector('[data-action="reset"]').addEventListener('click', () => {
    selection = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    renderSelection();
  });
  overlay.querySelector('[data-action="apply"]').addEventListener('click', async () => {
    if (selection.w < 10 || selection.h < 10) {
      alert('Please draw a larger crop area.');
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(selection.w);
    canvas.height = Math.round(selection.h);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(
      img,
      Math.round(selection.x), Math.round(selection.y),
      Math.round(selection.w), Math.round(selection.h),
      0, 0, canvas.width, canvas.height
    );
    const blob = await new Promise(res => canvas.toBlob(res, 'image/webp', 0.9));
    close();
    if (blob) onApply(new File([blob], 'crop.webp', { type: 'image/webp' }));
  });
}
