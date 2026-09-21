(() => {
  'use strict';

  // Frames must be at assets/frames/frame_001.jpg ... frame_376.jpg.
  const FRAME_COUNT = 376;
  const FRAME_DIR = 'assets/frames/';
  const FRAME_EXT = '.jpg';
  const CACHE_LIMIT = 32;          // Avoid keeping all ~200 MB of frames in memory.
  const PARALLEL_LOADS = 4;
  const PREFETCH_DISTANCE = 8;

  const $ = (selector, scope = document) => scope.querySelector(selector);
  const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
  const lerp = (a, b, t) => a + (b - a) * t;
  const fadeWindow = (p, start, peakIn, peakOut, end) =>
    clamp((p - start) / (peakIn - start)) * (1 - clamp((p - peakOut) / (end - peakOut)));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const smallScreen = window.matchMedia('(max-width: 700px)');

  const header = $('#siteHeader');
  const story = $('#story');
  const video = $('#cinematic');
  const intro = $('#introCopy');
  const code = $('#codeCopy');
  const craft = $('#craftCopy');
  const hint = $('#storyHint');
  const sceneLabel = $('#sceneLabel');
  const storyProgressFill = $('#storyProgressFill');
  const storyScrollIndicator = $('.story-scroll-indicator span');
  const gallery = $('#work');
  const galleryViewport = $('#galleryViewport');
  const track = $('#galleryTrack');
  const galleryProgressFill = $('#galleryProgressFill');
  const galleryCounter = $('#galleryCounter');
  const featured = $('#spotlightFrame');
  const cards = [...document.querySelectorAll('.project-card')];
  const projectDialog = $('#projectDialog');

  const projects = {
    saixora: { number: '01', name: 'SAIXORA', image: 'assets/saixora.webp', alt: 'SAIXORA AI and technology interface concept', description: 'A dark, considered digital experience exploring the intersection of artificial intelligence, bold typography, and thoughtful software.' },
    neon: { number: '02', name: 'NEON FITNESS', image: 'assets/neon-fitness.webp', alt: 'Neon Fitness interface concept', description: 'A high-energy brand expression with immersive imagery, confident layouts, and an electric cyan-and-violet visual language.' },
    royal: { number: '03', name: 'ZSMN ROYAL', image: 'assets/zsmn-royal.webp', alt: 'ZSMN Royal fashion interface concept', description: 'An editorial fashion storefront study with warm neutrals, luxe product photography, and a pared-back commerce experience.' },
    nova: { number: '04', name: 'SECURE NOVA', image: 'assets/secure-nova.webp', alt: 'Secure Nova education software website interface concept', description: 'A clean, approachable product page study for classroom security, device management, and school technology.' }
  };

  // Reuse the existing video container. The MP4 is NOT used; the canvas
  // displays the original JPEG images one by one as the page scrolls.
  video.pause();
  video.removeAttribute('src');
  video.querySelectorAll('source').forEach(source => source.remove());
  video.preload = 'none';
  video.style.display = 'none';

  const shell = video.parentElement;
  shell.style.background = "#050a12 url('assets/opening-poster.webp') center / cover no-repeat";
  const canvas = document.createElement('canvas');
  canvas.className = 'cinematic';  // Inherits the existing responsive video positioning.
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.opacity = '0';
  shell.insertBefore(canvas, video);
  const ctx = canvas.getContext('2d', { alpha: false });

  let currentScroll = 0;
  let targetProgress = 0;
  let smoothProgress = 0;
  let ticking = false;
  let cachedGalleryTravel = 0;
  let lastActiveCard = -1;
  let wantedFrame = 1;
  let lastRenderedFrame = 0;
  let previousWantedFrame = 1;
  let direction = 1;
  let activeLoads = 0;
  let canvasWidth = 0;
  let canvasHeight = 0;
  const frameCache = new Map();
  const loading = new Set();
  const failed = new Set();

  const frameURL = number =>
    `${FRAME_DIR}frame_${String(number).padStart(3, '0')}${FRAME_EXT}`;

  function sizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * scale));
    const height = Math.max(1, Math.round(rect.height * scale));
    if (width === canvasWidth && height === canvasHeight) return;
    canvas.width = canvasWidth = width;
    canvas.height = canvasHeight = height;
    lastRenderedFrame = 0; // Resizing clears a canvas; repaint the active frame.
    paintBestFrame();
  }

  function drawFrame(number) {
    const image = frameCache.get(number);
    if (!ctx || !image || !image.naturalWidth || !canvasWidth || !canvasHeight) return false;

    // Same framing as the original CSS: cover on desktop, contain on phones.
    const scale = (smallScreen.matches ? Math.min : Math.max)(
      canvasWidth / image.naturalWidth,
      canvasHeight / image.naturalHeight
    );
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    ctx.fillStyle = '#050a12';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, (canvasWidth - width) / 2, (canvasHeight - height) / 2, width, height);
    lastRenderedFrame = number;
    canvas.style.opacity = '1';

    // Refresh this image's LRU position without unloading its pixels.
    frameCache.delete(number);
    frameCache.set(number, image);
    return true;
  }

  function paintBestFrame() {
    if (frameCache.has(wantedFrame)) {
      if (wantedFrame !== lastRenderedFrame) drawFrame(wantedFrame);
      return;
    }
    // Keep the last frame visible while the requested one downloads. At the
    // beginning, show the closest cached frame if the exact one is not ready.
    if (!lastRenderedFrame) {
      let nearest = null;
      for (const number of frameCache.keys()) {
        if (nearest === null || Math.abs(number - wantedFrame) < Math.abs(nearest - wantedFrame)) {
          nearest = number;
        }
      }
      if (nearest !== null) drawFrame(nearest);
    }
  }

  function trimCache() {
    if (frameCache.size <= CACHE_LIMIT) return;
    // Retain the nearest frames so backward scrolling also feels responsive.
    const distances = [...frameCache.keys()]
      .filter(number => number !== lastRenderedFrame && number !== wantedFrame)
      .sort((a, b) => Math.abs(b - wantedFrame) - Math.abs(a - wantedFrame));
    for (const number of distances) {
      if (frameCache.size <= CACHE_LIMIT) break;
      frameCache.delete(number);
    }
  }

  function loadFrame(number) {
    if (number < 1 || number > FRAME_COUNT || loading.has(number) ||
        frameCache.has(number) || failed.has(number)) return;
    loading.add(number);
    activeLoads += 1;
    const image = new Image();
    image.onload = () => {
      loading.delete(number);
      activeLoads -= 1;
      frameCache.set(number, image);
      trimCache();
      paintBestFrame();
      pumpFrames();
    };
    image.onerror = () => {
      loading.delete(number);
      activeLoads -= 1;
      failed.add(number);
      console.warn(`Missing or unreadable animation frame: ${frameURL(number)}`);
      pumpFrames();
    };
    image.src = frameURL(number);
  }

  function pumpFrames() {
    if (reducedMotion.matches || !ctx) return;
    if (currentScroll > story.offsetTop + story.offsetHeight + window.innerHeight) return;

    // First load the exact scroll position, then nearby frames in the
    // direction of travel; never download all 376 at once.
    const priority = [wantedFrame];
    for (let step = 1; step <= PREFETCH_DISTANCE; step++) {
      priority.push(wantedFrame + step * direction, wantedFrame - step * direction);
    }
    for (const number of priority) {
      if (activeLoads >= PARALLEL_LOADS) break;
      loadFrame(number);
    }
  }

  function measure() {
    cachedGalleryTravel = Math.max(
      0,
      track.scrollWidth - galleryViewport.clientWidth + (smallScreen.matches ? 0 : 60)
    );
    sizeCanvas();
  }

  function requestUpdate() {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(tick);
    }
  }

  function updateScrollTargets() {
    currentScroll = window.scrollY || window.pageYOffset || 0;
    header.classList.toggle('is-scrolled', currentScroll > 45);
    if (reducedMotion.matches) return;
    const storyMax = Math.max(1, story.offsetHeight - window.innerHeight);
    targetProgress = clamp((currentScroll - story.offsetTop) / storyMax);
    requestUpdate();
  }

  function tick() {
    ticking = false;
    if (reducedMotion.matches) return;

    smoothProgress = Math.abs(smoothProgress - targetProgress) < 0.0005
      ? targetProgress
      : lerp(smoothProgress, targetProgress, 0.29);
    const p = smoothProgress;

    // Direct frame-by-frame scroll animation. NO VIDEO SEEKING.
    const nextFrame = 1 + Math.round(p * (FRAME_COUNT - 1));
    if (nextFrame !== wantedFrame) {
      direction = nextFrame >= previousWantedFrame ? 1 : -1;
      previousWantedFrame = nextFrame;
      wantedFrame = nextFrame;
      paintBestFrame();
      pumpFrames();
    }

    // Existing intro text, fades, progress, and scroll cues remain unchanged.
    const introOpacity = 1 - clamp((p - 0.03) / 0.15);
    intro.style.opacity = String(introOpacity);
    intro.style.transform = `translateY(${p * -46}px)`;
    intro.style.pointerEvents = introOpacity > 0.55 ? 'auto' : 'none';
    const codeOpacity = fadeWindow(p, 0.29, 0.39, 0.56, 0.67);
    code.style.opacity = String(codeOpacity);
    code.style.transform = `translateY(${(1 - codeOpacity) * 28}px)`;
    const craftOpacity = fadeWindow(p, 0.68, 0.77, 0.88, 0.97);
    craft.style.opacity = String(craftOpacity);
    craft.style.transform = `translateY(${(1 - craftOpacity) * 28}px)`;
    hint.style.opacity = String(1 - clamp(p / 0.09));
    storyProgressFill.style.width = `${p * 100}%`;
    storyScrollIndicator.style.height = `${p * 100}%`;
    sceneLabel.textContent = p < 0.3 ? 'DISCOVER' : p < 0.68 ? 'THE CODE' : 'THE CRAFT';

    // Existing horizontally moving project gallery remains unchanged.
    const galleryMax = Math.max(1, gallery.offsetHeight - window.innerHeight);
    const galleryProgress = clamp((currentScroll - gallery.offsetTop) / galleryMax);
    track.style.transform = `translate3d(${-cachedGalleryTravel * galleryProgress}px, 0, 0)`;
    galleryProgressFill.style.width = `${galleryProgress * 100}%`;
    const activeCard = Math.min(cards.length - 1, Math.floor(galleryProgress * cards.length));
    if (lastActiveCard !== activeCard) {
      galleryCounter.textContent = `${String(activeCard + 1).padStart(2, '0')} — 04`;
      lastActiveCard = activeCard;
    }

    if (Math.abs(smoothProgress - targetProgress) > 0.0005) requestUpdate();
  }

  window.addEventListener('scroll', updateScrollTargets, { passive: true });
  window.addEventListener('resize', () => { measure(); updateScrollTargets(); }, { passive: true });
  window.addEventListener('pageshow', updateScrollTargets);

  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        featured.classList.add('in-view');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.22 });
  revealObserver.observe(featured);

  function openDialog(dialog) {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    document.body.classList.add('dialog-open');
  }
  function closeDialog(dialog) {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
    document.body.classList.remove('dialog-open');
  }
  cards.forEach(card => card.addEventListener('click', () => {
    const project = projects[card.dataset.project];
    if (!project) return;
    $('#dialogNumber').textContent = project.number;
    $('#dialogTitle').textContent = project.name;
    $('#dialogImage').src = project.image;
    $('#dialogImage').alt = project.alt;
    $('#dialogDescription').textContent = project.description;
    openDialog(projectDialog);
  }));
  $('#closeDialog').addEventListener('click', () => closeDialog(projectDialog));
  $('#dialogBack').addEventListener('click', () => closeDialog(projectDialog));
  $('#exploreBtn').addEventListener('click', () => { window.location.href = 'main.html'; });
  [projectDialog].forEach(dialog => {
    dialog.addEventListener('close', () => document.body.classList.remove('dialog-open'));
    dialog.addEventListener('click', event => {
      if (event.target === dialog) closeDialog(dialog);
    });
  });
  $('#year').textContent = String(new Date().getFullYear());
  measure();
  updateScrollTargets();
  if (reducedMotion.matches) featured.classList.add('in-view');
  else pumpFrames(); // Load frame_001.jpg immediately, before the first scroll.
})();
