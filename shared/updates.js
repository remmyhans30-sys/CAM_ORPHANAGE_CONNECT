/*
 * Stories, updates and videos of an orphanage, shown to approved donors and verified partners.
 *   CocUpdates.open({ apiBase, token, endpoint, orphanageName, onExpired })
 *       opens a window with the posts and the home's social pages.
 *   CocUpdates.mount(container, { apiBase, token, endpoint, onExpired })
 *       draws the same content inside a page.
 *   CocUpdates.renderPosts(container, posts, { allowDelete, onDelete }) is also used by the orphanage portal.
 * endpoint is the path of the updates for one orphanage, for example '/browse/orphanages/3/updates'.
 * Needs shared/updates.css.
 */
(function () {
  var TYPE_LABEL = { story: 'Story', update: 'News', gift: 'Gift received' };
  var PLATFORM_LABEL = { website: 'Website', facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', tiktok: 'TikTok', x: 'X', whatsapp: 'WhatsApp' };
  var PLATFORM_ORDER = ['website', 'facebook', 'instagram', 'youtube', 'tiktok', 'x', 'whatsapp'];

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function prettyDate(value) {
    var d = new Date(String(value) + 'T00:00:00');
    return isNaN(d) ? value : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function renderPost(post, options) {
    var card = el('article', 'cu-post cu-post-' + post.type);
    var head = el('div', 'cu-post-head');
    head.appendChild(el('span', 'cu-badge cu-badge-' + post.type, TYPE_LABEL[post.type] || post.type));
    head.appendChild(el('span', 'cu-date', prettyDate(post.date)));
    card.appendChild(head);

    if (post.title) card.appendChild(el('h3', 'cu-title', post.title));
    String(post.text || '').split(/\n{2,}/).forEach(function (paragraph) {
      if (paragraph.trim()) card.appendChild(el('p', 'cu-text', paragraph.trim()));
    });

    if (post.photoUrl) {
      var photo = el('img', 'cu-photo');
      photo.src = post.photoUrl;
      photo.alt = '';
      photo.loading = 'lazy';
      card.appendChild(photo);
    }
    if (post.videoUrl) {
      var video = el('video', 'cu-video');
      video.controls = true;
      video.preload = 'metadata';
      video.playsInline = true;
      video.src = post.videoUrl;
      card.appendChild(video);
    }
    if (options && options.extra) options.extra(card, post);
    return card;
  }

  function renderPosts(container, posts, options) {
    container.innerHTML = '';
    if (!posts.length) {
      container.appendChild(el('p', 'cu-empty', (options && options.emptyText) || 'No stories or updates have been shared yet.'));
      return;
    }
    posts.forEach(function (post) { container.appendChild(renderPost(post, options)); });
  }

  function renderLinks(container, links) {
    container.innerHTML = '';
    var present = PLATFORM_ORDER.filter(function (p) { return links && links[p]; });
    if (!present.length) return;
    container.appendChild(el('p', 'cu-links-title', 'Follow this home elsewhere'));
    var row = el('div', 'cu-links');
    present.forEach(function (platform) {
      var a = el('a', 'cu-link', PLATFORM_LABEL[platform]);
      a.href = links[platform];
      a.target = '_blank';
      a.rel = 'noopener noreferrer nofollow';
      row.appendChild(a);
    });
    container.appendChild(row);
  }

  function load(opts) {
    return fetch(opts.apiBase + opts.endpoint, { headers: { Authorization: 'Bearer ' + opts.token } })
      .catch(function () { throw new Error('Cannot reach the server. Please try again in a moment.'); })
      .then(function (response) {
        return response.json().catch(function () { return {}; }).then(function (data) {
          if (response.status === 401 && opts.onExpired) opts.onExpired();
          if (!response.ok) throw new Error(data.error || 'Could not load the updates.');
          return data;
        });
      });
  }

  function mount(container, opts) {
    container.innerHTML = '';
    var links = el('div', 'cu-links-wrap');
    var list = el('div', 'cu-list');
    container.appendChild(links);
    container.appendChild(list);
    list.appendChild(el('p', 'cu-empty', 'Loading…'));
    return load(opts).then(function (data) {
      renderLinks(links, data.socialLinks);
      renderPosts(list, data.posts);
      return data;
    }).catch(function (err) {
      list.innerHTML = '';
      list.appendChild(el('p', 'cu-error', err.message));
    });
  }

  function open(opts) {
    var dialog = el('dialog', 'cu-dialog');
    var head = el('div', 'cu-dialog-head');
    head.appendChild(el('h2', 'cu-dialog-title', 'Updates from ' + opts.orphanageName));
    var close = el('button', 'cu-close', 'Close');
    close.type = 'button';
    head.appendChild(close);
    dialog.appendChild(head);
    var body = el('div', 'cu-dialog-body');
    dialog.appendChild(body);
    document.body.appendChild(dialog);

    function shut() {
      dialog.querySelectorAll('video').forEach(function (v) { v.pause(); });
      dialog.close();
      dialog.remove();
    }
    close.addEventListener('click', shut);
    dialog.addEventListener('cancel', function () { dialog.remove(); });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) shut(); });

    dialog.showModal();
    mount(body, opts);
  }

  window.CocUpdates = { open: open, mount: mount, renderPosts: renderPosts, renderLinks: renderLinks, TYPE_LABEL: TYPE_LABEL, PLATFORM_LABEL: PLATFORM_LABEL, PLATFORM_ORDER: PLATFORM_ORDER };
})();
