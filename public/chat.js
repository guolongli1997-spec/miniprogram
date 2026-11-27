// FlyTripVisa AI chat client — works with /api/chat on the Worker.
// Wire-up for index.html hero input, bottom-tab AI button and the chat popup,
// plus any .chat-btn elements on other pages.

(function () {
  const API_URL = '/api/chat';
  let sessionId = localStorage.getItem('flytrip_session') || null;
  let sending = false;

  const popupOverlay = document.getElementById('chatPopupOverlay');
  const popupMessages = document.getElementById('chatPopupMessages');
  const popupInput = document.getElementById('chatPopupInput');
  const popupSendBtn = document.getElementById('chatPopupSendBtn');
  const closePopupBtn = document.getElementById('closeChatPopupBtn');
  const navAiChatBtn = document.getElementById('navAiChatBtn');
  const heroInput = document.getElementById('aiChatInput');
  const heroSendBtn = document.getElementById('aiChatSendBtn');

  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function addMsg(text, role, isError) {
    const div = document.createElement('div');
    div.className = 'chat-msg ' + role + (isError ? ' error' : '');
    div.textContent = text;
    popupMessages.appendChild(div);
    popupMessages.scrollTop = popupMessages.scrollHeight;
    return div;
  }

  function addRetry(retryText) {
    const wrap = document.createElement('div');
    const btn = document.createElement('button');
    btn.className = 'chat-retry-btn';
    btn.textContent = '↻ Retry';
    btn.addEventListener('click', () => {
      wrap.remove();
      send(retryText);
    });
    wrap.appendChild(btn);
    popupMessages.appendChild(wrap);
    popupMessages.scrollTop = popupMessages.scrollHeight;
  }

  async function send(text) {
    const message = (text || '').trim();
    if (!message || sending) return;
    sending = true;
    popupSendBtn && (popupSendBtn.disabled = true);
    heroSendBtn && (heroSendBtn.disabled = true);

    addMsg(message, 'user');
    if (popupInput) popupInput.value = '';

    const typing = addMsg('FlyTrip AI is typing…', 'bot');
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, session_id: sessionId }),
      });
      const data = await res.json();
      typing.remove();
      if (data.ok) {
        sessionId = data.data.session_id || sessionId;
        if (sessionId) localStorage.setItem('flytrip_session', sessionId);
        addMsg(data.data.reply, 'bot');
      } else {
        addMsg(data.error || 'Service temporarily unavailable.', 'bot', true);
        addRetry(message);
      }
    } catch (err) {
      typing.remove();
      addMsg('Network error — please check your connection and try again.', 'bot', true);
      addRetry(message);
    } finally {
      sending = false;
      popupSendBtn && (popupSendBtn.disabled = false);
      heroSendBtn && (heroSendBtn.disabled = false);
    }
  }

  function openPopup() {
    if (!popupOverlay) return;
    popupOverlay.classList.add('open');
    if (document.body) document.body.style.overflow = 'hidden';
    setTimeout(() => popupInput && popupInput.focus(), 250);
  }
  function closePopup() {
    if (!popupOverlay) return;
    popupOverlay.classList.remove('open');
    if (document.body) document.body.style.overflow = '';
  }

  // Bottom tab AI button + close button
  navAiChatBtn && navAiChatBtn.addEventListener('click', openPopup);
  closePopupBtn && closePopupBtn.addEventListener('click', closePopup);
  popupOverlay && popupOverlay.addEventListener('click', (e) => { if (e.target === popupOverlay) closePopup(); });

  // Popup send (button + Enter)
  popupSendBtn && popupSendBtn.addEventListener('click', () => send(popupInput.value));
  popupInput && popupInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(popupInput.value); });

  // Hero quick-ask box: pre-fills popup then opens it
  function heroAsk() {
    const text = (heroInput && heroInput.value) || '';
    openPopup();
    if (text.trim()) { send(text); if (heroInput) heroInput.value = ''; }
  }
  heroSendBtn && heroSendBtn.addEventListener('click', heroAsk);
  heroInput && heroInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') heroAsk(); });

  // Generic .chat-btn hooks for other pages
  document.querySelectorAll('.chat-btn').forEach((el) =>
    el.addEventListener('click', () => { openPopup(); })
  );
})();
