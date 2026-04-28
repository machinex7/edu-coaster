const Marketing = {
  draftDuration:    4,
  draftMedium:      'tv',
  draftHook:        'jingle',
  draftMessageType: 'informational',

  buildPanel() {
    const DURATIONS = [
      { value: 1,  label: '1 week'          },
      { value: 2,  label: '2 weeks'         },
      { value: 4,  label: '4 weeks'         },
      { value: 8,  label: '8 weeks'         },
      { value: 13, label: '13 weeks (1 quarter)' },
    ];
    const MEDIUMS = [
      { value: 'tv',     label: 'TV'     },
      { value: 'radio',  label: 'Radio'  },
      { value: 'online', label: 'Online' },
      { value: 'print',  label: 'Print'  },
    ];
    const HOOKS = [
      { value: 'jingle',    label: 'Catchy Jingle'   },
      { value: 'tagline',   label: 'Tagline'         },
      { value: 'celebrity', label: 'Celebrity Cameo' },
    ];
    const MESSAGE_TYPES = [
      { value: 'informational', label: 'Informational', sub: 'biggest rides in the state'    },
      { value: 'emotional',     label: 'Emotional',     sub: 'make memories with your family' },
      { value: 'urgency',       label: 'Urgency-Driven', sub: 'this weekend only'             },
    ];

    const durationOptions = DURATIONS.map(d =>
      `<option value="${d.value}"${d.value === this.draftDuration ? ' selected' : ''}>${d.label}</option>`
    ).join('');

    const mediumBtns = MEDIUMS.map(m =>
      `<button class="mkt-option-btn${this.draftMedium === m.value ? ' active' : ''}" data-mkt-medium="${m.value}">${m.label}</button>`
    ).join('');

    const hookBtns = HOOKS.map(h =>
      `<button class="mkt-option-btn${this.draftHook === h.value ? ' active' : ''}" data-mkt-hook="${h.value}">${h.label}</button>`
    ).join('');

    const messageTypeBtns = MESSAGE_TYPES.map(m =>
      `<button class="mkt-option-btn mkt-option-btn--wide${this.draftMessageType === m.value ? ' active' : ''}" data-mkt-message="${m.value}">
        <span class="mkt-option-label">${m.label}</span>
        <span class="mkt-option-sub">${m.sub}</span>
      </button>`
    ).join('');

    document.getElementById('marketing-panel-body').innerHTML = `
      <div class="panel-section-header">Campaign Designer</div>
      <div class="posting-form">
        <div class="form-field">
          <label for="mkt-duration">Duration</label>
          <select id="mkt-duration">${durationOptions}</select>
        </div>
        <div class="form-field">
          <label>Medium</label>
          <div class="mkt-option-group">${mediumBtns}</div>
        </div>
        <div class="form-field">
          <label>Hook</label>
          <div class="mkt-option-group">${hookBtns}</div>
        </div>
        <div class="form-field">
          <label>Message Type</label>
          <div class="mkt-option-group mkt-option-group--col">${messageTypeBtns}</div>
        </div>
        <div class="form-actions">
          <button class="mkt-launch-btn" disabled>Launch Campaign</button>
        </div>
      </div>`;

    document.getElementById('mkt-duration').addEventListener('change', e => {
      this.draftDuration = parseInt(e.target.value);
    });

    document.querySelectorAll('[data-mkt-medium]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.draftMedium = btn.dataset.mktMedium;
        document.querySelectorAll('[data-mkt-medium]').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    document.querySelectorAll('[data-mkt-hook]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.draftHook = btn.dataset.mktHook;
        document.querySelectorAll('[data-mkt-hook]').forEach(b => b.classList.toggle('active', b === btn));
      });
    });

    document.querySelectorAll('[data-mkt-message]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.draftMessageType = btn.dataset.mktMessage;
        document.querySelectorAll('[data-mkt-message]').forEach(b => b.classList.toggle('active', b === btn));
      });
    });
  },
};
