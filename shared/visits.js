/*
 * Visit requests, shared by the donor and partner pages.
 *   CocVisits.request({ apiBase, token, orphanageId, orphanageName, onDone, onExpired })
 *       opens a small form asking to visit an orphanage.
 *   CocVisits.mountMine(container, { apiBase, token, onExpired })
 *       lists the signed-in person's own requests, with the home's answer, and lets them cancel
 *       one that is still waiting.
 * apiBase is the address of the API ending in /api. Needs shared/visits.css.
 */
(function () {
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function isoDay(offsetDays) {
    var d = new Date();
    d.setDate(d.getDate() + offsetDays);
    var month = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + month + '-' + day;
  }

  function prettyDate(value) {
    var d = new Date(value + 'T00:00:00');
    return isNaN(d) ? value : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  }

  function call(opts, path, method, body) {
    return fetch(opts.apiBase + path, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + opts.token },
      body: body ? JSON.stringify(body) : undefined
    }).catch(function () {
      throw new Error('Cannot reach the server. Please try again in a moment.');
    }).then(function (response) {
      return response.json().catch(function () { return {}; }).then(function (data) {
        if (response.status === 401) {
          if (opts.onExpired) opts.onExpired();
          throw new Error('Your session has expired. Please sign in again.');
        }
        if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
        return data;
      });
    });
  }

  function request(opts) {
    var dialog = el('dialog', 'cv-dialog');
    var form = el('form', 'cv-form');
    form.noValidate = true;

    form.appendChild(el('h2', 'cv-title', 'Request a visit'));
    form.appendChild(el('p', 'cv-lead', opts.orphanageName));

    function field(labelText, input, hint) {
      var wrap = el('div', 'cv-field');
      var label = el('label', 'cv-label', labelText);
      input.id = 'cv-' + labelText.toLowerCase().replace(/[^a-z]+/g, '-');
      label.htmlFor = input.id;
      wrap.appendChild(label);
      wrap.appendChild(input);
      if (hint) wrap.appendChild(el('p', 'cv-hint', hint));
      form.appendChild(wrap);
      return input;
    }

    var date = el('input', 'cv-input');
    date.type = 'date';
    date.min = isoDay(1);
    date.max = isoDay(365);
    field('Preferred date', date, 'Please choose a date from tomorrow. The home may suggest another day.');

    var visitors = el('input', 'cv-input');
    visitors.type = 'number';
    visitors.min = '1';
    visitors.max = '20';
    visitors.value = '2';
    field('Number of visitors', visitors);

    var message = el('textarea', 'cv-input');
    message.rows = 4;
    message.maxLength = 1000;
    message.placeholder = 'Who is coming and why you would like to visit (optional)';
    field('Message to the home', message);

    var rules = el('div', 'cv-rules');
    rules.appendChild(el('p', 'cv-rules-title', 'Before you ask'));
    var list = el('ul', 'cv-rules-list');
    [
      'The home decides whether and when a visit can happen.',
      'Visits are supervised by the home\'s staff. Visitors are never left alone with children.',
      'Photos or videos of children are only taken if the home agrees.',
      'If the home approves, it will see your name and email address so it can arrange the visit.'
    ].forEach(function (line) { list.appendChild(el('li', null, line)); });
    rules.appendChild(list);
    form.appendChild(rules);

    var error = el('p', 'cv-error');
    error.setAttribute('role', 'alert');
    form.appendChild(error);

    var done = el('p', 'cv-done');
    form.appendChild(done);

    var actions = el('div', 'cv-actions');
    var cancel = el('button', 'cv-btn cv-btn-quiet', 'Cancel');
    cancel.type = 'button';
    var send = el('button', 'cv-btn cv-btn-main', 'Send request');
    send.type = 'submit';
    actions.appendChild(cancel);
    actions.appendChild(send);
    form.appendChild(actions);
    dialog.appendChild(form);
    document.body.appendChild(dialog);

    function close() {
      dialog.close();
      dialog.remove();
    }
    cancel.addEventListener('click', close);
    dialog.addEventListener('cancel', function () { dialog.remove(); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      error.textContent = '';
      if (!date.value) {
        error.textContent = 'Please choose the date you would like to visit.';
        return;
      }
      send.disabled = true;
      call(opts, '/visits', 'POST', {
        orphanageId: opts.orphanageId,
        preferredDate: date.value,
        visitorsCount: Number(visitors.value),
        message: message.value.trim()
      }).then(function (data) {
        done.textContent = 'Request sent. ' + opts.orphanageName + ' will answer from its portal. You will see the answer under "My visit requests".';
        send.style.display = 'none';
        cancel.textContent = 'Close';
        if (opts.onDone) opts.onDone(data.visits);
      }).catch(function (err) {
        error.textContent = err.message;
        send.disabled = false;
      });
    });

    dialog.showModal();
    date.focus();
  }

  var STATUS_LABEL = { pending: 'Waiting for an answer', approved: 'Approved', declined: 'Declined', cancelled: 'Cancelled' };

  function mountMine(container, opts) {
    function draw(visits) {
      container.innerHTML = '';
      if (!visits.length) {
        container.appendChild(el('p', 'cv-empty', 'You have not asked to visit an orphanage yet. Use "Request a visit" on an orphanage.'));
        return;
      }
      visits.forEach(function (v) {
        var card = el('div', 'cv-card');
        var head = el('div', 'cv-card-head');
        head.appendChild(el('strong', 'cv-card-title', v.orphanageName));
        head.appendChild(el('span', 'cv-badge cv-badge-' + v.status, STATUS_LABEL[v.status] || v.status));
        card.appendChild(head);
        card.appendChild(el('p', 'cv-card-line', prettyDate(v.preferredDate) + ' · ' + v.visitorsCount + (v.visitorsCount === 1 ? ' visitor' : ' visitors')));
        if (v.message) card.appendChild(el('p', 'cv-card-note', 'Your message: ' + v.message));
        if (v.responseNote) card.appendChild(el('p', 'cv-card-reply', 'The home says: ' + v.responseNote));
        if (v.status === 'approved') card.appendChild(el('p', 'cv-card-line', 'The home has your name and email and will contact you to arrange the visit.'));
        if (v.status === 'pending') {
          var cancel = el('button', 'cv-btn cv-btn-quiet cv-btn-small', 'Cancel request');
          cancel.type = 'button';
          cancel.addEventListener('click', function () {
            cancel.disabled = true;
            call(opts, '/visits/' + v.id + '/cancel', 'POST', {}).then(function (data) { draw(data.visits); }).catch(function (err) {
              alert(err.message);
              cancel.disabled = false;
            });
          });
          card.appendChild(cancel);
        }
        container.appendChild(card);
      });
    }

    container.innerHTML = '';
    container.appendChild(el('p', 'cv-empty', 'Loading…'));
    return call(opts, '/visits/mine').then(function (data) { draw(data.visits); }).catch(function (err) {
      container.innerHTML = '';
      container.appendChild(el('p', 'cv-error', err.message));
    }).then(function () {
      return { reload: function () { return call(opts, '/visits/mine').then(function (data) { draw(data.visits); }); } };
    });
  }

  window.CocVisits = { request: request, mountMine: mountMine };
})();
