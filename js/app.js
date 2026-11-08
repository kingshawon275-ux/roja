/**
 * TARJETA ROJA / ROJA DIRECTA - APP CONTROLLER
 * API Oficial: https://adstrim.site/api/matches
 * Con respaldo local: temp_api.json y soporte multi-zona horaria (Hora Local / España CET)
 * Dominio Oficial: tarjetarojadirect.live
 */

(function () {
  'use strict';

  // API Endpoints (fuente de agenda estilo Pirlo: agenda18.com)
  const AG_HOST = 'https://agenda18.com';
  const AG_IMG = 'https://img.agenda18.com';
  const PRIMARY_API_URL = AG_HOST + '/agenda.json';
  const FALLBACK_LOCAL_URL = 'temp_api.json';
  const CORS_PROXY_URL = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(PRIMARY_API_URL);

  // Mapeo de categorías e iconos
  const CATEGORY_MAP = {
    'football': { name: 'Fútbol', icon: '⚽', slug: 'futbol' },
    'soccer': { name: 'Fútbol', icon: '⚽', slug: 'futbol' },
    'basketball': { name: 'Baloncesto', icon: '🏀', slug: 'baloncesto' },
    'hockey': { name: 'Hockey', icon: '🏒', slug: 'hockey' },
    'american-football': { name: 'Fútbol Americano', icon: '🏈', slug: 'americano' },
    'baseball': { name: 'Béisbol', icon: '⚾', slug: 'beisbol' },
    'fight': { name: 'Combate / UFC', icon: '🥊', slug: 'combate' },
    'tennis': { name: 'Tenis', icon: '🎾', slug: 'tenis' },
    'motorsport': { name: 'Motor', icon: '🏎️', slug: 'motor' }
  };

  // Mapeo de ligas a nombres en español / estilizados
  const LEAGUE_NAMES = {
    'uefa champions league': 'Champions League',
    'premier league': 'Premier League',
    'la liga': 'LaLiga EA Sports',
    'laliga': 'LaLiga EA Sports',
    'laliga smartbank': 'LaLiga Hypermotion',
    'serie a': 'Serie A Italia',
    'bundesliga': 'Bundesliga',
    'ligue 1': 'Ligue 1 Francia',
    'women\'s super league': 'Women\'s Super League',
    'nba': 'NBA Baloncesto',
    'nhl': 'NHL Hockey',
    'nfl': 'NFL Fútbol Americano',
    'mlb': 'MLB Béisbol',
    'ufc': 'UFC MMA',
    'ncaaf': 'NCAA College Football'
  };

  // Canales asignados para estilo Tarjeta Roja
  const CHANNEL_PRESETS = [
    'Movistar+ LaLiga', 'DAZN 1', 'ESPN 2', 'TUDN', 'Win Sports +',
    'Disney+ Deportes', 'Sky Sports', 'Canal 5', 'TNT Sports', 'Prime Video'
  ];

  // Estado de la aplicación
  const state = {
    allMatches: [],
    filteredMatches: [],
    currentCategory: 'all',
    searchQuery: '',
    selectedDay: 'all',
    timezoneMode: 'local', // 'local' o 'spain' (Europe/Madrid)
    isLoading: true
  };

  // Elementos DOM
  const DOM = {
    agendaList: document.getElementById('agendaEventsList'),
    agendaLoading: document.getElementById('agendaLoading'),
    agendaEmpty: document.getElementById('agendaEmptyState'),
    matchesCountBadge: document.getElementById('matchesCountBadge'),
    topLiveCount: document.getElementById('topLiveCount'),
    searchInput: document.getElementById('agendaSearchInput'),
    searchClearBtn: document.getElementById('searchClearBtn'),
    categoryPills: document.querySelectorAll('.sport-pill-btn'),
    tzToggleBtn: document.getElementById('tzToggleBtn'),
    tzLabelText: document.getElementById('tzLabelText'),
    mobileNavToggle: document.getElementById('mobileNavToggle'),
    mainNav: document.getElementById('mainNav'),
    currentDateBadge: document.getElementById('currentDateBadge'),
    playerModal: document.getElementById('playerModal'),
    playerFrame: document.getElementById('playerFrame'),
    playerTitle: document.getElementById('playerTitle'),
    playerClose: document.getElementById('playerClose'),
    playerReload: document.getElementById('playerReload')
  };

  // Iniciar al cargar el DOM
  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    setupDateDisplay();
    setupEventListeners();
    await fetchScheduleData();
  }

  // --- CONFIGURACIÓN DE FECHA ---
  function setupDateDisplay() {
    if (DOM.currentDateBadge) {
      const now = new Date();
      const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
      const dateStr = now.toLocaleDateString('es-ES', options);
      DOM.currentDateBadge.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }
  }

  // --- LISTENERS ---
  function setupEventListeners() {
    // Búsqueda en tiempo real
    if (DOM.searchInput) {
      DOM.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim().toLowerCase();
        if (DOM.searchClearBtn) {
          DOM.searchClearBtn.classList.toggle('active', state.searchQuery.length > 0);
        }
        applyFilters();
      });
    }

    if (DOM.searchClearBtn) {
      DOM.searchClearBtn.addEventListener('click', () => {
        if (DOM.searchInput) DOM.searchInput.value = '';
        state.searchQuery = '';
        DOM.searchClearBtn.classList.remove('active');
        applyFilters();
      });
    }

    // Filtros de categoría por deporte
    if (DOM.categoryPills) {
      DOM.categoryPills.forEach(pill => {
        pill.addEventListener('click', () => {
          DOM.categoryPills.forEach(p => p.classList.remove('active'));
          pill.classList.add('active');
          state.currentCategory = pill.getAttribute('data-sport') || 'all';
          applyFilters();
        });
      });
    }

    // Alternar zona horaria (Local vs España)
    if (DOM.tzToggleBtn) {
      DOM.tzToggleBtn.addEventListener('click', toggleTimezone);
    }

    // Menú móvil
    if (DOM.mobileNavToggle && DOM.mainNav) {
      DOM.mobileNavToggle.addEventListener('click', () => {
        DOM.mainNav.classList.toggle('mobile-active');
      });

      // Auto-cerrar menú al hacer clic en un enlace
      DOM.mainNav.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
          DOM.mainNav.classList.remove('mobile-active');
        });
      });
    }

    // Delegación para acordeón de canales
    if (DOM.agendaList) {
      DOM.agendaList.addEventListener('click', (e) => {
        // Reproducir embed (abre el modal con el iframe)
        const playBtn = e.target.closest('.ag-embed-play');
        if (playBtn) {
          e.preventDefault();
          e.stopPropagation();
          if (playBtn.disabled) return;
          const mId = playBtn.getAttribute('data-match-id');
          const eIdx = Number(playBtn.getAttribute('data-embed-index')) || 0;
          const match = state.allMatches.find(m => String(m.id) === String(mId));
          if (match && match.embeds[eIdx]) openPlayer(match, match.embeds[eIdx]);
          return;
        }

        const toggleBtn = e.target.closest('.tr-event-toggle');
        if (toggleBtn) {
          const card = toggleBtn.closest('.tr-event-card');
          if (card) {
            const isOpen = card.classList.contains('is-open');
            card.classList.toggle('is-open', !isOpen);
            toggleBtn.setAttribute('aria-expanded', !isOpen ? 'true' : 'false');
          }
        }
      });

      // Accesibilidad de teclado (Enter / Espacio)
      DOM.agendaList.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const toggle = e.target.closest('.tr-event-toggle');
          if (toggle && !e.target.closest('.btn-direct-stream')) {
            e.preventDefault();
            toggle.click();
          }
        }
      });
    }

    // Reproductor modal: cerrar / recargar / fondo / Escape
    if (DOM.playerClose) DOM.playerClose.addEventListener('click', closePlayer);
    if (DOM.playerReload) {
      DOM.playerReload.addEventListener('click', () => {
        if (DOM.playerFrame) DOM.playerFrame.src = DOM.playerFrame.src;
      });
    }
    if (DOM.playerModal) {
      DOM.playerModal.addEventListener('click', (e) => {
        if (e.target === DOM.playerModal) closePlayer();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && DOM.playerModal && DOM.playerModal.classList.contains('is-open')) {
        closePlayer();
      }
    });

    // FAQ Acordeón
    const faqQuestions = document.querySelectorAll('.faq-question-btn');
    faqQuestions.forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item');
        if (item) {
          const isOpen = item.classList.contains('is-open');
          item.classList.toggle('is-open', !isOpen);
        }
      });
    });
  }

  // --- ZONA HORARIA ---
  function toggleTimezone() {
    state.timezoneMode = state.timezoneMode === 'local' ? 'spain' : 'local';
    updateTzButtonText();
    renderMatches();
  }

  function updateTzButtonText() {
    if (DOM.tzLabelText) {
      if (state.timezoneMode === 'local') {
        DOM.tzLabelText.textContent = '🌐 Hora Local (Detectada)';
      } else {
        DOM.tzLabelText.textContent = '🇪🇸 Hora de España (CET)';
      }
    }
  }

  // --- CONSUMO DE LA API (https://adstrim.site/api/matches) ---
  async function fetchWithTimeout(url, timeoutMs = 2800) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        cache: 'no-cache',
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(id);
      return res;
    } catch (err) {
      clearTimeout(id);
      throw err;
    }
  }

  async function fetchScheduleData() {
    state.isLoading = true;
    if (DOM.agendaLoading) DOM.agendaLoading.style.display = 'block';
    if (DOM.agendaEmpty) DOM.agendaEmpty.style.display = 'none';

    let rawData = null;

    // 1. Intento directo a la API principal (adstrim.site)
    try {
      const res = await fetchWithTimeout(PRIMARY_API_URL, 8000);
      if (res.ok) {
        rawData = await res.json();
      }
    } catch (err) {
      console.warn('Direct fetch failed (likely CORS), trying proxy/fallback:', err.message);
    }

    // 2. Intento vía CORS proxy si falló el directo
    if (!rawData) {
      try {
        const proxyRes = await fetchWithTimeout(CORS_PROXY_URL, 3200);
        if (proxyRes.ok) {
          const jsonText = await proxyRes.text();
          rawData = JSON.parse(jsonText);
        }
      } catch (err) {
        console.warn('Proxy fetch failed:', err.message);
      }
    }

    // 3. Respaldo local verificado si ambos fallaron
    if (!rawData) {
      try {
        const localRes = await fetch(FALLBACK_LOCAL_URL);
        if (localRes.ok) {
          rawData = await localRes.json();
        }
      } catch (err) {
        console.error('All fetch strategies failed:', err);
      }
    }

    // Procesar los datos recibidos
    if (rawData) {
      processScheduleData(rawData);
    } else {
      showErrorState();
    }

    state.isLoading = false;
    if (DOM.agendaLoading) DOM.agendaLoading.style.display = 'none';
  }

  // Procesar estructura de eventos (formato agenda18.com / Strapi)
  function processScheduleData(data) {
    const list = (data && data.data) || [];

    // Normalizar eventos
    state.allMatches = list.map(item => normalizeMatchItem(item)).filter(Boolean);

    // Ordenar cronológicamente por timestamp
    state.allMatches.sort((a, b) => a.timestamp - b.timestamp);

    // Actualizar contadores
    updateLiveCounters();
    applyFilters();
  }

  // Construir la URL del reproductor: siempre a través de nuestro propio
  // wrapper local embed/eventos.html (evita el 404 de agenda18 y aplica
  // referrerpolicy="no-referrer", requisito del servidor de la señal).
  function buildPlayUrl(raw) {
    if (!raw) return '';
    // agenda18 entrega "/embed/eventos.html?r=<base64>" -> reusar su query en local
    const m = String(raw).match(/\/embed\/eventos\.html\?(.+)$/i);
    if (m) return 'embed/eventos.html?' + m[1];
    // URL absoluta de la señal -> envolver
    if (/^https?:/i.test(raw)) return 'embed/eventos.html?url=' + encodeURIComponent(raw);
    // ruta relativa de agenda18 -> resolver contra su host y envolver
    return 'embed/eventos.html?url=' + encodeURIComponent(AG_HOST + raw);
  }

  // Normalizar nombre de deporte -> slug usado por las pestañas
  function normalizeSport(raw) {
    const s = (raw || '').toString().toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (s.includes('futbol americano') || s.includes('americano') || s.includes('nfl')) {
      return { slug: 'americano', name: 'Fútbol Americano', icon: '🏈' };
    }
    if (s.includes('basket') || s.includes('baloncesto') || s.includes('nba')) {
      return { slug: 'baloncesto', name: 'Baloncesto', icon: '🏀' };
    }
    if (s.includes('hockey') || s.includes('nhl')) {
      return { slug: 'hockey', name: 'Hockey', icon: '🏒' };
    }
    if (s.includes('beisbol') || s.includes('baseball') || s.includes('mlb')) {
      return { slug: 'beisbol', name: 'Béisbol', icon: '⚾' };
    }
    if (s.includes('ufc') || s.includes('box') || s.includes('mma') || s.includes('combate') || s.includes('lucha')) {
      return { slug: 'combate', name: 'UFC / Combate', icon: '🥊' };
    }
    if (s.includes('tenis') || s.includes('tennis')) {
      return { slug: 'tenis', name: 'Tenis', icon: '🎾' };
    }
    if (s.includes('futbol') || s.includes('soccer') || s === '') {
      return { slug: 'futbol', name: 'Fútbol', icon: '⚽' };
    }
    return { slug: 'otros', name: raw || 'Otros', icon: '🏆' };
  }

  // Normalizar objeto de partido (formato agenda18.com)
  function normalizeMatchItem(item) {
    if (!item) return null;
    const a = item.attributes || {};

    const title = (a.diary_description || '').trim() || 'Evento Deportivo';
    const sportInfo = normalizeSport(a.deportes);

    // Bandera del país
    let flag = '';
    try {
      const url = a.country.data.attributes.image.data.attributes.url;
      if (url) flag = /^https?:/.test(url) ? url : AG_IMG + url;
    } catch (e) { flag = ''; }

    // Hora (diary_hour en HH:MM, UTC) -> timestamp de hoy
    const hourRaw = (a.diary_hour || '').slice(0, 5);
    let timestamp = Date.now();
    if (/^\d{2}:\d{2}$/.test(hourRaw)) {
      const [h, mn] = hourRaw.split(':').map(Number);
      const d = new Date();
      d.setUTCHours(h, mn, 0, 0);
      timestamp = d.getTime();
    }

    // Embeds / reproductores
    const embedsRaw = (a.embeds && a.embeds.data) || [];
    const embeds = embedsRaw.map(em => {
      const ea = em.attributes || {};
      return {
        name: (ea.embed_name || 'Reproductor').trim(),
        lang: (ea.idioma || '').trim(),
        iframe: buildPlayUrl(ea.embed_iframe)
      };
    }).filter(em => em.iframe);

    // Dividir título en equipos si es posible
    let team1 = '', team2 = '';
    if (title.includes(' vs ')) {
      const p = title.split(' vs '); team1 = p[0].trim(); team2 = p.slice(1).join(' vs ').trim();
    } else if (title.includes(' - ')) {
      const p = title.split(' - '); team1 = p[0].trim(); team2 = p.slice(1).join(' - ').trim();
    }

    return {
      id: item.id || Math.floor(Math.random() * 1000000),
      rawCategory: sportInfo.slug,
      categorySlug: sportInfo.slug,
      categoryName: sportInfo.name,
      categoryIcon: sportInfo.icon,
      league: sportInfo.name,
      rawLeague: a.deportes || '',
      leagueLogo: '',
      title: title,
      team1: team1,
      team2: team2,
      homeTeamLogo: '',
      awayTeamLogo: '',
      date_et: '',
      time_raw: hourRaw,
      timestamp: timestamp,
      status: 'UPCOMING',
      flag: flag,
      streams: embeds,  // reutiliza la lógica de conteo existente
      embeds: embeds
    };
  }

  // Actualizar contadores en vivo
  function updateLiveCounters() {
    const now = Date.now();
    const liveMatches = state.allMatches.filter(m => {
      const diff = now - m.timestamp;
      return diff >= 0 && diff <= (2.5 * 60 * 60 * 1000);
    });

    const liveCount = liveMatches.length || Math.min(state.allMatches.length, 6);
    if (DOM.topLiveCount) DOM.topLiveCount.textContent = `${liveCount} Partidos en Directo`;
  }

  // --- FILTROS ---
  function applyFilters() {
    let result = [...state.allMatches];

    // Filtro por deporte
    if (state.currentCategory !== 'all') {
      result = result.filter(m => m.categorySlug === state.currentCategory || m.rawCategory === state.currentCategory);
    }

    // Filtro por búsqueda
    if (state.searchQuery) {
      const q = state.searchQuery;
      result = result.filter(m => {
        return m.title.toLowerCase().includes(q) ||
               m.league.toLowerCase().includes(q) ||
               m.categoryName.toLowerCase().includes(q) ||
               m.team1.toLowerCase().includes(q) ||
               m.team2.toLowerCase().includes(q);
      });
    }

    state.filteredMatches = result;
    if (DOM.matchesCountBadge) {
      DOM.matchesCountBadge.textContent = `${result.length} Partidos Disponibles`;
    }

    renderMatches();
  }

  // --- FORMATEAR HORAS CON ZONA HORARIA ---
  function formatMatchTime(timestamp) {
    const date = new Date(timestamp);

    let timeZone = undefined;
    if (state.timezoneMode === 'spain') {
      timeZone = 'Europe/Madrid';
    }

    try {
      const timeStr = date.toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: timeZone
      });

      const dateStr = date.toLocaleDateString('es-ES', {
        day: '2-digit',
        month: '2-digit',
        timeZone: timeZone
      });

      return { time: timeStr, date: dateStr };
    } catch (e) {
      const h = String(date.getHours()).padStart(2, '0');
      const m = String(date.getMinutes()).padStart(2, '0');
      return { time: `${h}:${m}`, date: '' };
    }
  }

  // Comprobar si el partido está en juego
  function isMatchLive(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    return diff >= 0 && diff <= (2.5 * 60 * 60 * 1000);
  }

  // --- RENDERIZAR PARTIDOS (ESTILO TARJETA ROJA PREMIUM) ---
  function renderMatches() {
    if (!DOM.agendaList) return;

    if (state.filteredMatches.length === 0) {
      DOM.agendaList.innerHTML = '';
      if (DOM.agendaEmpty) DOM.agendaEmpty.style.display = 'block';
      return;
    }

    if (DOM.agendaEmpty) DOM.agendaEmpty.style.display = 'none';

    let html = '';
    state.filteredMatches.forEach((match, index) => {
      const timeData = formatMatchTime(match.timestamp);
      const isLive = isMatchLive(match.timestamp);
      const tzLabel = state.timezoneMode === 'spain' ? 'CET' : 'Local';

      // Reproductores / embeds para este partido
      let channelPillsHtml = '';
      if (match.embeds.length > 0) {
        match.embeds.forEach((em, sIdx) => {
          const label = em.name || CHANNEL_PRESETS[sIdx % CHANNEL_PRESETS.length] || `Opción ${sIdx + 1}`;
          const langBadge = em.lang ? `<span class="channel-badge-quality">${escapeHtml(em.lang)}</span>` : `<span class="channel-badge-quality">HD</span>`;
          channelPillsHtml += `
            <button type="button" class="channel-stream-link ag-embed-play" data-match-id="${match.id}" data-embed-index="${sIdx}">
              <span>▶</span> ${escapeHtml(label)}
              ${langBadge}
            </button>
          `;
        });
      } else {
        channelPillsHtml = `
          <div class="channel-no-stream">Sin enlaces disponibles por el momento.</div>
        `;
      }

      html += `
        <article class="tr-event-card" data-match-id="${match.id}">
          <div class="tr-event-main-bar tr-event-toggle" role="button" tabindex="0" aria-expanded="false" aria-controls="channels-${match.id}">
            <!-- Hora -->
            <div class="tr-event-time-col">
              <span class="tr-event-time ${isLive ? 'is-live' : ''}">${isLive ? '● EN VIVO' : timeData.time}</span>
              <span class="tr-event-tz-label">${tzLabel} • ${timeData.date}</span>
            </div>

            <!-- Icono Deporte / Competición -->
            <div class="tr-event-icon-col">
              <div class="tr-competition-badge" title="${escapeHtml(match.league)}">
                ${match.flag ? `
                  <img src="${escapeHtml(match.flag)}" alt="${escapeHtml(match.league)}" loading="lazy" onerror="this.onerror=null;this.outerHTML='<span>${match.categoryIcon}</span>';">
                ` : `
                  <span>${match.categoryIcon}</span>
                `}
              </div>
            </div>

            <!-- Título y Liga -->
            <div class="tr-event-info-col">
              <span class="tr-league-name">${escapeHtml(match.league)}</span>
              <div class="tr-match-title">
                ${match.team2 ? `
                  <div class="tr-team-badge-row">
                    ${match.homeTeamLogo ? `<img src="${match.homeTeamLogo}" class="tr-club-logo" alt="${escapeHtml(match.team1)}" onerror="this.style.display='none'">` : ''}
                    <span class="team-t1">${escapeHtml(match.team1)}</span>
                  </div>
                  <span class="vs-separator">VS</span>
                  <div class="tr-team-badge-row">
                    ${match.awayTeamLogo ? `<img src="${match.awayTeamLogo}" class="tr-club-logo" alt="${escapeHtml(match.team2)}" onerror="this.style.display='none'">` : ''}
                    <span class="team-t2">${escapeHtml(match.team2)}</span>
                  </div>
                ` : `
                  <span>${escapeHtml(match.title)}</span>
                `}
              </div>
            </div>

            <!-- Botones de Acción -->
            <div class="tr-event-actions-col">
              <span class="btn-open-channels">
                Canales <span class="chevron-icon">▶</span>
              </span>
              <button type="button" class="btn-direct-stream ag-embed-play" data-match-id="${match.id}" data-embed-index="0" ${match.embeds.length === 0 ? 'disabled style="opacity:.5;cursor:not-allowed;"' : ''}>
                Ver en Vivo
              </button>
            </div>
          </div>

          <!-- Bandeja desplegable de canales -->
          <div class="tr-channels-tray" id="channels-${match.id}">
            <div class="channels-tray-header">
              <span>Canales y Enlaces Oficiales:</span>
              <span>Emisión en Directo</span>
            </div>
            <div class="channels-pills-grid">
              ${channelPillsHtml}
            </div>
          </div>
        </article>
      `;
    });

    DOM.agendaList.innerHTML = html;
  }

  // --- REPRODUCTOR EMBED (modal con iframe) ---
  function openPlayer(match, embed) {
    if (!DOM.playerModal || !DOM.playerFrame) return;
    const lang = embed.lang ? ` [${embed.lang}]` : '';
    if (DOM.playerTitle) DOM.playerTitle.textContent = `${match.title} — ${embed.name}${lang}`;
    DOM.playerFrame.src = embed.iframe;
    DOM.playerModal.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closePlayer() {
    if (!DOM.playerModal) return;
    DOM.playerModal.classList.remove('is-open');
    if (DOM.playerFrame) DOM.playerFrame.src = '';
    document.body.style.overflow = '';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function showErrorState() {
    if (DOM.agendaList) {
      DOM.agendaList.innerHTML = `
        <div class="agenda-empty-state">
          <p style="color: #ef4444; font-weight: 700; margin-bottom: 8px;">No se pudo conectar a la API en tiempo real.</p>
          <p style="color: #9ca3af; font-size: 0.88rem;">Intenta recargar la página o revisa tu conexión a internet.</p>
        </div>
      `;
    }
  }

})();
